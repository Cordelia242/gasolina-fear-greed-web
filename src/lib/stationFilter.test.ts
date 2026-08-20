import { describe, expect, test } from 'vitest';
import { EXCLUDED_STATION_KEYS, filterSantaCruzStations, isSantaCruzStation } from './stationFilter';

describe('isSantaCruzStation', () => {
  test('excludes the confirmed out-of-Santa-Cruz stations', () => {
    for (const key of EXCLUDED_STATION_KEYS) {
      expect(isSantaCruzStation(key)).toBe(false);
    }
  });

  test('keeps stations not on the exclusion list', () => {
    expect(isSantaCruzStation('alemana')).toBe(true);
    expect(isSantaCruzStation('berea')).toBe(true);
    expect(isSantaCruzStation('la-teca')).toBe(true);
    expect(isSantaCruzStation('viru-viru')).toBe(true);
  });
});

describe('filterSantaCruzStations', () => {
  test('drops exactly the 5 confirmed out-of-Santa-Cruz stations', () => {
    const stations = [
      { key: 'alemana' },
      { key: 'cabezas' },
      { key: 'cedeno' },
      { key: 'parapeti' },
      { key: 'monteverde' },
      { key: 'lucyfer' },
      { key: 'berea' },
    ];
    const result = filterSantaCruzStations(stations);
    expect(result.map((s) => s.key)).toEqual(['alemana', 'berea']);
  });
});
