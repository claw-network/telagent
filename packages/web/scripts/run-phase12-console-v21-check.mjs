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
  const outputPath = process.env.P12_WEB_CONSOLE_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-12/manifests/2026-03-03-p12-web-console-v21-check.json');

  const html = await fs.readFile(path.resolve(webRoot, 'src/index.html'), 'utf8');
  const css = await fs.readFile(path.resolve(webRoot, 'src/styles.css'), 'utf8');
  const js = await fs.readFile(path.resolve(webRoot, 'src/main.js'), 'utf8');

  const requiredHtmlTokens = [
    'Audit & Emergency Panel v2.1',
    'btn-audit-snapshot',
    'btn-risk-refresh',
    'btn-fed-replay-pending-fill',
    'btn-fed-replay-batch',
    'fed-replay-ids',
    'audit-summary',
    'risk-board-list',
  ];
  const requiredJsTokens = [
    'fetchAuditSnapshot',
    'renderAuditSummary',
    'renderRiskBoard',
    'fillPendingReplayIds',
    'replayFederationDlqBatch',
    '/api/v1/node/audit-snapshot',
  ];
  const requiredCssTokens = [
    '.checkbox-label',
    '.textarea-label',
    '.risk-list',
    '.risk-row',
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
    phase: 'Phase 12',
    taskId: 'TA-P12-006',
    generatedAt: new Date().toISOString(),
    summary: {
      auditSnapshotPanelReady: true,
      riskBoardReady: true,
      dlqBatchReplayReady: true,
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

  console.log('[TA-P12-006] auditSnapshotPanelReady=true');
  console.log('[TA-P12-006] riskBoardReady=true');
  console.log('[TA-P12-006] dlqBatchReplayReady=true');
  console.log(`[TA-P12-006] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P12-006] decision=PASS');
  console.log(`[TA-P12-006] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P12-006] execution failed');
  console.error(error);
  process.exitCode = 1;
});
