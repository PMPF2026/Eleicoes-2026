/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Simbologia Cartográfica e Estilos Dinâmicos OpenLayers
 * GATE 6.2 — Implementação Cirúrgica da Simbologia Eleitoral Temática (Coroplético)
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

// Cores base para escalas graduadas (5 classes de intensidade por família cromática)
export const PALETTE = {
  // Tons de Vermelho (Lula - PT #13)
  lula: [
    'rgba(254, 226, 226, 0.88)', // Classe 0: < 2 pp (Muito Baixa)
    'rgba(252, 165, 165, 0.88)', // Classe 1: 2 a < 5 pp (Baixa)
    'rgba(248, 113, 113, 0.90)', // Classe 2: 5 a < 10 pp (Média)
    'rgba(239, 68, 68, 0.92)',  // Classe 3: 10 a < 20 pp (Alta)
    'rgba(185, 28, 28, 0.95)'   // Classe 4: >= 20 pp (Muito Alta)
  ],

  // Tons de Azul (Flávio Bolsonaro - PL #22)
  flavio: [
    'rgba(219, 234, 254, 0.88)', // Classe 0: < 2 pp (Muito Baixa)
    'rgba(147, 197, 253, 0.88)', // Classe 1: 2 a < 5 pp (Baixa)
    'rgba(96, 165, 250, 0.90)',  // Classe 2: 5 a < 10 pp (Média)
    'rgba(59, 130, 246, 0.92)',  // Classe 3: 10 a < 20 pp (Alta)
    'rgba(29, 78, 216, 0.95)'   // Classe 4: >= 20 pp (Muito Alta)
  ],

  // Tons de Amarelo (Zucco - PL #22)
  zucco: [
    'rgba(254, 249, 195, 0.88)', // Classe 0: < 2 pp (Muito Baixa)
    'rgba(253, 224, 71, 0.88)',  // Classe 1: 2 a < 5 pp (Baixa)
    'rgba(234, 179, 8, 0.90)',   // Classe 2: 5 a < 10 pp (Média)
    'rgba(202, 138, 4, 0.92)',   // Classe 3: 10 a < 20 pp (Alta)
    'rgba(161, 98, 7, 0.95)'     // Classe 4: >= 20 pp (Muito Alta)
  ],

  // Tons de Verde (Segundo Colocado Dinâmico Governador / Juliana Brizola)
  segundo_colocado: [
    'rgba(220, 252, 231, 0.88)', // Classe 0: < 2 pp (Muito Baixa)
    'rgba(134, 239, 172, 0.88)', // Classe 1: 2 a < 5 pp (Baixa)
    'rgba(74, 222, 128, 0.90)',  // Classe 2: 5 a < 10 pp (Média)
    'rgba(34, 197, 94, 0.92)',   // Classe 3: 10 a < 20 pp (Alta)
    'rgba(21, 128, 61, 0.95)'    // Classe 4: >= 20 pp (Muito Alta)
  ],

  // Retrocompatibilidade UI
  gov2: [
    'rgba(220, 252, 231, 0.88)',
    'rgba(134, 239, 172, 0.88)',
    'rgba(74, 222, 128, 0.90)',
    'rgba(34, 197, 94, 0.92)',
    'rgba(21, 128, 61, 0.95)'
  ],

  // Sem dados / Awaiting / Erro / Empate / Outros
  semDados: 'rgba(148, 163, 184, 0.70)'
};

/**
 * Seção 12: Escala determinística discreta de 5 classes de intensidade por margem percentual
 * Retorna o índice de 0 a 4 correspondente à classe, ou -1 se margem indefinida/nula.
 */
export function getMarginClass(margin) {
  if (margin === null || margin === undefined || isNaN(margin)) {
    return -1;
  }
  const m = parseFloat(margin);
  if (m < 2.0) return 0;       // muito baixa (< 2 pp)
  if (m < 5.0) return 1;       // baixa (2 a < 5 pp)
  if (m < 10.0) return 2;      // média (5 a < 10 pp)
  if (m < 20.0) return 3;      // alta (10 a < 20 pp)
  return 4;                    // muito alta (>= 20 pp)
}

/**
 * Seção 5: Determina a categoria cromática para Presidente
 */
export function getPresidentCategory(result) {
  if (!result || result.status === 'awaiting' || result.status === 'aguardando' || !result.vencedor) {
    return 'sem_dados';
  }
  if (result.status === 'error') {
    return 'error';
  }
  // Seção 10: Empate não escolhe vencedor arbitrário
  if (result.diferenca_pp === 0.0) {
    return 'empate';
  }

  const venc = result.vencedor;
  const num = String(venc.numero || '').trim();
  const nome = (venc.nome || '').toUpperCase();

  if (num === '13' || nome.includes('LULA')) {
    return 'lula';
  }
  if (num === '22' || nome.includes('FLAVIO') || nome.includes('BOLSONARO')) {
    return 'flavio';
  }
  return 'outros';
}

/**
 * Seção 6: Determina a categoria cromática para Governador
 * Segundo colocado derivado dinamicamente do estado eleitoral (não hardcodado)
 */
export function getGovernorCategory(result) {
  if (!result || result.status === 'awaiting' || result.status === 'aguardando' || !result.vencedor) {
    return 'sem_dados';
  }
  if (result.status === 'error') {
    return 'error';
  }
  // Seção 10: Empate não escolhe vencedor arbitrário
  if (result.diferenca_pp === 0.0) {
    return 'empate';
  }

  const venc = result.vencedor;
  const num = String(venc.numero || '').trim();
  const nome = (venc.nome || '').toUpperCase();

  if (num === '22' || nome.includes('ZUCCO')) {
    return 'zucco';
  }
  // Se Zucco não venceu o município, o vencedor é o concorrente/segundo colocado estadual
  return 'segundo_colocado';
}

/**
 * Retorna a cor de preenchimento correspondente à categoria e índice de intensidade
 */
export function getElectoralColor(category, intensityIndex) {
  if (category === 'sem_dados' || category === 'error' || category === 'empate' || category === 'outros') {
    return PALETTE.semDados;
  }
  const family = PALETTE[category];
  if (!family || !Array.isArray(family)) {
    return PALETTE.semDados;
  }
  const idx = Math.max(0, Math.min(intensityIndex, family.length - 1));
  return family[idx];
}

/**
 * Função de conveniência retrocompatível
 */
export function getFillColor(vencedor, margem) {
  if (!vencedor || !PALETTE[vencedor]) {
    return PALETTE.semDados;
  }
  const idx = getMarginClass(margem);
  if (idx < 0) return PALETTE.semDados;
  return getElectoralColor(vencedor, idx);
}

// Cache de instâncias de ol.style.Style para otimização de performance (sub-milissegundo)
const styleCache = new Map();

function getCachedStyle(fillColor) {
  let style = styleCache.get(fillColor);
  if (!style) {
    style = new ol.style.Style({
      fill: new ol.style.Fill({
        color: fillColor
      }),
      stroke: new ol.style.Stroke({
        color: 'rgba(255, 255, 255, 0.55)',
        width: 0.8
      })
    });
    styleCache.set(fillColor, style);
  }
  return style;
}

/**
 * Seção 16: Função modular de simbologia eleitoral
 * Recebe o feature cartográfico e calcula o estilo com base no CD_MUN e estado eleitoral ativo.
 */
export function getElectoralStyle(feature, electionStateInstance = electionState, cargo = null) {
  const cdMun = String(feature.get('CD_MUN') || '').trim();
  if (!cdMun || !/^\d{7}$/.test(cdMun)) {
    return getCachedStyle(PALETTE.semDados);
  }

  const munData = electionStateInstance.getElectionByMunicipality(cdMun);
  if (!munData) {
    return getCachedStyle(PALETTE.semDados);
  }

  const activeCargo = cargo || electionStateInstance.currentCargo || APP_CONFIG.CARGOS.PRESIDENTE;
  const result = (activeCargo === APP_CONFIG.CARGOS.GOVERNADOR) ? munData.governador : munData.presidente;

  if (!result) {
    return getCachedStyle(PALETTE.semDados);
  }

  const category = (activeCargo === APP_CONFIG.CARGOS.GOVERNADOR)
    ? getGovernorCategory(result)
    : getPresidentCategory(result);

  const intensityIdx = getMarginClass(result.diferenca_pp);
  const fillColor = getElectoralColor(category, intensityIdx);

  return getCachedStyle(fillColor);
}

/**
 * Função de estilo principal do OpenLayers para os 497 municípios
 */
export function municipalStyleFunction(feature, resolution) {
  return getElectoralStyle(feature, electionState);
}

/**
 * Estilo de destaque para município sob o cursor (Hover)
 */
export function hoverStyleFunction(feature) {
  const baseStyle = municipalStyleFunction(feature);
  return new ol.style.Style({
    fill: baseStyle.getFill(),
    stroke: new ol.style.Stroke({
      color: '#ffffff',
      width: 2.5
    }),
    zIndex: 100
  });
}

/**
 * Estilo de destaque para município selecionado (Clique / Pesquisa)
 */
export function selectedStyleFunction(feature) {
  const baseStyle = municipalStyleFunction(feature);
  return new ol.style.Style({
    fill: baseStyle.getFill(),
    stroke: new ol.style.Stroke({
      color: '#38bdf8',
      width: 3.5
    }),
    zIndex: 200
  });
}
