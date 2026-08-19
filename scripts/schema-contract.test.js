const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function assertSnapshot(snapshot) {
  assert.ok(snapshot.global?.inventory, 'global.inventory debe existir');
  assert.ok(snapshot.global?.pressure, 'global.pressure debe existir');
  assert.equal('score' in snapshot.global, false, 'global.score ambiguo debe eliminarse');
  assert.equal('state' in snapshot.global, false, 'global.state ambiguo debe eliminarse');
  assert.match(snapshot.global.pressure.mode || '', /^(PROVISIONAL|COMPLETE)$/, 'global.pressure.mode debe indicar la fase del indice');
  for (const station of snapshot.stations || []) {
    assert.ok(station.fuelLevel, `${station.key}: fuelLevel debe existir`);
    assert.ok(station.pressure, `${station.key}: pressure debe existir`);
    assert.equal('score' in station, false, `${station.key}: score ambiguo debe eliminarse`);
    assert.equal('state' in station, false, `${station.key}: state ambiguo debe eliminarse`);
    assert.match(station.pressure.mode || '', /^(PROVISIONAL|COMPLETE)$/, `${station.key}: pressure.mode debe existir`);
  }
}

test('latest separa inventario/nivel de combustible de presión', () => {
  assertSnapshot(readJson('public/data/latest.json'));
});

test('todos los snapshots históricos usan la nueva estructura', () => {
  const dir = path.join(root, 'public/data/history');
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const file = readJson(`public/data/history/${name}`);
    for (const snapshot of file.snapshots || []) assertSnapshot(snapshot);
  }
});

test('la UI usa nivel de combustible en tarjetas y presión en el índice', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(app, /fuelLevel/);
  assert.match(app, /pressure/);
  assert.match(app, /ÍNDICE PROVISIONAL|INDICE PROVISIONAL/);
  assert.match(app, /ÍNDICE COMPLETO|INDICE COMPLETO/);
  assert.match(html, /Índice de presión/i);
  assert.match(html, /Nivel de combustible/i);
});

test('el gráfico conserva saldo y volumen aunque pressure.score sea null', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /const pressurePoints=points\.filter\(p=>Number\.isFinite\(p\.score\)\)/);
  assert.match(app, /const pointCount=Math\.max\(/);
  assert.match(app, /rawScores=points\.map\(p=>p\.score\)/);
});

test('el workflow genera indice provisional y completo', () => {
  const workflow = readJson('gasolina-fear-greed-workflow(1).json');
  const node = workflow.nodes.find(n => n.name === 'Construir datos e indices');
  assert.ok(node, 'Debe existir Construir datos e indices');
  const code = node.parameters.jsCode;
  assert.match(code, /PROVISIONAL/);
  assert.match(code, /COMPLETE/);
  assert.match(code, /provisionalPressureScoreFor/);
  assert.match(code, /completePressureScoreFor/);
  assert.match(code, /stationsWithoutFuel/);
  assert.match(code, /inventoryTrend/);
});
