const fs = require('node:fs');

const path = 'app.js';
let app = fs.readFileSync(path, 'utf8');

const drawStart = app.indexOf('function drawZoneChart(');
const drawEnd = app.indexOf('function showChartTooltip(', drawStart);
if (drawStart < 0 || drawEnd < 0) throw new Error('No se encontró drawZoneChart');

const drawZoneChart = `function drawZoneChart(svg,scores,times,tooltipEl,sold,liters,seriesEnabled={index:true,balance:true,volume:true}){svg.onclick=null;svg.style.cursor='';
const wrapEl=svg.parentElement;
if(tooltipEl)tooltipEl.style.display='none';
const w=Math.max(280,Math.round(svg.getBoundingClientRect().width))||600,h=Math.max(160,Math.round(svg.getBoundingClientRect().height))||220;
svg.setAttribute('viewBox',\`0 0 \${w} \${h}\`);
const pointCount=Math.max(scores?.length||0,times?.length||0,sold?.length||0,liters?.length||0);
if(pointCount<2){svg.innerHTML=\`<text x="\${w/2}" y="\${h/2}" text-anchor="middle" fill="#6f6a7d" font-size="13" font-family="ui-monospace,monospace">Aún no hay suficiente histórico</text>\`;return}
const pL=44,pR=54,pT=14,pB=18,plotW=w-pL-pR,plotH=h-pT-pB,bandH=plotH/5;
const xs=Array.from({length:pointCount},(_,i)=>pL+i*(plotW/(pointCount-1)));
const pts=Array.from({length:pointCount},(_,i)=>Number.isFinite(scores?.[i])?[xs[i],h-pB-(clampScore(scores[i])/100)*plotH]:null);
const parts=[];
for(let i=0;i<5;i++){const y=pT+i*bandH,state=STATE_ORDER[4-i],color=STATE_COLORS[state],isEdge=i===0||i===4;if(isEdge)parts.push(\`<rect x="\${pL}" y="\${y.toFixed(1)}" width="\${plotW}" height="\${bandH.toFixed(1)}" fill="\${color}" fill-opacity="0.1"></rect>\`);if(i>0)parts.push(\`<line x1="\${pL}" y1="\${y.toFixed(1)}" x2="\${w-pR}" y2="\${y.toFixed(1)}" stroke="\${ZONE_DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="2,4"></line>\`);parts.push(\`<text x="\${(w-pR+3).toFixed(1)}" y="\${(y-3).toFixed(1)}" text-anchor="start" font-size="8" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="#6f6a7d" opacity="0.8">\${100-i*20}</text>\`);parts.push(\`<text x="\${(w-2).toFixed(1)}" y="\${(y+bandH/2+3).toFixed(1)}" text-anchor="end" font-size="9" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="\${color}" opacity="0.85">\${stateLabel(state)}</text>\`)}
parts.push(\`<text x="\${(w-pR+3).toFixed(1)}" y="\${(h-pB-3).toFixed(1)}" text-anchor="start" font-size="8" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="#6f6a7d" opacity="0.8">0</text>\`);
const hasBalance=Array.isArray(liters)&&liters.length===pointCount,showBalance=hasBalance&&seriesEnabled.balance;
if(showBalance){const minL=Math.min(...liters),maxL=Math.max(...liters),spanL=(maxL-minL)||1,balPts=liters.map((v,i)=>[xs[i],h-pB-((v-minL)/spanL)*plotH]),balD=balPts.map((pt,i)=>\`\${i?'L':'M'}\${pt[0].toFixed(1)},\${pt[1].toFixed(1)}\`).join(' '),lastBal=balPts.at(-1);
for(let i=0;i<=5;i++){const y=pT+i*bandH,val=maxL-i*(spanL/5);parts.push(\`<text x="\${(pL-4).toFixed(1)}" y="\${(y-3).toFixed(1)}" text-anchor="end" font-size="8" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="\${BALANCE_COLOR}" opacity="0.7">\${compactLiters(val)}</text>\`)}
parts.push(\`<path d="\${balD}" fill="none" stroke="\${BALANCE_COLOR}" stroke-width="1.5" stroke-opacity="0.55" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>\`);
parts.push(\`<circle cx="\${lastBal[0].toFixed(1)}" cy="\${lastBal[1].toFixed(1)}" r="3" fill="\${BALANCE_COLOR}"></circle>\`)}
const hasVolume=Array.isArray(sold)&&sold.length===pointCount,showVolume=hasVolume&&seriesEnabled.volume;
if(showVolume){const volFrac=0.22,maxAbs=Math.max(1,...sold.map(v=>Math.abs(v))),baseY=h-pB,barZoneH=volFrac*plotH,barW=Math.max(1,(plotW/(pointCount-1))*0.92);
sold.forEach((v,i)=>{const bh=(Math.abs(v)/maxAbs)*barZoneH;if(bh<=0)return;const x=xs[i]-barW/2,y=baseY-bh,color=v>=0?VOLUME_IN_COLOR:VOLUME_OUT_COLOR;parts.push(\`<rect x="\${x.toFixed(1)}" y="\${y.toFixed(1)}" width="\${barW.toFixed(1)}" height="\${bh.toFixed(1)}" fill="\${color}" fill-opacity="0.55"></rect>\`)})}
const tickCount=Math.min(5,pointCount);
for(let i=0;i<tickCount;i++){const idx=Math.round(i*(pointCount-1)/(tickCount-1||1)),x=xs[idx],label=times?.[idx]?new Intl.DateTimeFormat('es-BO',{day:'2-digit',month:'short'}).format(new Date(times[idx])):'',anchor=i===0?'start':i===tickCount-1?'end':'middle';parts.push(\`<text x="\${x.toFixed(1)}" y="\${h-4}" text-anchor="\${anchor}" font-size="9" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="#6f6a7d">\${esc(label)}</text>\`)}
if(seriesEnabled.index){for(let i=1;i<pointCount;i++){if(!pts[i-1]||!pts[i])continue;const color=scoreColor((scores[i-1]+scores[i])/2);parts.push(\`<path d="M\${pts[i-1][0].toFixed(1)},\${pts[i-1][1].toFixed(1)} L\${pts[i][0].toFixed(1)},\${pts[i][1].toFixed(1)}" fill="none" stroke="\${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>\`)}
const lastIndex=[...scores].map((v,i)=>Number.isFinite(v)?i:-1).filter(i=>i>=0).at(-1);if(lastIndex!==undefined){const last=pts[lastIndex],lastColor=scoreColor(scores[lastIndex]);parts.push(\`<circle cx="\${last[0].toFixed(1)}" cy="\${last[1].toFixed(1)}" r="4" fill="\${lastColor}" stroke="\${PANEL_COLOR}" stroke-width="2"></circle>\`);parts.push(\`<rect x="\${(last[0]+6).toFixed(1)}" y="\${(last[1]-9).toFixed(1)}" width="30" height="18" rx="4" fill="\${lastColor}"></rect>\`);parts.push(\`<text x="\${(last[0]+21).toFixed(1)}" y="\${(last[1]+4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" font-family="'IBM Plex Mono',ui-monospace,monospace" fill="\${PANEL_COLOR}">\${Math.round(scores[lastIndex])}</text>\`)}}
parts.push(\`<line class="chart-guide" x1="\${xs.at(-1).toFixed(1)}" y1="\${pT}" x2="\${xs.at(-1).toFixed(1)}" y2="\${h-pB}" stroke="#f4b74e" stroke-width="1" stroke-dasharray="3,3" style="display:none"></line>\`);
parts.push(\`<circle class="chart-marker" r="5" fill="none" stroke="#f4b74e" stroke-width="2" style="display:none"></circle>\`);
svg.innerHTML=parts.join('');
const guide=svg.querySelector('.chart-guide'),marker=svg.querySelector('.chart-marker');
svg.style.cursor='pointer';
svg.onclick=evt=>{const rect=svg.getBoundingClientRect(),svgX=(evt.clientX-rect.left)*(w/rect.width),step=plotW/(pointCount-1),idx=Math.max(0,Math.min(pointCount-1,Math.round((svgX-pL)/step))),x=xs[idx];guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.style.display='';if(seriesEnabled.index&&pts[idx]){marker.setAttribute('cx',pts[idx][0]);marker.setAttribute('cy',pts[idx][1]);marker.setAttribute('stroke',scoreColor(scores[idx]));marker.style.display=''}else{marker.style.display='none'}
if(tooltipEl)showChartTooltip(tooltipEl,wrapEl,x,{time:times?.[idx],score:scores?.[idx],liters:showBalance?liters[idx]:null,sold:showVolume?sold[idx]:null},seriesEnabled)}}
`;

app = app.slice(0, drawStart) + drawZoneChart + app.slice(drawEnd);

const trendStart = app.indexOf('async function renderTrendChart(');
const trendEnd = app.indexOf('async function fetchSaldosDay(', trendStart);
if (trendStart < 0 || trendEnd < 0) throw new Error('No se encontró renderTrendChart');

const renderTrendChart = `async function renderTrendChart(rangeKey){const days=rangeKey==='7d'?7:rangeKey==='30d'?30:400;const snaps=await getRangeSnapshots(days,rangeKey);const points=snaps.map(s=>({score:Number.isFinite(s.global?.pressure?.score)?clampScore(s.global.pressure.score):null,liters:Number(s.global?.inventory?.totalLiters||0),time:s.scrapedAt}));if(latest&&(!points.length||new Date(latest.scrapedAt)>new Date(points.at(-1).time)))points.push({score:Number.isFinite(latest.global?.pressure?.score)?clampScore(latest.global.pressure.score):null,liters:Number(latest.global?.inventory?.totalLiters||0),time:latest.scrapedAt});const rawScores=points.map(p=>p.score),rawTimes=points.map(p=>p.time),rawLiters=points.map(p=>p.liters),rawDelta=rawLiters.map((v,i)=>i===0?0:v-rawLiters[i-1]);const{scores,sold,liters,times}=downsampleWithVolume(rawScores,rawDelta,rawLiters,rawTimes,180);lastChartData={scores,sold,liters,times};drawZoneChart($('#trendChart'),scores,times,$('#trendChartTooltip'),sold,liters,chartSeries);const pressureScores=scores.filter(Number.isFinite);if(!pressureScores.length){$('#trendDelta').textContent='PRESIÓN: BASELINE';return}if(pressureScores.length<2){$('#trendDelta').textContent='—';return}const delta=pressureScores.at(-1)-pressureScores[0];$('#trendDelta').textContent=\`\${delta>=0?'+':''}\${delta.toFixed(1)} pts\`}
`;

app = app.slice(0, trendStart) + renderTrendChart + app.slice(trendEnd);
fs.writeFileSync(path, app);
