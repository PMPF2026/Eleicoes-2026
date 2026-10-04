/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Ponto de Entrada Principal (Bootstrap da Aplicação WebGIS)
 */

import { APP_CONFIG } from './config.js';
import { initProjections } from './utils/projection.js';
import { MapEngine } from './map/map-engine.js';
import { initPopups } from './ui/popup.js';
import { updateStatusPanel } from './ui/status-panel.js';
import { initTableView, populateTableData, renderTable } from './ui/table-view.js';
import { electionState } from './data/tse-normalizer.js';
import { generateMockElectionData } from './data/mock-data.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log(`[App] Inicializando ${APP_CONFIG.appName}...`);

  // 1. Inicializar Projeção EPSG:31982
  initProjections();

  // 2. Inicializar Motor Cartográfico
  const mapEngine = new MapEngine('map-container');
  mapEngine.init();

  // 3. Inicializar Popups
  initPopups(mapEngine.map);

  // 4. Inicializar Tabela Municipal
  initTableView(mapEngine);

  // 5. Vincular Gerenciador de Estado à UI
  electionState.subscribe(stateObj => {
    updateStatusPanel(stateObj);
    mapEngine.refreshStyles();
    renderTable();
  });

  // 6. Configurar Seletor de Cargo (Presidente vs Governador)
  const btnPres = document.getElementById('btn-cargo-pres');
  const btnGov = document.getElementById('btn-cargo-gov');

  if (btnPres && btnGov) {
    btnPres.onclick = () => {
      btnPres.classList.add('active');
      btnGov.classList.remove('active');
      electionState.setCargo(APP_CONFIG.CARGOS.PRESIDENTE);
      // Atualizar opções do filtro na tabela
      updateTableFilterOptions(APP_CONFIG.CARGOS.PRESIDENTE);
    };

    btnGov.onclick = () => {
      btnGov.classList.add('active');
      btnPres.classList.remove('active');
      electionState.setCargo(APP_CONFIG.CARGOS.GOVERNADOR);
      // Atualizar opções do filtro na tabela
      updateTableFilterOptions(APP_CONFIG.CARGOS.GOVERNADOR);
    };
  }

  // 7. Configurar Seletor de Basemaps
  const basemapToggle = document.getElementById('btn-basemap-toggle');
  const basemapMenu = document.getElementById('basemap-menu');

  if (basemapToggle && basemapMenu) {
    basemapToggle.onclick = (e) => {
      e.stopPropagation();
      basemapMenu.classList.toggle('active');
    };

    document.addEventListener('click', () => {
      basemapMenu.classList.remove('active');
    });

    document.querySelectorAll('.basemap-option').forEach(opt => {
      opt.onclick = () => {
        const key = opt.getAttribute('data-base');
        mapEngine.setBasemap(key);
        document.querySelectorAll('.basemap-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        basemapMenu.classList.remove('active');
      };
    });
  }

  // 8. Botão Centralizar RS
  const resetBtn = document.getElementById('btn-reset-view');
  if (resetBtn) {
    resetBtn.onclick = () => mapEngine.resetView();
  }

  // 9. Configurar Busca Rápida Municipal
  setupMunicipalSearch(mapEngine);

  // 10. Quando os 497 municípios forem carregados
  mapEngine.onFeaturesLoaded(features => {
    populateTableData(features);

    // Carregar inicialmente os dados simulados de teste para validação imediata da interface
    const mockData = generateMockElectionData(features);
    electionState.updateElectionData(mockData);

    // Configurar Botão de Alternância (Simulação vs Aguardando Oficial)
    const simBtn = document.getElementById('btn-toggle-sim');
    if (simBtn) {
      simBtn.onclick = () => {
        if (electionState.currentState === APP_CONFIG.STATES.WAITING) {
          electionState.updateElectionData(mockData);
          simBtn.innerHTML = '<span>Modo Simulação / Teste</span>';
          simBtn.style.color = '#38bdf8';
        } else {
          electionState.resetToWaiting();
          simBtn.innerHTML = '<span>Aguardando Oficial TSE</span>';
          simBtn.style.color = '#fbbf24';
        }
      };
    }
  });
});

/**
 * Configura o autocomplete da barra de busca de municípios
 */
function setupMunicipalSearch(mapEngine) {
  const searchInput = document.getElementById('search-municipal');
  const dropdown = document.getElementById('search-results-dropdown');
  if (!searchInput || !dropdown) return;

  searchInput.oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q || q.length < 2) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    }

    const matches = [];
    mapEngine.featuresByIbge.forEach((feat, cd) => {
      const nm = (feat.get('NM_MUN') || '').toLowerCase();
      if (nm.includes(q) || cd.includes(q)) {
        matches.push({ cd, nm: feat.get('NM_MUN') });
      }
    });

    if (matches.length === 0) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = matches.slice(0, 8).map(m => `
      <div class="search-result-item" data-cd="${m.cd}">
        <span>${m.nm}</span>
        <span class="ibge-tag">${m.cd}</span>
      </div>
    `).join('');

    dropdown.classList.add('active');

    dropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.onclick = () => {
        const cd = item.getAttribute('data-cd');
        mapEngine.zoomToIbge(cd);
        dropdown.classList.remove('active');
        searchInput.value = '';
      };
    });
  };

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

/**
 * Atualiza os rótulos do dropdown de filtro da tabela
 */
function updateTableFilterOptions(cargo) {
  const filterSelect = document.getElementById('table-filter-winner');
  if (!filterSelect) return;

  if (cargo === APP_CONFIG.CARGOS.PRESIDENTE) {
    filterSelect.innerHTML = `
      <option value="all">Todos os Vencedores</option>
      <option value="lula">Vantagem Lula (PT)</option>
      <option value="flavio">Vantagem Flávio Bolsonaro (PL)</option>
      <option value="sem-dados">Sem dados / Pendente</option>
    `;
  } else {
    filterSelect.innerHTML = `
      <option value="all">Todos os Vencedores</option>
      <option value="zucco">Vantagem Zucco (PL)</option>
      <option value="gov2">Vantagem 2º Colocado</option>
      <option value="sem-dados">Sem dados / Pendente</option>
    `;
  }
}
