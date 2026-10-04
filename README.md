# Eleições RS 2026 — Mapa Eleitoral

WebGIS Interativo para visualização dos resultados eleitorais dos **497 municípios do Estado do Rio Grande do Sul** nas Eleições 2026, com arquitetura preparada para integração com os dados oficiais de apuração do Tribunal Superior Eleitoral (TSE).

## Funcionalidades

- **Mapeamento Coroplético Dinâmico:** Visualização cartográfica com gradientes de intensidade de cor proporcionais à margem percentual de vitória do candidato em cada município.
- **Seletor de Cargos:**
  - **Presidente:** Lula (vermelho progressivo), Flávio Bolsonaro (azul progressivo), Sem dados (cinza neutro).
  - **Governador:** Zucco (amarelo progressivo), 2º Colocado (verde progressivo), Sem dados (cinza neutro).
- **Painel de Totalização:** Monitoramento em tempo real do percentual apurado no estado, contagem de municípios totalizados vs. pendentes e consolidação de votos.
- **Tabela Municipal Completa:** Relação dos 497 municípios com busca rápida por nome ou código IBGE, filtros por vencedor, ordenação por qualquer métrica e sincronização direta com o mapa.
- **Popups e Consulta Individual:** Detalhamento com votos válidos, brancos, nulos, percentuais e status de apuração por município ao passar o mouse ou clicar.
- **Barra de Coordenadas em Tempo Real:** Indicação de coordenadas geográficas (Lat/Lon) e métricas projetadas UTM (Fuso 22S - SIRGAS 2000).
- **Seletor de Mapas de Fundo (Basemaps):** CartoDB Positron (padrão claro), CartoDB Dark Matter, OpenStreetMap e Imagem de Satélite Esri.

## Base Cartográfica

- **Cobertura:** 100% dos 497 municípios do Rio Grande do Sul.
- **Fonte Oficial:** Malha Municipal Digital do IBGE (auditada e validada).
- **Chave de Relacionamento:** Código IBGE de 7 dígitos (`CD_MUN`, String).
- **Projeção:** SIRGAS 2000 / UTM Zona 22S (`EPSG:31982`), convertida para exibição Web Mercator (`EPSG:3857`) via OpenLayers e Proj4js.

## Tecnologias

- **OpenLayers 10** (WebGL & Canvas)
- **Proj4js** (Gerenciamento de Projeções Cartográficas)
- **HTML5 & CSS3 Moderno** (Design responsivo e acessível)
- **JavaScript ES Modules (ESM)** (Vanilla JS puro, sem dependências de compilação)
- **Hospedagem:** Vercel
- **Versionamento:** GitHub
