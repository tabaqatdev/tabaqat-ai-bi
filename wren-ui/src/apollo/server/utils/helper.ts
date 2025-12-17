/**
 * @function
 * @description Retrieve json without error
 */
export const safeParseJson = (data) => {
  try {
    return JSON.parse(data);
  } catch (_e) {
    return false;
  }
};

export const safeStringify = (data) => {
  if (typeof data === 'string') {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch (_e) {
    return data;
  }
};

// List of geometry types for PostGIS support
const GEOMETRY_TYPES = [
  'geometry',
  'geography',
  'point',
  'linestring',
  'polygon',
  'multipoint',
  'multilinestring',
  'multipolygon',
  'geometrycollection',
];

export const isGeometryType = (type: string, columnName?: string): boolean => {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  if (GEOMETRY_TYPES.some(
    (geoType) => lowerType === geoType || lowerType.includes(geoType)
  )) {
    return true;
  }
  // PostgreSQL returns USER-DEFINED for PostGIS geometry types
  if (lowerType === 'user-defined' && columnName) {
    const lowerName = columnName.toLowerCase();
    const geometryNames = ['geom', 'geometry', 'geography', 'location', 'coordinates', 'shape', 'boundary', 'the_geom', 'wkb_geometry'];
    return geometryNames.some(name => lowerName.includes(name) || lowerName === name);
  }
  return false;
};

export const convertColumnType = (parent: { type: string }) => {
  if (!parent.type) return 'UNKNOWN';
  if (parent.type.includes('STRUCT')) {
    return 'RECORD';
  }
  if (isGeometryType(parent.type)) {
    return 'GEOMETRY';
  }
  return parent.type;
};
