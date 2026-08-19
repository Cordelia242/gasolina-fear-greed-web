/**
 * Regenerates the "Construir datos e indices" Code node inside
 * gasolina-fear-greed-workflow(1).json from src/index-engine (via the
 * bundle built by build-engine-bundle.ts) + the orchestration glue in
 * construir-datos-e-indices.glue.js.
 *
 * This is how src/index-engine stays the SINGLE source of truth for the
 * formula: nobody hand-edits the Code node's math. Change the engine,
 * re-run this script, commit the regenerated workflow JSON.
 *
 * Usage: npm run build:n8n-workflow
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildEngineBundle } from './build-engine-bundle.ts';

const WORKFLOW_PATH = path.resolve(import.meta.dirname, '../../gasolina-fear-greed-workflow(1).json');
const GLUE_PATH = path.resolve(import.meta.dirname, './construir-datos-e-indices.glue.js');
const NODE_NAME = 'Construir datos e indices';

interface N8nNode {
  name: string;
  parameters?: { jsCode?: string };
}

interface N8nWorkflow {
  nodes: N8nNode[];
}

async function main() {
  const [bundle, glue, workflowRaw] = await Promise.all([
    buildEngineBundle(),
    readFile(GLUE_PATH, 'utf8'),
    readFile(WORKFLOW_PATH, 'utf8'),
  ]);

  const workflow = JSON.parse(workflowRaw) as N8nWorkflow;
  const node = workflow.nodes.find((n) => n.name === NODE_NAME);
  if (!node || !node.parameters) {
    throw new Error(`No se encontró el nodo "${NODE_NAME}" en ${WORKFLOW_PATH}`);
  }

  node.parameters.jsCode = `${bundle}\n\n${glue}`;

  await writeFile(WORKFLOW_PATH, JSON.stringify(workflow, null, 2) + '\n');
  console.log(`Actualizado "${NODE_NAME}" en ${path.basename(WORKFLOW_PATH)} (${bundle.length + glue.length} chars).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
