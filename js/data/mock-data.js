/**
 * Eleições RS 2026 — Mapa Eleitoral
 * DADOS DE TESTE — NÃO OFICIAIS
 * 
 * ATENÇÃO:
 * Este conjunto de dados é estritamente simulado para testes de interface,
 * renderização cartográfica, escalas coropléticas e responsividade da tabela.
 * NÃO REPRESENTA RESULTADOS REAIS DAS ELEIÇÕES.
 */

export const IS_MOCK_DATA = true;
export const MOCK_DISCLAIMER = 'DADOS DE TESTE — NÃO OFICIAIS';

/**
 * Gera resultados simulados consistentes e realistas para os 497 municípios
 * com base no código IBGE (determinístico).
 */
export function generateMockElectionData(features) {
  const electionData = {
    metadata: {
      tipo: 'DADOS DE TESTE — NÃO OFICIAIS',
      geradoEm: new Date().toISOString(),
      ultimaAtualizacao: '04/10/2026 17:30',
      totalizacaoPercent: 94.8,
      secoesTotal: 27840,
      secoesApuradas: 26392,
      municipiosTotal: 497,
      municipiosApurados: 478,
      municipiosPendentes: 19
    },
    resultados: {}
  };

  // Pseudo-random com semente para manter resultados estáveis por CD_MUN
  function pseudoRandom(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  }

  features.forEach((feat, idx) => {
    const props = feat.getProperties ? feat.getProperties() : (feat.properties || {});
    const cdMun = String(props.CD_MUN);
    const nmMun = props.NM_MUN;

    // Simula 19 municípios pendentes de apuração
    const isPendente = idx % 26 === 0;

    if (isPendente) {
      electionData.resultados[cdMun] = {
        cdMun,
        nmMun,
        situacao: 'AGUARDANDO_TOTALIZACAO',
        apurado: false,
        presidente: null,
        governador: null
      };
      return;
    }

    const rand1 = pseudoRandom(cdMun + '_pres');
    const rand2 = pseudoRandom(cdMun + '_gov');
    const randPop = pseudoRandom(cdMun + '_pop');

    // Estimativa de eleitorado (5.000 a 150.000)
    const validosPres = Math.round(3000 + randPop * 85000);
    const brancosPres = Math.round(validosPres * 0.025);
    const nulosPres = Math.round(validosPres * 0.035);
    const totalPres = validosPres + brancosPres + nulosPres;

    // Presidente: Lula vs Flávio Bolsonaro
    // Variação percentual entre 35% e 65%
    const pLula = 35 + rand1 * 30;
    const pFlavio = 100 - pLula;
    const vLula = Math.round(validosPres * (pLula / 100));
    const vFlavio = validosPres - vLula;
    const vencedorPres = pLula >= pFlavio ? 'lula' : 'flavio';
    const margemPres = Math.abs(pLula - pFlavio);

    // Governador: Zucco vs Segundo Colocado
    const pZucco = 38 + rand2 * 28;
    const pGov2 = 100 - pZucco;
    const vZucco = Math.round(validosPres * (pZucco / 100));
    const vGov2 = validosPres - vZucco;
    const vencedorGov = pZucco >= pGov2 ? 'zucco' : 'gov2';
    const margemGov = Math.abs(pZucco - pGov2);

    electionData.resultados[cdMun] = {
      cdMun,
      nmMun,
      situacao: 'TOTALIZADO',
      apurado: true,
      secoesTotal: Math.round(validosPres / 350) + 2,
      secoesApuradas: Math.round(validosPres / 350) + 2,
      votosValidos: validosPres,
      votosBrancos: brancosPres,
      votosNulos: nulosPres,
      totalVotos: totalPres,
      
      presidente: {
        vencedor: vencedorPres,
        margemPercent: parseFloat(margemPres.toFixed(2)),
        lula: {
          nome: 'Lula',
          numero: 13,
          votos: vLula,
          percentual: parseFloat(pLula.toFixed(2))
        },
        flavio: {
          nome: 'Flávio Bolsonaro',
          numero: 22,
          votos: vFlavio,
          percentual: parseFloat(pFlavio.toFixed(2))
        }
      },

      governador: {
        vencedor: vencedorGov,
        margemPercent: parseFloat(margemGov.toFixed(2)),
        zucco: {
          nome: 'Zucco',
          numero: 22,
          votos: vZucco,
          percentual: parseFloat(pZucco.toFixed(2))
        },
        gov2: {
          nome: 'Segundo Colocado',
          numero: 0,
          votos: vGov2,
          percentual: parseFloat(pGov2.toFixed(2))
        }
      }
    };
  });

  return electionData;
}
