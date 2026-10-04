/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Tabela Completa dos 497 Municípios (Busca, Filtros, Ordenação e Zoom no Mapa)
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

let allTableData = [];
let filteredTableData = [];
let currentSortColumn = 'nmMun';
let currentSortAsc = true;
let mapEngineRef = null;

export function initTableView(mapEngine) {
  mapEngineRef = mapEngine;

  const drawer = document.getElementById('table-drawer');
  const overlay = document.getElementById('table-drawer-overlay');
  const openBtn = document.getElementById('btn-open-table');
  const closeBtn = document.getElementById('table-close-btn');
  const searchInput = document.getElementById('table-search');
  const filterSelect = document.getElementById('table-filter-winner');
  const exportBtn = document.getElementById('btn-export-csv');

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

  if (searchInput) {
    searchInput.oninput = (e) => {
      filterData(e.target.value, filterSelect ? filterSelect.value : 'all');
    };
  }

  if (filterSelect) {
    filterSelect.onchange = (e) => {
      filterData(searchInput ? searchInput.value : '', e.target.value);
    };
  }

  if (exportBtn) {
    exportBtn.onclick = exportToCSV;
  }

  // Configurar ordenação nas colunas
  document.querySelectorAll('table.mun-table th[data-col]').forEach(th => {
    th.onclick = () => {
      const col = th.getAttribute('data-col');
      if (currentSortColumn === col) {
        currentSortAsc = !currentSortAsc;
      } else {
        currentSortColumn = col;
        currentSortAsc = true;
      }
      sortData();
      renderTable();
    };
  });
}

/**
 * Recarrega os dados da tabela com base no estado atual da apuração
 */
export function populateTableData(features) {
  allTableData = features.map(feat => {
    const cdMun = String(feat.get('CD_MUN'));
    const nmMun = feat.get('NM_MUN') || '';
    const nmRgi = feat.get('NM_RGI') || '';
    const res = electionState.getMunicipioResult(cdMun);

    return {
      cdMun,
      nmMun,
      nmRgi,
      result: res
    };
  });

  filteredTableData = [...allTableData];
  sortData();
}

function filterData(query, filterWinner) {
  const q = query.toLowerCase().trim();
  const currentCargo = electionState.currentCargo;

  filteredTableData = allTableData.filter(item => {
    // Filtro de texto (Nome ou Código IBGE)
    const matchText = !q || item.nmMun.toLowerCase().includes(q) || item.cdMun.includes(q);
    if (!matchText) return false;

    // Filtro de Vencedor
    if (filterWinner === 'all') return true;

    if (!item.result || !item.result.apurado) {
      return filterWinner === 'sem-dados';
    }

    const cData = currentCargo === APP_CONFIG.CARGOS.PRESIDENTE ? item.result.presidente : item.result.governador;
    return cData && cData.vencedor === filterWinner;
  });

  sortData();
  renderTable();
}

function sortData() {
  const cargo = electionState.currentCargo;

  filteredTableData.sort((a, b) => {
    let valA = a[currentSortColumn];
    let valB = b[currentSortColumn];

    if (currentSortColumn === 'vencedor') {
      const wA = a.result && a.result.apurado ? (cargo === 'PRESIDENTE' ? a.result.presidente.vencedor : a.result.governador.vencedor) : '';
      const wB = b.result && b.result.apurado ? (cargo === 'PRESIDENTE' ? b.result.presidente.vencedor : b.result.governador.vencedor) : '';
      valA = wA;
      valB = wB;
    } else if (currentSortColumn === 'percent') {
      const pA = a.result && a.result.apurado ? (cargo === 'PRESIDENTE' ? Math.max(a.result.presidente.lula.percentual, a.result.presidente.flavio.percentual) : Math.max(a.result.governador.zucco.percentual, a.result.governador.gov2.percentual)) : 0;
      const pB = b.result && b.result.apurado ? (cargo === 'PRESIDENTE' ? Math.max(b.result.presidente.lula.percentual, b.result.presidente.flavio.percentual) : Math.max(b.result.governador.zucco.percentual, b.result.governador.gov2.percentual)) : 0;
      valA = pA;
      valB = pB;
    } else if (currentSortColumn === 'margem') {
      const mA = a.result && a.result.apurado ? (cargo === 'PRESIDENTE' ? a.result.presidente.margemPercent : a.result.governador.margemPercent) : -1;
      const mB = b.result && b.result.apurado ? (cargo === 'PRESIDENTE' ? b.result.presidente.margemPercent : b.result.governador.margemPercent) : -1;
      valA = mA;
      valB = mB;
    } else if (currentSortColumn === 'votosValidos') {
      valA = a.result && a.result.apurado ? a.result.votosValidos : 0;
      valB = b.result && b.result.apurado ? b.result.votosValidos : 0;
    }

    if (valA < valB) return currentSortAsc ? -1 : 1;
    if (valA > valB) return currentSortAsc ? 1 : -1;
    return 0;
  });
}

export function renderTable() {
  const tbody = document.getElementById('mun-table-body');
  const countEl = document.getElementById('table-count-label');
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `${filteredTableData.length} de ${allTableData.length} municípios`;
  }

  const cargo = electionState.currentCargo;

  if (filteredTableData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-dim);">
          Nenhum município localizado com os filtros atuais.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredTableData.map(item => {
    const res = item.result;
    let winnerHtml = '<span class="winner-pill sem-dados">Sem dados</span>';
    let pctWinner = '-';
    let margem = '-';
    let validos = '-';

    if (res && res.apurado) {
      validos = res.votosValidos.toLocaleString('pt-BR');
      const cData = cargo === APP_CONFIG.CARGOS.PRESIDENTE ? res.presidente : res.governador;
      if (cData) {
        margem = `${cData.margemPercent.toFixed(1)}%`;
        if (cargo === APP_CONFIG.CARGOS.PRESIDENTE) {
          if (cData.vencedor === 'lula') {
            winnerHtml = '<span class="winner-pill lula">Lula (PT)</span>';
            pctWinner = `${cData.lula.percentual.toFixed(1)}%`;
          } else {
            winnerHtml = '<span class="winner-pill flavio">Flávio (PL)</span>';
            pctWinner = `${cData.flavio.percentual.toFixed(1)}%`;
          }
        } else {
          if (cData.vencedor === 'zucco') {
            winnerHtml = '<span class="winner-pill zucco">Zucco (PL)</span>';
            pctWinner = `${cData.zucco.percentual.toFixed(1)}%`;
          } else {
            winnerHtml = '<span class="winner-pill gov2">2º Colocado</span>';
            pctWinner = `${cData.gov2.percentual.toFixed(1)}%`;
          }
        }
      }
    }

    return `
      <tr data-cd="${item.cdMun}">
        <td><strong>${item.nmMun}</strong></td>
        <td><code style="font-family: monospace; color: #94a3b8;">${item.cdMun}</code></td>
        <td>${item.nmRgi || '-'}</td>
        <td>${winnerHtml}</td>
        <td><strong>${pctWinner}</strong></td>
        <td class="margin-tag">${margem}</td>
        <td>${validos}</td>
      </tr>
    `;
  }).join('');

  // Adicionar clique na linha para zoom no mapa
  tbody.querySelectorAll('tr[data-cd]').forEach(tr => {
    tr.onclick = () => {
      const cd = tr.getAttribute('data-cd');
      if (mapEngineRef) {
        // Fechar gaveta em telas pequenas para ver o mapa
        if (window.innerWidth < 768) {
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

function exportToCSV() {
  if (filteredTableData.length === 0) return;
  const cargo = electionState.currentCargo;
  
  const headers = ['Municipio', 'Codigo_IBGE', 'Regiao', 'Vencedor', 'Percentual_Vencedor', 'Margem_Percentual', 'Votos_Validos'];
  const rows = filteredTableData.map(item => {
    const res = item.result;
    let w = 'Sem dados';
    let p = '';
    let m = '';
    let v = '';
    if (res && res.apurado) {
      v = res.votosValidos;
      const c = cargo === 'PRESIDENTE' ? res.presidente : res.governador;
      if (c) {
        w = c.vencedor;
        m = c.margemPercent;
        p = cargo === 'PRESIDENTE' ? (c.vencedor === 'lula' ? c.lula.percentual : c.flavio.percentual) : (c.vencedor === 'zucco' ? c.zucco.percentual : c.gov2.percentual);
      }
    }
    return [
      `"${item.nmMun}"`,
      `"${item.cdMun}"`,
      `"${item.nmRgi}"`,
      `"${w}"`,
      p,
      m,
      v
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Eleicoes_RS_2026_${cargo}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
