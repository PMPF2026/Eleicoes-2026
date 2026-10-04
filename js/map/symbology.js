/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Simbologia Cartográfica e Estilos Dinâmicos OpenLayers
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

// Cores base para escalas graduadas
const PALETTE = {
  // Tons de Vermelho (Lula)
  lula: [
    'rgba(254, 202, 202, 0.75)', // Margem < 5% (Muito Claro)
    'rgba(248, 113, 113, 0.80)', // Margem 5% - 15% (Claro)
    'rgba(239, 68, 68, 0.85)',  // Margem 15% - 30% (Médio)
    'rgba(185, 28, 28, 0.90)'   // Margem > 30% (Intenso)
  ],

  // Tons de Azul (Flávio Bolsonaro)
  flavio: [
    'rgba(191, 219, 254, 0.75)', // Margem < 5% (Muito Claro)
    'rgba(96, 165, 250, 0.80)',  // Margem 5% - 15% (Claro)
    'rgba(59, 130, 246, 0.85)',  // Margem 15% - 30% (Médio)
    'rgba(29, 78, 216, 0.90)'    // Margem > 30% (Intenso)
  ],

  // Tons de Amarelo (Zucco)
  zucco: [
    'rgba(254, 240, 138, 0.75)', // Margem < 5% (Muito Claro)
    'rgba(250, 204, 21, 0.80)',  // Margem 5% - 15% (Claro)
    'rgba(234, 179, 8, 0.85)',   // Margem 15% - 30% (Médio)
    'rgba(161, 98, 7, 0.90)'     // Margem > 30% (Intenso)
  ],

  // Tons de Verde (Segundo Colocado Governador)
  gov2: [
    'rgba(187, 247, 208, 0.75)', // Margem < 5% (Muito Claro)
    'rgba(74, 222, 128, 0.80)',  // Margem 5% - 15% (Claro)
    'rgba(34, 197, 94, 0.85)',   // Margem 15% - 30% (Médio)
    'rgba(21, 128, 61, 0.90)'    // Margem > 30% (Intenso)
  ],

  // Sem dados / Neutro
  semDados: 'rgba(148, 163, 184, 0.65)'
};

/**
 * Retorna a cor de preenchimento baseada no vencedor e na margem percentual
 */
export function getFillColor(vencedor, margem) {
  if (!vencedor || !PALETTE[vencedor]) {
    return PALETTE.semDados;
  }

  const palette = PALETTE[vencedor];
  if (margem < 5.0) return palette[0];
  if (margem < 15.0) return palette[1];
  if (margem < 30.0) return palette[2];
  return palette[3];
}

/**
 * Função de estilo principal do OpenLayers para os 497 municípios
 */
export function municipalStyleFunction(feature, resolution) {
  const cdMun = String(feature.get('CD_MUN'));
  const currentCargo = electionState.currentCargo;
  const result = electionState.getMunicipioResult(cdMun);

  let fillColor = PALETTE.semDados;

  if (result && result.apurado) {
    if (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE && result.presidente) {
      fillColor = getFillColor(result.presidente.vencedor, result.presidente.margemPercent);
    } else if (currentCargo === APP_CONFIG.CARGOS.GOVERNADOR && result.governador) {
      fillColor = getFillColor(result.governador.vencedor, result.governador.margemPercent);
    }
  }

  return new ol.style.Style({
    fill: new ol.style.Fill({
      color: fillColor
    }),
    stroke: new ol.style.Stroke({
      color: 'rgba(255, 255, 255, 0.45)',
      width: 0.8
    })
  });
}

/**
 * Estilo de destaque para município sob o cursor (Hover)
 */
export function hoverStyleFunction(feature) {
  const baseStyle = municipalStyleFunction(feature);
  return new ol.style.Style({
    fill: baseStyle.getFill(),
    stroke: new ol.style.Stroke({
      color: '#f8fafc',
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
