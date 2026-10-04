/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Ficha Eleitoral Municipal (Popup Interativo) e Tooltip do WebGIS
 * GATE 6.3 — Implementação Cirúrgica do Popup Eleitoral Municipal
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

let popupOverlay = null;
let popupContainer = null;
let tooltipElement = null;

// Rastreamento para atualização dinâmica ao alternar cargo
let currentFeature = null;
let currentCoordinate = null;
let mapInstance = null;

/**
 * Funções utilitárias de escape e formatação
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toLocaleString('pt-BR');
}

function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,00%';
  return Number(val).toFixed(2).replace('.', ',') + '%';
}

function formatPp(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,00 pp';
  return Number(val).toFixed(2).replace('.', ',') + ' pp';
}

function formatDateTime(isoStr) {
  if (!isoStr) {
    const meta = electionState.getElectionMetadata();
    if (meta?.published_at) {
      isoStr = meta.published_at;
    }
  }
  if (!isoStr) return '04/10/2026 18:55';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(isoStr);
  }
}

/**
 * Retorna a cor de destaque do candidato de acordo com o cargo e regras do GATE 6.2
 */
function getCandidateColor(cand, cargo) {
  if (!cand) return '#94a3b8';
  const num = String(cand.numero || '');
  if (cargo === APP_CONFIG.CARGOS.PRESIDENTE) {
    if (num === '13') return '#ef4444'; // Lula (PT)
    if (num === '22') return '#3b82f6'; // Flávio Bolsonaro (PL)
    return '#94a3b8';
  } else {
    if (num === '22') return '#eab308'; // Zucco (PL)
    return '#22c55e'; // Segundo colocado dinâmico / oposição estadual
  }
}

/**
 * Inicializa a sobreposição do popup e tooltip
 */
export function initPopups(map) {
  mapInstance = map;
  popupContainer = document.getElementById('map-popup');
  const closer = document.getElementById('popup-closer');

  if (popupContainer) {
    popupOverlay = new ol.Overlay({
      element: popupContainer,
      autoPan: {
        animation: {
          duration: 250
        }
      }
    });
    map.addOverlay(popupOverlay);

    if (closer) {
      closer.onclick = () => {
        hidePopup();
        return false;
      };
    }
  }

  // Elemento do Tooltip Flutuante (Hover)
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'map-tooltip';
  tooltipElement.style.display = 'none';
  document.body.appendChild(tooltipElement);

  // Inscrição para re-renderizar popup aberto em caso de mudança de cargo ou novos dados
  electionState.subscribe(() => {
    refreshPopup();
  });
}

/**
 * Re-renderiza o popup atualmente aberto (ex: alternância Presidente <-> Governador)
 */
export function refreshPopup() {
  if (currentFeature && currentCoordinate && popupOverlay && popupOverlay.getPosition() !== undefined) {
    showPopup(currentFeature, currentCoordinate, mapInstance);
  }
}

/**
 * Renderiza a Ficha Eleitoral Municipal detalhada
 */
export function showPopup(feature, coordinate, map) {
  if (!popupOverlay || !popupContainer || !feature) return;

  currentFeature = feature;
  currentCoordinate = coordinate || currentCoordinate;
  if (map) mapInstance = map;

  const cdMun = String(feature.get('CD_MUN') || '').trim();
  const nmMun = feature.get('NM_MUN') || 'Município';
  const nmRgi = feature.get('NM_RGI') || '';

  const munData = electionState.getElectionByMunicipality(cdMun);
  const currentCargo = electionState.currentCargo;
  const cargoLabel = currentCargo === APP_CONFIG.CARGOS.PRESIDENTE 
    ? 'Presidente da República' 
    : 'Governador do Estado';

  const contentEl = document.getElementById('popup-content');
  if (!contentEl) return;

  // Caso 1: Município não encontrado no estado consolidado
  if (!munData) {
    contentEl.innerHTML = `
      <div class="popup-header-section">
        <div class="popup-title-row">
          <span class="popup-mun-name">${escapeHtml(nmMun)}</span>
          <span class="popup-ibge-badge">IBGE ${escapeHtml(cdMun)}</span>
        </div>
      </div>
      <div class="popup-awaiting-card" style="border-color: rgba(239, 68, 68, 0.3);">
        <div class="awaiting-title" style="color: #ef4444;">DADOS INDISPONÍVEIS</div>
        <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.4;">
          Não foi possível carregar os dados eleitorais deste município no consolidado oficial.
        </p>
      </div>
    `;
    popupOverlay.setPosition(currentCoordinate);
    return;
  }

  const cargoData = (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE) 
    ? munData.presidente 
    : munData.governador;

  const rawStatus = (cargoData.status || '').toLowerCase();
  const isAwaiting = (rawStatus === APP_CONFIG.ELECTORAL_STATUS.AWAITING || rawStatus === 'aguardando');
  const isFallback = (rawStatus === APP_CONFIG.ELECTORAL_STATUS.FALLBACK);
  const isError = (rawStatus === APP_CONFIG.ELECTORAL_STATUS.ERROR);
  const isFinalizado = (rawStatus === APP_CONFIG.ELECTORAL_STATUS.FINALIZADO);

  // Determinar rótulo e classe do status badge
  let statusBadgeLabel = 'EM APURAÇÃO';
  let statusBadgeClass = 'status-em_apuracao';

  if (isAwaiting) {
    statusBadgeLabel = 'AGUARDANDO';
    statusBadgeClass = 'status-awaiting';
  } else if (isFinalizado) {
    statusBadgeLabel = 'TOTALIZADO';
    statusBadgeClass = 'status-finalizado';
  } else if (isFallback) {
    statusBadgeLabel = 'ÚLTIMO DADO VÁLIDO';
    statusBadgeClass = 'status-fallback';
  } else if (isError) {
    statusBadgeLabel = 'DADOS INDISPONÍVEIS';
    statusBadgeClass = 'status-error';
  }

  // Dados de totalização
  const secoesApuradas = cargoData.secoes_apuradas ?? 0;
  const secoesTotal = cargoData.secoes_total ?? 0;
  const pctApurado = cargoData.percentual_apurado ?? 0.0;
  const pctStr = pctApurado.toFixed(2).replace('.', ',') + '%';
  const progressWidth = Math.min(100, Math.max(0, pctApurado));

  // Início da montagem do HTML
  let html = `
    <div class="popup-header-section">
      <div class="popup-title-row">
        <span class="popup-mun-name">${escapeHtml(nmMun)}</span>
        <span class="popup-ibge-badge">IBGE ${escapeHtml(cdMun)}</span>
      </div>
      <div class="popup-sub-row">
        <span class="popup-cargo-tag">${escapeHtml(cargoLabel)}</span>
        <span class="popup-status-badge ${statusBadgeClass}">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;"></span>
          ${statusBadgeLabel}
        </span>
      </div>
    </div>

    <!-- Barra de Progresso da Totalização -->
    <div class="popup-progress-card">
      <div class="progress-label-row">
        <span>Apuração das Seções</span>
        <span class="progress-pct-val">${pctStr}</span>
      </div>
      <div class="progress-track">
        <div style="height: 100%; width: ${progressWidth}%; background: #38bdf8; border-radius: 3px; transition: width 0.3s ease;"></div>
      </div>
      <div class="progress-sec-row">
        <span>Seções apuradas: <strong>${formatNumber(secoesApuradas)}</strong> de <strong>${formatNumber(secoesTotal)}</strong></span>
      </div>
    </div>
  `;

  // Caso 2: Município Aguardando Apuração (Regra Seção 17: Sem zeros artificiais ou falsos vencedores)
  if (isAwaiting) {
    html += `
      <div class="popup-awaiting-card">
        <div class="awaiting-title">AGUARDANDO APURAÇÃO OFICIAL</div>
        <p style="font-size: 11px; color: #94a3b8; margin: 0 0 10px 0; line-height: 1.4;">
          Nenhuma seção eleitoral foi totalizada até o momento neste município.
        </p>
        <div class="awaiting-meta">
          <div>Seções Apuradas: <strong>0 / ${formatNumber(secoesTotal)}</strong></div>
          <div>Apuração: <strong>0,00%</strong></div>
        </div>
        <div class="awaiting-grid">
          <div>Líder: <strong style="color: #cbd5e1;">—</strong></div>
          <div>2º Colocado: <strong style="color: #cbd5e1;">—</strong></div>
          <div>Margem: <strong style="color: #cbd5e1;">—</strong></div>
          <div>Votos Válidos: <strong style="color: #cbd5e1;">—</strong></div>
        </div>
      </div>
    `;
  } else if (isError) {
    // Caso 3: Erro nos dados do município
    html += `
      <div class="popup-awaiting-card" style="border-color: rgba(239, 68, 68, 0.3);">
        <div class="awaiting-title" style="color: #ef4444;">DADOS INDISPONÍVEIS</div>
        <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.4;">
          Não foi possível processar um resultado eleitoral válido para este município no momento.
        </p>
      </div>
    `;
  } else {
    // Caso 4: Em Apuração, Finalizado ou Fallback LKG
    if (isFallback) {
      html += `
        <div class="popup-fallback-notice">
          ⚠️ Dados preservados do último ciclo válido (LKG).
        </div>
      `;
    }

    const vencedor = cargoData.vencedor;
    const segundo = cargoData.segundo_colocado;
    const margemPp = cargoData.diferenca_pp;

    // Card 1º Colocado (Líder / Vencedor)
    if (vencedor) {
      const vColor = getCandidateColor(vencedor, currentCargo);
      const vNome = vencedor.nome_urna || vencedor.nome || 'Candidato';
      const badgeText = isFinalizado ? 'VENCEDOR' : '1º LUGAR (LÍDER)';

      html += `
        <div class="popup-cand-highlight primary-cand" style="border-left-color: ${vColor};">
          <div class="highlight-top-row">
            <span class="cand-badge" style="background: ${vColor};">${badgeText}</span>
            <span class="cand-pct" style="color: ${vColor};">${formatPct(vencedor.percentual)}</span>
          </div>
          <div class="highlight-main-row">
            <span class="cand-name">${escapeHtml(vNome)}</span>
            <span class="cand-partido">${escapeHtml(vencedor.partido || '')} · ${escapeHtml(String(vencedor.numero || ''))}</span>
          </div>
          <div class="highlight-sub-row">
            ${formatNumber(vencedor.votos)} votos
          </div>
        </div>
      `;
    }

    // Card 2º Colocado
    if (segundo) {
      const sColor = getCandidateColor(segundo, currentCargo);
      const sNome = segundo.nome_urna || segundo.nome || 'Candidato';

      html += `
        <div class="popup-cand-highlight secondary-cand" style="border-left-color: ${sColor};">
          <div class="highlight-top-row">
            <span class="cand-badge" style="background: ${sColor};">2º LUGAR</span>
            <span class="cand-pct" style="color: ${sColor};">${formatPct(segundo.percentual)}</span>
          </div>
          <div class="highlight-main-row">
            <span class="cand-name">${escapeHtml(sNome)}</span>
            <span class="cand-partido">${escapeHtml(segundo.partido || '')} · ${escapeHtml(String(segundo.numero || ''))}</span>
          </div>
          <div class="highlight-sub-row">
            ${formatNumber(segundo.votos)} votos
          </div>
        </div>
      `;
    }

    // Faixa de Margem de Vantagem
    if (margemPp !== null && margemPp !== undefined && vencedor && segundo) {
      const diffVotos = Math.abs((vencedor.votos ?? 0) - (segundo.votos ?? 0));
      html += `
        <div class="popup-margin-strip">
          <span>Margem de Vantagem:</span>
          <strong>${formatPp(margemPp)} (${formatNumber(diffVotos)} votos)</strong>
        </div>
      `;
    }

    // Lista dos Demais Candidatos (3º colocado em diante)
    const rawCands = Array.isArray(cargoData.candidatos) ? cargoData.candidatos : [];
    const sortedCands = [...rawCands].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));
    
    // Identificar números do 1º e 2º para filtrar
    const topNumbers = new Set();
    if (vencedor) topNumbers.add(String(vencedor.numero));
    if (segundo) topNumbers.add(String(segundo.numero));

    const outrosCandidatos = sortedCands.filter(c => !topNumbers.has(String(c.numero)));

    if (outrosCandidatos.length > 0) {
      html += `
        <div class="popup-others-section">
          <div class="others-header">Demais Candidatos (${outrosCandidatos.length})</div>
          <div class="others-list">
            ${outrosCandidatos.map((cand, idx) => {
              const cNome = cand.nome_urna || cand.nome || 'Candidato';
              return `
                <div class="other-row">
                  <span class="other-rank">${idx + 3}º</span>
                  <span class="other-name" title="${escapeHtml(cNome)}">
                    ${escapeHtml(cNome)} <small>(${escapeHtml(cand.partido || '')})</small>
                  </span>
                  <span class="other-pct">${formatPct(cand.percentual)}</span>
                  <span class="other-votes">${formatNumber(cand.votos)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Estatísticas Secundárias (Eleitorado e Apuração Geral)
    html += `
      <div class="popup-secondary-grid">
        <div>Votos Válidos: <strong>${formatNumber(cargoData.votos_validos)}</strong></div>
        <div>Comparecimento: <strong>${formatNumber(cargoData.comparecimento)}</strong></div>
        <div>Abstenção: <strong>${formatNumber(cargoData.abstencao)}</strong></div>
        <div>Brancos / Nulos: <strong>${formatNumber(cargoData.votos_brancos)} / ${formatNumber(cargoData.votos_nulos)}</strong></div>
      </div>
    `;
  }

  // Rodapé Oficial com Data/Hora e Fonte TSE
  const updateTimestamp = cargoData.last_checked || cargoData.source_last_modified || munData.metadata?.published_at;
  html += `
    <div class="popup-footer-row">
      <div>Atualização TSE: <strong>${formatDateTime(updateTimestamp)}</strong></div>
      <div>Fonte: Tribunal Superior Eleitoral (TSE) • Dados Consolidados</div>
    </div>
  `;

  contentEl.innerHTML = html;
  popupOverlay.setPosition(currentCoordinate);
}

/**
 * Fecha a sobreposição do popup
 */
export function hidePopup() {
  if (popupOverlay) {
    popupOverlay.setPosition(undefined);
  }
  currentFeature = null;
  currentCoordinate = null;
}

/**
 * Exibe Tooltip Flutuante rápido (Hover)
 */
export function showTooltip(feature, mouseEvent) {
  if (!tooltipElement || !feature) return;

  const cdMun = String(feature.get('CD_MUN') || '').trim();
  const nmMun = feature.get('NM_MUN') || 'Município';
  const munData = electionState.getElectionByMunicipality(cdMun);
  const currentCargo = electionState.currentCargo;

  let text = `<strong>${escapeHtml(nmMun)}</strong>`;

  if (munData) {
    const cargoData = (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE) 
      ? munData.presidente 
      : munData.governador;

    if (cargoData) {
      const rawStatus = (cargoData.status || '').toLowerCase();
      if (rawStatus === APP_CONFIG.ELECTORAL_STATUS.AWAITING || rawStatus === 'aguardando') {
        text += `: <span style="color: #fbbf24;">Aguardando apuração</span>`;
      } else if (cargoData.vencedor) {
        const vNome = cargoData.vencedor.nome_urna || cargoData.vencedor.nome || 'Líder';
        const vPct = cargoData.vencedor.percentual ? cargoData.vencedor.percentual.toFixed(1).replace('.', ',') : '0,0';
        text += `: ${escapeHtml(vNome)} (${vPct}%)`;
      }
    }
  }

  tooltipElement.innerHTML = text;
  tooltipElement.style.left = `${mouseEvent.pageX}px`;
  tooltipElement.style.top = `${mouseEvent.pageY}px`;
  tooltipElement.style.display = 'block';
}

/**
 * Oculta o Tooltip Flutuante
 */
export function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.style.display = 'none';
  }
}
