/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Configurações Gerais da Aplicação e Metadados TSE
 */

export const APP_CONFIG = {
  appName: 'Eleições RS 2026 — Mapa Eleitoral',
  version: '1.0.0',
  uf: 'RS',
  cd_uf: '43',
  totalMunicipios: 497,
  
  // Projeção dos Dados GeoJSON
  sourceCRS: 'EPSG:31982',
  displayCRS: 'EPSG:3857',

  // Caminho do GeoJSON dos 497 Municípios
  geoJsonPath: 'data/Municipios_RS_497.geojson',

  // Coordenadas Centrais do Rio Grande do Sul (EPSG:4326)
  centerRS: [-52.8, -30.1],
  defaultZoom: 7.2,
  minZoom: 6.0,
  maxZoom: 14.0,

  // Estados de Operação do Sistema
  STATES: {
    WAITING: 'WAITING',       // 1 - Aguardando Apuração Oficial TSE
    PROGRESS: 'PROGRESS',     // 2 - Apuração em Andamento
    CONCLUDED: 'CONCLUDED'    // 3 - Totalização Concluída
  },

  // Cargos Eletivos Monitorados
  CARGOS: {
    PRESIDENTE: 'PRESIDENTE',
    GOVERNADOR: 'GOVERNADOR'
  },

  // Candidatos e Metadados
  CANDIDATOS: {
    PRESIDENTE: {
      candidato1: { id: 'lula', nome: 'Lula', numero: 13, partido: 'PT', colorBase: '#ef4444' },
      candidato2: { id: 'flavio', nome: 'Flávio Bolsonaro', numero: 22, partido: 'PL', colorBase: '#3b82f6' }
    },
    GOVERNADOR: {
      candidato1: { id: 'zucco', nome: 'Zucco', numero: 22, partido: 'PL', colorBase: '#eab308' },
      candidato2: { id: 'gov2', nome: 'Segundo Colocado', numero: 0, partido: 'TSE', colorBase: '#22c55e' }
    }
  }
};
