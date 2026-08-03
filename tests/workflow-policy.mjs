import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const ciWorkflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

assert.doesNotMatch(
  workflow,
  /^permissions:\s*\{[^\n]*(?:pages:\s*write|id-token:\s*write)/m,
  'Deployment credentials must not be granted at workflow scope.',
);
assert.match(workflow, /^permissions:\n  contents: read$/m, 'The workflow default must be read-only.');
assert.match(
  workflow,
  /^  deploy:\n(?:    .*\n)*?    permissions:\n      pages: write\n      id-token: write$/m,
  'Only the deploy job may receive the Pages and OIDC write permissions.',
);
assert.match(workflow, /^    outputs:\n      page_url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}$/m);
assert.match(workflow, /^  smoke:\n    needs: deploy$/m, 'A smoke job must run after deployment.');
assert.match(
  workflow,
  /PLAYWRIGHT_BASE_URL: \$\{\{ needs\.deploy\.outputs\.page_url \}\}/,
  'The smoke job must test the URL returned by deploy-pages.',
);
assert.match(workflow, /if: \$\{\{ needs\.deploy\.result == 'success' \}\}/, 'Smoke must be guarded by successful deployment.');
assert.match(workflow, /npm run test:e2e:deployed/, 'Smoke must run deployed browser contracts.');
assert.match(workflow, /npm run test:deployed-feed/, 'Smoke must run deployed feed contracts.');

for (const use of workflow.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
  assert.match(use[1], /@[0-9a-f]{40}$/, `Action must use an immutable commit SHA: ${use[1]}`);
}
for (const use of ciWorkflow.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
  assert.match(use[1], /@[0-9a-f]{40}$/, `CI action must use an immutable commit SHA: ${use[1]}`);
}

console.log('Deployment workflow follows least-privilege, immutable-action, and smoke-test policy.');
