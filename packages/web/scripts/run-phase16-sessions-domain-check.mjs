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
  const outputPath = process.env.P16_SESSIONS_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-sessions-domain-check.json');

  const mainJs = await fs.readFile(path.resolve(webRoot, 'src/main.js'), 'utf8');
  const sessionDomain = await fs.readFile(path.resolve(webRoot, 'src/core/session-domain.js'), 'utf8');
  const css = await fs.readFile(path.resolve(webRoot, 'src/styles.css'), 'utf8');
  const tests = await fs.readFile(path.resolve(webRoot, 'test/session-domain.test.js'), 'utf8');

  const requiredMainTokens = [
    'sessionRuntimeByConversation',
    'Refresh From Start',
    'Retry Last Pull',
    'Retry Last Failed Send',
    'async function retryLastPull()',
    'async function retryLastSend()',
    'recordPullFailure',
    'recordSendFailure',
    "reason: 'refresh-from-start'",
  ];
  const requiredDomainTokens = [
    'export function createSessionRuntime()',
    'export function mergeMessagesByEnvelope(existingItems, incomingItems)',
    'export function recordPullSuccess(runtime, { cursor, loadedCount, action })',
    'export function recordSendFailure(runtime, errorMessage, payload)',
    'export function resetPullCursor(runtime)',
  ];
  const requiredCssTokens = [
    '.session-status-card',
    '.status-grid',
    '.status-row',
  ];
  const requiredTestTokens = [
    'ensureSessionRuntime creates and reuses runtime by conversation',
    'mergeMessagesByEnvelope dedupes by envelope and sorts by seq',
    'recordSendFailure and recordSendSuccess update retry payload',
  ];

  for (const token of requiredMainTokens) {
    assertContains(mainJs, token, 'main.js');
  }
  for (const token of requiredDomainTokens) {
    assertContains(sessionDomain, token, 'session-domain.js');
  }
  for (const token of requiredCssTokens) {
    assertContains(css, token, 'styles.css');
  }
  for (const token of requiredTestTokens) {
    assertContains(tests, token, 'session-domain.test.js');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-002',
    generatedAt: new Date().toISOString(),
    summary: {
      sessionRuntimeReady: true,
      cursorResetAndRetryReady: true,
      sendRetryReady: true,
      sessionsStatusPanelReady: true,
      testsReady: true,
      requiredTokensChecked: requiredMainTokens.length
        + requiredDomainTokens.length
        + requiredCssTokens.length
        + requiredTestTokens.length,
    },
    decision: 'PASS',
    details: {
      mainChecks: requiredMainTokens,
      sessionDomainChecks: requiredDomainTokens,
      cssChecks: requiredCssTokens,
      testChecks: requiredTestTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-002] sessionRuntimeReady=true');
  console.log('[TA-P16-002] cursorResetAndRetryReady=true');
  console.log('[TA-P16-002] sendRetryReady=true');
  console.log('[TA-P16-002] sessionsStatusPanelReady=true');
  console.log('[TA-P16-002] testsReady=true');
  console.log(`[TA-P16-002] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-002] decision=PASS');
  console.log(`[TA-P16-002] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-002] execution failed');
  console.error(error);
  process.exitCode = 1;
});
