/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Camada Visual Independente de Labels Municipais (GATE 7.1)
 * 
 * Exibe o nome dos 497 municípios do Rio Grande do Sul (NM_MUN) diretamente
 * sobre a representação cartográfica, utilizando renderização nativa OpenLayers
 * com posicionamento no centro visual (ponto interno), declutter nativo
 * e escala de visualização progressiva por nível de zoom.
 */

// Conjunto de municípios de referência macro-regional do RS
const MACRO_HUBS = new Set([
  'PORTO ALEGRE', 'PASSO FUNDO', 'PELOTAS', 'CAXIAS DO SUL', 'SANTA MARIA',
  'URUGUAIANA', 'SANTA CRUZ DO SUL', 'IJUI', 'IJUÍ', 'BAGE', 'BAGÉ',
  'ERECHIM', 'RIO GRANDE', 'BENTO GONCALVES', 'BENTO GONÇALVES', 'LAJEADO',
  'ALEGRETE', 'SANTANA DO LIVRAMENTO', 'SANTO ANGELO', 'SANTO ÂNGELO',
  'CRUZ ALTA', 'SAO BORJA', 'SÃO BORJA', 'VACARIA'
]);

// Cache em memória de instâncias ol.style.Style (otimização de renderização a 60fps)
const labelStyleCache = new Map();

/**
 * Remove acentos para comparação normalizada de nomes de municípios
 */
function normalizeName(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/**
 * Calcula o ponto interior ótimo (PointOnSurface / getInteriorPoint)
 * Para MultiPolygons com múltiplas partes ou ilhas, seleciona a parte de maior área
 * garantindo que o rótulo permaneça sempre rigorosamente dentro do polígono principal.
 */
export function calculateInteriorPoint(feature) {
  const geom = feature.getGeometry();
  if (!geom) return null;

  const geomType = geom.getType();

  if (geomType === 'Polygon') {
    return geom.getInteriorPoint().getCoordinates();
  }

  if (geomType === 'MultiPolygon') {
    const polygons = geom.getPolygons();
    if (!polygons || polygons.length === 0) return null;

    let maxArea = -1;
    let largestPoly = polygons[0];

    for (let i = 0; i < polygons.length; i++) {
      const area = polygons[i].getArea();
      if (area > maxArea) {
        maxArea = area;
        largestPoly = polygons[i];
      }
    }

    if (largestPoly) {
      return largestPoly.getInteriorPoint().getCoordinates();
    }
    return geom.getInteriorPoints().getPoint(0).getCoordinates();
  }

  return null;
}

/**
 * Retorna o estilo de texto OpenLayers para o município a partir do cache
 */
function getCachedLabelStyle(nameUpper, fontSize) {
  const cacheKey = `${nameUpper}_${fontSize}`;
  let style = labelStyleCache.get(cacheKey);

  if (!style) {
    style = new ol.style.Style({
      text: new ol.style.Text({
        text: nameUpper,
        font: `600 ${fontSize} "Inter", "Fira Sans", sans-serif`,
        fill: new ol.style.Fill({
          color: '#0f172a' // Slate escuro de alto contraste
        }),
        stroke: new ol.style.Stroke({
          color: '#ffffff', // Halo branco puro para legibilidade sobre qualquer coroplético
          width: 2.8
        }),
        textAlign: 'center',
        textBaseline: 'middle',
        placement: 'point'
      })
    });
    labelStyleCache.set(cacheKey, style);
  }

  return style;
}

/**
 * Função de estilo progressivo por nível de zoom com declutter nativo OpenLayers
 * 
 * - Zoom afastado (zoom < 7.6): Apenas polos macro-regionais de referência para manter o mapa limpo
 * - Zoom intermediário (7.6 <= zoom < 9.2): Exibição progressiva de polos intermediários e municípios médios
 * - Zoom aproximado (zoom >= 9.2): Todos os 497 municípios disponíveis para exibição
 */
export function municipalLabelStyleFunction(feature, resolution) {
  // Conversão padronizada de resolução para nível de zoom em EPSG:3857
  const zoom = Math.log2(156543.03392804097 / resolution);

  // Zoom excessivamente afastado (< 7.0): mapa totalmente limpo
  if (zoom < 7.0) {
    return null;
  }

  const isMacro = feature.get('_isMacro');
  const isMeso = feature.get('_isMeso');

  // Zoom afastado (7.0 <= zoom < 7.6): apenas polos macro-regionais
  if (zoom < 7.6) {
    if (!isMacro) return null;
  }
  // Zoom intermediário (7.6 <= zoom < 9.2): polos e municípios com área intermediária
  else if (zoom < 9.2) {
    if (!isMeso) return null;
  }
  // Zoom aproximado (zoom >= 9.2): todos os 497 municípios são elegíveis

  const nameUpper = feature.get('_nameUpper');
  if (!nameUpper) return null;

  // Escala sutil da fonte: 10px no zoom inicial/médio, 11px no zoom detalhado
  const fontSize = zoom >= 9.8 ? '11px' : '10px';
  return getCachedLabelStyle(nameUpper, fontSize);
}

/**
 * Cria e configura a camada visual independente de labels OpenLayers
 */
export function createLabelLayer() {
  const labelSource = new ol.source.Vector();

  const labelLayer = new ol.layer.Vector({
    source: labelSource,
    declutter: true, // Recurso nativo do OpenLayers para eliminação automática de sobreposição
    zIndex: 15,      // Ordem: Basemap (0) -> Municípios coropléticos (10) -> Labels (15) -> Interação
    style: municipalLabelStyleFunction
  });

  return { labelLayer, labelSource };
}

/**
 * Popula a camada de labels com os 497 municípios a partir das feições cartográficas
 * NÃO modifica o GeoJSON original em disco nem altera suas propriedades.
 */
export function populateMunicipalLabels(polygonFeatures, labelSource) {
  if (!polygonFeatures || !Array.isArray(polygonFeatures) || !labelSource) return;

  const labelFeatures = [];

  polygonFeatures.forEach(polyFeat => {
    const rawNm = polyFeat.get('NM_MUN');
    if (!rawNm) return;

    const coords = calculateInteriorPoint(polyFeat);
    if (!coords) return;

    const cdMun = String(polyFeat.get('CD_MUN') || '');
    const nmUpper = String(rawNm).toUpperCase().trim();
    const nmNorm = normalizeName(rawNm);
    const rgintNorm = normalizeName(polyFeat.get('NM_RGINT') || '');
    const rgiNorm = normalizeName(polyFeat.get('NM_RGI') || '');
    const area = parseFloat(polyFeat.get('AREA_KM2') || 0);

    // Classificação hierárquica baseada em dados geográficos oficiais do IBGE
    const isMacro = MACRO_HUBS.has(nmNorm) ||
                    (rgintNorm.length > 0 && (nmNorm.includes(rgintNorm) || rgintNorm.includes(nmNorm))) ||
                    area >= 2800;

    const isMeso = isMacro ||
                   (rgiNorm.length > 0 && (nmNorm.includes(rgiNorm) || rgiNorm.includes(nmNorm))) ||
                   area >= 300;

    const labelFeat = new ol.Feature({
      geometry: new ol.geom.Point(coords),
      NM_MUN: rawNm,
      CD_MUN: cdMun,
      _nameUpper: nmUpper,
      _isMacro: isMacro,
      _isMeso: isMeso,
      parentFeature: polyFeat
    });

    labelFeatures.push(labelFeat);
  });

  labelSource.clear();
  labelSource.addFeatures(labelFeatures);
  console.log(`[Labels] ${labelFeatures.length} labels municipais inicializados com sucesso.`);
}
