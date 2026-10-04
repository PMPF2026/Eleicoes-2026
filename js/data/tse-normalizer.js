/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Camada de Normalização Oficial TSE e Gerenciamento de Estado
 */

import { APP_CONFIG } from '../config.js';

class ElectionStateManager {
  constructor() {
    this.currentState = APP_CONFIG.STATES.WAITING;
    this.currentCargo = APP_CONFIG.CARGOS.PRESIDENTE;
    this.electionData = null;
    this.subscribers = [];
  }

  /**
   * Inscreve um ouvinte para alterações nos dados ou no estado
   */
  subscribe(callback) {
    this.subscribers.push(callback);
  }

  /**
   * Notifica todos os ouvintes
   */
  notify() {
    this.subscribers.forEach(cb => cb({
      state: this.currentState,
      cargo: this.currentCargo,
      data: this.electionData
    }));
  }

  /**
   * Alterna o cargo visualizado (Presidente / Governador)
   */
  setCargo(cargo) {
    if (this.currentCargo !== cargo) {
      this.currentCargo = cargo;
      this.notify();
    }
  }

  /**
   * Atualiza os dados eleitorais centralizadamente
   */
  updateElectionData(normalizedData) {
    this.electionData = normalizedData;
    
    // Determina o estado da aplicação
    if (!normalizedData || Object.keys(normalizedData.resultados || {}).length === 0) {
      this.currentState = APP_CONFIG.STATES.WAITING;
    } else if (normalizedData.metadata && normalizedData.metadata.totalizacaoPercent >= 100) {
      this.currentState = APP_CONFIG.STATES.CONCLUDED;
    } else {
      this.currentState = APP_CONFIG.STATES.PROGRESS;
    }

    this.notify();
  }

  /**
   * Limpa os dados para o estado inicial (Aguardando apuração)
   */
  resetToWaiting() {
    this.electionData = null;
    this.currentState = APP_CONFIG.STATES.WAITING;
    this.notify();
  }

  /**
   * Obtém o resultado eleitoral de um município pelo código IBGE
   */
  getMunicipioResult(cdMun) {
    if (!this.electionData || !this.electionData.resultados) return null;
    return this.electionData.resultados[String(cdMun)] || null;
  }
}

export const electionState = new ElectionStateManager();

/**
 * Normalizador conceitual para arquivos JSON oficiais do TSE.
 * Transforma o payload do TSE na estrutura padrão indexada por CD_MUN.
 */
export function normalizeTSEPayload(tseRawJson) {
  if (!tseRawJson) return null;

  // Estrutura normalizada preparada para integração oficial
  const normalized = {
    metadata: {
      tipo: 'DADOS OFICIAIS TSE',
      eleicao: tseRawJson.eleicao || 'Eleições Gerais 2026',
      uf: tseRawJson.uf || 'RS',
      totalizacaoPercent: parseFloat(tseRawJson.pst || tseRawJson.percentualTotalizacao || 0),
      secoesTotal: parseInt(tseRawJson.s || tseRawJson.secoesTotal || 0, 10),
      secoesApuradas: parseInt(tseRawJson.st || tseRawJson.secoesApuradas || 0, 10),
      ultimaAtualizacao: tseRawJson.dg || tseRawJson.dataHora || new Date().toLocaleString('pt-BR'),
      municipiosTotal: 497,
      municipiosApurados: 0,
      municipiosPendentes: 497
    },
    resultados: {}
  };

  return normalized;
}
