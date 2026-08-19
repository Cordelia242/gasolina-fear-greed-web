const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, content) => fs.writeFileSync(path.join(root, p), content);
const readJson = p => JSON.parse(read(p));
const writeJson = (p, value) => write(p, JSON.stringify(value, null, 2) + '\n');
const clamp = v => Math.max(0, Math.min(100, Number(v) || 0));
const round2 = v => Math.round(v * 100) / 100;

function fuelStateFor(score) {
  if (score <= 20) return 'CRITICO';
  if (score <= 40) return 'ESCASEZ';
  if (score <= 60) return 'NORMAL';
  if (score <= 80) return 'ABUNDANCIA';
  return 'SATURADO';
}

function pressureStateFor(score) {
  if (!Number.isFinite(score)) return 'BASELINE_BUILDING';
  if (score <= 20) return 'SIN_PRESION';
  if (score <= 40) return 'DEMANDA_BAJA';
  if (score <= 60) return 'EQUILIBRIO';
  if (score <= 80) return 'PRESION_ALTA';
  return 'PRESION_EXTREMA';
}

function fuelLevelFor(liters) {
  const score = clamp(Number(liters || 0) / 25000 * 100);
  return { score: round2(score), state: fuelStateFor(score) };
}

function pressureFromLegacyStation(station) {
  if (station?.pressure && typeof station.pressure === 'object') return station.pressure;
  if (station?.baselineReady && Number.isFinite(station?.demandIndex)) {
    const score = clamp(100 - Number(station.demandIndex));
    return {
      score: round2(score),
      state: pressureStateFor(score),
      baselineReady: true,
      baselineCleanDays: station.baselineCleanDays ?? null,
      demandRatio: station.demandRatio ?? null,
      expectedOutflowLitersPerHour: station.expectedOutflowLitersPerHour ?? null
    };
  }
  return {
    score: null,
    state: 'BASELINE_BUILDING',
    baselineReady: false,
    baselineCleanDays: station?.baselineCleanDays ?? 0,
    demandRatio: station?.demandRatio ?? null,
    expectedOutflowLitersPerHour: station?.expectedOutflowLitersPerHour ?? null
  };
}

function migrateStation(station) {
  const fuelLevel = fuelLevelFor(station.liters);
  const pressure = pressureFromLegacyStation(station);
  const flow = station.flow && typeof station.flow === 'object' ? station.flow : {
    deltaLiters: station.deltaLiters ?? null,
    litersPerHour: station.flowLitersPerHour ?? null,
    outflowLitersPerHour: station.outflowLitersPerHour ?? null,
    inflowLitersPerHour: station.inflowLitersPerHour ?? null,
    recentOutflowLitersPerHour: station.recentOutflowLitersPerHour ?? null,
    hoursToEmpty: station.hoursToEmpty ?? null
  };
  const cleaned = { ...station, fuelLevel, pressure, flow };
  for (const key of [
    'score','state','absoluteIndex','historicalIndex','demandIndex','runwayIndex',
    'deltaLiters','flowLitersPerHour','outflowLitersPerHour','inflowLitersPerHour',
    'recentOutflowLitersPerHour','hoursToEmpty','demandRatio','demandZ',
    'expectedOutflowLitersPerHour','baselineCleanDays','baselineReady','baselineHour',
    'vehiclesEstimated','queueMinutes'
  ]) delete cleaned[key];
  return cleaned;
}

function migrateSnapshot(snapshot) {
  const stations = (snapshot.stations || []).map(migrateStation);
  const inventoryScore = stations.length
    ? stations.reduce((sum, s) => sum + Number(s.fuelLevel?.score || 0), 0) / stations.length
    : 0;
  const readyPressure = stations.filter(s => Number.isFinite(s.pressure?.score));
  const pressureScore = readyPressure.length
    ? readyPressure.reduce((sum, s) => sum + s.pressure.score, 0) / readyPressure.length
    : null;
  const oldGlobal = snapshot.global || {};
  const inventory = {
    score: round2(inventoryScore),
    state: fuelStateFor(inventoryScore),
    totalLiters: stations.reduce((sum, s) => sum + Number(s.liters || 0), 0),
    stationsAvailable: stations.filter(s => Number(s.liters || 0) > 0).length,
    stationsTotal: stations.length
  };
  const pressure = {
    score: pressureScore === null ? null : round2(pressureScore),
    state: pressureScore === null ? 'BASELINE_BUILDING' : pressureStateFor(pressureScore),
    stationsReady: readyPressure.length,
    stationsTotal: stations.length
  };
  const flow = oldGlobal.flow && typeof oldGlobal.flow === 'object' ? oldGlobal.flow : {
    outflowLitersPerHour: oldGlobal.outflowLitersPerHour ?? null,
    inflowLitersPerHour: oldGlobal.inflowLitersPerHour ?? null,
    netFlowLitersPerHour: oldGlobal.netFlowLitersPerHour ?? null
  };
  return { ...snapshot, global: { inventory, pressure, flow }, stations };
}

function migrateHistoricalData() {
  for (const dir of ['public/data/history', 'public/data/saldos']) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter(n => n.endsWith('.json'))) {
      const rel = `${dir}/${name}`;
      const data = readJson(rel);
      if (dir.endsWith('/history')) {
        data.snapshots = (data.snapshots || []).map(migrateSnapshot);
      } else {
        data.records = (data.records || []).map(record => {
          const migrated = migrateStation(record);
          return migrated;
        });
      }
      writeJson(rel, data);
    }
  }
  if (fs.existsSync(path.join(root, 'public/data/latest.json'))) {
    writeJson('public/data/latest.json', migrateSnapshot(readJson('public/data/latest.json')));
  }
}

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`No se encontró patrón para ${label}`);
  if (source.indexOf(needle, index + needle.length) >= 0) throw new Error(`Patrón ambiguo para ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

function migrateIndexHtml() {
  let html = read('index.html');
  html = html.replace('<span class="label">ÍNDICE GLOBAL</span>', '<span class="label">ÍNDICE DE PRESIÓN</span>');
  html = html.replace('Medidor del índice global', 'Medidor del índice de presión');
  html = html.replace('Gráfico del índice', 'Gráfico de presión');
  html = html.replace('Índice de escasez</button>', 'Índice de presión</button>');
  html = replaceOnce(
    html,
    '<div class="prop"><dt>Litros actuales</dt><dd id="dialogLiters">—</dd></div>',
    '<div class="prop"><dt>Litros actuales</dt><dd id="dialogLiters">—</dd></div>\n        <div class="prop"><dt>Nivel de combustible</dt><dd id="dialogFuelLevel">—</dd></div>\n        <div class="prop"><dt>Índice de presión</dt><dd id="dialogPressure">—</dd></div>',
    'propiedades del diálogo'
  );
  write('index.html', html);
}

function migrateStyles() {
  let css = read('styles.css');
  if (!css.includes('.state-SIN_PRESION')) {
    css += `\n/* Índice de presión: alto = mayor tensión, separado del nivel de combustible. */\n.state-SIN_PRESION{color:var(--s-saturado)}\n.state-DEMANDA_BAJA{color:var(--s-abundancia)}\n.state-EQUILIBRIO{color:var(--s-normal)}\n.state-PRESION_ALTA{color:var(--s-escasez)}\n.state-PRESION_EXTREMA{color:var(--s-critico)}\n.state-BASELINE_BUILDING{color:var(--muted)}\n`;
  }
  write('styles.css', css);
}

function migrateApp() {
  let app = read('app.js');
  app = replaceOnce(
    app,
    "const stateLabel=s=>({CRITICO:'CRÍTICO',ESCASEZ:'ESCASEZ',NORMAL:'NORMAL',ABUNDANCIA:'ABUNDANCIA',SATURADO:'SATURADO'})[s]||s||'—';",
    "const fuelStateLabel=s=>({CRITICO:'CRÍTICO',ESCASEZ:'ESCASEZ',NORMAL:'NORMAL',ABUNDANCIA:'ABUNDANCIA',SATURADO:'SATURADO'})[s]||s||'—';\nconst pressureStateLabel=s=>({SIN_PRESION:'SIN PRESIÓN',DEMANDA_BAJA:'DEMANDA BAJA',EQUILIBRIO:'EQUILIBRIO',PRESION_ALTA:'PRESIÓN ALTA',PRESION_EXTREMA:'PRESIÓN EXTREMA',BASELINE_BUILDING:'BASELINE EN CONSTRUCCIÓN'})[s]||s||'—';",
    'labels de estado'
  );

  const oldStateBlock = `const STATE_ORDER=['CRITICO','ESCASEZ','NORMAL','ABUNDANCIA','SATURADO'];\nconst STATE_COLORS=Object.fromEntries(STATE_ORDER.map(s=>[s,rootStyle.getPropertyValue(\`--s-\${s.toLowerCase()}\`).trim()]));\nconst PANEL_COLOR=rootStyle.getPropertyValue('--panel').trim();\nconst VOLUME_COLOR=rootStyle.getPropertyValue('--volume').trim();\nconst VOLUME_IN_COLOR=rootStyle.getPropertyValue('--volume-in').trim();\nconst VOLUME_OUT_COLOR=rootStyle.getPropertyValue('--volume-out').trim();\nconst BALANCE_COLOR=rootStyle.getPropertyValue('--balance-line').trim();\nconst ZONE_DIVIDER_COLOR=rootStyle.getPropertyValue('--zone-divider').trim();\nfunction compactLiters(v){const n=Number(v)||0;if(n>=1000)return \`\${(n/1000).toFixed(n>=10000?0:1)}K L\`;return \`\${Math.round(n)} L\`}\nconst clampScore=v=>Math.max(0,Math.min(100,Number(v)||0));\nconst scoreToState=v=>STATE_ORDER[Math.min(4,Math.floor(clampScore(v)/20))];\nconst scoreColor=v=>STATE_COLORS[scoreToState(v)];`;
  const newStateBlock = `const FUEL_STATE_ORDER=['CRITICO','ESCASEZ','NORMAL','ABUNDANCIA','SATURADO'];\nconst FUEL_STATE_COLORS=Object.fromEntries(FUEL_STATE_ORDER.map(s=>[s,rootStyle.getPropertyValue(\`--s-\${s.toLowerCase()}\`).trim()]));\nconst PRESSURE_STATE_ORDER=['SIN_PRESION','DEMANDA_BAJA','EQUILIBRIO','PRESION_ALTA','PRESION_EXTREMA'];\nconst PRESSURE_STATE_COLORS={SIN_PRESION:FUEL_STATE_COLORS.SATURADO,DEMANDA_BAJA:FUEL_STATE_COLORS.ABUNDANCIA,EQUILIBRIO:FUEL_STATE_COLORS.NORMAL,PRESION_ALTA:FUEL_STATE_COLORS.ESCASEZ,PRESION_EXTREMA:FUEL_STATE_COLORS.CRITICO};\nconst STATE_ORDER=PRESSURE_STATE_ORDER;\nconst STATE_COLORS=PRESSURE_STATE_COLORS;\nconst stateLabel=pressureStateLabel;\nconst PANEL_COLOR=rootStyle.getPropertyValue('--panel').trim();\nconst VOLUME_COLOR=rootStyle.getPropertyValue('--volume').trim();\nconst VOLUME_IN_COLOR=rootStyle.getPropertyValue('--volume-in').trim();\nconst VOLUME_OUT_COLOR=rootStyle.getPropertyValue('--volume-out').trim();\nconst BALANCE_COLOR=rootStyle.getPropertyValue('--balance-line').trim();\nconst ZONE_DIVIDER_COLOR=rootStyle.getPropertyValue('--zone-divider').trim();\nfunction compactLiters(v){const n=Number(v)||0;if(n>=1000)return \`\${(n/1000).toFixed(n>=10000?0:1)}K L\`;return \`\${Math.round(n)} L\`}\nconst clampScore=v=>Math.max(0,Math.min(100,Number(v)||0));\nconst scoreToState=v=>PRESSURE_STATE_ORDER[Math.min(4,Math.floor(clampScore(v)/20))];\nconst scoreColor=v=>PRESSURE_STATE_COLORS[scoreToState(v)];\nconst fuelScoreColor=v=>FUEL_STATE_COLORS[FUEL_STATE_ORDER[Math.min(4,Math.floor(clampScore(v)/20))]];`;
  app = replaceOnce(app, oldStateBlock, newStateBlock, 'bloque de colores/estados');

  app = app.replace(
    /function renderGauge\(score\)\{[^\n]+\}/,
    `function renderGauge(score){const numeric=Number(score);if(!Number.isFinite(numeric)){$('#gaugeSvg').innerHTML=\`<path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#3a3542" stroke-width="14" stroke-linecap="round"/>\`;return}const s=clampScore(numeric),cx=100,cy=100,r=80,angle=(180-(s/100)*180)*Math.PI/180,mx=(cx+r*Math.cos(angle)).toFixed(1),my=(cy-r*Math.sin(angle)).toFixed(1);$('#gaugeSvg').innerHTML=\`<defs><linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="\${PRESSURE_STATE_COLORS.SIN_PRESION}"/><stop offset="25%" stop-color="\${PRESSURE_STATE_COLORS.DEMANDA_BAJA}"/><stop offset="50%" stop-color="\${PRESSURE_STATE_COLORS.EQUILIBRIO}"/><stop offset="75%" stop-color="\${PRESSURE_STATE_COLORS.PRESION_ALTA}"/><stop offset="100%" stop-color="\${PRESSURE_STATE_COLORS.PRESION_EXTREMA}"/></linearGradient></defs><path d="M \${cx-r} \${cy} A \${r} \${r} 0 0 1 \${cx+r} \${cy}" fill="none" stroke="url(#gaugeGrad)" stroke-width="14" stroke-linecap="round"/><circle cx="\${mx}" cy="\${my}" r="8" fill="\${PANEL_COLOR}" stroke="#fff" stroke-width="3"/>\`}`
  );
  app = app.replace(
    /function renderGlobal\(d\)\{[^\n]+\}/,
    `function renderGlobal(d){const g=d.global||{},inventory=g.inventory||{},pressure=g.pressure||{},hasPressure=Number.isFinite(pressure.score),s=hasPressure?clampScore(pressure.score):null;$('#globalScore').textContent=hasPressure?Math.round(s):'--';renderGauge(s);const stateEl=$('#globalState');[...FUEL_STATE_ORDER,...PRESSURE_STATE_ORDER,'BASELINE_BUILDING'].forEach(st=>stateEl.classList.remove('state-'+st));stateEl.textContent=pressureStateLabel(pressure.state||'BASELINE_BUILDING');if(pressure.state)stateEl.classList.add('state-'+pressure.state);$('#totalLiters').textContent=\`\${fmt.format(inventory.totalLiters||0)} L\`;$('#availableStations').textContent=inventory.stationsAvailable??0;$('#totalStations').textContent=inventory.stationsTotal??d.stations?.length??0;const dt=new Date(d.scrapedAt);$('#updatedAt').textContent=Number.isNaN(dt.getTime())?'Actualización reciente':\`Actualizado \${new Intl.DateTimeFormat('es-BO',{dateStyle:'short',timeStyle:'short'}).format(dt)}\`}`
  );

  app = app.replace(
    /function stationCard\(s\)\{[^\n]+\}/,
    `function stationCard(s){const fuel=s.fuelLevel||{score:0,state:'CRITICO'},color=fuelScoreColor(fuel.score);return \`<article class="card station state-\${fuel.state}" data-key="\${esc(s.key)}"><div class="station-top"><div><h3>\${esc(s.name)}</h3><div class="address">\${esc(s.address||'Dirección no disponible')}</div></div><div class="station-score">\${Math.round(fuel.score??0)} · \${fuelStateLabel(fuel.state)}</div></div><div class="station-main"><strong>\${fmt.format(s.liters||0)}</strong><span>litros</span></div><div class="station-chart">\${stationSparkline(s.key,color)}</div><div class="station-meta"><span>Nivel: \${fuelStateLabel(fuel.state)}</span><span>\${esc(stationConsumptionLabel(s.key))}</span></div></article>\`}`
  );
  app = app.replace(
    /function renderStationChart\(\)\{[^\n]+\}/,
    `function renderStationChart(){const hours=rangeHours[currentRange]??STATION_CHART_HOURS,cutoff=Date.now()-hours*3600*1000,records=dialogRecords.filter(r=>new Date(r.scrapedAt).getTime()>=cutoff),liters=records.map(r=>Number(r.liters||0)),times=records.map(r=>r.scrapedAt),color=currentDialogStation?fuelScoreColor(currentDialogStation.fuelLevel?.score):'#8b7cd8';svgLineChart($('#stationChart'),liters,{min:0,times,detailEl:$('#stationChartDetail'),formatValue:v=>\`\${fmt.format(v)} L\`,color})}`
  );
  app = app.replace(
    /async function openStationDialog\(key\)\{[^\n]+\}/,
    `async function openStationDialog(key){const station=(latest?.stations||[]).find(s=>s.key===key);if(!station)return;currentDialogStation=station;currentRange='5h';document.querySelectorAll('.range-filters .filter').forEach(x=>x.classList.toggle('active',x.dataset.range==='5h'));$('#dialogName').textContent=station.name;$('#dialogAddress').textContent=station.address||'Dirección no disponible';$('#dialogLiters').textContent=\`\${fmt.format(station.liters||0)} L\`;const fuel=station.fuelLevel||{score:0,state:'CRITICO'},pressure=station.pressure||{score:null,state:'BASELINE_BUILDING'};$('#dialogFuelLevel').textContent=\`\${Math.round(fuel.score)} · \${fuelStateLabel(fuel.state)}\`;$('#dialogPressure').textContent=Number.isFinite(pressure.score)?\`\${Math.round(pressure.score)} · \${pressureStateLabel(pressure.state)}\`:pressureStateLabel(pressure.state||'BASELINE_BUILDING');$('#stationChart').innerHTML='';dialogRecords=[];$('#stationDialog').showModal();dialogRecords=(await getSaldosRecords()).filter(r=>r.station===key).sort((a,b)=>new Date(a.scrapedAt)-new Date(b.scrapedAt));renderStationChart()}`
  );

  app = app.replace('Índice de escasez</span>', 'Índice de presión</span>');
  app = app.replace(
    /async function renderTrendChart\(rangeKey\)\{[\s\S]*?\nasync function fetchSaldosDay/,
    `async function renderTrendChart(rangeKey){const days=rangeKey==='7d'?7:rangeKey==='30d'?30:400;const snaps=await getRangeSnapshots(days,rangeKey);const points=snaps.map(s=>({score:Number.isFinite(s.global?.pressure?.score)?clampScore(s.global.pressure.score):null,liters:Number(s.global?.inventory?.totalLiters||0),time:s.scrapedAt}));if(latest&&(!points.length||new Date(latest.scrapedAt)>new Date(points.at(-1).time)))points.push({score:Number.isFinite(latest.global?.pressure?.score)?clampScore(latest.global.pressure.score):null,liters:Number(latest.global?.inventory?.totalLiters||0),time:latest.scrapedAt});const pressurePoints=points.filter(p=>Number.isFinite(p.score));if(!pressurePoints.length){lastChartData={scores:[],sold:[],liters:[],times:[]};drawZoneChart($('#trendChart'),[],[],$('#trendChartTooltip'),[],[],chartSeries);$('#trendDelta').textContent='BASELINE';return}const rawScores=pressurePoints.map(p=>p.score),rawTimes=pressurePoints.map(p=>p.time),rawLiters=pressurePoints.map(p=>p.liters),rawDelta=rawLiters.map((v,i)=>i===0?0:v-rawLiters[i-1]);const{scores,sold,liters,times}=downsampleWithVolume(rawScores,rawDelta,rawLiters,rawTimes,180);lastChartData={scores,sold,liters,times};drawZoneChart($('#trendChart'),scores,times,$('#trendChartTooltip'),sold,liters,chartSeries);if(scores.length<2){$('#trendDelta').textContent='—';return}const delta=scores.at(-1)-scores[0];$('#trendDelta').textContent=\`\${delta>=0?'+':''}\${delta.toFixed(1)} pts\`}\nasync function fetchSaldosDay`
  );

  write('app.js', app);
}

function n8nNodeCode() {
const cfg = $('Configuracion').first().json;
const parsed = $('Extraer surtidores visibles').first().json;
const localDate = $('Fecha local').first().json.localDate;

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
function fuelStateFor(score) {
  if (score <= 20) return 'CRITICO';
  if (score <= 40) return 'ESCASEZ';
  if (score <= 60) return 'NORMAL';
  if (score <= 80) return 'ABUNDANCIA';
  return 'SATURADO';
}
function pressureStateFor(score) {
  if (!Number.isFinite(score)) return 'BASELINE_BUILDING';
  if (score <= 20) return 'SIN_PRESION';
  if (score <= 40) return 'DEMANDA_BAJA';
  if (score <= 60) return 'EQUILIBRIO';
  if (score <= 80) return 'PRESION_ALTA';
  return 'PRESION_EXTREMA';
}
function fuelLevelFor(liters) {
  const score = clamp(Number(liters || 0) / 25000 * 100);
  return { score: round2(score), state: fuelStateFor(score) };
}
function readGithubJson(nodeName, fallback) {
  const response = $(nodeName).first().json;
  if (!response || !response.content) return { exists: false, value: clone(fallback) };
  try {
    const raw = Buffer.from(String(response.content).replace(/\n/g, ''), 'base64').toString('utf8');
    return { exists: true, value: JSON.parse(raw) };
  } catch (e) {
    throw new Error(`No se pudo interpretar ${nodeName}: ${e.message}`);
  }
}
function sourceDate(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : localDate;
}
function sourceHour(value) {
  const m = String(value || '').match(/T(\d{2}):/);
  return m ? Number(m[1]) : 0;
}
function msForLocalIso(value) {
  if (!value) return null;
  const normalized = String(value).match(/[zZ]|[+-]\d{2}:\d{2}$/) ? String(value) : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}
function isCrisisDate(date, crises) {
  return crises.some(c => {
    if (!c || c.enabled === false || !c.start) return false;
    const start = String(c.start).slice(0, 10);
    const end = c.end ? String(c.end).slice(0, 10) : null;
    return date >= start && (!end || date <= end);
  });
}
function dateMinusDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function aggregateDays(days, crises, minDate) {
  let outflowCount = 0, sumOutflow = 0, sumOutflowSq = 0;
  const cleanDates = new Set();
  for (const [date, d] of Object.entries(days || {})) {
    if (date < minDate || isCrisisDate(date, crises)) continue;
    const oc = Number(d.outflowCount || 0);
    if (oc > 0) {
      outflowCount += oc;
      sumOutflow += Number(d.sumOutflow || 0);
      sumOutflowSq += Number(d.sumOutflowSq || 0);
      cleanDates.add(date);
    }
  }
  const meanOutflow = outflowCount ? sumOutflow / outflowCount : null;
  const variance = outflowCount > 1 ? Math.max(0, sumOutflowSq / outflowCount - meanOutflow * meanOutflow) : 0;
  return { cleanDays: cleanDates.size, outflowCount, meanOutflow, outflowStd: Math.sqrt(variance) };
}
function updateDayBucket(bucket, date, outflowLph) {
  bucket.days = bucket.days || {};
  const d = bucket.days[date] || { outflowCount: 0, sumOutflow: 0, sumOutflowSq: 0 };
  if (Number.isFinite(outflowLph) && outflowLph > 0) {
    d.outflowCount += 1;
    d.sumOutflow += outflowLph;
    d.sumOutflowSq += outflowLph * outflowLph;
  }
  bucket.days[date] = d;
}
function pruneDays(bucket, minDate) {
  for (const date of Object.keys(bucket.days || {})) if (date < minDate) delete bucket.days[date];
}
function pressureScoreFor(recentOutflow, baseline) {
  if (!baseline || !Number.isFinite(baseline.meanOutflow) || baseline.meanOutflow <= 0 || !Number.isFinite(recentOutflow)) return null;
  const ratio = recentOutflow / baseline.meanOutflow;
  const ratioScore = clamp(50 + 35 * Math.log2(Math.max(0.05, ratio)));
  let zScore = 50;
  if (baseline.outflowStd > 0) zScore = clamp(50 + 20 * ((recentOutflow - baseline.meanOutflow) / baseline.outflowStd));
  return { score: clamp(ratioScore * 0.75 + zScore * 0.25), ratio };
}

const seedCatalog = [
  { key: 'alemana', name: 'ALEMANA' }, { key: 'beni', name: 'BENI' },
  { key: 'berea', name: 'BEREA' }, { key: 'cedeno', name: 'CEDENO' },
  { key: 'chaco', name: 'CHACO' }, { key: 'gasco', name: 'GASCO' },
  { key: 'la-teca', name: 'LA TECA' }, { key: 'lopez', name: 'LOPEZ' },
  { key: 'montecristo', name: 'MONTECRISTO' }, { key: 'paragua', name: 'PARAGUA' },
  { key: 'parapeti', name: 'PARAPETI' }, { key: 'royal', name: 'ROYAL' },
  { key: 'sur-central', name: 'SUR CENTRAL' }, { key: 'viru-viru', name: 'VIRU VIRU' }
];
const catalogFile = readGithubJson('GitHub - Leer catalog.json', { stations: seedCatalog });
const statsFile = readGithubJson('GitHub - Leer stats.json', { version: 3, stations: {} });
const historyFile = readGithubJson('GitHub - Leer historico diario', { date: localDate, snapshots: [] });
const latestFile = readGithubJson('GitHub - Leer latest.json', null);
const saldosDayFile = readGithubJson('GitHub - Leer saldos del día', { date: localDate, records: [] });
const crisesFile = readGithubJson('GitHub - Leer crises.json', { version: 1, crises: [] });
const catalog = catalogFile.value || { stations: seedCatalog };
const stats = statsFile.value || { version: 3, stations: {} };
const history = historyFile.value || { date: localDate, snapshots: [] };
const saldosDay = saldosDayFile.value || { date: localDate, records: [] };
const crises = Array.isArray(crisesFile.value?.crises) ? crisesFile.value.crises : [];
catalog.stations = Array.isArray(catalog.stations) ? catalog.stations : [];
stats.version = 3;
stats.stations = stats.stations || {};
history.date = localDate;
history.snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
saldosDay.date = localDate;
saldosDay.records = Array.isArray(saldosDay.records) ? saldosDay.records : [];

const currentDate = sourceDate(parsed.sourceMeasuredAt);
const currentHour = sourceHour(parsed.sourceMeasuredAt);
const currentIsCrisis = isCrisisDate(currentDate, crises);
const RETENTION_DAYS = 120;
const BASELINE_WINDOW_DAYS = 90;
const BASELINE_MIN_CLEAN_DAYS = 30;
const retentionStart = dateMinusDays(currentDate, RETENTION_DAYS);
const baselineStart = dateMinusDays(currentDate, BASELINE_WINDOW_DAYS);
const now = new Date().toISOString();

const catalogByKey = new Map(seedCatalog.map(s => [s.key, { ...s }]));
for (const s of catalog.stations) if (s?.key) catalogByKey.set(s.key, { ...catalogByKey.get(s.key), ...s });
for (const s of parsed.stations) {
  const previous = catalogByKey.get(s.key) || {};
  catalogByKey.set(s.key, { ...previous, key: s.key, name: s.name || previous.name || s.key, address: s.address || previous.address || null, lastSeenAt: now });
}
const visible = new Map(parsed.stations.map(s => [s.key, s]));
const latestByKey = new Map((latestFile.value?.stations || []).map(s => [s.key, s]));
const previousMeasuredAt = latestFile.value?.sourceMeasuredAt || null;
const previousDate = sourceDate(previousMeasuredAt);
const prevMs = msForLocalIso(previousMeasuredAt);
const currentMs = msForLocalIso(parsed.sourceMeasuredAt);
const elapsedMs = prevMs !== null && currentMs !== null ? currentMs - prevMs : null;
const elapsedHours = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 3600000 : null;
const sameMeasurement = Boolean(previousMeasuredAt && parsed.sourceMeasuredAt === previousMeasuredAt);
const stationResults = [];
const pendingStats = [];

for (const station of [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const current = visible.get(station.key);
  const liters = current ? Number(current.liters || 0) : 0;
  const fuelLevel = fuelLevelFor(liters);
  const previousStation = latestByKey.get(station.key);
  const previousLiters = previousStation ? Number(previousStation.liters || 0) : null;
  let deltaLiters = null, flowLph = null, outflowLph = null, inflowLph = null;
  if (!sameMeasurement && elapsedHours && Number.isFinite(previousLiters)) {
    deltaLiters = liters - previousLiters;
    flowLph = deltaLiters / elapsedHours;
    outflowLph = flowLph < 0 ? Math.abs(flowLph) : 0;
    inflowLph = flowLph > 0 ? flowLph : 0;
  }

  const prior = stats.stations[station.key] || { hours: {}, recentOutflowLph: null };
  prior.hours = prior.hours || {};
  const bucket = prior.hours[String(currentHour)] || { days: {} };
  pruneDays(bucket, retentionStart);
  const baseline = aggregateDays(bucket.days, crises, baselineStart);
  const baselineReady = baseline.cleanDays >= BASELINE_MIN_CLEAN_DAYS && baseline.outflowCount > 0 && baseline.meanOutflow > 0;
  const priorRecent = Number(prior.recentOutflowLph);
  let recentOutflow = Number.isFinite(priorRecent) ? priorRecent : null;
  if (Number.isFinite(outflowLph)) {
    const alpha = 0.35;
    recentOutflow = recentOutflow === null ? outflowLph : alpha * outflowLph + (1 - alpha) * recentOutflow;
  }
  const pressureCalc = baselineReady ? pressureScoreFor(recentOutflow, baseline) : null;
  const pressureScore = pressureCalc ? round2(pressureCalc.score) : null;
  const pressure = {
    score: pressureScore,
    state: pressureStateFor(pressureScore),
    baselineReady,
    baselineCleanDays: baseline.cleanDays,
    demandRatio: pressureCalc ? round2(pressureCalc.ratio) : null,
    expectedOutflowLitersPerHour: baselineReady ? round2(baseline.meanOutflow) : null
  };
  const flow = {
    deltaLiters: deltaLiters === null ? null : round2(deltaLiters),
    litersPerHour: flowLph === null ? null : round2(flowLph),
    outflowLitersPerHour: outflowLph === null ? null : round2(outflowLph),
    inflowLitersPerHour: inflowLph === null ? null : round2(inflowLph),
    recentOutflowLitersPerHour: recentOutflow === null ? null : round2(recentOutflow),
    hoursToEmpty: recentOutflow > 0 ? round2(liters / recentOutflow) : null
  };

  stationResults.push({
    key: station.key,
    name: station.name,
    address: current?.address || station.address || null,
    liters,
    visibleInSource: Boolean(current),
    fuelLevel,
    pressure,
    flow,
    inConfiguredCrisis: currentIsCrisis
  });

  if (!sameMeasurement) {
    if (previousDate === currentDate && Number.isFinite(outflowLph) && outflowLph > 0) updateDayBucket(bucket, currentDate, outflowLph);
    prior.hours[String(currentHour)] = bucket;
    pendingStats.push({ key: station.key, value: { ...prior, recentOutflowLph: recentOutflow, updatedAt: now } });
  }
}

const inventoryScore = stationResults.length ? stationResults.reduce((sum, s) => sum + s.fuelLevel.score, 0) / stationResults.length : 0;
const readyPressure = stationResults.filter(s => Number.isFinite(s.pressure.score));
const pressureScore = readyPressure.length ? readyPressure.reduce((sum, s) => sum + s.pressure.score, 0) / readyPressure.length : null;
const globalFlow = stationResults.reduce((acc, s) => {
  acc.out += Number(s.flow.outflowLitersPerHour || 0);
  acc.in += Number(s.flow.inflowLitersPerHour || 0);
  return acc;
}, { out: 0, in: 0 });
const snapshot = {
  scrapedAt: now,
  sourceMeasuredAt: parsed.sourceMeasuredAt,
  baseline: {
    minimumCleanDays: BASELINE_MIN_CLEAN_DAYS,
    windowDays: BASELINE_WINDOW_DAYS,
    retentionDays: RETENTION_DAYS,
    currentDateInConfiguredCrisis: currentIsCrisis,
    configuredCrises: crises.filter(c => c && c.enabled !== false && c.start).length,
    stationsReady: readyPressure.length,
    stationsTotal: stationResults.length
  },
  global: {
    inventory: {
      score: round2(inventoryScore),
      state: fuelStateFor(inventoryScore),
      totalLiters: stationResults.reduce((sum, s) => sum + s.liters, 0),
      stationsAvailable: stationResults.filter(s => s.liters > 0).length,
      stationsTotal: stationResults.length
    },
    pressure: {
      score: pressureScore === null ? null : round2(pressureScore),
      state: pressureStateFor(pressureScore),
      stationsReady: readyPressure.length,
      stationsTotal: stationResults.length
    },
    flow: {
      outflowLitersPerHour: round2(globalFlow.out),
      inflowLitersPerHour: round2(globalFlow.in),
      netFlowLitersPerHour: round2(globalFlow.in - globalFlow.out)
    }
  },
  stations: stationResults
};
const last = history.snapshots[history.snapshots.length - 1];
const isNewSnapshot = !last || last.sourceMeasuredAt !== snapshot.sourceMeasuredAt || last.global?.inventory?.totalLiters !== snapshot.global.inventory.totalLiters;
if (isNewSnapshot) {
  history.snapshots.push(snapshot);
  for (const update of pendingStats) stats.stations[update.key] = update.value;
  for (const s of stationResults) saldosDay.records.push({
    scrapedAt: now,
    sourceMeasuredAt: parsed.sourceMeasuredAt,
    station: s.key,
    name: s.name,
    liters: s.liters,
    visibleInSource: s.visibleInSource,
    fuelLevel: s.fuelLevel,
    pressure: s.pressure,
    flow: s.flow
  });
}
catalog.stations = [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
catalog.updatedAt = now;
stats.updatedAt = now;
const pretty = value => JSON.stringify(value, null, 2) + '\n';
return [{ json: {
  catalogExists: catalogFile.exists,
  statsExists: statsFile.exists,
  historyExists: historyFile.exists,
  latestExists: latestFile.exists,
  saldosExists: saldosDayFile.exists,
  catalogPath: `${cfg.dataRoot}/catalog.json`,
  statsPath: `${cfg.dataRoot}/stats.json`,
  historyPath: `${cfg.dataRoot}/history/${localDate}.json`,
  latestPath: `${cfg.dataRoot}/latest.json`,
  saldosPath: `${cfg.dataRoot}/saldos/${localDate}.json`,
  catalogContent: pretty(catalog),
  statsContent: pretty(stats),
  historyContent: pretty(history),
  latestContent: pretty(snapshot),
  saldosContent: pretty(saldosDay),
  snapshot
} }];
}

function migrateWorkflow() {
  const workflow = readJson('gasolina-fear-greed-workflow(1).json');
  const node = workflow.nodes.find(n => n.name === 'Construir datos e indices');
  if (!node) throw new Error('No se encontró Construir datos e indices');
  const source = n8nNodeCode.toString();
  node.parameters.jsCode = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')).trim() + '\n';
  writeJson('gasolina-fear-greed-workflow(1).json', workflow);
}

function validate() {
  cp.execFileSync(process.execPath, ['--check', path.join(root, 'app.js')], { stdio: 'inherit' });
  const workflow = readJson('gasolina-fear-greed-workflow(1).json');
  const code = workflow.nodes.find(n => n.name === 'Construir datos e indices')?.parameters?.jsCode;
  if (!code) throw new Error('Workflow sin jsCode');
  const tmp = path.join(root, '.tmp-n8n-code.js');
  write(tmp.slice(root.length + 1), `function __check(){\n${code}\n}\n`);
  try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' }); } finally { fs.unlinkSync(tmp); }
  cp.execFileSync(process.execPath, ['--test', path.join(root, 'scripts/schema-contract.test.js')], { stdio: 'inherit' });
}

migrateHistoricalData();
migrateIndexHtml();
migrateStyles();
migrateApp();
migrateWorkflow();
validate();
console.log('Migración completada: nivel de combustible e índice de presión separados.');
