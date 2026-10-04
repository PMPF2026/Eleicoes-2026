#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
GATE 5C.2 — ORQUESTRADOR E MOTOR CENTRAL DE ATUALIZAÇÃO TSE (497 MUNICÍPIOS)
Eleições RS 2026 — Mapa Eleitoral
===============================================================================
Pipeline de Produção:
TSE -> Orquestrador com Exclusão Mútua (Lock) -> Requisições Condicionais
-> HTTP 200/304 -> Validação -> Normalização -> Last Known Good (LKG) ->
Validação Global -> Staging Provisório -> Publicação Atômica -> Health Check

Recursos Operacionais:
- Lock de execução em arquivo (scripts/.collector.lock) com expiração de lock órfão
- Objeto explícito de Checksum SHA-256 no metadado do consolidado
- Emissão de arquivo de estado operacional de saúde (data/pipeline_status.json)
- Publicação estritamente atômica via staging (.tmp) e os.replace
- Política de Fail-Safe (limiar de 5% de falhas) com fallback LKG
- Suporte a testes controlados (--test-lock, --test-fail-staging, --test-interruption)
===============================================================================
"""

import os
import sys
import json
import time
import hashlib
import ssl
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# Configurações do Coletor
TSE_CONFIG_URL = "https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json"
ELEICAO_PRESIDENTE = "6257"
CARGO_PRESIDENTE = "1"
ELEICAO_GOVERNADOR = "6259"
CARGO_GOVERNADOR = "3"
UF = "rs"

# Parâmetros Operacionais de Concorrência e Rede
MAX_WORKERS = 15          # Concorrência conservadora aprovada (15 workers)
TIMEOUT_SECONDS = 12      # Timeout estrito por requisição
MAX_RETRIES = 3           # Tentativas limitadas
BACKOFF_429 = [2.0, 4.0, 8.0]  # Backoff progressivo para HTTP 429
FAIL_SAFE_THRESHOLD = 0.05      # Limite de 5% de falhas para fail-safe
LOCK_TIMEOUT_SECONDS = 600      # 10 minutos para considerar lock obsoleto/órfão

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_PATH = os.path.join(PROJECT_ROOT, "data", "Municipios_RS_497.geojson")
OUTPUT_JSON_PATH = os.path.join(PROJECT_ROOT, "data", "tse_rs_consolidado.json")
STATUS_JSON_PATH = os.path.join(PROJECT_ROOT, "data", "pipeline_status.json")
LOCK_FILE_PATH = os.path.join(PROJECT_ROOT, "scripts", ".collector.lock")
LOGS_DIR = os.path.join(PROJECT_ROOT, "logs")

# SSL Context
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS_BASE = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://resultados.tse.jus.br/oficial/app/index.html'
}


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_iso_now():
    return datetime.now(timezone.utc).astimezone().isoformat()


def parse_float(val_str, default=0.0):
    if not val_str:
        return default
    try:
        return float(str(val_str).replace(',', '.'))
    except (ValueError, TypeError):
        return default


def parse_int(val_str, default=0):
    if not val_str:
        return default
    try:
        return int(val_str)
    except (ValueError, TypeError):
        return default


# ==============================================================================
# MECANISMO DE LOCK E EXCLUSÃO MÚTUA (SEÇÕES 15 E 16)
# ==============================================================================
class CollectorLock:
    def __init__(self, lock_path=LOCK_FILE_PATH, timeout=LOCK_TIMEOUT_SECONDS):
        self.lock_path = lock_path
        self.timeout = timeout
        self.acquired = False

    def acquire(self):
        pid = os.getpid()
        now_ts = time.time()
        now_iso = get_iso_now()

        if os.path.exists(self.lock_path):
            try:
                with open(self.lock_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                lock_time = data.get('timestamp_epoch', 0)
                lock_pid = data.get('pid', 'desconhecido')
                age = now_ts - lock_time

                if age < self.timeout:
                    log(f"[LOCK CONTROLLER] Bloqueio ativo detectado (PID {lock_pid}, idade: {age:.1f}s).")
                    log("[LOCK CONTROLLER] Rejeitando execução concorrente duplicada para garantir integridade.")
                    return False
                else:
                    log(f"[LOCK CONTROLLER] Lock órfão/expirado detectado (idade: {age:.1f}s > {self.timeout}s). Liberando...")
            except Exception as e:
                log(f"[LOCK CONTROLLER] Aviso ao inspecionar lock anterior ({e}). Sobrescrevendo...")

        # Gravar novo lock
        lock_info = {
            'pid': pid,
            'timestamp_epoch': now_ts,
            'acquired_at': now_iso,
            'status': 'running'
        }
        try:
            with open(self.lock_path, "w", encoding="utf-8") as f:
                json.dump(lock_info, f, indent=2)
            self.acquired = True
            log(f"[LOCK CONTROLLER] Lock de execução adquirido com sucesso (PID {pid}).")
            return True
        except Exception as e:
            log(f"[LOCK CONTROLLER] Falha ao criar arquivo de lock: {e}")
            return False

    def release(self):
        if self.acquired and os.path.exists(self.lock_path):
            try:
                os.remove(self.lock_path)
                log("[LOCK CONTROLLER] Lock de execução liberado com sucesso.")
            except Exception as e:
                log(f"[LOCK CONTROLLER] Erro ao remover lock ({e}).")
            self.acquired = False


# ==============================================================================
# REQUISIÇÕES HTTP CONDICIONAIS (SEÇÃO 7)
# ==============================================================================
def fetch_url(url, etag=None, last_modified=None, retries=MAX_RETRIES):
    attempt = 0
    last_err = None
    headers = dict(HEADERS_BASE)

    if etag:
        headers['If-None-Match'] = str(etag).strip()
    if last_modified:
        headers['If-Modified-Since'] = str(last_modified).strip()

    while attempt < retries:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=TIMEOUT_SECONDS) as resp:
                status = resp.status
                headers_dict = {
                    'etag': resp.headers.get('etag', ''),
                    'last-modified': resp.headers.get('last-modified', ''),
                    'cache-control': resp.headers.get('cache-control', '')
                }
                raw_bytes = resp.read()
                data = json.loads(raw_bytes.decode('utf-8'))
                return {
                    'success': True,
                    'status': status,
                    'not_modified': False,
                    'headers': headers_dict,
                    'data': data,
                    'raw_bytes': raw_bytes,
                    'attempts': attempt,
                    'error': None
                }
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.reason}"
            if e.code == 304:
                headers_dict = {
                    'etag': e.headers.get('etag', etag or ''),
                    'last-modified': e.headers.get('last-modified', last_modified or ''),
                    'cache-control': e.headers.get('cache-control', '')
                }
                return {
                    'success': True,
                    'status': 304,
                    'not_modified': True,
                    'headers': headers_dict,
                    'data': None,
                    'raw_bytes': b'',
                    'attempts': attempt,
                    'error': None
                }
            elif e.code == 404:
                return {
                    'success': False,
                    'status': 404,
                    'not_modified': False,
                    'headers': {},
                    'data': None,
                    'attempts': attempt,
                    'error': 'HTTP 404 (Sem dados na CDN do TSE)'
                }
            elif e.code == 429:
                delay_idx = min(attempt - 1, len(BACKOFF_429) - 1)
                sleep_time = BACKOFF_429[delay_idx]
                time.sleep(sleep_time)
            elif e.code >= 500:
                time.sleep(1.0 * attempt)
            else:
                time.sleep(0.5 * attempt)
        except Exception as e:
            last_err = str(e)
            time.sleep(0.5 * attempt)

    return {
        'success': False,
        'status': 0,
        'not_modified': False,
        'headers': {},
        'data': None,
        'attempts': attempt,
        'error': last_err
    }


# ==============================================================================
# NORMALIZADOR E LAST KNOWN GOOD (SEÇÕES 8, 9 E 10)
# ==============================================================================
def normalize_cargo(raw_resp, cargo_tipo, eleicao_esperada, prev_cargo_data=None, now_iso=None):
    now_iso = now_iso or get_iso_now()

    # 1. CASO HTTP 304 (NOT MODIFIED)
    if raw_resp.get('not_modified') and raw_resp.get('status') == 304:
        if prev_cargo_data:
            updated_cargo = dict(prev_cargo_data)
            updated_cargo['freshness'] = {
                'last_checked': now_iso,
                'last_changed': prev_cargo_data.get('freshness', {}).get('last_changed') or now_iso,
                'source_last_modified': raw_resp.get('headers', {}).get('last-modified') or prev_cargo_data.get('metadata', {}).get('last_modified', ''),
                'http_status': 304,
                'freshness_status': 'not_modified'
            }
            updated_cargo['metadata']['etag'] = raw_resp.get('headers', {}).get('etag') or prev_cargo_data.get('metadata', {}).get('etag', '')
            updated_cargo['metadata']['http_status'] = 304
            return updated_cargo

    # 2. CASO FALHA: LAST KNOWN GOOD (LKG FALLBACK)
    if not raw_resp.get('success'):
        if prev_cargo_data and prev_cargo_data.get('candidatos'):
            updated_cargo = dict(prev_cargo_data)
            updated_cargo['freshness'] = {
                'last_checked': now_iso,
                'last_changed': prev_cargo_data.get('freshness', {}).get('last_changed') or now_iso,
                'source_last_modified': prev_cargo_data.get('metadata', {}).get('last_modified', ''),
                'http_status': raw_resp.get('status', 0),
                'freshness_status': 'fallback',
                'fallback_reason': raw_resp.get('error')
            }
            updated_cargo['metadata']['http_status'] = raw_resp.get('status', 0)
            return updated_cargo
        else:
            status_desc = "awaiting" if raw_resp.get('status') == 404 else "error"
            return {
                'status': status_desc,
                'cargo_codigo': cargo_tipo,
                'eleicao': eleicao_esperada,
                'totalizacao': {
                    'secoes_total': 0,
                    'secoes_apuradas': 0,
                    'percentual_totalizacao': 0.0,
                    'totalizacao_finalizada': False,
                    'status': status_desc
                },
                'eleitorado': {
                    'total_eleitores': 0,
                    'comparecimento': 0,
                    'percentual_comparecimento': 0.0,
                    'abstencao': 0,
                    'percentual_abstencao': 0.0
                },
                'votos': {
                    'total_votos': 0,
                    'votos_validos': 0,
                    'percentual_validos': 0.0,
                    'votos_brancos': 0,
                    'percentual_brancos': 0.0,
                    'votos_nulos': 0,
                    'percentual_nulos': 0.0
                },
                'vencedor': None,
                'segundo_colocado': None,
                'diferenca_pp': None,
                'candidatos': [],
                'validacao': {
                    'consistente': True,
                    'observacao': f"Sem apuração no TSE ({status_desc})"
                },
                'freshness': {
                    'last_checked': now_iso,
                    'last_changed': None,
                    'source_last_modified': None,
                    'http_status': raw_resp.get('status', 0),
                    'freshness_status': status_desc,
                    'fallback_reason': raw_resp.get('error') if status_desc == 'error' else None
                },
                'metadata': {
                    'idg': None,
                    'dg': None,
                    'hg': None,
                    'tf': None,
                    'etag': '',
                    'last_modified': '',
                    'http_status': raw_resp.get('status', 0)
                }
            }

    # 3. CASO HTTP 200: NOVO CONTEÚDO
    raw = raw_resp['data']
    hdrs = raw_resp.get('headers', {})

    ele = raw.get('ele', eleicao_esperada)
    idg = raw.get('idg')
    dg = raw.get('dg')
    hg = raw.get('hg')
    tf = raw.get('tf')
    finalizado = (tf == 's')

    s = raw.get('s', {})
    secoes_total = parse_int(s.get('ts'))
    secoes_apuradas = parse_int(s.get('st'))
    perc_apurado = parse_float(s.get('pst'))

    if finalizado:
        status_str = "finalizado"
        fresh_status = "fresh"
    elif secoes_apuradas > 0:
        status_str = "em_apuracao"
        fresh_status = "fresh"
    else:
        status_str = "awaiting"
        fresh_status = "awaiting"

    e = raw.get('e', {})
    total_eleitores = parse_int(e.get('te'))
    comparecimento = parse_int(e.get('c'))
    perc_comp = parse_float(e.get('pc'))
    abstencao = parse_int(e.get('a'))
    perc_abst = parse_float(e.get('pa'))

    v = raw.get('v', {})
    total_votos = parse_int(v.get('tv'))
    votos_validos = parse_int(v.get('vvc', v.get('vv')))
    perc_validos = parse_float(v.get('pvvc', v.get('pvv')))
    votos_brancos = parse_int(v.get('vb'))
    perc_brancos = parse_float(v.get('pvb'))
    votos_nulos = parse_int(v.get('tvn', v.get('vn')))
    perc_nulos = parse_float(v.get('ptvn', v.get('pvn')))

    carg_list = raw.get('carg', [])
    carg0 = carg_list[0] if carg_list else {}
    cargo_cod = carg0.get('cd', cargo_tipo)
    cargo_nome = carg0.get('nmn', 'Presidente' if cargo_tipo == '1' else 'Governador')

    candidatos = []
    for agr in carg0.get('agr', []):
        for par in agr.get('par', []):
            sg_partido = par.get('sg', '')
            for c in par.get('cand', []):
                votos_cand = parse_int(c.get('vap'))
                pvap_val = parse_float(c.get('pvap'))

                vices = []
                for sup in c.get('vs', []):
                    vices.append({
                        'tipo': sup.get('tp'),
                        'nome_urna': sup.get('nmu'),
                        'nome_completo': sup.get('nm'),
                        'partido': sup.get('sgp')
                    })

                candidatos.append({
                    'numero': str(c.get('n', '')),
                    'nome_urna': c.get('nmu', ''),
                    'nome_completo': c.get('nm', ''),
                    'partido': sg_partido,
                    'votos': votos_cand,
                    'percentual': pvap_val,
                    'percentual_expandido': c.get('pvapn', ''),
                    'situacao': c.get('st', ''),
                    'destino_voto': c.get('dvt', ''),
                    'eleito': (c.get('e', 'n') == 's'),
                    'vice': vices
                })

    candidatos.sort(key=lambda x: x['votos'], reverse=True)

    vencedor = None
    segundo = None
    diferenca_pp = None

    if len(candidatos) > 0 and secoes_apuradas > 0:
        c1 = candidatos[0]
        vencedor = {
            'numero': c1['numero'],
            'nome': c1['nome_urna'],
            'partido': c1['partido'],
            'votos': c1['votos'],
            'percentual': c1['percentual']
        }
        if len(candidatos) > 1:
            c2 = candidatos[1]
            segundo = {
                'numero': c2['numero'],
                'nome': c2['nome_urna'],
                'partido': c2['partido'],
                'votos': c2['votos'],
                'percentual': c2['percentual']
            }
            diferenca_pp = round(c1['percentual'] - c2['percentual'], 2)
        else:
            diferenca_pp = round(c1['percentual'], 2)

    soma_votos_cands = sum(cand['votos'] for cand in candidatos)
    soma_total_componentes = votos_validos + votos_brancos + votos_nulos
    consistente = True
    inconsistencias = []

    if secoes_apuradas > 0:
        if soma_votos_cands != votos_validos:
            consistente = False
            inconsistencias.append(f"Soma votos ({soma_votos_cands}) != válidos ({votos_validos})")
        if soma_total_componentes != total_votos:
            consistente = False
            inconsistencias.append(f"Válidos+Brancos+Nulos ({soma_total_componentes}) != total ({total_votos})")

    source_mod = hdrs.get('last-modified', '')
    source_dt_str = f"{dg} {hg}" if dg and hg else now_iso

    return {
        'status': status_str,
        'cargo_codigo': cargo_cod,
        'cargo_nome': cargo_nome,
        'eleicao': ele,
        'totalizacao': {
            'secoes_total': secoes_total,
            'secoes_apuradas': secoes_apuradas,
            'percentual_totalizacao': perc_apurado,
            'totalizacao_finalizada': finalizado,
            'status': status_str
        },
        'eleitorado': {
            'total_eleitores': total_eleitores,
            'comparecimento': comparecimento,
            'percentual_comparecimento': perc_comp,
            'abstencao': abstencao,
            'percentual_abstencao': perc_abst
        },
        'votos': {
            'total_votos': total_votos,
            'votos_validos': votos_validos,
            'percentual_validos': perc_validos,
            'votos_brancos': votos_brancos,
            'percentual_brancos': perc_brancos,
            'votos_nulos': votos_nulos,
            'percentual_nulos': perc_nulos
        },
        'vencedor': vencedor,
        'segundo_colocado': segundo,
        'diferenca_pp': diferenca_pp,
        'candidatos': candidatos,
        'validacao': {
            'consistente': consistente,
            'inconsistencias': inconsistencias
        },
        'freshness': {
            'last_checked': now_iso,
            'last_changed': now_iso,
            'source_last_modified': source_mod,
            'source_generation_time': source_dt_str,
            'http_status': 200,
            'freshness_status': fresh_status
        },
        'metadata': {
            'idg': idg,
            'dg': dg,
            'hg': hg,
            'tf': tf,
            'etag': hdrs.get('etag', ''),
            'last_modified': source_mod,
            'http_status': 200
        }
    }


def load_and_validate_municipalities():
    log("Carregando mapeamento oficial de municípios do TSE...")
    res = fetch_url(TSE_CONFIG_URL)
    if not res['success']:
        raise RuntimeError(f"Falha ao obter configuração municipal do TSE: {res['error']}")

    cfg = res['data']
    rs_abr = next((a for a in cfg.get('abr', []) if a.get('cd', '').lower() == UF), None)
    if not rs_abr:
        raise RuntimeError("Abrangência 'rs' não encontrada no arquivo municipal do TSE!")

    tse_muns = rs_abr.get('mu', [])
    if len(tse_muns) != 497:
        raise ValueError(f"Esperados 497 municípios no TSE para o RS, encontrados: {len(tse_muns)}")

    if not os.path.exists(GEOJSON_PATH):
        raise FileNotFoundError(f"Arquivo cartográfico não encontrado: {GEOJSON_PATH}")

    with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
        geo = json.load(f)

    geo_muns = {}
    for feat in geo.get('features', []):
        props = feat.get('properties', {})
        cd_mun = props.get('CD_MUN')
        nm_mun = props.get('NM_MUN')
        if cd_mun:
            geo_muns[str(cd_mun)] = nm_mun

    if len(geo_muns) != 497:
        raise ValueError(f"Esperados 497 municípios no GeoJSON, encontrados: {len(geo_muns)}")

    dicionario_muns = []
    missing_in_geo = []
    for m in tse_muns:
        cd_ibge = str(m.get('cdi', ''))
        cd_tse = str(m.get('cd', ''))
        nome_tse = m.get('nm', '')
        if cd_ibge not in geo_muns:
            missing_in_geo.append((cd_ibge, nome_tse))
        else:
            dicionario_muns.append({
                'cd_mun': cd_ibge,
                'cd_tse': cd_tse,
                'nome': nome_tse,
                'nome_geojson': geo_muns[cd_ibge],
                'zonas': m.get('z', [])
            })

    if missing_in_geo:
        raise ValueError(f"Inconsistência cadastral! Municípios ausentes no GeoJSON: {missing_in_geo}")

    log(f"Validação cadastral: 497/497 municípios pareados com sucesso.")
    return dicionario_muns


def fetch_municipality_task(mun, prev_mun=None, now_iso=None):
    cd_tse = mun['cd_tse']
    cd_mun = mun['cd_mun']
    nome = mun['nome']
    now_iso = now_iso or get_iso_now()

    prev_pres = (prev_mun or {}).get('presidente')
    prev_gov = (prev_mun or {}).get('governador')

    etag_pres = (prev_pres or {}).get('metadata', {}).get('etag')
    last_mod_pres = (prev_pres or {}).get('metadata', {}).get('last_modified')
    etag_gov = (prev_gov or {}).get('metadata', {}).get('etag')
    last_mod_gov = (prev_gov or {}).get('metadata', {}).get('last_modified')

    url_pres = f"https://resultados.tse.jus.br/oficial/ele2026/6257/dados/rs/rs{cd_tse}-c0001-e006257-u.json"
    url_gov = f"https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rs/rs{cd_tse}-c0003-e006259-u.json"

    resp_pres = fetch_url(url_pres, etag=etag_pres, last_modified=last_mod_pres)
    resp_gov = fetch_url(url_gov, etag=etag_gov, last_modified=last_mod_gov)

    norm_pres = normalize_cargo(resp_pres, CARGO_PRESIDENTE, ELEICAO_PRESIDENTE, prev_cargo_data=prev_pres, now_iso=now_iso)
    norm_gov = normalize_cargo(resp_gov, CARGO_GOVERNADOR, ELEICAO_GOVERNADOR, prev_cargo_data=prev_gov, now_iso=now_iso)

    return {
        'cd_mun': cd_mun,
        'cd_tse': cd_tse,
        'nome': nome,
        'uf': 'RS',
        'zonas': mun['zonas'],
        'presidente': norm_pres,
        'governador': norm_gov,
        'raw_metrics': {
            'pres_status': resp_pres['status'],
            'pres_not_modified': resp_pres.get('not_modified', False),
            'pres_attempts': resp_pres['attempts'],
            'gov_status': resp_gov['status'],
            'gov_not_modified': resp_gov.get('not_modified', False),
            'gov_attempts': resp_gov['attempts']
        }
    }


def validate_consolidated_payload(payload):
    muns = payload.get('municipalities', {})
    if len(muns) != 497:
        return False, f"Total de municípios inválido: {len(muns)} (esperado 497)"

    for cd_mun, m in muns.items():
        if len(cd_mun) != 7 or not cd_mun.isdigit():
            return False, f"Chave CD_MUN inválida: {cd_mun}"
        if 'presidente' not in m or 'governador' not in m:
            return False, f"Cargo ausente no município {cd_mun}"

        for cargo in ['presidente', 'governador']:
            c = m[cargo]
            st = c.get('totalizacao', {}).get('secoes_apuradas', 0)
            if st > 0:
                vv = c.get('votos', {}).get('votos_validos', 0)
                sum_cands = sum(cand.get('votos', 0) for cand in c.get('candidatos', []))
                if vv != sum_cands:
                    return False, f"Inconsistência matemática em {cd_mun} ({cargo}): soma cands ({sum_cands}) != válidos ({vv})"

    return True, "Validação global aprovada."


def update_health_status(pipeline_state, collection_id, data_version, now_iso, published_iso, duration_sec, stats, checksum_val=None, error_msg=None):
    """
    Grava o arquivo de status operacional de saúde (data/pipeline_status.json) de forma atômica (Seções 13 e 14).
    """
    status_payload = {
        'pipeline_state': pipeline_state,
        'collection_id': collection_id,
        'data_version': data_version,
        'last_run_started_at': now_iso,
        'last_run_finished_at': get_iso_now(),
        'last_successful_publication_at': published_iso,
        'duration_seconds': duration_sec,
        'total_municipalities': stats.get('total_municipios', 497),
        'total_endpoints': stats.get('total_endpoints', 994),
        'http_200': stats.get('http_200', 0),
        'http_304': stats.get('http_304', 0),
        'http_errors': stats.get('timeouts_erros', 0) + stats.get('http_5xx', 0),
        'fallbacks_active': stats.get('fallbacks_lkg', 0),
        'checksum': {
            'algorithm': 'SHA-256',
            'value': checksum_val or ''
        },
        'freshness_summary': stats.get('freshness_summary', {}),
        'fail_safe_triggered': (pipeline_state == 'fail_safe_aborted'),
        'error_message': error_msg
    }
    tmp_path = STATUS_JSON_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(status_payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, STATUS_JSON_PATH)


# ==============================================================================
# CICLO PRINCIPAL DE ORQUESTRAÇÃO E PUBLICAÇÃO
# ==============================================================================
def run_collection(sim_mode=None):
    lock = CollectorLock()
    if not lock.acquire():
        return {
            'success': False,
            'action': 'lock_blocked',
            'message': 'Execução concorrente rejeitada: outro coletor está em andamento.'
        }

    start_time = datetime.now()
    collection_id = f"cycle-{start_time.strftime('%Y%m%d-%H%M%S')}"
    data_version = start_time.strftime("%Y%m%d.%H%M%S")
    now_iso = get_iso_now()

    try:
        log("=================================================================")
        log(f"INICIANDO CICLO DE ATUALIZAÇÃO TSE — {collection_id}")
        log("=================================================================")

        # 1. Carregar Base LKG Anterior
        previous_consolidated = None
        if os.path.exists(OUTPUT_JSON_PATH):
            try:
                with open(OUTPUT_JSON_PATH, "r", encoding="utf-8") as f:
                    previous_consolidated = json.load(f)
                log("Base anterior (LKG) carregada com sucesso.")
            except Exception as e:
                log(f"Aviso ao carregar LKG anterior: {e}")

        prev_muns_map = (previous_consolidated or {}).get('municipalities', {})

        # 2. Carregar e Validar Dicionário
        municipios = load_and_validate_municipalities()
        total_muns = len(municipios)

        log(f"Disparando consultas para {total_muns} municípios com {MAX_WORKERS} workers...")

        results_by_cd_mun = {}
        stats = {
            'total_municipios': total_muns,
            'total_endpoints': total_muns * 2,
            'http_200': 0,
            'http_304': 0,
            'http_404': 0,
            'http_429': 0,
            'http_5xx': 0,
            'timeouts_erros': 0,
            'fallbacks_lkg': 0,
            'total_retries': 0,
            'freshness_summary': {
                'fresh': 0,
                'not_modified': 0,
                'awaiting': 0,
                'fallback': 0,
                'error': 0
            }
        }

        # 3. Execução Concorrente
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(
                    fetch_municipality_task,
                    m,
                    prev_mun=prev_muns_map.get(m['cd_mun']),
                    now_iso=now_iso
                ): m for m in municipios
            }

            completed = 0
            for future in as_completed(futures):
                mun_ref = futures[future]
                completed += 1
                try:
                    res = future.result()
                    cd_mun = res['cd_mun']
                    results_by_cd_mun[cd_mun] = {
                        'cd_mun': res['cd_mun'],
                        'cd_tse': res['cd_tse'],
                        'nome': res['nome'],
                        'uf': res['uf'],
                        'zonas': res['zonas'],
                        'presidente': res['presidente'],
                        'governador': res['governador']
                    }

                    m_metrics = res['raw_metrics']

                    # Métricas Pres
                    p_st = m_metrics['pres_status']
                    if m_metrics['pres_not_modified'] or p_st == 304:
                        stats['http_304'] += 1
                    elif p_st == 200:
                        stats['http_200'] += 1
                    elif p_st == 404:
                        stats['http_404'] += 1
                    elif p_st == 429:
                        stats['http_429'] += 1
                    elif p_st >= 500:
                        stats['http_5xx'] += 1
                    else:
                        stats['timeouts_erros'] += 1

                    # Métricas Gov
                    g_st = m_metrics['gov_status']
                    if m_metrics['gov_not_modified'] or g_st == 304:
                        stats['http_304'] += 1
                    elif g_st == 200:
                        stats['http_200'] += 1
                    elif g_st == 404:
                        stats['http_404'] += 1
                    elif g_st == 429:
                        stats['http_429'] += 1
                    elif g_st >= 500:
                        stats['http_5xx'] += 1
                    else:
                        stats['timeouts_erros'] += 1

                    p_fresh = res['presidente']['freshness']['freshness_status']
                    g_fresh = res['governador']['freshness']['freshness_status']
                    stats['freshness_summary'][p_fresh] = stats['freshness_summary'].get(p_fresh, 0) + 1
                    stats['freshness_summary'][g_fresh] = stats['freshness_summary'].get(g_fresh, 0) + 1

                    if p_fresh == 'fallback' or g_fresh == 'fallback':
                        stats['fallbacks_lkg'] += 1

                    if completed % 100 == 0 or completed == total_muns:
                        log(f"Progresso: {completed}/{total_muns} municípios concluídos ({completed/total_muns*100:.1f}%)")

                except Exception as e:
                    log(f"Erro no município {mun_ref['nome']}: {e}")

        end_time = datetime.now()
        duration_sec = round((end_time - start_time).total_seconds(), 2)

        # 4. Avaliação Fail-Safe (Seção 21)
        total_endpoints = total_muns * 2
        failed_endpoints = stats['timeouts_erros'] + stats['http_5xx']
        fail_rate = failed_endpoints / total_endpoints

        if fail_rate > FAIL_SAFE_THRESHOLD:
            log(f"ALERTA CRÍTICO: Taxa de falha ({fail_rate*100:.2f}%) excede o limite fail-safe.")
            update_health_status('fail_safe_aborted', collection_id, data_version, now_iso, None, duration_sec, stats, error_msg="Taxa de falha excedeu o limiar de 5%")
            return {
                'success': False,
                'action': 'fail_safe_aborted',
                'fail_rate': fail_rate,
                'duration_sec': duration_sec
            }

        # 5. Montagem do Payload Provisório
        published_iso = get_iso_now()
        payload_provisorio = {
            'metadata': {
                'source': 'Tribunal Superior Eleitoral (TSE) - Dados Oficiais',
                'environment': 'Produção / CDN Oficial TSE',
                'schema_version': '1.0.0',
                'data_version': data_version,
                'collection_id': collection_id,
                'collected_at': now_iso,
                'published_at': published_iso,
                'publication_status': 'published',
                'uf': 'RS',
                'total_municipalities': total_muns,
                'collection_duration_seconds': duration_sec,
                'checksum': {
                    'algorithm': 'SHA-256',
                    'value': ''  # preenchido no cálculo atômico
                },
                'stats': stats
            },
            'municipalities': results_by_cd_mun
        }

        # 6. Validação Global Antes da Publicação Atômica
        val_ok, val_msg = validate_consolidated_payload(payload_provisorio)
        if not val_ok:
            log(f"FALHA NA VALIDAÇÃO GLOBAL: {val_msg}")
            update_health_status('validation_failed', collection_id, data_version, now_iso, None, duration_sec, stats, error_msg=val_msg)
            return {'success': False, 'action': 'validation_failed', 'error': val_msg}

        # Simulação controlada de falha no staging (Seção 27)
        if sim_mode == 'fail_staging':
            log("[SIMULAÇÃO] Provocando falha proposital antes do replace atômico...")
            raise RuntimeError("SIMULATED_STAGING_FAILURE (Simulação controlada de erro de gravação)")

        # 7. Gravação Atômica e Checksum (Seções 10 e 20)
        staging_path = OUTPUT_JSON_PATH + ".tmp"
        
        # Calcular checksum provisório e embutir no metadata
        raw_json_str = json.dumps(payload_provisorio, ensure_ascii=False, indent=2)
        initial_sha = hashlib.sha256(raw_json_str.encode('utf-8')).hexdigest()
        payload_provisorio['metadata']['checksum']['value'] = initial_sha
        
        # Gravação final com checksum integrado
        final_json_bytes = json.dumps(payload_provisorio, ensure_ascii=False, indent=2).encode('utf-8')
        final_sha = hashlib.sha256(final_json_bytes).hexdigest()

        with open(staging_path, "wb") as f:
            f.write(final_json_bytes)

        # Atomic Swap
        os.replace(staging_path, OUTPUT_JSON_PATH)

        size_final = len(final_json_bytes)
        log(f"Publicação atômica concluída em: {OUTPUT_JSON_PATH}")
        log(f"Tamanho: {size_final:,} bytes | SHA-256: {final_sha}")
        log(f"Requisições: HTTP 200={stats['http_200']} | HTTP 304={stats['http_304']} | Fallbacks={stats['fallbacks_lkg']}")

        # 8. Atualizar Status de Saúde do Pipeline
        update_health_status('success', collection_id, data_version, now_iso, published_iso, duration_sec, stats, checksum_val=final_sha)

        report = {
            'success': True,
            'action': 'published_atomic',
            'collection_id': collection_id,
            'data_version': data_version,
            'published_at': published_iso,
            'duration_sec': duration_sec,
            'size_bytes': size_final,
            'sha256': final_sha,
            'stats': stats
        }
        return report

    finally:
        lock.release()


if __name__ == '__main__':
    mode = None
    if '--test-lock' in sys.argv:
        log("[MODO TESTE] Testando exclusão mútua do lock...")
        lock = CollectorLock()
        if lock.acquire():
            log("Primeiro lock adquirido com sucesso. Tentando adquirir segundo lock concorrente...")
            second_lock = CollectorLock()
            acquired_second = second_lock.acquire()
            log(f"Resultado da segunda tentativa concorrente: {'BLOQUEADO COM SUCESSO' if not acquired_second else 'FALHA DE LOCK'}")
            lock.release()
            sys.exit(0 if not acquired_second else 1)
    elif '--test-fail-staging' in sys.argv:
        mode = 'fail_staging'

    rep = run_collection(sim_mode=mode)
    print("\nRELATÓRIO DE EXECUÇÃO:")
    print(json.dumps(rep, indent=2, ensure_ascii=False))
