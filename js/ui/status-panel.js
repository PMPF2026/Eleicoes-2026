/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Painel de Totalização, Placar Estadual e Legenda Dinâmica
 */

import { APP_CONFIG } from '../config.js';

export function updateStatusPanel(stateObj) {
  const { state, cargo, data } = stateObj;

  const statusBadge = document.getElementById('app-status-badge');
  const percentEl = document.getElementById('stat-totalizacao-percent');
  const progressFill = document.getElementById('stat-progress-fill');
  const apuradosEl = document.getElementById('stat-mun-apurados');
  const pendentesEl = document.getElementById('stat-mun-pendentes');
  const updateTimeEl = document.getElementById('stat-update-time');
  const scoreboardEl = document.getElementById('scoreboard-container');

  // Atualiza Badge do Topo
  if (statusBadge) {
    if (state === APP_CONFIG.STATES.WAITING) {
      statusBadge.className = 'status-indicator-badge waiting';
      statusBadge.innerHTML = '<span class="status-dot"></span><span>Aguardando Apuração TSE</span>';
    } else if (state === APP_CONFIG.STATES.CONCLUDED) {
      statusBadge.className = 'status-indicator-badge';
      statusBadge.innerHTML = '<span class="status-dot" style="background:#10b981;"></span><span>Totalização Concluída — Oficial</span>';
    } else {
      statusBadge.className = 'status-indicator-badge';
      statusBadge.innerHTML = '<span class="status-dot"></span><span>Apuração em Andamento</span>';
    }
  }

  // Se não há dados carregados
  if (!data || !data.metadata || state === APP_CONFIG.STATES.WAITING) {
    if (percentEl) percentEl.textContent = '0,00%';
    if (progressFill) progressFill.style.width = '0%';
    if (apuradosEl) apuradosEl.textContent = '0';
    if (pendentesEl) pendentesEl.textContent = '497';
    if (updateTimeEl) updateTimeEl.textContent = 'Aguardando dados...';
    if (scoreboardEl) {
      scoreboardEl.innerHTML = `
        <div style="font-size: 12px; color: var(--text-dim); text-align: center; padding: 8px 0;">
          Aguardando início da totalização oficial pelo TSE
        </div>
      `;
    }
    updateDynamicLegend(cargo);
    return;
  }

  const meta = data.metadata;
  const pct = meta.totalizacaoPercent || 0;
  if (percentEl) percentEl.textContent = `${pct.toFixed(2)}%`;
  if (progressFill) progressFill.style.width = `${Math.min(pct, 100)}%`;
  if (apuradosEl) apuradosEl.textContent = meta.municipiosApurados || 0;
  if (pendentesEl) pendentesEl.textContent = meta.municipiosPendentes || 0;
  if (updateTimeEl) updateTimeEl.textContent = meta.ultimaAtualizacao || '-';

  // Consolidar Votos Estaduais para o Placar
  let c1Votes = 0;
  let c2Votes = 0;
  let c1Name = '';
  let c2Name = '';
  let c1Color = '';
  let c2Color = '';

  if (cargo === APP_CONFIG.CARGOS.PRESIDENTE) {
    c1Name = 'Lula (PT)';
    c2Name = 'Flávio Bolsonaro (PL)';
    c1Color = '#ef4444';
    c2Color = '#3b82f6';
    Object.values(data.resultados || {}).forEach(r => {
      if (r.apurado && r.presidente) {
        c1Votes += r.presidente.lula.votos;
        c2Votes += r.presidente.flavio.votos;
      }
    });
  } else {
    c1Name = 'Zucco (PL)';
    c2Name = 'Segundo Colocado';
    c1Color = '#eab308';
    c2Color = '#22c55e';
    Object.values(data.resultados || {}).forEach(r => {
      if (r.apurado && r.governador) {
        c1Votes += r.governador.zucco.votos;
        c2Votes += r.governador.gov2.votos;
      }
    });
  }

  const totalValid = c1Votes + c2Votes;
  const c1Pct = totalValid > 0 ? ((c1Votes / totalValid) * 100).toFixed(2) : '0,00';
  const c2Pct = totalValid > 0 ? ((c2Votes / totalValid) * 100).toFixed(2) : '0,00';

  if (scoreboardEl) {
    scoreboardEl.innerHTML = `
      <div class="candidate-row">
        <div class="cand-info">
          <div class="cand-color-indicator" style="background: ${c1Color};"></div>
          <span class="cand-name">${c1Name}</span>
        </div>
        <div class="cand-numbers">
          <span class="cand-percent" style="color: ${c1Color};">${c1Pct}%</span>
          <div class="cand-votes">${c1Votes.toLocaleString('pt-BR')} votos</div>
        </div>
      </div>
      <div class="candidate-row">
        <div class="cand-info">
          <div class="cand-color-indicator" style="background: ${c2Color};"></div>
          <span class="cand-name">${c2Name}</span>
        </div>
        <div class="cand-numbers">
          <span class="cand-percent" style="color: ${c2Color};">${c2Pct}%</span>
          <div class="cand-votes">${c2Votes.toLocaleString('pt-BR')} votos</div>
        </div>
      </div>
    `;
  }

  updateDynamicLegend(cargo);
}

/**
 * Atualiza a Legenda Dinâmica de acordo com o cargo selecionado
 */
export function updateDynamicLegend(cargo) {
  const legendContainer = document.getElementById('dynamic-legend-content');
  if (!legendContainer) return;

  if (cargo === APP_CONFIG.CARGOS.PRESIDENTE) {
    legendContainer.innerHTML = `
      <div class="legend-group">
        <div class="legend-group-title" style="color: #fca5a5;">Lula (PT) — Vantagem</div>
        <div class="legend-scale">
          <div class="legend-scale-item" style="background: rgba(254, 202, 202, 0.75);" title="< 5%"></div>
          <div class="legend-scale-item" style="background: rgba(248, 113, 113, 0.80);" title="5% - 15%"></div>
          <div class="legend-scale-item" style="background: rgba(239, 68, 68, 0.85);" title="15% - 30%"></div>
          <div class="legend-scale-item" style="background: rgba(185, 28, 28, 0.90);" title="> 30%"></div>
        </div>
        <div class="legend-labels"><span>+0%</span><span>+15%</span><span>+30%+</span></div>
      </div>

      <div class="legend-group" style="margin-top: 8px;">
        <div class="legend-group-title" style="color: #93c5fd;">Flávio Bolsonaro (PL) — Vantagem</div>
        <div class="legend-scale">
          <div class="legend-scale-item" style="background: rgba(191, 219, 254, 0.75);" title="< 5%"></div>
          <div class="legend-scale-item" style="background: rgba(96, 165, 250, 0.80);" title="5% - 15%"></div>
          <div class="legend-scale-item" style="background: rgba(59, 130, 246, 0.85);" title="15% - 30%"></div>
          <div class="legend-scale-item" style="background: rgba(29, 78, 216, 0.90);" title="> 30%"></div>
        </div>
        <div class="legend-labels"><span>+0%</span><span>+15%</span><span>+30%+</span></div>
      </div>

      <div class="legend-empty">
        <div class="legend-color-box" style="background: #64748b;"></div>
        <span>Sem dados / Aguardando</span>
      </div>
    `;
  } else {
    legendContainer.innerHTML = `
      <div class="legend-group">
        <div class="legend-group-title" style="color: #fde047;">Zucco (PL) — Vantagem</div>
        <div class="legend-scale">
          <div class="legend-scale-item" style="background: rgba(254, 240, 138, 0.75);" title="< 5%"></div>
          <div class="legend-scale-item" style="background: rgba(250, 204, 21, 0.80);" title="5% - 15%"></div>
          <div class="legend-scale-item" style="background: rgba(234, 179, 8, 0.85);" title="15% - 30%"></div>
          <div class="legend-scale-item" style="background: rgba(161, 98, 7, 0.90);" title="> 30%"></div>
        </div>
        <div class="legend-labels"><span>+0%</span><span>+15%</span><span>+30%+</span></div>
      </div>

      <div class="legend-group" style="margin-top: 8px;">
        <div class="legend-group-title" style="color: #86efac;">Segundo Colocado — Vantagem</div>
        <div class="legend-scale">
          <div class="legend-scale-item" style="background: rgba(187, 247, 208, 0.75);" title="< 5%"></div>
          <div class="legend-scale-item" style="background: rgba(74, 222, 128, 0.80);" title="5% - 15%"></div>
          <div class="legend-scale-item" style="background: rgba(34, 197, 94, 0.85);" title="15% - 30%"></div>
          <div class="legend-scale-item" style="background: rgba(21, 128, 61, 0.90);" title="> 30%"></div>
        </div>
        <div class="legend-labels"><span>+0%</span><span>+15%</span><span>+30%+</span></div>
      </div>

      <div class="legend-empty">
        <div class="legend-color-box" style="background: #64748b;"></div>
        <span>Sem dados / Aguardando</span>
      </div>
    `;
  }
}
