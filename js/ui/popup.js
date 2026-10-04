/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Sistema de Popups Detalhados e Tooltips do Mapa
 */

import { electionState } from '../data/tse-normalizer.js';

let popupOverlay = null;
let popupContainer = null;
let tooltipElement = null;

export function initPopups(map) {
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

  // Elemento do Tooltip (Hover)
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'map-tooltip';
  tooltipElement.style.display = 'none';
  document.body.appendChild(tooltipElement);
}

export function showPopup(feature, coordinate, map) {
  if (!popupOverlay || !popupContainer) return;

  const cdMun = String(feature.get('CD_MUN'));
  const nmMun = feature.get('NM_MUN') || 'Município';
  const nmRgi = feature.get('NM_RGI') || '';
  const result = electionState.getMunicipioResult(cdMun);

  const contentEl = document.getElementById('popup-content');
  if (!contentEl) return;

  if (!result || !result.apurado) {
    contentEl.innerHTML = `
      <div class="popup-title">${nmMun}</div>
      <div class="popup-meta">
        <span>IBGE: <strong>${cdMun}</strong></span>
        ${nmRgi ? `<span>Região: ${nmRgi}</span>` : ''}
      </div>
      <div class="popup-card" style="text-align: center; padding: 14px 10px;">
        <span style="color: #fbbf24; font-size: 13px; font-weight: 600;">Aguardando totalização oficial TSE</span>
      </div>
    `;
  } else {
    const pres = result.presidente;
    const gov = result.governador;

    contentEl.innerHTML = `
      <div class="popup-title">${nmMun}</div>
      <div class="popup-meta">
        <span>IBGE: <strong>${cdMun}</strong></span>
        ${nmRgi ? `<span>Região: ${nmRgi}</span>` : ''}
      </div>

      <!-- Presidente -->
      <div class="popup-card">
        <div class="popup-card-header">Presidente da República</div>
        <div class="popup-cand-row ${pres.vencedor === 'lula' ? 'winner' : ''}">
          <span>${pres.lula.nome} (${pres.lula.numero})</span>
          <span><strong>${pres.lula.percentual.toFixed(1)}%</strong> (${pres.lula.votos.toLocaleString('pt-BR')})</span>
        </div>
        <div class="popup-cand-row ${pres.vencedor === 'flavio' ? 'winner' : ''}">
          <span>${pres.flavio.nome} (${pres.flavio.numero})</span>
          <span><strong>${pres.flavio.percentual.toFixed(1)}%</strong> (${pres.flavio.votos.toLocaleString('pt-BR')})</span>
        </div>
      </div>

      <!-- Governador -->
      <div class="popup-card">
        <div class="popup-card-header">Governador do Estado</div>
        <div class="popup-cand-row ${gov.vencedor === 'zucco' ? 'winner' : ''}">
          <span>${gov.zucco.nome} (${gov.zucco.numero})</span>
          <span><strong>${gov.zucco.percentual.toFixed(1)}%</strong> (${gov.zucco.votos.toLocaleString('pt-BR')})</span>
        </div>
        <div class="popup-cand-row ${gov.vencedor === 'gov2' ? 'winner' : ''}">
          <span>${gov.gov2.nome}</span>
          <span><strong>${gov.gov2.percentual.toFixed(1)}%</strong> (${gov.gov2.votos.toLocaleString('pt-BR')})</span>
        </div>
      </div>

      <!-- Estatísticas do Município -->
      <div class="popup-totals-grid">
        <div>Votos Válidos: <strong>${result.votosValidos.toLocaleString('pt-BR')}</strong></div>
        <div>Total de Votos: <strong>${result.totalVotos.toLocaleString('pt-BR')}</strong></div>
        <div>Brancos: ${result.votosBrancos.toLocaleString('pt-BR')}</div>
        <div>Nulos: ${result.votosNulos.toLocaleString('pt-BR')}</div>
      </div>
    `;
  }

  popupOverlay.setPosition(coordinate);
}

export function hidePopup() {
  if (popupOverlay) {
    popupOverlay.setPosition(undefined);
  }
}

export function showTooltip(feature, mouseEvent) {
  if (!tooltipElement) return;

  const cdMun = String(feature.get('CD_MUN'));
  const nmMun = feature.get('NM_MUN');
  const result = electionState.getMunicipioResult(cdMun);
  const currentCargo = electionState.currentCargo;

  let text = nmMun;
  if (result && result.apurado) {
    const cData = currentCargo === 'PRESIDENTE' ? result.presidente : result.governador;
    const winnerKey = cData.vencedor;
    const winnerName = cData[winnerKey] ? cData[winnerKey].nome : 'Líder';
    const winnerPct = cData[winnerKey] ? cData[winnerKey].percentual.toFixed(1) : '0';
    text = `<strong>${nmMun}</strong>: ${winnerName} (${winnerPct}%)`;
  }

  tooltipElement.innerHTML = text;
  tooltipElement.style.left = `${mouseEvent.pageX}px`;
  tooltipElement.style.top = `${mouseEvent.pageY}px`;
  tooltipElement.style.display = 'block';
}

export function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.style.display = 'none';
  }
}
