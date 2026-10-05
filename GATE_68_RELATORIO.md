# GATE 6.8 — RELATÓRIO DE ATIVAÇÃO E VALIDAÇÃO OPERACIONAL EM PRODUÇÃO

## WebGIS Eleições RS 2026 — Mapa Eleitoral

**Data:** 04/10/2026  
**Ambiente:** GitHub Actions CI/CD + Vercel Production  
**Repositório Oficial:** `https://github.com/PMPF2026/Eleicoes-2026`  
**Deploy Vercel:** `https://eleicoes-2026-six.vercel.app/`  
**Branch:** `main`  

---

## 1. RESUMO DA EXECUÇÃO OPERACIONAL

A primeira execução operacional real da esteira de automação do TSE em ambiente de produção foi disparada com sucesso pleno, cumprindo todos os requisitos estabelecidos no **GATE 6.8**.

O fluxo completo foi validado de ponta a ponta:

```text
TSE CDN Oficial (994 endpoints)
               ↓
GitHub Actions (Runner Ubuntu-Latest / Python 3.11)
               ↓
scripts/tse_collector.py (Lock de concorrência ativo)
               ↓
Validação de Integridade (497 municípios × 2 cargos = 994 estados)
               ↓
Detecção de Alteração Real (Checksum SHA-256)
               ↓
Commit Automático [github-actions bot] + Git Push
               ↓
Deploy Automático no Edge Vercel (Cache-Control otimizado)
               ↓
WebGIS em Produção (Consumo exclusivo do consolidado)
```

---

## 2. DADOS DA EXECUÇÃO (GITHUB ACTIONS)

* **Run ID:** `37244559654`
* **Nome do Workflow:** `Atualização Oficial dos Resultados TSE`
* **Arquivo do Workflow:** `.github/workflows/update_tse.yml`
* **Evento de Disparo:** `workflow_dispatch` (manual via GitHub Actions API)
* **Data/Hora de Início:** 04/10/2026 23:39:50 UTC (20:39:50 BRT)
* **Data/Hora de Término:** 04/10/2026 23:40:06 UTC (20:40:06 BRT)
* **Duração Total do Job:** **16 segundos**
* **Status Final:** `completed`
* **Conclusão:** `success`
* **URL da Execução:** `https://github.com/PMPF2026/Eleicoes-2026/actions/runs/37244559654`

---

## 3. MÉTRICAS DA COLETA TSE

* **Total de Endpoints Auditados:** 994 (497 municípios × 2 cargos)
* **Cargos Processados:** Presidente (`6257`) e Governador (`6259`)
* **Municípios Cobertos:** 497 / 497 (100% dos municípios do RS)
* **Respostas HTTP 200 (Novos Dados):** 25 endpoints
* **Respostas HTTP 304 (Sem Alteração / LKG):** 969 endpoints
* **Erros de Rede / HTTP 4xx / 5xx:** **0 erros**
* **Timeouts / Falhas:** **0 falhas**
* **Fallbacks Acionados:** 0
* **Duração da Coleta no Coletor:** 7.35 segundos

---

## 4. ESTADO DO PIPELINE E FAIL-SAFE

* **Pipeline State:** `success`
* **Fail-Safe Acionado:** `false` (limiar de 5% respeitado com folga de 100%)
* **Data Version:** `20261004.233953`
* **Collection ID:** `cycle-20261004-233953`
* **Tamanho do Arquivo Consolidado:** 7.901.776 bytes
* **Hash SHA-256 do Consolidado:** `2f002d5ba66222085f1b0f60fa0c0bd1c509660d00d2ec12f0d0ed0c66c9f989`
* **Validação de Integridade Pré-Publicação:** **APROVADO** (497 municípios, Presidente e Governador presentes, checksum correspondente)

---

## 5. CONTROLE DE VERSÃO E COMMIT AUTOMÁTICO

* **Detecção de Mudança:** SHA anterior (`939fed56ea...`) ≠ SHA novo (`2f002d5ba6...`).
* **Ação do Workflow:** Alteração real detectada; commit automático executado conforme a regra anti-poluição.
* **Commit Anterior:** `f86fd6f36fe6f6bac6125f3b8d087efa368624b8`
* **Novo Commit Automático:** `74603aaefdff1bed05b7e4f919c959a28d9ca6d3`
* **Autor:** `github-actions[bot] <github-actions[bot]@users.noreply.github.com>`
* **Mensagem:** `chore(tse): atualizacao automatica [cycle-20261004-233953] (200=25, 304=969)`
* **Push Automático:** Realizado diretamente para `origin/main` sem `--force`.
* **Working Tree Local:** Sincronizado (`git pull origin main`), 100% limpo.

---

## 6. VALIDAÇÃO DO DEPLOY NO VERCEL

* **URL de Produção:** `https://eleicoes-2026-six.vercel.app/`
* **Status HTTP do Portal (`/`):** 200 OK
* **Status HTTP do Consolidado (`/data/tse_rs_consolidado.json`):** 200 OK
* **Status HTTP do Pipeline Status (`/data/pipeline_status.json`):** 200 OK
* **Headers de Cache Observados:** `public, max-age=0, s-maxage=30, stale-while-revalidate=60`
* **Propagação no Edge:** O arquivo consolidado em produção reflete imediatamente a versão `20261004.233953` com SHA `2f002d5ba66222085f1b0f60fa0c0bd1c509660d00d2ec12f0d0ed0c66c9f989`.

---

## 7. VALIDAÇÃO DOS MUNICÍPIOS DE REFERÊNCIA

Os dados em produção foram auditados individualmente para as cidades de referência:

### 7.1 Passo Fundo (4314100)
* **Presidente:** Status `em_apuracao` | 446/446 seções (100.0%) | 1º: FLAVIO BOLSONARO (PL) 65.469 votos (56.52%) | 2º: LULA (PT) 40.293 votos (34.79%) | Margem: +21.73 p.p.
* **Governador:** Status `em_apuracao` | 446/446 seções (100.0%) | 1º: ZUCCO (PL) 65.539 votos (60.05%) | 2º: JULIANA BRIZOLA (PDT) 35.856 votos (32.85%) | Margem: +27.20 p.p.

### 7.2 Porto Alegre (4314902)
* **Presidente:** Status `em_apuracao` | 3.076/3.077 seções (99.97%) | 1º: LULA (PT) 377.124 votos (48.57%) | 2º: FLAVIO BOLSONARO (PL) 325.013 votos (41.86%) | Margem: +6.71 p.p.
* **Governador:** Status `em_apuracao` | 3.076/3.077 seções (99.97%) | 1º: JULIANA BRIZOLA (PDT) 338.272 votos (45.78%) | 2º: ZUCCO (PL) 324.702 votos (43.94%) | Margem: +1.84 p.p.

### 7.3 Pelotas (4314407)
* **Presidente:** Status `em_apuracao` | 757/757 seções (100.0%) | 1º: LULA (PT) 86.617 votos (47.10%) | 2º: FLAVIO BOLSONARO (PL) 77.399 votos (42.09%) | Margem: +5.01 p.p.
* **Governador:** Status `em_apuracao` | 757/757 seções (100.0%) | 1º: ZUCCO (PL) 79.621 votos (47.12%) | 2º: JULIANA BRIZOLA (PDT) 72.363 votos (42.83%) | Margem: +4.29 p.p.

### 7.4 Alto Feliz (4300570)
* **Presidente:** Status `em_apuracao` | 9/9 seções (100.0%) | 1º: FLAVIO BOLSONARO (PL) 1.623 votos (69.69%) | 2º: LULA (PT) 428 votos (18.38%) | Margem: +51.31 p.p.
* **Governador:** Status `em_apuracao` | 9/9 seções (100.0%) | 1º: ZUCCO (PL) 1.532 votos (68.24%) | 2º: GABRIEL SOUZA (MDB) 384 votos (17.10%) | Margem: +51.14 p.p.

### 7.5 Agudo (4300109)
* **Presidente:** Status `em_apuracao` | 15/48 seções (31.25%) | 1º: FLAVIO BOLSONARO (PL) 1.982 votos (59.22%) | 2º: LULA (PT) 1.046 votos (31.25%) | Margem: +27.97 p.p.
* **Governador:** Status `em_apuracao` | 15/48 seções (31.25%) | 1º: ZUCCO (PL) 2.012 votos (63.85%) | 2º: JULIANA BRIZOLA (PDT) 752 votos (23.87%) | Margem: +39.98 p.p.

---

## 8. CONSISTÊNCIA ENTRE MAPA, POPUP E TABELA

* O normalizador (`js/data/tse-normalizer.js`) gera uma estrutura unificada `electionStateMap`.
* Mapa (`js/map/symbology.js`), Popup (`js/ui/popup.js`) e Tabela (`js/ui/table-view.js`) utilizam exclusivamente a mesma referência de dados.
* Vencedor, 2º colocado, percentuais, margem, total de seções e status de apuração são rigorosamente coerentes e idênticos em todas as três visões.
* Zero divergência constatada.

---

## 9. CONFIGURAÇÃO DE AUTOMAÇÃO FUTURA

* O cron de atualização automática permanece ativo em `.github/workflows/update_tse.yml`:
  ```yaml
  schedule:
    - cron: '*/5 * * * *'
  ```
* O gatilho manual `workflow_dispatch` permanece disponível para disparos sob demanda.
* A regra de anti-poluição garante que os próximos ciclos que retornarem HTTP 304 não criarão commits espúrios.

---

## 10. DECISÃO FINAL

Todos os critérios de homologação em produção foram integralmente cumpridos:

```text
===================================================
GATE 6.8 — APROVADO
===================================================
```

A esteira de atualização e publicação dos resultados eleitorais oficiais do TSE está plenamente ativada, segura, auditada e em operação em produção.
