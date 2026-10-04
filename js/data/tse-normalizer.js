/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Módulo de Ingestão, Normalização Oficial TSE e Gerenciamento de Estado Eleitoral
 * GATE 6.1 — Integração do Consolidado TSE ao WebGIS
 */

import { APP_CONFIG } from '../config.js';

class ElectionStateManager {
  constructor() {
    this.currentState = APP_CONFIG.STATES.WAITING;
    this.currentCargo = APP_CONFIG.CARGOS.PRESIDENTE;
    
    // Mapa de Estado Eleitoral: indexado estritamente por CD_MUN (string de 7 dígitos)
    // Estrutura: { [cdMun]: { cdMun, cdTse, nome, uf, zonas, presidente, governador } }
    this.electionStateMap = {};
    
    // Metadados da versão e publicação
    this.metadata = null;
    
    // Métricas de desempenho de carregamento
    this.performanceMetrics = {
      downloadTimeMs: 0,
      parseTimeMs: 0,
      indexTimeMs: 0,
      totalTimeMs: 0
    };

    // Flag de validação e prontidão
    this.isLoaded = false;
    this.isValid = false;
    
    // Ouvintes de alteração de estado (UI, Mapa, Tabela)
    this.subscribers = [];
  }

  /**
   * Inscreve um ouvinte para alterações no estado eleitoral
   */
  subscribe(callback) {
    this.subscribers.push(callback);
  }

  /**
   * Notifica todos os ouvintes registrados
   */
  notify() {
    const payload = {
      state: this.currentState,
      cargo: this.currentCargo,
      isLoaded: this.isLoaded,
      isValid: this.isValid,
      metadata: this.metadata,
      data: this.getConsolidatedSummary()
    };

    this.subscribers.forEach(cb => {
      try {
        cb(payload);
      } catch (err) {
        console.error('[ElectionStateManager] Erro ao notificar ouvinte:', err);
      }
    });
  }

  /**
   * Alterna o cargo visualizado (Presidente / Governador)
   */
  setCargo(cargo) {
    if (this.currentCargo !== cargo) {
      this.currentCargo = cargo;
      this.notify();
    }
  }

  /**
   * Carrega o arquivo consolidado oficial do TSE assincronamente.
   * Não bloqueia a renderização da base cartográfica.
   * Se houver falha de rede ou validação, não corrompe a aplicação.
   */
  async loadConsolidatedData(url = APP_CONFIG.tseConsolidadoPath) {
    console.log(`[TSE Normalizer] Iniciando carregamento do consolidado: ${url}`);
    const tStart = performance.now();

    try {
      // 1. Download / Requisição HTTP
      const tFetchStart = performance.now();
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        },
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`Falha HTTP ao carregar consolidado TSE: ${response.status} ${response.statusText}`);
      }

      const tFetchEnd = performance.now();
      this.performanceMetrics.downloadTimeMs = Math.round(tFetchEnd - tFetchStart);

      // 2. Parse JSON
      const tParseStart = performance.now();
      const rawJson = await response.json();
      const tParseEnd = performance.now();
      this.performanceMetrics.parseTimeMs = Math.round(tParseEnd - tParseStart);

      // 3. Validação Estrutural e Indexação por CD_MUN
      const tIndexStart = performance.now();
      this.normalizeAndValidate(rawJson);
      const tIndexEnd = performance.now();
      this.performanceMetrics.indexTimeMs = Math.round(tIndexEnd - tIndexStart);

      this.performanceMetrics.totalTimeMs = Math.round(performance.now() - tStart);
      this.isLoaded = true;
      this.isValid = true;

      // Determinar estado geral da apuração
      this.updateGlobalState();

      console.log(`[TSE Normalizer] Consolidado TSE carregado com sucesso em ${this.performanceMetrics.totalTimeMs}ms (Download: ${this.performanceMetrics.downloadTimeMs}ms, Parse: ${this.performanceMetrics.parseTimeMs}ms, Indexação: ${this.performanceMetrics.indexTimeMs}ms).`);
      
      this.notify();
      return true;

    } catch (error) {
      this.isLoaded = false;
      this.isValid = false;
      this.electionStateMap = {};
      this.currentState = APP_CONFIG.STATES.WAITING;

      console.error('[TSE Normalizer] ERRO CRÍTICO no carregamento do consolidado TSE:', error.message);
      console.warn('[TSE Normalizer] Base cartográfica preservada em funcionamento sem dados eleitorais.');

      // Notifica com estado de espera seguro
      this.notify();
      return false;
    }
  }

  /**
   * Valida rigorosamente e normaliza o payload do TSE indexando por CD_MUN
   */
  normalizeAndValidate(rawJson) {
    if (!rawJson || typeof rawJson !== 'object') {
      throw new Error('Payload inválido ou vazio recebido do TSE.');
    }

    if (!rawJson.municipalities || typeof rawJson.municipalities !== 'object') {
      throw new Error("Estrutura incompatível: chave 'municipalities' não encontrada no consolidado.");
    }

    const munKeys = Object.keys(rawJson.municipalities);
    const munCount = munKeys.length;

    // Validação estrita: 497 municípios obrigatórios
    if (munCount !== APP_CONFIG.totalMunicipios) {
      throw new Error(`Validação falhou: Consolidado contém ${munCount} municípios (esperado: ${APP_CONFIG.totalMunicipios}).`);
    }

    // Armazenar metadados oficiais da publicação
    this.metadata = {
      source: rawJson.metadata?.source || 'TSE - Dados Oficiais',
      environment: rawJson.metadata?.environment || 'Produção',
      schema_version: rawJson.metadata?.schema_version || '1.0.0',
      data_version: rawJson.metadata?.data_version || null,
      collection_id: rawJson.metadata?.collection_id || null,
      collected_at: rawJson.metadata?.collected_at || null,
      published_at: rawJson.metadata?.published_at || null,
      publication_status: rawJson.metadata?.publication_status || 'published',
      checksum: rawJson.metadata?.checksum || null,
      stats: rawJson.metadata?.stats || null
    };

    const newMap = {};
    let totalPresidente = 0;
    let totalGovernador = 0;

    for (const cdMun of munKeys) {
      // Validação estrita do CD_MUN: deve ser string de 7 dígitos
      const cdStr = String(cdMun).trim();
      if (!/^\d{7}$/.test(cdStr)) {
        throw new Error(`Código CD_MUN inválido no consolidado: '${cdMun}' (deve ter 7 dígitos numéricos).`);
      }

      const rawMun = rawJson.municipalities[cdMun];
      if (!rawMun.presidente || typeof rawMun.presidente !== 'object') {
        throw new Error(`Município ${cdStr} não contém dados de 'presidente'.`);
      }
      if (!rawMun.governador || typeof rawMun.governador !== 'object') {
        throw new Error(`Município ${cdStr} não contém dados de 'governador'.`);
      }

      totalPresidente++;
      totalGovernador++;

      // Normalização individual de Presidente e Governador
      const presNorm = this.normalizeCargoData(rawMun.presidente, 'Presidente');
      const govNorm = this.normalizeCargoData(rawMun.governador, 'Governador');

      newMap[cdStr] = {
        cdMun: cdStr,
        cdTse: String(rawMun.cd_tse || ''),
        nome: rawMun.nome || '',
        uf: rawMun.uf || 'RS',
        zonas: Array.isArray(rawMun.zonas) ? [...rawMun.zonas] : [],
        apurado: (presNorm.status !== APP_CONFIG.ELECTORAL_STATUS.AWAITING || govNorm.status !== APP_CONFIG.ELECTORAL_STATUS.AWAITING),
        presidente: presNorm,
        governador: govNorm
      };
    }

    // Validação estrita dos 994 estados eleitorais (497 Presidente + 497 Governador)
    if (totalPresidente !== 497 || totalGovernador !== 497) {
      throw new Error(`Contagem de estados eleitorais incorreta: Presidente=${totalPresidente}, Governador=${totalGovernador} (esperado 497 cada, total 994).`);
    }

    this.electionStateMap = newMap;
  }

  /**
   * Normaliza os dados de um cargo específico preservando regras estritas
   */
  normalizeCargoData(rawCargo, cargoNome) {
    const rawStatus = (rawCargo.status || '').toLowerCase();
    const freshnessStatus = (rawCargo.freshness?.freshness_status || '').toLowerCase();
    const totalizacao = rawCargo.totalizacao || {};
    const eleitorado = rawCargo.eleitorado || {};
    const votos = rawCargo.votos || {};
    const freshness = rawCargo.freshness || {};

    const secoesApuradas = parseInt(totalizacao.secoes_apuradas ?? 0, 10);
    const secoesTotal = parseInt(totalizacao.secoes_total ?? 0, 10);
    const finalizada = totalizacao.totalizacao_finalizada === true || rawStatus === 'finalizado';

    // Determinação do estado eleitoral oficial (Seções 9, 10, 11, 12)
    let status = APP_CONFIG.ELECTORAL_STATUS.AWAITING;

    if (freshnessStatus === 'fallback' || rawStatus === 'fallback') {
      status = APP_CONFIG.ELECTORAL_STATUS.FALLBACK;
    } else if (freshnessStatus === 'error' || rawStatus === 'error') {
      status = APP_CONFIG.ELECTORAL_STATUS.ERROR;
    } else if (finalizada) {
      status = APP_CONFIG.ELECTORAL_STATUS.FINALIZADO;
    } else if (secoesApuradas > 0 && secoesApuradas < secoesTotal) {
      status = APP_CONFIG.ELECTORAL_STATUS.EM_APURACAO;
    } else if (rawStatus === 'aguardando' || rawStatus === 'awaiting' || secoesApuradas === 0) {
      status = APP_CONFIG.ELECTORAL_STATUS.AWAITING;
    } else {
      status = rawStatus || APP_CONFIG.ELECTORAL_STATUS.AWAITING;
    }

    const isAwaiting = (status === APP_CONFIG.ELECTORAL_STATUS.AWAITING);

    // Seção 10: Município Aguardando: vencedor = null, segundo = null, margin_pp = null
    // Não transformar null em 0. Não interpretar ausência de apuração como derrota.
    let vencedor = null;
    let segundoColocado = null;
    let diferencaPp = null;

    if (!isAwaiting) {
      if (rawCargo.vencedor && typeof rawCargo.vencedor === 'object') {
        vencedor = {
          numero: String(rawCargo.vencedor.numero || ''),
          nome: rawCargo.vencedor.nome || '',
          partido: rawCargo.vencedor.partido || '',
          votos: parseInt(rawCargo.vencedor.votos ?? 0, 10),
          percentual: parseFloat(rawCargo.vencedor.percentual ?? 0.0)
        };
      }

      // Seção 14: Segundo colocado derivado dinamicamente do backend, NÃO hardcodado!
      if (rawCargo.segundo_colocado && typeof rawCargo.segundo_colocado === 'object') {
        segundoColocado = {
          numero: String(rawCargo.segundo_colocado.numero || ''),
          nome: rawCargo.segundo_colocado.nome || '',
          partido: rawCargo.segundo_colocado.partido || '',
          votos: parseInt(rawCargo.segundo_colocado.votos ?? 0, 10),
          percentual: parseFloat(rawCargo.segundo_colocado.percentual ?? 0.0)
        };
      }

      // Seção 15: Margem (diferenca_pp) preservada do backend sem substituição
      if (rawCargo.diferenca_pp !== null && rawCargo.diferenca_pp !== undefined) {
        diferencaPp = parseFloat(rawCargo.diferenca_pp);
      }
    }

    // Candidatos específicos para retrocompatibilidade com placar estadual
    const candList = Array.isArray(rawCargo.candidatos) ? rawCargo.candidatos : [];
    const lulaCand = candList.find(c => String(c.numero) === '13');
    const flavioCand = candList.find(c => String(c.numero) === '22');
    const zuccoCand = candList.find(c => String(c.numero) === '22');

    // Seção 13, 14, 16: Campos obrigatórios do estado eleitoral
    return {
      status,
      cargo_codigo: String(rawCargo.cargo_codigo || ''),
      cargo_nome: rawCargo.cargo_nome || cargoNome,
      eleicao: String(rawCargo.eleicao || ''),
      vencedor,
      segundo_colocado: segundoColocado,
      diferenca_pp: diferencaPp,
      votos_validos: parseInt(votos.votos_validos ?? 0, 10),
      total_votos: parseInt(votos.total_votos ?? 0, 10),
      votos_brancos: parseInt(votos.votos_brancos ?? 0, 10),
      votos_nulos: parseInt(votos.votos_nulos ?? 0, 10),
      comparecimento: parseInt(eleitorado.comparecimento ?? 0, 10),
      abstencao: parseInt(eleitorado.abstencao ?? 0, 10),
      total_eleitores: parseInt(eleitorado.total_eleitores ?? 0, 10),
      secoes_apuradas: secoesApuradas,
      secoes_total: secoesTotal,
      percentual_apurado: parseFloat(totalizacao.percentual_totalizacao ?? 0.0),
      candidatos: candList,
      // Retrocompatibilidade UI
      lula: {
        nome: 'Lula',
        numero: 13,
        partido: 'PT',
        votos: lulaCand ? parseInt(lulaCand.votos ?? 0, 10) : 0,
        percentual: lulaCand ? parseFloat(lulaCand.percentual ?? 0.0) : 0.0
      },
      flavio: {
        nome: 'Flávio Bolsonaro',
        numero: 22,
        partido: 'PL',
        votos: flavioCand ? parseInt(flavioCand.votos ?? 0, 10) : 0,
        percentual: flavioCand ? parseFloat(flavioCand.percentual ?? 0.0) : 0.0
      },
      zucco: {
        nome: 'Zucco',
        numero: 22,
        partido: 'PL',
        votos: zuccoCand ? parseInt(zuccoCand.votos ?? 0, 10) : 0,
        percentual: zuccoCand ? parseFloat(zuccoCand.percentual ?? 0.0) : 0.0
      },
      gov2: {
        nome: segundoColocado?.nome || 'Segundo Colocado',
        numero: segundoColocado?.numero || 0,
        partido: segundoColocado?.partido || '',
        votos: segundoColocado?.votos || 0,
        percentual: segundoColocado?.percentual || 0.0
      },
      freshness_status: freshness.freshness_status || 'unknown',
      last_checked: freshness.last_checked || null,
      last_changed: freshness.last_changed || null,
      source_last_modified: freshness.source_last_modified || null
    };
  }

  /**
   * Atualiza o estado global da aplicação com base na totalização média
   */
  updateGlobalState() {
    let totalSecApuradas = 0;
    let totalSecGerais = 0;

    Object.values(this.electionStateMap).forEach(m => {
      const pres = m.presidente;
      totalSecApuradas += pres.secoes_apuradas;
      totalSecGerais += pres.secoes_total;
    });

    if (totalSecApuradas === 0) {
      this.currentState = APP_CONFIG.STATES.WAITING;
    } else if (totalSecApuradas >= totalSecGerais && totalSecGerais > 0) {
      this.currentState = APP_CONFIG.STATES.CONCLUDED;
    } else {
      this.currentState = APP_CONFIG.STATES.PROGRESS;
    }
  }

  /**
   * Seção 8: Validação cruzada Cartografia (GeoJSON) × Consolidado Eleitoral
   * Executa comparação independente entre os 497 CD_MUN do GeoJSON e os 497 do consolidado.
   * Exibe log de desenvolvimento idêntico ao solicitado.
   */
  validateCartographyCrossReference(features) {
    if (!features || !Array.isArray(features)) {
      console.warn('[TSE Normalizer] Validação cruzada ignorada: lista de feições ausente.');
      return;
    }

    const geoCdMuns = [];
    const geoCdSet = new Set();
    let duplicados = 0;

    features.forEach(feat => {
      const rawCd = feat.get('CD_MUN');
      if (rawCd !== undefined && rawCd !== null) {
        const cdStr = String(rawCd).trim();
        if (geoCdSet.has(cdStr)) {
          duplicados++;
        }
        geoCdSet.add(cdStr);
        geoCdMuns.push(cdStr);
      }
    });

    const tseCdSet = new Set(Object.keys(this.electionStateMap));
    
    const cartograficos = geoCdSet.size;
    const eleitorais = tseCdSet.size;
    
    // Interseção e diferenças
    let correspondencias = 0;
    let ausentes = 0;
    
    geoCdSet.forEach(cd => {
      if (tseCdSet.has(cd)) {
        correspondencias++;
      } else {
        ausentes++;
      }
    });

    let adicionais = 0;
    tseCdSet.forEach(cd => {
      if (!geoCdSet.has(cd)) {
        adicionais++;
      }
    });

    const statusStr = (correspondencias === 497 && ausentes === 0 && adicionais === 0 && duplicados === 0) ? 'OK' : 'FALHA';

    // Seção 8: Log estrito em modo de desenvolvimento
    console.log(
`ELEIÇÕES RS 2026
Municípios cartográficos: ${cartograficos}
Municípios eleitorais: ${eleitorais}
Correspondências: ${correspondencias}
Ausentes: ${ausentes}
Adicionais: ${adicionais}
Duplicados: ${duplicados}
STATUS: ${statusStr}`
    );

    return {
      cartograficos,
      eleitorais,
      correspondencias,
      ausentes,
      adicionais,
      duplicados,
      status: statusStr
    };
  }

  // =========================================================================
  // CAMADA DE ACESSO INTERNA (SEÇÃO 18 E 19)
  // =========================================================================

  /**
   * Consulta o estado eleitoral de um município pelo CD_MUN (7 dígitos)
   */
  getElectionByMunicipality(cdMun) {
    if (!cdMun) return null;
    const key = String(cdMun).trim();
    return this.electionStateMap[key] || null;
  }

  /**
   * Consulta os dados oficiais de Presidente para o município
   */
  getPresidentialResult(cdMun) {
    const mun = this.getElectionByMunicipality(cdMun);
    return mun ? mun.presidente : null;
  }

  /**
   * Consulta os dados oficiais de Governador para o município
   */
  getGovernorResult(cdMun) {
    const mun = this.getElectionByMunicipality(cdMun);
    return mun ? mun.governador : null;
  }

  /**
   * Consulta o resultado eleitoral do município para o cargo ativo na aplicação
   */
  getElectionState(cdMun) {
    const mun = this.getElectionByMunicipality(cdMun);
    if (!mun) return null;
    return this.currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? mun.presidente : mun.governador;
  }

  /**
   * Seção 19: Retorna os metadados globais da versão e publicação
   */
  getElectionMetadata() {
    return this.metadata;
  }

  /**
   * Retorna métricas de performance de carregamento
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Seção 20: Capacidade de leitura sob demanda do pipeline_status.json (sem timer/polling)
   */
  async fetchPipelineStatus(url = APP_CONFIG.tsePipelineStatusPath) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[TSE Normalizer] Não foi possível obter pipeline_status:', e.message);
    }
    return null;
  }

  /**
   * Compatibilidade regressiva para componentes existentes (tabela, painel e popups)
   */
  getMunicipioResult(cdMun) {
    const mun = this.getElectionByMunicipality(cdMun);
    if (!mun) return null;

    const pres = mun.presidente;
    const gov = mun.governador;
    const isApurado = (pres.status !== APP_CONFIG.ELECTORAL_STATUS.AWAITING || gov.status !== APP_CONFIG.ELECTORAL_STATUS.AWAITING);

    const presWinnerKey = pres.vencedor ? (String(pres.vencedor.numero) === '13' ? 'lula' : (String(pres.vencedor.numero) === '22' ? 'flavio' : 'other')) : null;
    const govWinnerKey = gov.vencedor ? (String(gov.vencedor.numero) === '22' ? 'zucco' : 'gov2') : null;

    return {
      cdMun: mun.cdMun,
      cdTse: mun.cdTse,
      nmMun: mun.nome,
      apurado: isApurado,
      presidente: {
        ...pres,
        vencedor: presWinnerKey,
        vencedorNome: pres.vencedor?.nome || null,
        margemPercent: pres.diferenca_pp !== null && pres.diferenca_pp !== undefined ? pres.diferenca_pp : 0.0
      },
      governador: {
        ...gov,
        vencedor: govWinnerKey,
        vencedorNome: gov.vencedor?.nome || null,
        margemPercent: gov.diferenca_pp !== null && gov.diferenca_pp !== undefined ? gov.diferenca_pp : 0.0
      },
      votosValidos: pres.votos_validos,
      totalVotos: pres.total_votos,
      votosBrancos: pres.votos_brancos,
      votosNulos: pres.votos_nulos
    };
  }

  /**
   * Gera resumo consolidado para os componentes de UI existentes
   */
  getConsolidatedSummary() {
    if (!this.isLoaded) return null;

    let apuradosCount = 0;
    let pendentesCount = 0;
    let totalSecApuradas = 0;
    let totalSecGerais = 0;

    Object.values(this.electionStateMap).forEach(m => {
      const pres = m.presidente;
      if (pres.status === APP_CONFIG.ELECTORAL_STATUS.AWAITING) {
        pendentesCount++;
      } else {
        apuradosCount++;
      }
      totalSecApuradas += pres.secoes_apuradas;
      totalSecGerais += pres.secoes_total;
    });

    const totalizacaoPct = totalSecGerais > 0 ? (totalSecApuradas / totalSecGerais) * 100 : 0.0;

    return {
      metadata: {
        tipo: 'DADOS OFICIAIS TSE',
        eleicao: 'Eleições Gerais 2026',
        uf: 'RS',
        totalizacaoPercent: totalizacaoPct,
        secoesTotal: totalSecGerais,
        secoesApuradas: totalSecApuradas,
        ultimaAtualizacao: this.metadata?.published_at || new Date().toLocaleString('pt-BR'),
        municipiosTotal: 497,
        municipiosApurados: apuradosCount,
        municipiosPendentes: pendentesCount
      },
      resultados: this.electionStateMap
    };
  }
}

// Instância singleton do Gerenciador de Estado Eleitoral
export const electionState = new ElectionStateManager();

// Funções de acesso exportadas (Seção 18)
export function getElectionByMunicipality(cdMun) {
  return electionState.getElectionByMunicipality(cdMun);
}

export function getPresidentialResult(cdMun) {
  return electionState.getPresidentialResult(cdMun);
}

export function getGovernorResult(cdMun) {
  return electionState.getGovernorResult(cdMun);
}

export function getElectionState(cdMun) {
  return electionState.getElectionState(cdMun);
}

export function getElectionMetadata() {
  return electionState.getElectionMetadata();
}
