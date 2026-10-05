/**
 * Eleições RS 2026 — Mapa Eleitoral
 * GATE 7.1 — Componente "Sobre": Informações Institucionais e Técnicas
 */

import { APP_CONFIG } from '../config.js';
import { electionState } from '../data/tse-normalizer.js';

/**
 * Inicializa o modal "Sobre" e seus controles de abertura, fechamento e dados dinâmicos.
 */
export function initAboutModal() {
  const openBtn = document.getElementById('btn-open-about');
  const footerLink = document.getElementById('footer-link-about');
  const modal = document.getElementById('about-modal');
  const overlay = document.getElementById('about-modal-overlay');
  const closeBtn = document.getElementById('about-modal-close');

  if (!modal || !overlay) {
    console.warn('[Sobre] Elementos do modal Sobre não encontrados no DOM.');
    return;
  }

  function openModal() {
    updateDynamicInfo();
    modal.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (openBtn) {
    openBtn.onclick = (e) => {
      e.preventDefault();
      openModal();
    };
  }

  if (footerLink) {
    footerLink.onclick = (e) => {
      e.preventDefault();
      openModal();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      closeModal();
    };
  }

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Atualiza as informações ao inicializar caso já haja metadados carregados
  updateDynamicInfo();
}

/**
 * Atualiza dinamicamente as informações de coleta a partir do pipeline_status.json ou do consolidado
 */
async function updateDynamicInfo() {
  const timeEl = document.getElementById('about-update-time');
  const versionEl = document.getElementById('about-update-version');
  const statusEl = document.getElementById('about-update-status');
  const munsEl = document.getElementById('about-update-muns');

  if (!timeEl) return;

  try {
    // Tenta obter o status operacional mais recente de data/pipeline_status.json
    const res = await fetch(APP_CONFIG.tsePipelineStatusPath, { cache: 'no-cache' });
    if (res.ok) {
      const statusData = await res.json();
      renderStatusData(statusData, timeEl, versionEl, statusEl, munsEl);
      return;
    }
  } catch (e) {
    // Silently fallback to in-memory electionState metadata
  }

  // Fallback para metadados já carregados no electionState
  const meta = electionState.metadata;
  if (meta) {
    const formattedDate = formatIsoDate(meta.published_at || meta.collected_at);
    timeEl.textContent = formattedDate || 'Conforme apuração oficial';
    if (versionEl) versionEl.textContent = meta.data_version || meta.collection_id || '1.0.0';
    if (statusEl) statusEl.textContent = meta.publication_status === 'published' ? 'Atualizado (Oficial)' : 'Em apuração';
    if (munsEl) munsEl.textContent = '497 municípios (100% RS)';
  } else {
    timeEl.textContent = 'Aguardando sincronização oficial';
  }
}

function renderStatusData(statusData, timeEl, versionEl, statusEl, munsEl) {
  const ts = statusData.last_successful_publication_at || statusData.last_run_finished_at;
  timeEl.textContent = formatIsoDate(ts) || 'Em apuração contínua';
  
  if (versionEl) {
    versionEl.textContent = statusData.data_version || statusData.collection_id || '-';
  }

  if (statusEl) {
    const isSuccess = statusData.pipeline_state === 'success' && !statusData.fail_safe_triggered;
    statusEl.innerHTML = isSuccess 
      ? '<span style="color: #4ade80;">Operacional • Sucesso</span>' 
      : '<span style="color: #f59e0b;">Em processamento</span>';
  }

  if (munsEl) {
    const total = statusData.total_municipalities || 497;
    const h200 = statusData.http_200 !== undefined ? statusData.http_200 : '-';
    const h304 = statusData.http_304 !== undefined ? statusData.http_304 : '-';
    munsEl.textContent = `${total} municípios (200: ${h200} | 304: ${h304})`;
  }
}

function formatIsoDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' (Horário de Brasília)';
  } catch (e) {
    return isoString;
  }
}
