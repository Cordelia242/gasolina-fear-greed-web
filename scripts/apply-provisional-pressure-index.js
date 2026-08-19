const fs = require('node:fs');
const path = require('node:path');

function replaceOrThrow(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`No se encontro bloque para ${label}`);
  return text.replace(from, to);
}

function clamp(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }
function round2(v) { return Math.round(v * 100) / 100; }
function pressureStateFor(score) {
  if (!Number.isFinite(score)) return 'BASELINE_BUILDING';
  if (score <= 20) return 'SIN_PRESION';
  if (score <= 40) return 'DEMANDA_BAJA';
  if (score <= 60) return 'EQUILIBRIO';
  if (score <= 80) return 'PRESION_ALTA';
  return 'PRESION_EXTREMA';
}
function runwayPressureFor(liters, outflow) {
  const stock = Number(liters || 0);
  if (stock <= 0) return 100;
  const rate = Number(outflow || 0);
  if (!(rate > 0)) return 0;
  const hours = stock / rate;
  if (hours <= 2) return 100;
  if (hours <= 4) return 100 - (hours - 2) * 7.5;
  if (hours <= 8) return 85 - (hours - 4) * 5;
  if (hours <= 12) return 65 - (hours - 8) * 5;
  if (hours <= 24) return 45 - (hours - 12) * (25 / 12);
  if (hours <= 48) return 20 - (hours - 24) * (20 / 24);
  return 0;
}
function provisionalPressureScoreFor({ runwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure }) {
  return clamp(
    runwayPressure * 0.35 +
    inventoryTrendPressure * 0.30 +
    stationsWithoutFuelPressure * 0.25 +
    flowBalancePressure * 0.10
  );
}
function completePressureScoreFor({ demandPressure, runwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure }) {
  return clamp(
    demandPressure * 0.45 +
    runwayPressure * 0.20 +
    inventoryTrendPressure * 0.15 +
    stationsWithoutFuelPressure * 0.10 +
    flowBalancePressure * 0.10
  );
}
function globalComponents(snapshot, previousSnapshot) {
  const stations = snapshot.stations || [];
  const total = stations.length || 1;
  const runwayPressure = stations.reduce((sum, s) => sum + runwayPressureFor(s.liters, s.flow?.recentOutflowLitersPerHour ?? s.flow?.outflowLitersPerHour), 0) / total;
  const stationsWithoutFuel = stations.filter(s => Number(s.liters || 0) <= 0).length;
  const stationsWithoutFuelPressure = stationsWithoutFuel / total * 100;
  const outflow = Number(snapshot.global?.flow?.outflowLitersPerHour || 0);
  const inflow = Number(snapshot.global?.flow?.inflowLitersPerHour || 0);
  const flowBalancePressure = outflow > 0 ? clamp((outflow - inflow) / outflow * 100) : 0;
  const currentLiters = Number(snapshot.global?.inventory?.totalLiters ?? stations.reduce((sum, s) => sum + Number(s.liters || 0), 0));
  const previousLiters = Number(previousSnapshot?.global?.inventory?.totalLiters);
  const currentMs = Date.parse(snapshot.scrapedAt || snapshot.sourceMeasuredAt || '');
  const previousMs = Date.parse(previousSnapshot?.scrapedAt || previousSnapshot?.sourceMeasuredAt || '');
  const elapsedHours = Number.isFinite(currentMs) && Number.isFinite(previousMs) && currentMs > previousMs ? (currentMs - previousMs) / 3600000 : null;
  let inventoryTrendPctPerHour = null;
  let inventoryTrendPressure = 0;
  if (elapsedHours && previousLiters > 0) {
    inventoryTrendPctPerHour = ((currentLiters - previousLiters) / previousLiters) * 100 / elapsedHours;
    inventoryTrendPressure = inventoryTrendPctPerHour < 0 ? clamp((-inventoryTrendPctPerHour / 5) * 100) : 0;
  }
  return { runwayPressure, stationsWithoutFuel, stationsWithoutFuelPressure, flowBalancePressure, inventoryTrendPctPerHour, inventoryTrendPressure };
}
function migrateSnapshot(snapshot, previousSnapshot) {
  for (const s of snapshot.stations || []) {
    const runwayPressure = runwayPressureFor(s.liters, s.flow?.recentOutflowLitersPerHour ?? s.flow?.outflowLitersPerHour);
    const demandScore = Number.isFinite(s.pressure?.demandScore) ? s.pressure.demandScore : null;
    const complete = Boolean(s.pressure?.baselineReady && Number.isFinite(demandScore));
    const score = complete ? clamp(demandScore * 0.75 + runwayPressure * 0.25) : runwayPressure;
    s.pressure = {
      ...(s.pressure || {}),
      score: round2(score),
      state: pressureStateFor(score),
      mode: complete ? 'COMPLETE' : 'PROVISIONAL',
      runwayPressure: round2(runwayPressure),
      demandScore: complete ? round2(demandScore) : null
    };
  }
  const c = globalComponents(snapshot, previousSnapshot);
  const ready = (snapshot.stations || []).filter(s => s.pressure?.mode === 'COMPLETE');
  const requiredStationsForComplete = Math.max(3, Math.ceil((snapshot.stations || []).length * 0.5));
  const isComplete = ready.length >= requiredStationsForComplete;
  const demandPressure = ready.length ? ready.reduce((sum, s) => sum + Number(s.pressure.demandScore || 0), 0) / ready.length : null;
  const score = isComplete
    ? completePressureScoreFor({ demandPressure, ...c })
    : provisionalPressureScoreFor(c);
  snapshot.global = snapshot.global || {};
  snapshot.global.pressure = {
    ...(snapshot.global.pressure || {}),
    score: round2(score),
    state: pressureStateFor(score),
    mode: isComplete ? 'COMPLETE' : 'PROVISIONAL',
    stationsReady: ready.length,
    stationsTotal: (snapshot.stations || []).length,
    requiredStationsForComplete,
    components: {
      demandPressure: demandPressure === null ? null : round2(demandPressure),
      runwayPressure: round2(c.runwayPressure),
      inventoryTrendPressure: round2(c.inventoryTrendPressure),
      inventoryTrendPctPerHour: c.inventoryTrendPctPerHour === null ? null : round2(c.inventoryTrendPctPerHour),
      stationsWithoutFuel: c.stationsWithoutFuel,
      stationsWithoutFuelPressure: round2(c.stationsWithoutFuelPressure),
      flowBalancePressure: round2(c.flowBalancePressure)
    }
  };
  return snapshot;
}

// 1) Workflow n8n
const workflowPath = 'gasolina-fear-greed-workflow(1).json';
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const node = workflow.nodes.find(n => n.name === 'Construir datos e indices');
if (!node) throw new Error('No existe Construir datos e indices');
let code = node.parameters.jsCode;

code = replaceOrThrow(code,
`function pressureScoreFor(recentOutflow, baseline) {
  if (!baseline || !Number.isFinite(baseline.meanOutflow) || baseline.meanOutflow <= 0 || !Number.isFinite(recentOutflow)) return null;
  const ratio = recentOutflow / baseline.meanOutflow;
  const ratioScore = clamp(50 + 35 * Math.log2(Math.max(0.05, ratio)));
  let zScore = 50;
  if (baseline.outflowStd > 0) zScore = clamp(50 + 20 * ((recentOutflow - baseline.meanOutflow) / baseline.outflowStd));
  return { score: clamp(ratioScore * 0.75 + zScore * 0.25), ratio };
}`,
`function demandPressureScoreFor(recentOutflow, baseline) {
  if (!baseline || !Number.isFinite(baseline.meanOutflow) || baseline.meanOutflow <= 0 || !Number.isFinite(recentOutflow)) return null;
  const ratio = recentOutflow / baseline.meanOutflow;
  const ratioScore = clamp(50 + 35 * Math.log2(Math.max(0.05, ratio)));
  let zScore = 50;
  if (baseline.outflowStd > 0) zScore = clamp(50 + 20 * ((recentOutflow - baseline.meanOutflow) / baseline.outflowStd));
  return { score: clamp(ratioScore * 0.75 + zScore * 0.25), ratio };
}
function runwayPressureFor(liters, recentOutflow) {
  const stock = Number(liters || 0);
  if (stock <= 0) return 100;
  const rate = Number(recentOutflow || 0);
  if (!(rate > 0)) return 0;
  const hours = stock / rate;
  if (hours <= 2) return 100;
  if (hours <= 4) return 100 - (hours - 2) * 7.5;
  if (hours <= 8) return 85 - (hours - 4) * 5;
  if (hours <= 12) return 65 - (hours - 8) * 5;
  if (hours <= 24) return 45 - (hours - 12) * (25 / 12);
  if (hours <= 48) return 20 - (hours - 24) * (20 / 24);
  return 0;
}
function provisionalPressureScoreFor({ runwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure }) {
  return clamp(runwayPressure * 0.35 + inventoryTrendPressure * 0.30 + stationsWithoutFuelPressure * 0.25 + flowBalancePressure * 0.10);
}
function completePressureScoreFor({ demandPressure, runwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure }) {
  return clamp(demandPressure * 0.45 + runwayPressure * 0.20 + inventoryTrendPressure * 0.15 + stationsWithoutFuelPressure * 0.10 + flowBalancePressure * 0.10);
}`,
'funciones de presion');

code = replaceOrThrow(code,
`  const pressureCalc = baselineReady ? pressureScoreFor(recentOutflow, baseline) : null;
  const pressureScore = pressureCalc ? round2(pressureCalc.score) : null;
  const pressure = {
    score: pressureScore,
    state: pressureStateFor(pressureScore),
    baselineReady,
    baselineCleanDays: baseline.cleanDays,
    demandRatio: pressureCalc ? round2(pressureCalc.ratio) : null,
    expectedOutflowLitersPerHour: baselineReady ? round2(baseline.meanOutflow) : null
  };`,
`  const demandCalc = baselineReady ? demandPressureScoreFor(recentOutflow, baseline) : null;
  const runwayPressure = clamp(runwayPressureFor(liters, recentOutflow));
  const stationPressureScore = demandCalc
    ? clamp(demandCalc.score * 0.75 + runwayPressure * 0.25)
    : runwayPressure;
  const pressure = {
    score: round2(stationPressureScore),
    state: pressureStateFor(stationPressureScore),
    mode: demandCalc ? 'COMPLETE' : 'PROVISIONAL',
    baselineReady,
    baselineCleanDays: baseline.cleanDays,
    demandScore: demandCalc ? round2(demandCalc.score) : null,
    demandRatio: demandCalc ? round2(demandCalc.ratio) : null,
    expectedOutflowLitersPerHour: baselineReady ? round2(baseline.meanOutflow) : null,
    runwayPressure: round2(runwayPressure)
  };`,
'presion por estacion');

code = replaceOrThrow(code,
`const inventoryScore = stationResults.length ? stationResults.reduce((sum, s) => sum + s.fuelLevel.score, 0) / stationResults.length : 0;
const readyPressure = stationResults.filter(s => Number.isFinite(s.pressure.score));
const pressureScore = readyPressure.length ? readyPressure.reduce((sum, s) => sum + s.pressure.score, 0) / readyPressure.length : null;
const globalFlow = stationResults.reduce((acc, s) => {
  acc.out += Number(s.flow.outflowLitersPerHour || 0);
  acc.in += Number(s.flow.inflowLitersPerHour || 0);
  return acc;
}, { out: 0, in: 0 });`,
`const inventoryScore = stationResults.length ? stationResults.reduce((sum, s) => sum + s.fuelLevel.score, 0) / stationResults.length : 0;
const totalLiters = stationResults.reduce((sum, s) => sum + s.liters, 0);
const globalFlow = stationResults.reduce((acc, s) => {
  acc.out += Number(s.flow.outflowLitersPerHour || 0);
  acc.in += Number(s.flow.inflowLitersPerHour || 0);
  return acc;
}, { out: 0, in: 0 });
const stationsWithoutFuel = stationResults.filter(s => s.liters <= 0).length;
const stationsWithoutFuelPressure = stationResults.length ? stationsWithoutFuel / stationResults.length * 100 : 0;
const globalRunwayPressure = stationResults.length ? stationResults.reduce((sum, s) => sum + Number(s.pressure.runwayPressure || 0), 0) / stationResults.length : 0;
const previousGlobalLiters = Number(latestFile.value?.global?.inventory?.totalLiters);
let inventoryTrendPctPerHour = null;
let inventoryTrendPressure = 0;
if (!sameMeasurement && elapsedHours && previousGlobalLiters > 0) {
  inventoryTrendPctPerHour = ((totalLiters - previousGlobalLiters) / previousGlobalLiters) * 100 / elapsedHours;
  inventoryTrendPressure = inventoryTrendPctPerHour < 0 ? clamp((-inventoryTrendPctPerHour / 5) * 100) : 0;
}
const flowBalancePressure = globalFlow.out > 0 ? clamp((globalFlow.out - globalFlow.in) / globalFlow.out * 100) : 0;
const completeStations = stationResults.filter(s => s.pressure.mode === 'COMPLETE' && Number.isFinite(s.pressure.demandScore));
const requiredStationsForComplete = Math.max(3, Math.ceil(stationResults.length * 0.5));
const globalMode = completeStations.length >= requiredStationsForComplete ? 'COMPLETE' : 'PROVISIONAL';
const demandPressure = completeStations.length ? completeStations.reduce((sum, s) => sum + s.pressure.demandScore, 0) / completeStations.length : null;
const pressureScore = globalMode === 'COMPLETE'
  ? completePressureScoreFor({ demandPressure, runwayPressure: globalRunwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure })
  : provisionalPressureScoreFor({ runwayPressure: globalRunwayPressure, inventoryTrendPressure, stationsWithoutFuelPressure, flowBalancePressure });`,
'presion global');

code = replaceOrThrow(code,
`      totalLiters: stationResults.reduce((sum, s) => sum + s.liters, 0),`,
`      totalLiters,`,
'litros globales');

code = replaceOrThrow(code,
`    pressure: {
      score: pressureScore === null ? null : round2(pressureScore),
      state: pressureStateFor(pressureScore),
      stationsReady: readyPressure.length,
      stationsTotal: stationResults.length
    },`,
`    pressure: {
      score: round2(pressureScore),
      state: pressureStateFor(pressureScore),
      mode: globalMode,
      stationsReady: completeStations.length,
      stationsTotal: stationResults.length,
      requiredStationsForComplete,
      components: {
        demandPressure: demandPressure === null ? null : round2(demandPressure),
        runwayPressure: round2(globalRunwayPressure),
        inventoryTrendPressure: round2(inventoryTrendPressure),
        inventoryTrendPctPerHour: inventoryTrendPctPerHour === null ? null : round2(inventoryTrendPctPerHour),
        stationsWithoutFuel,
        stationsWithoutFuelPressure: round2(stationsWithoutFuelPressure),
        flowBalancePressure: round2(flowBalancePressure)
      }
    },`,
'objeto global.pressure');

code = code.replace(`stationsReady: readyPressure.length,`, `stationsReady: completeStations.length,`);
node.parameters.jsCode = code;
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n');

// 2) UI
let app = fs.readFileSync('app.js', 'utf8');
app = replaceOrThrow(app,
`const pressureStateLabel=s=>({SIN_PRESION:'SIN PRESIÓN',DEMANDA_BAJA:'DEMANDA BAJA',EQUILIBRIO:'EQUILIBRIO',PRESION_ALTA:'PRESIÓN ALTA',PRESION_EXTREMA:'PRESIÓN EXTREMA',BASELINE_BUILDING:'BASELINE EN CONSTRUCCIÓN'})[s]||s||'—';`,
`const pressureStateLabel=s=>({SIN_PRESION:'SIN PRESIÓN',DEMANDA_BAJA:'DEMANDA BAJA',EQUILIBRIO:'EQUILIBRIO',PRESION_ALTA:'PRESIÓN ALTA',PRESION_EXTREMA:'PRESIÓN EXTREMA',BASELINE_BUILDING:'BASELINE EN CONSTRUCCIÓN'})[s]||s||'—';\nconst pressureModeLabel=m=>m==='COMPLETE'?'ÍNDICE COMPLETO':'ÍNDICE PROVISIONAL';`,
'etiqueta de modo');

const oldRenderGlobal = `function renderGlobal(d){const g=d.global||{},inventory=g.inventory||{},pressure=g.pressure||{},hasPressure=Number.isFinite(pressure.score),s=hasPressure?clampScore(pressure.score):null;$('#globalScore').textContent=hasPressure?Math.round(s):'--';renderGauge(s);const stateEl=$('#globalState');[...FUEL_STATE_ORDER,...PRESSURE_STATE_ORDER,'BASELINE_BUILDING'].forEach(st=>stateEl.classList.remove('state-'+st));stateEl.textContent=pressureStateLabel(pressure.state||'BASELINE_BUILDING');if(pressure.state)stateEl.classList.add('state-'+pressure.state);$('#totalLiters').textContent=\`${'${'}fmt.format(inventory.totalLiters||0)} L\`;$('#availableStations').textContent=inventory.stationsAvailable??0;$('#totalStations').textContent=inventory.stationsTotal??d.stations?.length??0;const dt=new Date(d.scrapedAt);$('#updatedAt').textContent=Number.isNaN(dt.getTime())?'Actualización reciente':\`Actualizado ${'${'}new Intl.DateTimeFormat('es-BO',{dateStyle:'short',timeStyle:'short'}).format(dt)}\`}`;
const newRenderGlobal = `function renderGlobal(d){const g=d.global||{},inventory=g.inventory||{},pressure=g.pressure||{},hasPressure=Number.isFinite(pressure.score),s=hasPressure?clampScore(pressure.score):null;$('#globalScore').textContent=hasPressure?Math.round(s):'--';renderGauge(s);const stateEl=$('#globalState');[...FUEL_STATE_ORDER,...PRESSURE_STATE_ORDER,'BASELINE_BUILDING'].forEach(st=>stateEl.classList.remove('state-'+st));stateEl.textContent=pressureStateLabel(pressure.state||'BASELINE_BUILDING');if(pressure.state)stateEl.classList.add('state-'+pressure.state);const modeEl=$('#pressureMode');if(modeEl)modeEl.textContent=pressureModeLabel(pressure.mode);$('#totalLiters').textContent=\`${'${'}fmt.format(inventory.totalLiters||0)} L\`;$('#availableStations').textContent=inventory.stationsAvailable??0;$('#totalStations').textContent=inventory.stationsTotal??d.stations?.length??0;const dt=new Date(d.scrapedAt);$('#updatedAt').textContent=Number.isNaN(dt.getTime())?'Actualización reciente':\`Actualizado ${'${'}new Intl.DateTimeFormat('es-BO',{dateStyle:'short',timeStyle:'short'}).format(dt)}\`}`;
app = replaceOrThrow(app, oldRenderGlobal, newRenderGlobal, 'renderGlobal');

app = replaceOrThrow(app,
`if(!pressureScores.length){$('#trendDelta').textContent='PRESIÓN: BASELINE';return}if(pressureScores.length<2){$('#trendDelta').textContent='—';return}const delta=pressureScores.at(-1)-pressureScores[0];$('#trendDelta').textContent=\`${'${'}delta>=0?'+':''}${'${'}delta.toFixed(1)} pts\`}`,
`if(!pressureScores.length){$('#trendDelta').textContent=pressureModeLabel(latest?.global?.pressure?.mode);return}if(pressureScores.length<2){$('#trendDelta').textContent=pressureModeLabel(latest?.global?.pressure?.mode);return}const delta=pressureScores.at(-1)-pressureScores[0];$('#trendDelta').textContent=\`${'${'}delta>=0?'+':''}${'${'}delta.toFixed(1)} pts · ${'${'}pressureModeLabel(latest?.global?.pressure?.mode).replace('ÍNDICE ','')}\`}`,
'badge del grafico');

app = replaceOrThrow(app,
`$('#dialogPressure').textContent=Number.isFinite(pressure.score)?\`${'${'}Math.round(pressure.score)} · ${'${'}pressureStateLabel(pressure.state)}\`:pressureStateLabel(pressure.state||'BASELINE_BUILDING');`,
`$('#dialogPressure').textContent=Number.isFinite(pressure.score)?\`${'${'}Math.round(pressure.score)} · ${'${'}pressureStateLabel(pressure.state)} · ${'${'}pressureModeLabel(pressure.mode)}\`:pressureStateLabel(pressure.state||'BASELINE_BUILDING');`,
'detalle de presion');
fs.writeFileSync('app.js', app);

let html = fs.readFileSync('index.html', 'utf8');
html = replaceOrThrow(html,
`              <span id="globalState">—</span>`,
`              <span id="globalState">—</span>\n              <small id="pressureMode" class="pressure-mode">ÍNDICE PROVISIONAL</small>`,
'modo en gauge');
fs.writeFileSync('index.html', html);

let css = fs.readFileSync('styles.css', 'utf8');
if (!css.includes('.pressure-mode{')) css += `\n.pressure-mode{display:block;margin-top:5px;color:var(--muted);font:500 10px/1.3 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em}\n`;
fs.writeFileSync('styles.css', css);

// 3) Migrar latest/historicos/saldos para que el indice aparezca inmediatamente.
const historyDir = 'public/data/history';
const historyFiles = fs.readdirSync(historyDir).filter(n => n.endsWith('.json')).sort();
let previousSnapshot = null;
for (const name of historyFiles) {
  const p = path.join(historyDir, name);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const snapshot of data.snapshots || []) {
    migrateSnapshot(snapshot, previousSnapshot);
    previousSnapshot = snapshot;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
const latestPath = 'public/data/latest.json';
const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const previousForLatest = previousSnapshot && previousSnapshot.sourceMeasuredAt === latest.sourceMeasuredAt ? null : previousSnapshot;
migrateSnapshot(latest, previousForLatest);
fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2) + '\n');

const saldosDir = 'public/data/saldos';
for (const name of fs.readdirSync(saldosDir).filter(n => n.endsWith('.json'))) {
  const p = path.join(saldosDir, name);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of data.records || []) {
    const runwayPressure = runwayPressureFor(r.liters, r.flow?.recentOutflowLitersPerHour ?? r.flow?.outflowLitersPerHour);
    r.pressure = { ...(r.pressure || {}), score: round2(runwayPressure), state: pressureStateFor(runwayPressure), mode: 'PROVISIONAL', runwayPressure: round2(runwayPressure), demandScore: null };
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
