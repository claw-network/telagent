import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Phase13SdkParityReport {
  phase: 'Phase 13';
  taskId: 'TA-P13-006';
  generatedAt: string;
  summary: {
    coreMethodParityPass: boolean;
    apiPrefixParityPass: boolean;
    errorModelParityPass: boolean;
    pullConversationQueryParityPass: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function hasTsMethod(content: string, methodName: string): boolean {
  const pattern = new RegExp(`\\basync\\s+${methodName}\\s*\\(`);
  return pattern.test(content);
}

function hasPyMethod(content: string, methodName: string): boolean {
  const pattern = new RegExp(`\\bdef\\s+${methodName}\\s*\\(`);
  return pattern.test(content);
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P13_SDK_PARITY_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-13/manifests/2026-03-03-p13-sdk-parity-check.json');

  const tsSdkPath = path.resolve(repoRoot, 'packages/sdk/src/index.ts');
  const pySdkPath = path.resolve(repoRoot, 'packages/sdk-python/telagent_sdk/client.py');

  const [tsContent, pyContent] = await Promise.all([
    fs.readFile(tsSdkPath, 'utf8'),
    fs.readFile(pySdkPath, 'utf8'),
  ]);

  const methodPairs = [
    { ts: 'getSelfIdentity', py: 'get_self_identity' },
    { ts: 'getIdentity', py: 'get_identity' },
    { ts: 'createGroup', py: 'create_group' },
    { ts: 'sendMessage', py: 'send_message' },
    { ts: 'pullMessages', py: 'pull_messages' },
  ];

  const methodChecks = methodPairs.map((pair) => ({
    ...pair,
    tsExists: hasTsMethod(tsContent, pair.ts),
    pyExists: hasPyMethod(pyContent, pair.py),
  }));
  const coreMethodParityPass = methodChecks.every((item) => item.tsExists && item.pyExists);

  const tsApiPrefixCount = (tsContent.match(/\/api\/v1\//g) ?? []).length;
  const pyApiPrefixCount = (pyContent.match(/\/api\/v1\//g) ?? []).length;
  const apiPrefixParityPass = tsApiPrefixCount >= 3 && pyApiPrefixCount >= 3;

  const errorModelParityPass = tsContent.includes('TelagentSdkError')
    && tsContent.includes('normalizeProblem')
    && pyContent.includes('class TelagentSdkError')
    && pyContent.includes('_is_problem_response')
    && pyContent.includes('application/problem+json');

  const pullConversationQueryParityPass = tsContent.includes('conversation_id')
    && pyContent.includes('conversation_id');

  const report: Phase13SdkParityReport = {
    phase: 'Phase 13',
    taskId: 'TA-P13-006',
    generatedAt: new Date().toISOString(),
    summary: {
      coreMethodParityPass,
      apiPrefixParityPass,
      errorModelParityPass,
      pullConversationQueryParityPass,
    },
    decision: coreMethodParityPass && apiPrefixParityPass && errorModelParityPass && pullConversationQueryParityPass
      ? 'PASS'
      : 'FAIL',
    details: {
      files: {
        tsSdkPath,
        pySdkPath,
      },
      methodChecks,
      apiPrefix: {
        tsApiPrefixCount,
        pyApiPrefixCount,
      },
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P13-006] coreMethodParityPass=${coreMethodParityPass}`);
  console.log(`[TA-P13-006] apiPrefixParityPass=${apiPrefixParityPass}`);
  console.log(`[TA-P13-006] errorModelParityPass=${errorModelParityPass}`);
  console.log(`[TA-P13-006] pullConversationQueryParityPass=${pullConversationQueryParityPass}`);
  console.log(`[TA-P13-006] decision=${report.decision}`);
  console.log(`[TA-P13-006] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 13 SDK parity check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P13-006] execution failed');
  console.error(error);
  process.exitCode = 1;
});
