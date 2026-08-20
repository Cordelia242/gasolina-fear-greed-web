/**
 * Stations outside the city of Santa Cruz de la Sierra (Andrés Ibáñez
 * province) — kept in the raw data (BioCloud scrapes them, the engine scores
 * them, they still count toward the official index), but hidden from this
 * view per user request. Confirmed 2026-08-20:
 * - cabezas, cedeno, parapeti: Camiri / Cabezas (Cordillera province)
 * - monteverde: Montero (Obispo Santistevan province)
 * - lucyfer: address references "Oruro" (a different department)
 */
export const EXCLUDED_STATION_KEYS: readonly string[] = ['cabezas', 'cedeno', 'parapeti', 'monteverde', 'lucyfer'];

export function isSantaCruzStation(key: string): boolean {
  return !EXCLUDED_STATION_KEYS.includes(key);
}

export function filterSantaCruzStations<T extends { key: string }>(stations: T[]): T[] {
  return stations.filter((s) => isSantaCruzStation(s.key));
}
