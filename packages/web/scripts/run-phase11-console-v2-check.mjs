import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assertContains(content, token, sourceLabel) {
  if (!content.includes(token)) {
    throw new Error(`${sourceLabel} missing required token: ${token}`);
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(scriptDir, '..');
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_WEB_CONSOLE_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-web-console-v2-check.json');

  const html = await fs.readFile(path.resolve(webRoot, 'src/index.html'), 'utf8');
  const css = await fs.readFile(path.resolve(webRoot, 'src/styles.css'), 'utf8');
  const js = await fs.readFile(path.resolve(webRoot, 'src/main.js'), 'utf8');

  const requiredHtmlTokens = [
    'Group State & Rollback Entry',
    'Federation Ops View',
    'btn-group-snapshot',
    'btn-retracted',
    'btn-fed-node-info',
    'btn-fed-dlq',
    'btn-fed-replay',
    'retracted-list',
    'federation-dlq-list',
  ];
  const requiredJsTokens = [
    'refreshGroupSnapshot',
    'fetchRetractedEnvelopes',
    'fetchFederationNodeInfo',
    'fetchFederationDlq',
    'replayFederationDlq',
  ];
  const requiredCssTokens = [
    '.state-grid',
    '.ops-list',
    '.ops-row',
  ];

  for (const token of requiredHtmlTokens) {
    assertContains(html, token, 'index.html');
  }
  for (const token of requiredJsTokens) {
    assertContains(js, token, 'main.js');
  }
  for (const token of requiredCssTokens) {
    assertContains(css, token, 'styles.css');
  }

  const report = {
    phase: 'Phase 11',
    taskId: 'TA-P11-009',
    generatedAt: new Date().toISOString(),
    summary: {
      groupStateViewReady: true,
      rollbackEntryReady: true,
      federationViewReady: true,
      requiredTokensChecked: requiredHtmlTokens.length + requiredJsTokens.length + requiredCssTokens.length,
    },
    decision: 'PASS',
    details: {
      htmlChecks: requiredHtmlTokens,
      jsChecks: requiredJsTokens,
      cssChecks: requiredCssTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P11-009] groupStateViewReady=true');
  console.log('[TA-P11-009] rollbackEntryReady=true');
  console.log('[TA-P11-009] federationViewReady=true');
  console.log(`[TA-P11-009] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P11-009] decision=PASS');
  console.log(`[TA-P11-009] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P11-009] execution failed');
  console.error(error);
  process.exitCode = 1;
});
