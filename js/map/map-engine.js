/**
 * Eleições RS 2026 — Mapa Eleitoral
 * Motor Cartográfico OpenLayers v10 (Camadas, Basemaps, Eventos e Interações)
 */

import { APP_CONFIG } from '../config.js';
import { municipalStyleFunction, hoverStyleFunction, selectedStyleFunction } from './symbology.js';
import { formatCursorCoordinates } from '../utils/projection.js';
import { showPopup, hidePopup, showTooltip, hideTooltip } from '../ui/popup.js';

export class MapEngine {
  constructor(targetElementId) {
    this.targetElementId = targetElementId;
    this.map = null;
    this.vectorLayer = null;
    this.vectorSource = null;
    this.basemaps = {};
    this.currentBasemap = 'carto-light';
    this.hoveredFeature = null;
    this.selectedFeature = null;
    this.featuresByIbge = new Map();
    this.onFeaturesLoadedCallbacks = [];
  }

  init() {
    // Definir Basemaps
    this.basemaps['carto-light'] = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attributions: '© CartoDB, © OpenStreetMap'
      }),
      visible: true
    });

    this.basemaps['carto-dark'] = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        attributions: '© CartoDB, © OpenStreetMap'
      }),
      visible: false
    });

    this.basemaps['osm'] = new ol.layer.Tile({
      source: new ol.source.OSM(),
      visible: false
    });

    this.basemaps['satellite'] = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: '© Esri, Maxar, Earthstar Geographics'
      }),
      visible: false
    });

    // Camada Vetorial dos 497 Municípios
    this.vectorSource = new ol.source.Vector({
      url: APP_CONFIG.geoJsonPath,
      format: new ol.format.GeoJSON({
        dataProjection: APP_CONFIG.sourceCRS,
        featureProjection: APP_CONFIG.displayCRS
      })
    });

    this.vectorLayer = new ol.layer.Vector({
      source: this.vectorSource,
      style: municipalStyleFunction,
      zIndex: 10
    });

    // Posição central inicial
    const centerMercator = ol.proj.fromLonLat(APP_CONFIG.centerRS);

    this.map = new ol.Map({
      target: this.targetElementId,
      layers: [
        this.basemaps['carto-light'],
        this.basemaps['carto-dark'],
        this.basemaps['osm'],
        this.basemaps['satellite'],
        this.vectorLayer
      ],
      view: new ol.View({
        center: centerMercator,
        zoom: APP_CONFIG.defaultZoom,
        minZoom: APP_CONFIG.minZoom,
        maxZoom: APP_CONFIG.maxZoom
      }),
      controls: ol.control.defaults.defaults({
        zoom: true,
        rotate: false,
        attribution: true
      })
    });

    // Ouvinte de carregamento das features
    this.vectorSource.once('featuresloadend', () => {
      const features = this.vectorSource.getFeatures();
      console.log(`[MapEngine] ${features.length} municípios carregados com sucesso no mapa.`);
      
      features.forEach(feat => {
        const cdMun = String(feat.get('CD_MUN'));
        this.featuresByIbge.set(cdMun, feat);
      });

      this.onFeaturesLoadedCallbacks.forEach(cb => cb(features));
    });

    this.setupInteractions();
  }

  onFeaturesLoaded(callback) {
    if (this.featuresByIbge.size > 0) {
      callback(Array.from(this.featuresByIbge.values()));
    } else {
      this.onFeaturesLoadedCallbacks.push(callback);
    }
  }

  setupInteractions() {
    const map = this.map;
    const coordEl = document.getElementById('footer-coords');

    // Pointer Move (Hover + Coordenadas)
    map.on('pointermove', (evt) => {
      if (evt.dragging) return;

      // Coordenadas
      if (coordEl) {
        const coords = formatCursorCoordinates(evt.coordinate);
        coordEl.textContent = `${coords.geographic} | ${coords.utm}`;
      }

      // Detecção de Hover
      let hitFeature = null;
      map.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
        if (layer === this.vectorLayer) {
          hitFeature = feat;
          return true;
        }
      });

      map.getTargetElement().style.cursor = hitFeature ? 'pointer' : '';

      // Atualiza estilo de hover
      if (this.hoveredFeature !== hitFeature) {
        if (this.hoveredFeature && this.hoveredFeature !== this.selectedFeature) {
          this.hoveredFeature.setStyle(null);
        }
        if (hitFeature && hitFeature !== this.selectedFeature) {
          hitFeature.setStyle(hoverStyleFunction(hitFeature));
        }
        this.hoveredFeature = hitFeature;
      }

      // Tooltip flutuante
      if (hitFeature) {
        showTooltip(hitFeature, evt.originalEvent);
      } else {
        hideTooltip();
      }
    });

    // Clique no Município
    map.on('singleclick', (evt) => {
      let clickedFeature = null;
      map.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
        if (layer === this.vectorLayer) {
          clickedFeature = feat;
          return true;
        }
      });

      if (clickedFeature) {
        this.selectFeature(clickedFeature);
        showPopup(clickedFeature, evt.coordinate, map);
      } else {
        this.clearSelection();
        hidePopup();
      }
    });
  }

  selectFeature(feature) {
    if (this.selectedFeature) {
      this.selectedFeature.setStyle(null);
    }
    this.selectedFeature = feature;
    feature.setStyle(selectedStyleFunction(feature));
  }

  clearSelection() {
    if (this.selectedFeature) {
      this.selectedFeature.setStyle(null);
      this.selectedFeature = null;
    }
  }

  zoomToIbge(cdMun) {
    const feat = this.featuresByIbge.get(String(cdMun));
    if (feat) {
      this.selectFeature(feat);
      const geom = feat.getGeometry();
      const extent = geom.getExtent();
      
      this.map.getView().fit(extent, {
        padding: [60, 60, 60, 60],
        duration: 800,
        maxZoom: 11
      });

      const center = ol.extent.getCenter(extent);
      showPopup(feat, center, this.map);
    }
  }

  resetView() {
    const centerMercator = ol.proj.fromLonLat(APP_CONFIG.centerRS);
    this.map.getView().animate({
      center: centerMercator,
      zoom: APP_CONFIG.defaultZoom,
      duration: 600
    });
    this.clearSelection();
    hidePopup();
  }

  setBasemap(key) {
    if (this.basemaps[key]) {
      Object.keys(this.basemaps).forEach(k => {
        this.basemaps[k].setVisible(k === key);
      });
      this.currentBasemap = key;
    }
  }

  refreshStyles() {
    if (this.vectorLayer) {
      this.vectorLayer.changed();
    }
  }
}
