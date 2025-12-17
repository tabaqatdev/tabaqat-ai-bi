import { useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Spin } from 'antd';
import styled from 'styled-components';

const MapContainer = styled.div`
  width: 100%;
  height: 400px;
  position: relative;

  .maplibregl-map {
    width: 100%;
    height: 100%;
  }

  .maplibregl-popup {
    max-width: 300px;
  }

  .maplibregl-popup-content {
    padding: 10px 15px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 10;
`;

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
  properties?: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

interface MapViewProps {
  data: any[][];
  columns: { name: string; type: string }[];
  width?: number | string;
  height?: number | string;
}

// Helper function to detect geometry column
const findGeometryColumn = (
  columns: { name: string; type: string }[]
): number => {
  return columns.findIndex(
    (col) =>
      col.type?.toUpperCase() === 'GEOMETRY' ||
      col.type?.toUpperCase() === 'GEOGRAPHY' ||
      col.name?.toLowerCase().includes('geojson') ||
      col.name?.toLowerCase().includes('geometry') ||
      col.name?.toLowerCase().includes('geom')
  );
};

// Helper function to find lat/long columns
const findLatLongColumns = (
  columns: { name: string; type: string }[]
): { latIndex: number; longIndex: number } => {
  const colNames = columns.map((col) => col.name?.toLowerCase());
  
  const latIndex = colNames.findIndex((name) => 
    name === 'lat' || name === 'latitude' || name === 'y' || (name?.includes('lat') && !name?.includes('lon'))
  );
  
  const longIndex = colNames.findIndex((name) => 
    name === 'long' || name === 'lng' || name === 'longitude' || name === 'x' || name?.includes('lon')
  );
  
  return { latIndex, longIndex };
};

// Convert lat/long data to GeoJSON FeatureCollection
const convertLatLongToGeoJSON = (
  data: any[][],
  columns: { name: string; type: string }[],
  latIndex: number,
  longIndex: number
): GeoJSONFeatureCollection => {
  const features: GeoJSONFeature[] = [];

  data.forEach((row) => {
    let lat = parseFloat(row[latIndex]);
    let lng = parseFloat(row[longIndex]);

    // Skip if coordinates are invalid numbers
    if (isNaN(lat) || isNaN(lng)) return;

    // Auto-detect and swap if coordinates appear to be reversed
    // Latitude must be between -90 and 90, longitude between -180 and 180
    // If lat is outside [-90, 90] but lng is within, they might be swapped
    if ((lat < -90 || lat > 90) && (lng >= -90 && lng <= 90)) {
      // Swap coordinates - data likely has long in lat column
      [lat, lng] = [lng, lat];
    }

    // Validate coordinates are within valid ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('Invalid coordinates:', { lat, lng });
      return;
    }

    // Add other columns as properties
    const properties: Record<string, any> = {};
    columns.forEach((col, index) => {
      if (index !== latIndex && index !== longIndex) {
        properties[col.name] = row[index];
      }
    });
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat], // GeoJSON uses [longitude, latitude]
      },
      properties,
    });
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};

// Helper function to parse WKB hex string to GeoJSON
const parseWKBHex = (wkbHex: string): { type: string; coordinates: any } | null => {
  try {
    // Remove any leading '0x' if present
    const hex = wkbHex.replace(/^0x/i, '');
    
    // WKB format: byte order (1 byte) + type (4 bytes) + coordinates
    // Byte order: 00 = big endian, 01 = little endian
    const byteOrder = parseInt(hex.substring(0, 2), 16);
    const isLittleEndian = byteOrder === 1;
    
    // Read 4-byte integer for geometry type
    const typeHex = hex.substring(2, 10);
    let geomType: number;
    if (isLittleEndian) {
      // Reverse bytes for little endian
      geomType = parseInt(
        typeHex.substring(6, 8) + typeHex.substring(4, 6) + 
        typeHex.substring(2, 4) + typeHex.substring(0, 2),
        16
      );
    } else {
      geomType = parseInt(typeHex, 16);
    }
    
    // Handle SRID flag (if type > 0x20000000, SRID is present)
    let offset = 10;
    const hasSRID = (geomType & 0x20000000) !== 0;
    if (hasSRID) {
      offset += 8; // Skip 4-byte SRID
      geomType = geomType & 0x1FFFFFFF; // Remove SRID flag
    }
    
    // Handle Z flag
    const hasZ = (geomType & 0x80000000) !== 0 || (geomType >= 1000 && geomType < 2000);
    if (hasZ) {
      geomType = geomType & 0x7FFFFFFF;
      if (geomType >= 1000) geomType -= 1000;
    }
    
    // Handle M flag
    const hasM = (geomType & 0x40000000) !== 0 || (geomType >= 2000 && geomType < 3000);
    if (hasM) {
      geomType = geomType & 0xBFFFFFFF;
      if (geomType >= 2000) geomType -= 2000;
    }
    
    const coordSize = hasZ ? (hasM ? 32 : 24) : (hasM ? 24 : 16); // bytes per coordinate
    
    // Helper to read double from hex
    const readDouble = (hexStr: string, pos: number, littleEndian: boolean): number => {
      const bytes = hexStr.substring(pos, pos + 16);
      let reordered = bytes;
      if (littleEndian) {
        reordered = '';
        for (let i = 14; i >= 0; i -= 2) {
          reordered += bytes.substring(i, i + 2);
        }
      }
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      for (let i = 0; i < 8; i++) {
        view.setUint8(i, parseInt(reordered.substring(i * 2, i * 2 + 2), 16));
      }
      return view.getFloat64(0, false);
    };
    
    // Helper to read uint32 from hex
    const readUint32 = (hexStr: string, pos: number, littleEndian: boolean): number => {
      const bytes = hexStr.substring(pos, pos + 8);
      if (littleEndian) {
        return parseInt(
          bytes.substring(6, 8) + bytes.substring(4, 6) + 
          bytes.substring(2, 4) + bytes.substring(0, 2),
          16
        );
      }
      return parseInt(bytes, 16);
    };
    
    // Parse based on geometry type
    switch (geomType) {
      case 1: { // Point
        const x = readDouble(hex, offset, isLittleEndian);
        const y = readDouble(hex, offset + 16, isLittleEndian);
        return { type: 'Point', coordinates: [x, y] };
      }
      case 2: { // LineString
        const numPoints = readUint32(hex, offset, isLittleEndian);
        offset += 8;
        const coords: number[][] = [];
        for (let i = 0; i < numPoints; i++) {
          const x = readDouble(hex, offset, isLittleEndian);
          const y = readDouble(hex, offset + 16, isLittleEndian);
          coords.push([x, y]);
          offset += coordSize * 2; // 2 hex chars per byte
        }
        return { type: 'LineString', coordinates: coords };
      }
      case 3: { // Polygon
        const numRings = readUint32(hex, offset, isLittleEndian);
        offset += 8;
        const rings: number[][][] = [];
        for (let r = 0; r < numRings; r++) {
          const numPoints = readUint32(hex, offset, isLittleEndian);
          offset += 8;
          const ring: number[][] = [];
          for (let i = 0; i < numPoints; i++) {
            const x = readDouble(hex, offset, isLittleEndian);
            const y = readDouble(hex, offset + 16, isLittleEndian);
            ring.push([x, y]);
            offset += coordSize * 2;
          }
          rings.push(ring);
        }
        return { type: 'Polygon', coordinates: rings };
      }
      case 4: { // MultiPoint
        const numPoints = readUint32(hex, offset, isLittleEndian);
        offset += 8;
        const coords: number[][] = [];
        for (let i = 0; i < numPoints; i++) {
          offset += 10; // Skip byte order and type for each point
          const x = readDouble(hex, offset, isLittleEndian);
          const y = readDouble(hex, offset + 16, isLittleEndian);
          coords.push([x, y]);
          offset += coordSize * 2;
        }
        return { type: 'MultiPoint', coordinates: coords };
      }
      case 5: { // MultiLineString
        const numLines = readUint32(hex, offset, isLittleEndian);
        offset += 8;
        const lines: number[][][] = [];
        for (let l = 0; l < numLines; l++) {
          offset += 10; // Skip byte order and type
          const numPoints = readUint32(hex, offset, isLittleEndian);
          offset += 8;
          const line: number[][] = [];
          for (let i = 0; i < numPoints; i++) {
            const x = readDouble(hex, offset, isLittleEndian);
            const y = readDouble(hex, offset + 16, isLittleEndian);
            line.push([x, y]);
            offset += coordSize * 2;
          }
          lines.push(line);
        }
        return { type: 'MultiLineString', coordinates: lines };
      }
      case 6: { // MultiPolygon
        const numPolygons = readUint32(hex, offset, isLittleEndian);
        offset += 8;
        const polygons: number[][][][] = [];
        for (let p = 0; p < numPolygons; p++) {
          offset += 10; // Skip byte order and type
          const numRings = readUint32(hex, offset, isLittleEndian);
          offset += 8;
          const rings: number[][][] = [];
          for (let r = 0; r < numRings; r++) {
            const numPoints = readUint32(hex, offset, isLittleEndian);
            offset += 8;
            const ring: number[][] = [];
            for (let i = 0; i < numPoints; i++) {
              const x = readDouble(hex, offset, isLittleEndian);
              const y = readDouble(hex, offset + 16, isLittleEndian);
              ring.push([x, y]);
              offset += coordSize * 2;
            }
            rings.push(ring);
          }
          polygons.push(rings);
        }
        return { type: 'MultiPolygon', coordinates: polygons };
      }
      default:
        console.warn('Unsupported WKB geometry type:', geomType);
        return null;
    }
  } catch (e) {
    console.warn('Failed to parse WKB hex:', e);
    return null;
  }
};

// Check if string looks like WKB hex
const isWKBHex = (value: string): boolean => {
  // WKB hex starts with 00 (big endian) or 01 (little endian)
  // and contains only hex characters
  const cleaned = value.replace(/^0x/i, '');
  return /^[0-9a-fA-F]+$/.test(cleaned) && 
         (cleaned.startsWith('00') || cleaned.startsWith('01')) &&
         cleaned.length >= 18; // Minimum for a point: 1 + 4 + 8 + 8 = 21 bytes = 42 hex chars
};

// Helper function to parse GeoJSON from various formats
const parseGeoJSON = (value: any): GeoJSONFeature | null => {
  if (!value) return null;

  try {
    // If it's already an object
    if (typeof value === 'object') {
      if (value.type === 'Feature') {
        return value as GeoJSONFeature;
      }
      if (value.type && value.coordinates) {
        return {
          type: 'Feature',
          geometry: value,
          properties: {},
        };
      }
    }

    // If it's a string
    if (typeof value === 'string') {
      const trimmed = value.trim();
      
      // Check if it's WKB hex format (PostGIS default output)
      if (isWKBHex(trimmed)) {
        const geometry = parseWKBHex(trimmed);
        if (geometry) {
          return {
            type: 'Feature',
            geometry: geometry as GeoJSONFeature['geometry'],
            properties: {},
          };
        }
      }
      
      // Try to parse as JSON/GeoJSON
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'Feature') {
          return parsed as GeoJSONFeature;
        }
        if (parsed.type && parsed.coordinates) {
          return {
            type: 'Feature',
            geometry: parsed,
            properties: {},
          };
        }
      } catch {
        // Not valid JSON, continue to other formats
      }
      
      // Try WKT (Well-Known Text) format
      const wktGeometry = parseWKT(trimmed);
      if (wktGeometry) {
        return {
          type: 'Feature',
          geometry: wktGeometry as GeoJSONFeature['geometry'],
          properties: {},
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse geometry:', e);
  }

  return null;
};

// Helper function to parse WKT (Well-Known Text) format
const parseWKT = (wkt: string): { type: string; coordinates: any } | null => {
  try {
    const trimmed = wkt.trim().toUpperCase();
    
    // Parse POINT
    const pointMatch = trimmed.match(/^POINT\s*\(\s*([\d.-]+)\s+([\d.-]+)\s*\)$/i);
    if (pointMatch) {
      return {
        type: 'Point',
        coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])],
      };
    }
    
    // Parse LINESTRING
    const lineMatch = trimmed.match(/^LINESTRING\s*\((.+)\)$/i);
    if (lineMatch) {
      const coords = lineMatch[1].split(',').map(pair => {
        const [x, y] = pair.trim().split(/\s+/);
        return [parseFloat(x), parseFloat(y)];
      });
      return { type: 'LineString', coordinates: coords };
    }
    
    // Parse POLYGON
    const polygonMatch = trimmed.match(/^POLYGON\s*\(\((.+)\)\)$/i);
    if (polygonMatch) {
      const rings = polygonMatch[1].split('),(').map(ring => {
        return ring.replace(/[()]/g, '').split(',').map(pair => {
          const [x, y] = pair.trim().split(/\s+/);
          return [parseFloat(x), parseFloat(y)];
        });
      });
      return { type: 'Polygon', coordinates: rings };
    }
    
    // Parse MULTIPOINT
    const multipointMatch = trimmed.match(/^MULTIPOINT\s*\((.+)\)$/i);
    if (multipointMatch) {
      const coords = multipointMatch[1].split(',').map(point => {
        const match = point.trim().match(/\(?\s*([\d.-]+)\s+([\d.-]+)\s*\)?/);
        if (match) {
          return [parseFloat(match[1]), parseFloat(match[2])];
        }
        return null;
      }).filter(Boolean);
      return { type: 'MultiPoint', coordinates: coords };
    }
    
    return null;
  } catch (e) {
    console.warn('Failed to parse WKT:', e);
    return null;
  }
};

// Convert data rows to GeoJSON FeatureCollection
const convertToGeoJSON = (
  data: any[][],
  columns: { name: string; type: string }[],
  geometryColumnIndex: number
): GeoJSONFeatureCollection => {
  const features: GeoJSONFeature[] = [];

  data.forEach((row) => {
    const geometryValue = row[geometryColumnIndex];
    const feature = parseGeoJSON(geometryValue);

    if (feature) {
      // Add other columns as properties
      const properties: Record<string, any> = {};
      columns.forEach((col, index) => {
        if (index !== geometryColumnIndex) {
          properties[col.name] = row[index];
        }
      });
      feature.properties = { ...feature.properties, ...properties };
      features.push(feature);
    }
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};

// Calculate bounds from GeoJSON
const calculateBounds = (
  geojson: GeoJSONFeatureCollection
): [[number, number], [number, number]] | null => {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const processCoordinates = (coords: any) => {
    if (typeof coords[0] === 'number') {
      // It's a point [lng, lat]
      minLng = Math.min(minLng, coords[0]);
      maxLng = Math.max(maxLng, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLat = Math.max(maxLat, coords[1]);
    } else {
      // It's an array of coordinates
      coords.forEach(processCoordinates);
    }
  };

  geojson.features.forEach((feature) => {
    if (feature.geometry && feature.geometry.coordinates) {
      processCoordinates(feature.geometry.coordinates);
    }
  });

  if (
    minLng === Infinity ||
    maxLng === -Infinity ||
    minLat === Infinity ||
    maxLat === -Infinity
  ) {
    return null;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
};

export default function MapView(props: MapViewProps) {
  const { data, columns, width = '100%', height = 400 } = props;
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLibreLoaded, setMapLibreLoaded] = useState(false);

  // Find geometry column or lat/long columns and convert data to GeoJSON
  const { geojson, hasGeometry } = useMemo(() => {
    // First try to find a geometry column
    const geometryColumnIndex = findGeometryColumn(columns);
    if (geometryColumnIndex !== -1) {
      const geojsonData = convertToGeoJSON(data, columns, geometryColumnIndex);
      return {
        geojson: geojsonData,
        hasGeometry: geojsonData.features.length > 0,
      };
    }

    // If no geometry column, try lat/long columns
    const { latIndex, longIndex } = findLatLongColumns(columns);
    if (latIndex !== -1 && longIndex !== -1) {
      const geojsonData = convertLatLongToGeoJSON(data, columns, latIndex, longIndex);
      return {
        geojson: geojsonData,
        hasGeometry: geojsonData.features.length > 0,
      };
    }

    return { geojson: null, hasGeometry: false };
  }, [data, columns]);

  // Dynamically import maplibre-gl
  useEffect(() => {
    const loadMapLibre = async () => {
      try {
        // Dynamically import maplibre-gl and its CSS
        const maplibregl = (await import('maplibre-gl')).default;
        // @ts-ignore - CSS import
        await import('maplibre-gl/dist/maplibre-gl.css');
        setMapLibreLoaded(true);

        if (!mapContainer.current || !geojson || !hasGeometry) {
          setIsLoading(false);
          return;
        }

        // Initialize map
        const map = new maplibregl.Map({
          container: mapContainer.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: [
                  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                ],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              },
            },
            layers: [
              {
                id: 'osm',
                type: 'raster',
                source: 'osm',
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          },
          center: [0, 0],
          zoom: 2,
        });

        mapRef.current = map;

        map.on('load', () => {
          // Add GeoJSON source
          map.addSource('geojson-data', {
            type: 'geojson',
            data: geojson as any,
          });

          // Add layers based on geometry types
          const geometryTypes = new Set(
            geojson.features.map((f) => f.geometry?.type)
          );

          // Point layer
          if (
            geometryTypes.has('Point') ||
            geometryTypes.has('MultiPoint')
          ) {
            map.addLayer({
              id: 'points',
              type: 'circle',
              source: 'geojson-data',
              filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
              paint: {
                'circle-radius': 8,
                'circle-color': '#1890ff',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              },
            });
          }

          // Line layer
          if (
            geometryTypes.has('LineString') ||
            geometryTypes.has('MultiLineString')
          ) {
            map.addLayer({
              id: 'lines',
              type: 'line',
              source: 'geojson-data',
              filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
              paint: {
                'line-color': '#1890ff',
                'line-width': 3,
              },
            });
          }

          // Polygon layer
          if (
            geometryTypes.has('Polygon') ||
            geometryTypes.has('MultiPolygon')
          ) {
            map.addLayer({
              id: 'polygons-fill',
              type: 'fill',
              source: 'geojson-data',
              filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
              paint: {
                'fill-color': '#1890ff',
                'fill-opacity': 0.3,
              },
            });

            map.addLayer({
              id: 'polygons-outline',
              type: 'line',
              source: 'geojson-data',
              filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
              paint: {
                'line-color': '#1890ff',
                'line-width': 2,
              },
            });
          }

          // Fit bounds to data
          const bounds = calculateBounds(geojson);
          if (bounds) {
            map.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
            });
          }

          // Add popup on click
          const layerIds = ['points', 'lines', 'polygons-fill'].filter((id) =>
            map.getLayer(id)
          );

          layerIds.forEach((layerId) => {
            map.on('click', layerId, (e: any) => {
              if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                const properties = feature.properties || {};
                const popupContent = Object.entries(properties)
                  .filter(([key]) => key !== 'geometry' && key !== 'geojson')
                  .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                  .join('<br/>');

                new maplibregl.Popup()
                  .setLngLat(e.lngLat)
                  .setHTML(popupContent || 'No properties')
                  .addTo(map);
              }
            });

            map.on('mouseenter', layerId, () => {
              map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
            });
          });

          setIsLoading(false);
        });

        map.on('error', (e: any) => {
          console.error('Map error:', e);
          setError('Failed to load map');
          setIsLoading(false);
        });
      } catch (err) {
        console.error('Failed to load MapLibre:', err);
        setError('Failed to load map library');
        setIsLoading(false);
      }
    };

    loadMapLibre();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [geojson, hasGeometry]);

  if (!hasGeometry) {
    return (
      <Alert
        type="info"
        message="No geometry data available"
        description="The query results do not contain any geometry data that can be displayed on a map. Make sure your query includes a geometry column with valid GeoJSON data."
        showIcon
      />
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Map Error"
        description={error}
        showIcon
      />
    );
  }

  return (
    <MapContainer style={{ width, height: typeof height === 'number' ? height : parseInt(height) }}>
      {isLoading && (
        <LoadingOverlay>
          <Spin size="large" tip="Loading map..." />
        </LoadingOverlay>
      )}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </MapContainer>
  );
}
