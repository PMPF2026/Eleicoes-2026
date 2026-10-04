/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Configuração e Registro de Projeções Cartográficas (Proj4js & OpenLayers)
 * 
 * Camada Original: SIRGAS 2000 / UTM Zone 22S (EPSG:31982)
 * Camada de Exibição Web: Web Mercator (EPSG:3857) e Geográfico WGS84 (EPSG:4326)
 */

export const EPSG_UTM22S = 'EPSG:31982';
export const EPSG_WGS84 = 'EPSG:4326';
export const EPSG_WEBMERCATOR = 'EPSG:3857';

export const PROJ4_DEF_31982 = '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';

/**
 * Registra o CRS EPSG:31982 no proj4 e conecta com OpenLayers
 */
export function initProjections() {
  if (typeof proj4 !== 'undefined') {
    proj4.defs(EPSG_UTM22S, PROJ4_DEF_31982);
    if (window.ol && window.ol.proj && window.ol.proj.proj4 && window.ol.proj.proj4.register) {
      window.ol.proj.proj4.register(proj4);
      console.log('[Projection] EPSG:31982 registrado no OpenLayers via Proj4js com sucesso.');
    }
  } else {
    console.warn('[Projection] Proj4js não detectado no escopo global.');
  }
}

/**
 * Converte coordenadas do mapa para exibição no rodapé (Lat/Lon e UTM Fuso 22S)
 */
export function formatCursorCoordinates(mapCoord) {
  if (!mapCoord || !window.ol || !window.ol.proj) {
    return { utm: 'E: - | N: -', geographic: 'Lat: - | Lon: -' };
  }
  
  const lonLat = window.ol.proj.toLonLat(mapCoord);
  const lon = lonLat[0];
  const lat = lonLat[1];
  
  let utmX = 0;
  let utmY = 0;
  
  if (typeof proj4 !== 'undefined') {
    try {
      const utm = proj4(EPSG_WGS84, EPSG_UTM22S, [lon, lat]);
      utmX = Math.round(utm[0]);
      utmY = Math.round(utm[1]);
    } catch (e) {
      // ignore
    }
  }

  const latFormatted = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonFormatted = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'O'}`;
  const utmFormatted = `E: ${utmX.toLocaleString('pt-BR')} m | N: ${utmY.toLocaleString('pt-BR')} m (UTM 22S)`;
  const geoFormatted = `${latFormatted}, ${lonFormatted}`;

  return { utm: utmFormatted, geographic: geoFormatted, rawLonLat: [lon, lat] };
}
