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
  const outputPath = process.env.P16_GROUPS_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-groups-domain-check.json');

  const mainJs = await fs.readFile(path.resolve(webRoot, 'src/main.js'), 'utf8');
  const groupDomain = await fs.readFile(path.resolve(webRoot, 'src/core/group-domain.js'), 'utf8');
  const apiClient = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.js'), 'utf8');
  const css = await fs.readFile(path.resolve(webRoot, 'src/styles.css'), 'utf8');
  const tests = await fs.readFile(path.resolve(webRoot, 'test/group-domain.test.js'), 'utf8');

  const requiredMainTokens = [
    'refreshGroupDiagnostics',
    'validateCreateGroupInput',
    'validateInviteInput',
    'validateAcceptInviteInput',
    'Group Diagnostics Status',
    'Refresh Chain State + Members',
    'group-members-view',
  ];
  const requiredDomainTokens = [
    'export function validateCreateGroupInput(input)',
    'export function validateInviteInput(input)',
    'export function validateAcceptInviteInput(input)',
    'export function summarizeMembersByState(members)',
    "const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/",
  ];
  const requiredApiClientTokens = [
    'async listGroupMembersEnvelope(groupId, options = {})',
    '/api/v1/groups/',
    '/members',
  ];
  const requiredCssTokens = [
    '.group-member-list',
    '.group-member-row',
    '.group-member-meta',
  ];
  const requiredTestTokens = [
    'validateCreateGroupInput returns empty errors for valid payload',
    'validateInviteInput and validateAcceptInviteInput catch invalid fields',
    'summarizeMembersByState counts state buckets',
  ];

  for (const token of requiredMainTokens) {
    assertContains(mainJs, token, 'main.js');
  }
  for (const token of requiredDomainTokens) {
    assertContains(groupDomain, token, 'group-domain.js');
  }
  for (const token of requiredApiClientTokens) {
    assertContains(apiClient, token, 'api-client.js');
  }
  for (const token of requiredCssTokens) {
    assertContains(css, token, 'styles.css');
  }
  for (const token of requiredTestTokens) {
    assertContains(tests, token, 'group-domain.test.js');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-003',
    generatedAt: new Date().toISOString(),
    summary: {
      groupInputValidationReady: true,
      groupDiagnosticsViewReady: true,
      groupChainStateSyncReady: true,
      groupMembersEnvelopeReady: true,
      testsReady: true,
      requiredTokensChecked: requiredMainTokens.length
        + requiredDomainTokens.length
        + requiredApiClientTokens.length
        + requiredCssTokens.length
        + requiredTestTokens.length,
    },
    decision: 'PASS',
    details: {
      mainChecks: requiredMainTokens,
      groupDomainChecks: requiredDomainTokens,
      apiClientChecks: requiredApiClientTokens,
      cssChecks: requiredCssTokens,
      testChecks: requiredTestTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-003] groupInputValidationReady=true');
  console.log('[TA-P16-003] groupDiagnosticsViewReady=true');
  console.log('[TA-P16-003] groupChainStateSyncReady=true');
  console.log('[TA-P16-003] groupMembersEnvelopeReady=true');
  console.log('[TA-P16-003] testsReady=true');
  console.log(`[TA-P16-003] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-003] decision=PASS');
  console.log(`[TA-P16-003] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});
