const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
let app = fs.readFileSync(appPath, 'utf8');
const before = "const numeric=Number(score);if(!Number.isFinite(numeric))";
const after = "const numeric=score===null||score===undefined||score===''?NaN:Number(score);if(!Number.isFinite(numeric))";
if (!app.includes(before)) throw new Error('No se encontró el patrón de renderGauge esperado');
app = app.replace(before, after);
fs.writeFileSync(appPath, app);
cp.execFileSync(process.execPath, ['--check', appPath], { stdio: 'inherit' });
cp.execFileSync(process.execPath, ['--test', path.join(root, 'scripts/schema-contract.test.js')], { stdio: 'inherit' });
console.log('Corrección de gauge aplicada y contrato validado.');
