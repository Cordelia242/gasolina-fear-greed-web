import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Snapshot } from '../src/types';

const root = path.resolve(__dirname, '..');
const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function assertSnapshotShape(snapshot: Snapshot) {
  expect(snapshot.global?.inventory, 'global.inventory debe existir').toBeTruthy();
  expect(snapshot.global?.pressure, 'global.pressure debe existir').toBeTruthy();
  expect('score' in (snapshot.global as object), 'global.score ambiguo debe eliminarse').toBe(false);
  expect('state' in (snapshot.global as object), 'global.state ambiguo debe eliminarse').toBe(false);
  // El campo mode es reciente en el pipeline de n8n: algunos snapshots en vuelo
  // aún no lo traen. Cuando está presente, debe ser uno de los dos valores válidos.
  if (snapshot.global.pressure.mode !== undefined) {
    expect(snapshot.global.pressure.mode, 'global.pressure.mode debe indicar la fase del índice').toMatch(/^(PROVISIONAL|COMPLETE)$/);
  }
  for (const station of snapshot.stations || []) {
    expect(station.fuelLevel, `${station.key}: fuelLevel debe existir`).toBeTruthy();
    expect(station.pressure, `${station.key}: pressure debe existir`).toBeTruthy();
    expect('score' in (station as object), `${station.key}: score ambiguo debe eliminarse`).toBe(false);
    expect('state' in (station as object), `${station.key}: state ambiguo debe eliminarse`).toBe(false);
    if (station.pressure.mode !== undefined) {
      expect(station.pressure.mode, `${station.key}: pressure.mode inválido`).toMatch(/^(PROVISIONAL|COMPLETE)$/);
    }
  }
}

describe('contrato de datos', () => {
  test('latest.json separa inventario/nivel de combustible de presión', () => {
    assertSnapshotShape(readJson<Snapshot>('public/data/latest.json'));
  });

  test('todos los snapshots históricos usan la nueva estructura', () => {
    const dir = path.join(root, 'public/data/history');
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const file = readJson<{ snapshots: Snapshot[] }>(`public/data/history/${name}`);
      for (const snapshot of file.snapshots || []) assertSnapshotShape(snapshot);
    }
  });

  test('el workflow n8n genera índice provisional y completo', () => {
    const workflow = readJson<{ nodes: Array<{ name: string; parameters: { jsCode: string } }> }>(
      'gasolina-fear-greed-workflow(1).json'
    );
    const node = workflow.nodes.find((n) => n.name === 'Construir datos e indices');
    expect(node, 'Debe existir Construir datos e indices').toBeTruthy();
    const code = node!.parameters.jsCode;
    expect(code).toMatch(/PROVISIONAL/);
    expect(code).toMatch(/COMPLETE/);
    expect(code).toMatch(/provisionalPressureScoreFor/);
    expect(code).toMatch(/completePressureScoreFor/);
    expect(code).toMatch(/stationsWithoutFuel/);
    expect(code).toMatch(/inventoryTrend/);
  });
});
