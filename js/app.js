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
import { initAboutModal } from './ui/about.js';
import { electionState } from './data/tse-normalizer.js';

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

  // 4.1 Inicializar Modal Institucional Sobre (GATE 7.1)
  initAboutModal();

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
    };

    btnGov.onclick = () => {
      btnGov.classList.add('active');
      btnPres.classList.remove('active');
      electionState.setCargo(APP_CONFIG.CARGOS.GOVERNADOR);
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

  // 10. Quando os 497 municípios forem carregados na cartografia
  mapEngine.onFeaturesLoaded(async (features) => {
    // 10.1 Ingestão e normalização oficial do TSE
    await electionState.loadConsolidatedData();

    // 10.2 Validação cruzada Cartografia x Eleições (Seção 8 do GATE 6.1)
    electionState.validateCartographyCrossReference(features);

    // 10.3 Atualizar a renderização da simbologia temática coroplética
    mapEngine.refreshStyles();

    // 10.4 Preencher a tabela municipal com os dados base
    populateTableData(features);

    // Configurar o botão informativo oficial
    const simBtn = document.getElementById('btn-toggle-sim');
    if (simBtn) {
      simBtn.innerHTML = `
        <span class="ui-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </span>
        <span>Consolidado Oficial TSE (497 Mun)</span>
      `;
      simBtn.style.color = '#10b981';
      simBtn.title = 'Dados consolidados oficiais do TSE carregados com sucesso';
      simBtn.onclick = () => {
        const meta = electionState.getElectionMetadata();
        console.log('[TSE Oficial] Metadados da Publicação:', meta);
        console.log('[TSE Oficial] Métricas de Desempenho:', electionState.getPerformanceMetrics());
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
