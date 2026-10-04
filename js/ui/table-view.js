/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Tabela Municipal Interativa dos 497 Municípios com Filtros Analíticos
 * GATE 6.4 — Tabela Municipal + Filtros Analíticos
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

let allMunicipalities = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 50;
let currentSort = { column: 'nmMun', asc: true };

let currentFilters = {
  search: '',
  status: 'all',
  winner: 'all',
  margin: 'all'
};

let mapEngineRef = null;

/**
 * Utilitários de escape e formatação
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

function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return Number(val).toFixed(2).replace('.', ',') + '%';
}

function formatPp(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return Number(val).toFixed(2).replace('.', ',') + ' pp';
}

/**
 * Cores para identificação visual discreta do candidato
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
    return '#22c55e'; // Oposição / Segundo colocado dinâmico estadual
  }
}

/**
 * Inicializa os controles e eventos da tabela municipal
 */
export function initTableView(mapEngine) {
  mapEngineRef = mapEngine;

  const drawer = document.getElementById('table-drawer');
  const overlay = document.getElementById('table-drawer-overlay');
  const openBtn = document.getElementById('btn-open-table');
  const closeBtn = document.getElementById('table-close-btn');

  const searchInput = document.getElementById('table-search');
  const statusSelect = document.getElementById('table-filter-status');
  const winnerSelect = document.getElementById('table-filter-winner');
  const marginSelect = document.getElementById('table-filter-margin');
  const clearBtn = document.getElementById('btn-clear-filters');

  const pageSizeSelect = document.getElementById('table-page-size');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  function openDrawer() {
    if (drawer && overlay) {
      drawer.classList.add('active');
      overlay.classList.add('active');
      renderTable();
    }
  }

  function closeDrawer() {
    if (drawer && overlay) {
      drawer.classList.remove('active');
      overlay.classList.remove('active');
    }
  }

  if (openBtn) openBtn.onclick = openDrawer;
  if (closeBtn) closeBtn.onclick = closeDrawer;
  if (overlay) overlay.onclick = closeDrawer;

  // Busca por município (Seção 7)
  if (searchInput) {
    searchInput.oninput = (e) => {
      currentFilters.search = e.target.value;
      currentPage = 1;
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  }

  // Filtro de Status (Seção 8.1)
  if (statusSelect) {
    statusSelect.onchange = (e) => {
      currentFilters.status = e.target.value;
      currentPage = 1;
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  }

  // Filtro de Candidato Vencedor (Seção 8.2)
  if (winnerSelect) {
    winnerSelect.onchange = (e) => {
      currentFilters.winner = e.target.value;
      currentPage = 1;
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  }

  // Filtro de Faixa de Margem (Seção 8.3)
  if (marginSelect) {
    marginSelect.onchange = (e) => {
      currentFilters.margin = e.target.value;
      currentPage = 1;
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  }

  // Limpar Filtros
  if (clearBtn) {
    clearBtn.onclick = () => {
      currentFilters = { search: '', status: 'all', winner: 'all', margin: 'all' };
      if (searchInput) searchInput.value = '';
      if (statusSelect) statusSelect.value = 'all';
      if (winnerSelect) winnerSelect.value = 'all';
      if (marginSelect) marginSelect.value = 'all';
      currentPage = 1;
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  }

  // Paginação: Seleção de linhas por página (Seção 12)
  if (pageSizeSelect) {
    pageSizeSelect.onchange = (e) => {
      pageSize = parseInt(e.target.value, 10);
      currentPage = 1;
      renderTableBodyAndPagination();
    };
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderTableBodyAndPagination();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const maxPages = Math.ceil(filteredData.length / pageSize) || 1;
      if (currentPage < maxPages) {
        currentPage++;
        renderTableBodyAndPagination();
      }
    };
  }

  // Ordenação nas colunas (Seção 9)
  document.querySelectorAll('table.mun-table th[data-col]').forEach(th => {
    th.onclick = () => {
      const col = th.getAttribute('data-col');
      if (currentSort.column === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.column = col;
        // Colunas numéricas/percentuais iniciam em ordem decrescente (maior primeiro)
        if (['apuracao', 'percent1', 'percent2', 'margem'].includes(col)) {
          currentSort.asc = false;
        } else {
          currentSort.asc = true;
        }
      }
      updateSortHeaderIcons();
      applyFiltersAndSort();
      renderTableBodyAndPagination();
    };
  });

  // Re-renderizar tabela ao atualizar estado eleitoral ou alternar cargo (Seção 11)
  electionState.subscribe(() => {
    renderTable();
  });
}

/**
 * Atualiza os ícones de ordenação nas colunas
 */
function updateSortHeaderIcons() {
  document.querySelectorAll('table.mun-table th[data-col]').forEach(th => {
    const col = th.getAttribute('data-col');
    const iconSpan = th.querySelector('.sort-icon');
    if (col === currentSort.column) {
      th.classList.add('active-sort');
      if (iconSpan) iconSpan.textContent = currentSort.asc ? '↑' : '↓';
    } else {
      th.classList.remove('active-sort');
      if (iconSpan) iconSpan.textContent = '↕';
    }
  });
}

/**
 * Popula a base dos 497 municípios cartográficos no carregamento da malha
 */
export function populateTableData(features) {
  if (!features || !Array.isArray(features)) return;

  allMunicipalities = features.map(feat => {
    return {
      cdMun: String(feat.get('CD_MUN') || '').trim(),
      nmMun: feat.get('NM_MUN') || 'Município',
      nmRgi: feat.get('NM_RGI') || '',
      feature: feat
    };
  });

  renderTable();
}

/**
 * Reconstrói dinamicamente as opções do filtro de candidatos líderes para o cargo ativo (Seção 8.2)
 */
function rebuildWinnerFilterOptions() {
  const winnerSelect = document.getElementById('table-filter-winner');
  if (!winnerSelect) return;

  const currentCargo = electionState.currentCargo;
  const winnerCounts = new Map();

  allMunicipalities.forEach(item => {
    const mun = electionState.getElectionByMunicipality(item.cdMun);
    const cargoData = mun ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? mun.presidente : mun.governador) : null;
    if (cargoData && cargoData.vencedor && cargoData.vencedor.nome) {
      const name = String(cargoData.vencedor.nome).trim().toUpperCase();
      winnerCounts.set(name, (winnerCounts.get(name) || 0) + 1);
    }
  });

  // Ordenar candidatos por número decrescente de municípios liderados
  const sortedWinners = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1]);

  let html = `<option value="all">Todos os Vencedores</option>`;
  sortedWinners.forEach(([name, count]) => {
    const isSelected = currentFilters.winner.toUpperCase() === name.toUpperCase();
    html += `<option value="${escapeHtml(name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(name)} (${count})</option>`;
  });

  winnerSelect.innerHTML = html;

  // Se o candidato filtrado anteriormente não existir no novo cargo, resetar para 'all'
  if (currentFilters.winner !== 'all' && !winnerCounts.has(currentFilters.winner.toUpperCase())) {
    currentFilters.winner = 'all';
    winnerSelect.value = 'all';
  }
}

/**
 * Renderiza a faixa de resumo no topo da gaveta (Seção 13)
 */
function renderSummaryRibbon() {
  const ribbon = document.getElementById('table-summary-ribbon');
  if (!ribbon) return;

  const currentCargo = electionState.currentCargo;
  const totalMuns = allMunicipalities.length || 497;
  let totalizados = 0;
  let emApuracao = 0;
  let aguardando = 0;

  allMunicipalities.forEach(item => {
    const mun = electionState.getElectionByMunicipality(item.cdMun);
    const cargoData = mun ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? mun.presidente : mun.governador) : null;
    const rawStatus = (cargoData?.status || 'awaiting').toLowerCase();

    if (rawStatus === 'finalizado') {
      totalizados++;
    } else if (rawStatus === 'em_apuracao') {
      emApuracao++;
    } else {
      aguardando++;
    }
  });

  ribbon.innerHTML = `
    <div class="summary-pill total">
      <span class="summary-count">${totalMuns}</span>
      <span class="summary-label">Municípios</span>
    </div>
    <div class="summary-pill totalizado">
      <span class="summary-dot"></span>
      <span class="summary-count">${totalizados}</span>
      <span class="summary-label">Totalizados</span>
    </div>
    <div class="summary-pill em_apuracao">
      <span class="summary-dot"></span>
      <span class="summary-count">${emApuracao}</span>
      <span class="summary-label">Em apuração</span>
    </div>
    <div class="summary-pill aguardando">
      <span class="summary-dot"></span>
      <span class="summary-count">${aguardando}</span>
      <span class="summary-label">Aguardando</span>
    </div>
  `;
}

/**
 * Aplica os filtros e efetua a ordenação dos dados
 */
function applyFiltersAndSort() {
  const currentCargo = electionState.currentCargo;
  const q = currentFilters.search.toLowerCase().trim();
  const fStatus = currentFilters.status;
  const fWinner = currentFilters.winner.toUpperCase();
  const fMargin = currentFilters.margin;

  filteredData = allMunicipalities.filter(item => {
    // 1. Busca por nome (NM_MUN) ou código IBGE (CD_MUN)
    if (q) {
      const matchNm = item.nmMun.toLowerCase().includes(q);
      const matchCd = item.cdMun.includes(q);
      if (!matchNm && !matchCd) return false;
    }

    const mun = electionState.getElectionByMunicipality(item.cdMun);
    const cargoData = mun ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? mun.presidente : mun.governador) : null;
    const rawStatus = (cargoData?.status || 'awaiting').toLowerCase();

    // 2. Filtro de Status (Seção 8.1)
    if (fStatus !== 'all') {
      if (fStatus === 'finalizado' && rawStatus !== 'finalizado') return false;
      if (fStatus === 'em_apuracao' && rawStatus !== 'em_apuracao') return false;
      if (fStatus === 'awaiting' && rawStatus !== 'awaiting' && rawStatus !== 'aguardando') return false;
      if (fStatus === 'fallback' && rawStatus !== 'fallback') return false;
      if (fStatus === 'error' && rawStatus !== 'error') return false;
    }

    // 3. Filtro de Candidato Vencedor (Seção 8.2)
    if (fWinner !== 'ALL') {
      if (rawStatus === 'awaiting' || rawStatus === 'aguardando' || !cargoData?.vencedor) {
        return false;
      }
      const winnerName = String(cargoData.vencedor.nome || '').trim().toUpperCase();
      if (winnerName !== fWinner) return false;
    }

    // 4. Filtro de Faixa de Margem (Seção 8.3)
    if (fMargin !== 'all') {
      const diff = cargoData?.diferenca_pp;
      if (diff === null || diff === undefined) return false;
      if (fMargin === '<2' && diff >= 2.0) return false;
      if (fMargin === '2-5' && (diff < 2.0 || diff >= 5.0)) return false;
      if (fMargin === '5-10' && (diff < 5.0 || diff >= 10.0)) return false;
      if (fMargin === '10-20' && (diff < 10.0 || diff >= 20.0)) return false;
      if (fMargin === '>=20' && diff < 20.0) return false;
    }

    return true;
  });

  // Ordenação (Seção 9)
  sortFilteredData();

  // Ajuste do limite de página
  const maxPages = Math.ceil(filteredData.length / pageSize) || 1;
  if (currentPage > maxPages) currentPage = 1;
}

/**
 * Ordena os municípios filtrados segundo a coluna e direção selecionadas
 */
function sortFilteredData() {
  const currentCargo = electionState.currentCargo;
  const col = currentSort.column;
  const asc = currentSort.asc;

  filteredData.sort((a, b) => {
    const munA = electionState.getElectionByMunicipality(a.cdMun);
    const munB = electionState.getElectionByMunicipality(b.cdMun);
    const dataA = munA ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? munA.presidente : munA.governador) : null;
    const dataB = munB ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? munB.presidente : munB.governador) : null;

    if (col === 'nmMun') {
      return asc ? a.nmMun.localeCompare(b.nmMun, 'pt-BR') : b.nmMun.localeCompare(a.nmMun, 'pt-BR');
    }

    if (col === 'status') {
      const sA = dataA?.status || 'awaiting';
      const sB = dataB?.status || 'awaiting';
      return asc ? sA.localeCompare(sB) : sB.localeCompare(sA);
    }

    if (col === 'apuracao') {
      const pA = dataA?.percentual_apurado ?? -1;
      const pB = dataB?.percentual_apurado ?? -1;
      return asc ? pA - pB : pB - pA;
    }

    if (col === 'vencedor') {
      const vA = dataA?.vencedor?.nome || '';
      const vB = dataB?.vencedor?.nome || '';
      return asc ? vA.localeCompare(vB, 'pt-BR') : vB.localeCompare(vA, 'pt-BR');
    }

    if (col === 'percent1') {
      const pctA = dataA?.vencedor?.percentual ?? -1;
      const pctB = dataB?.vencedor?.percentual ?? -1;
      return asc ? pctA - pctB : pctB - pctA;
    }

    if (col === 'segundo') {
      const sA = dataA?.segundo_colocado?.nome || '';
      const sB = dataB?.segundo_colocado?.nome || '';
      return asc ? sA.localeCompare(sB, 'pt-BR') : sB.localeCompare(sA, 'pt-BR');
    }

    if (col === 'percent2') {
      const pctA = dataA?.segundo_colocado?.percentual ?? -1;
      const pctB = dataB?.segundo_colocado?.percentual ?? -1;
      return asc ? pctA - pctB : pctB - pctA;
    }

    if (col === 'margem') {
      // Quando ascendente (menor margem primeiro), ausência de apuração vai para o final
      const mA = dataA?.diferenca_pp !== null && dataA?.diferenca_pp !== undefined ? dataA.diferenca_pp : (asc ? 999999 : -1);
      const mB = dataB?.diferenca_pp !== null && dataB?.diferenca_pp !== undefined ? dataB.diferenca_pp : (asc ? 999999 : -1);
      return asc ? mA - mB : mB - mA;
    }

    return 0;
  });
}

/**
 * Renderiza o corpo da tabela e atualiza os controles de paginação
 */
function renderTableBodyAndPagination() {
  const tbody = document.getElementById('mun-table-body');
  const countLabel = document.getElementById('table-count-label');
  const pagesLabel = document.getElementById('pagination-pages-label');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');

  if (!tbody) return;

  const totalFiltered = filteredData.length;
  const totalAll = allMunicipalities.length;
  const maxPages = Math.ceil(totalFiltered / pageSize) || 1;

  if (currentPage > maxPages) currentPage = maxPages;
  if (currentPage < 1) currentPage = 1;

  // Atualizar rótulo de contagem
  if (countLabel) {
    if (totalFiltered === 0) {
      countLabel.textContent = `0 municípios encontrados`;
    } else {
      const startItem = (currentPage - 1) * pageSize + 1;
      const endItem = Math.min(currentPage * pageSize, totalFiltered);
      countLabel.textContent = `Exibindo ${startItem}–${endItem} de ${totalFiltered} municípios ${totalFiltered !== totalAll ? `(filtrados de ${totalAll})` : ''}`;
    }
  }

  // Atualizar paginação
  if (pagesLabel) {
    pagesLabel.textContent = `${currentPage} de ${maxPages}`;
  }
  if (prevBtn) prevBtn.disabled = (currentPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentPage >= maxPages);

  // Caso nenhum município corresponda aos filtros
  if (totalFiltered === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 16px; color: #94a3b8;">
          Nenhum município localizado com os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  // Segmentação para a página ativa
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filteredData.slice(startIdx, startIdx + pageSize);
  const currentCargo = electionState.currentCargo;

  tbody.innerHTML = pageItems.map(item => {
    const mun = electionState.getElectionByMunicipality(item.cdMun);
    const cargoData = mun ? (currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? mun.presidente : mun.governador) : null;
    const rawStatus = (cargoData?.status || 'awaiting').toLowerCase();

    const isAwaiting = (rawStatus === 'awaiting' || rawStatus === 'aguardando');
    const isFallback = (rawStatus === 'fallback');
    const isError = (rawStatus === 'error');
    const isFinalizado = (rawStatus === 'finalizado');

    // Badge de Situação (Seção 6)
    let badgeHtml = '<span class="table-badge status-awaiting">Aguardando</span>';
    if (isFinalizado) {
      badgeHtml = '<span class="table-badge status-finalizado">Totalizado</span>';
    } else if (rawStatus === 'em_apuracao') {
      badgeHtml = '<span class="table-badge status-em_apuracao">Em apuração</span>';
    } else if (isFallback) {
      badgeHtml = '<span class="table-badge status-fallback">Último dado válido</span>';
    } else if (isError) {
      badgeHtml = '<span class="table-badge status-error">Dados indisponíveis</span>';
    }

    // Apuração
    let apuracaoHtml = '<span>0,00%</span>';
    if (cargoData) {
      const pctStr = (cargoData.percentual_apurado ?? 0).toFixed(2).replace('.', ',') + '%';
      const secApuradas = cargoData.secoes_apuradas ?? 0;
      const secTotal = cargoData.secoes_total ?? 0;
      apuracaoHtml = `<span>${pctStr}</span> <small style="color: #64748b;">(${secApuradas}/${secTotal})</small>`;
    }

    // Regra da Seção 6: para awaiting ou error, 1º = —, 2º = —, Margem = —. Sem zeros falsos.
    let cand1Html = '—';
    let pct1Html = '—';
    let cand2Html = '—';
    let pct2Html = '—';
    let margemHtml = '—';

    if (!isAwaiting && !isError && cargoData) {
      const v = cargoData.vencedor;
      const s = cargoData.segundo_colocado;

      if (v) {
        const vColor = getCandidateColor(v, currentCargo);
        const vNome = v.nome_urna || v.nome || 'Candidato';
        cand1Html = `
          <span class="cand-name-tag" style="border-left: 3px solid ${vColor}; padding-left: 5px;">
            ${escapeHtml(vNome)} <small>(${escapeHtml(v.partido || '')})</small>
          </span>
        `;
        pct1Html = `<strong>${formatPct(v.percentual)}</strong>`;
      }

      if (s) {
        const sColor = getCandidateColor(s, currentCargo);
        const sNome = s.nome_urna || s.nome || 'Candidato';
        cand2Html = `
          <span class="cand-name-tag" style="border-left: 3px solid ${sColor}; padding-left: 5px;">
            ${escapeHtml(sNome)} <small>(${escapeHtml(s.partido || '')})</small>
          </span>
        `;
        pct2Html = `<span>${formatPct(s.percentual)}</span>`;
      }

      if (cargoData.diferenca_pp !== null && cargoData.diferenca_pp !== undefined) {
        margemHtml = `<strong class="margin-tag">${formatPp(cargoData.diferenca_pp)}</strong>`;
      }
    }

    return `
      <tr data-cd="${item.cdMun}" title="Clique para localizar ${escapeHtml(item.nmMun)} no mapa e abrir a ficha eleitoral">
        <td>
          <strong>${escapeHtml(item.nmMun)}</strong>
          <span class="ibge-code">${item.cdMun}</span>
        </td>
        <td>${badgeHtml}</td>
        <td>${apuracaoHtml}</td>
        <td>${cand1Html}</td>
        <td>${pct1Html}</td>
        <td>${cand2Html}</td>
        <td>${pct2Html}</td>
        <td>${margemHtml}</td>
      </tr>
    `;
  }).join('');

  // Integração com o Mapa ao clicar na linha (Seção 10)
  tbody.querySelectorAll('tr[data-cd]').forEach(tr => {
    tr.onclick = () => {
      const cd = tr.getAttribute('data-cd');
      if (mapEngineRef) {
        // Em telas estreitas, recolhe a gaveta para visualização do mapa
        if (window.innerWidth < 960) {
          const drawer = document.getElementById('table-drawer');
          const overlay = document.getElementById('table-drawer-overlay');
          if (drawer) drawer.classList.remove('active');
          if (overlay) overlay.classList.remove('active');
        }
        mapEngineRef.zoomToIbge(cd);
      }
    };
  });
}

/**
 * Renderização central da tabela (reconstrói opções dinâmicas, resumo, filtros e linhas)
 */
export function renderTable() {
  if (allMunicipalities.length === 0) return;
  rebuildWinnerFilterOptions();
  renderSummaryRibbon();
  updateSortHeaderIcons();
  applyFiltersAndSort();
  renderTableBodyAndPagination();
}
