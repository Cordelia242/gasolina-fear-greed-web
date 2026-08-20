export type FuelState = 'CRITICO' | 'ESCASEZ' | 'NORMAL' | 'ABUNDANCIA' | 'SATURADO';
export type PressureState =
  | 'SIN_PRESION'
  | 'DEMANDA_BAJA'
  | 'EQUILIBRIO'
  | 'PRESION_ALTA'
  | 'PRESION_EXTREMA'
  | 'BASELINE_BUILDING';
export type PressureMode = 'COMPLETE' | 'PROVISIONAL';

export interface FuelLevel {
  score: number;
  state: FuelState;
}

export interface Pressure {
  score: number | null;
  state: PressureState;
  mode?: PressureMode;
}

export interface Inventory {
  totalLiters: number;
  stationsAvailable: number;
  stationsTotal: number;
}

export interface Flow {
  outflowLitersPerHour: number;
  inflowLitersPerHour: number;
  netFlowLitersPerHour: number;
}

export interface Global {
  inventory: Inventory;
  pressure: Pressure;
  flow?: Flow;
}

export interface Station {
  key: string;
  name: string;
  address?: string;
  liters: number;
  visibleInSource?: boolean;
  fuelLevel: FuelLevel;
  pressure: Pressure;
  flow?: Flow;
}

export interface Snapshot {
  scrapedAt: string;
  sourceMeasuredAt?: string;
  global: Global;
  stations?: Station[];
}

export interface HistoryFile {
  date: string;
  snapshots: Snapshot[];
}

export interface SaldoRecord {
  scrapedAt: string;
  sourceMeasuredAt?: string;
  station: string;
  name?: string;
  liters: number;
  fuelLevel?: FuelLevel;
  pressure?: Pressure;
  visibleInSource?: boolean;
}

export interface SaldosFile {
  date: string;
  records: SaldoRecord[];
}
