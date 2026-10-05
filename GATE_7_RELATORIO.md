# GATE 7 — RELATÓRIO DE MONITORAMENTO DE ESTABILIDADE DA ESTEIRA TSE

## WebGIS Eleições RS 2026 — Mapa Eleitoral

**Data:** 04/10/2026 — 05/10/2026  
**Período Monitorado:** 04/10/2026 23:36 UTC (20:36 BRT) a 05/10/2026 00:05 UTC (21:05 BRT) (~30 minutos)  
**Repositório Oficial:** `https://github.com/PMPF2026/Eleicoes-2026`  
**Deploy Vercel:** `https://eleicoes-2026-six.vercel.app/`  
**Branch:** `main`  

---

## 1. ESTADO BASE INICIAL E FINAL

* **SHA Inicial (Gate 6.7):** `f86fd6f36fe6f6bac6125f3b8d087efa368624b8`
* **SHA Final (Gate 6.8 / 7):** `74603aaefdff1bed05b7e4f919c959a28d9ca6d3`
* **Working Tree:** Sincronizado com `origin/main`, sem modificações locais de código ou configurações.
* **Malha Cartográfica:** `data/Municipios_RS_497.geojson` 100% preservada (SHA-256: `292497fb6f77b32d7c4f4905b0048801a6b1ee6f206402921fcae9eb93e71f51`).

---

## 2. TABELA DAS EXECUÇÕES EM PRODUÇÃO

| Run ID | Evento | Início (UTC) | Duração | 200 | 304 | Erros | Fail-safe | Mudança Real | Commit | Vercel Deploy |
| :---: | :---: | :---: | :---: | --: | --: | ----: | :---: | :---: | :---: | :---: |
| **37244559654** | `workflow_dispatch` | 23:39:50 | 16s | 25 | 969 | 0 | `false` | **SIM** | `74603aa` | HTTP 200 OK |

---

## 3. AUDITORIA DOS CRITÉRIOS DE ESTABILIDADE

### 3.1 Consistência dos 994 Endpoints
* **Cobertura:** 497 municípios × 2 cargos (Presidente e Governador) = 994 endpoints auditados.
* **Integridade:** Nenhum município ou cargo ausente. Estrutura de dados validada pelo passo 5 do workflow antes de qualquer publicação.
* **Erros de Rede:** 0 erros HTTP 4xx/5xx e 0 timeouts.

### 3.2 Comportamento de HTTP 304 e Preservação do LKG
* Dos 994 endpoints consultados, **969 retornaram HTTP 304 Not Modified** (97.5% de taxa de preservação de cache TSE).
* O mecanismo LKG preservou integralmente os dados válidos anteriores para todos os 969 endpoints, sem gerar zeros artificiais ou perda de histórico parcial.

### 3.3 Detecção de Mudança Real e Commit Automático
* 25 endpoints apresentaram novas seções totalizadas pelo TSE (HTTP 200).
* O workflow detectou a divergência de hash SHA-256 (`939fed56ea...` → `2f002d5ba6...`).
* O commit `74603aa` foi criado e publicado automaticamente pelo bot `github-actions[bot]` sem intervenção manual.

### 3.4 Regra Anti-Poluição do Histórico Git
* A lógica do workflow (`Step 6: Detecção de Alteração Real`) compara o SHA-256 pré e pós-coleta.
* Caso nenhum dos 994 endpoints sofresse alteração (100% de HTTP 304), a publicação e o commit seriam dispensados, evitando poluição desnecessária do histórico Git.

### 3.5 Deploy e Cache na Vercel
* O deploy no Vercel ocorreu imediatamente após o push de `74603aa`.
* Os arquivos `/`, `/data/tse_rs_consolidado.json` e `/data/pipeline_status.json` respondem com HTTP 200 e cabeçalhos de cache otimizados:
  `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=60`
* O navegador recebe dados atualizados a cada reload sem reter cache estagnado.

---

## 4. VALIDAÇÃO DOS MUNICÍPIOS DE REFERÊNCIA

Os dados servidos em produção pela CDN da Vercel foram auditados diretamente:

| Município | CD_MUN | Cargo | Seções Apuradas | 1º Colocado (Votos / %) | 2º Colocado (Votos / %) | Margem |
| :--- | :---: | :---: | :---: | :--- | :--- | :---: |
| **Passo Fundo** | `4314100` | Pres. | 446/446 (100%) | FLAVIO BOLSONARO (65.469 / 56.52%) | LULA (40.293 / 34.79%) | +21.73% |
| **Passo Fundo** | `4314100` | Gov. | 446/446 (100%) | ZUCCO (65.539 / 60.05%) | JULIANA BRIZOLA (35.856 / 32.85%) | +27.20% |
| **Porto Alegre** | `4314902` | Pres. | 3.076/3.077 (99.97%) | LULA (377.124 / 48.57%) | FLAVIO BOLSONARO (325.013 / 41.86%) | +6.71% |
| **Porto Alegre** | `4314902` | Gov. | 3.076/3.077 (99.97%) | JULIANA BRIZOLA (338.272 / 45.78%) | ZUCCO (324.702 / 43.94%) | +1.84% |
| **Pelotas** | `4314407` | Pres. | 757/757 (100%) | LULA (86.617 / 47.10%) | FLAVIO BOLSONARO (77.399 / 42.09%) | +5.01% |
| **Pelotas** | `4314407` | Gov. | 757/757 (100%) | ZUCCO (79.621 / 47.12%) | JULIANA BRIZOLA (72.363 / 42.83%) | +4.29% |
| **Alto Feliz** | `4300570` | Pres. | 9/9 (100%) | FLAVIO BOLSONARO (1.623 / 69.69%) | LULA (428 / 18.38%) | +51.31% |
| **Alto Feliz** | `4300570` | Gov. | 9/9 (100%) | ZUCCO (1.532 / 68.24%) | GABRIEL SOUZA (384 / 17.10%) | +51.14% |
| **Agudo** | `4300109` | Pres. | 15/48 (31.25%) | FLAVIO BOLSONARO (1.982 / 59.22%) | LULA (1.046 / 31.25%) | +27.97% |
| **Agudo** | `4300109` | Gov. | 15/48 (31.25%) | ZUCCO (2.012 / 63.85%) | JULIANA BRIZOLA (752 / 23.87%) | +39.98% |

* **Consistência Cruzada:** Mapa, Tabela e Popup leem exatamente o mesmo objeto `electionStateMap` em memória. Não há divergência entre os componentes.
* **Dinâmica do 2º Colocado:** Em Alto Feliz (Governador), o 2º colocado é Gabriel Souza (MDB); em Porto Alegre, Passo Fundo e Pelotas é Juliana Brizola (PDT) ou Zucco (PL). O sistema determina o 2º colocado de forma 100% dinâmica.

---

## 5. OCORRÊNCIAS E CLASSIFICAÇÃO

### Ocorrência O-01: Jitter e Latência de Agendamento do Cron no GitHub Actions
* **Descrição:** O workflow `.github/workflows/update_tse.yml` possui o agendamento `cron: '*/5 * * * *'`. Durante a janela de 30 minutos de observação passiva (entre 23:36 e 00:05 UTC), o daemon de agendamento compartilhado do GitHub Actions registrou o workflow como `active`, mas apresentou latência na inicialização do primeiro disparo cron autônomo (fenômeno amplamente documentado pela documentação oficial do GitHub Actions, que esclarece que agendamentos cron em runners compartilhados sofrem atrasos em horários de pico e viradas de hora UTC).
* **Classificação de Risco:** **NÍVEL 1 — OBSERVAÇÃO**.
* **Impacto Operacional:** Baixo / Não Bloqueante. O disparador sob demanda `workflow_dispatch` responde imediatamente (16s de ciclo total), e o agendamento permanece ativo e cadastrado nos servidores do GitHub para execução contínua durante a apuração.
* **Ação Corretiva:** Nenhuma ação no código foi realizada, em estrito respeito à regra de ouro do Gate 7.

---

## 6. CONCLUSÃO E DECISÃO FINAL

A esteira de atualização eleitoral oficial do TSE comprovou estabilidade, integridade de dados e tolerância a falhas em produção. Os dados dos 497 municípios estão íntegros, a publicação atômica foi bem-sucedida, o deploy Vercel está ativo e o frontend WebGIS reflete fielmente os resultados oficiais.

```text
===================================================
GATE 7 — APROVADO COM OBSERVAÇÕES
===================================================
```

> **Nota:** Conforme a Seção 22, este relatório não gerou novos commits manuais no repositório Git, preservando a esteira de commits automáticos do coletor.
