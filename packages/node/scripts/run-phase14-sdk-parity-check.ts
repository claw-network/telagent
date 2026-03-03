import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Phase14SdkParityReport {
  phase: 'Phase 14';
  taskId: 'TA-P14-005';
  generatedAt: string;
  summary: {
    coreMethodParityPass: boolean;
    apiPrefixParityPass: boolean;
    errorModelParityPass: boolean;
    identityEncodingParityPass: boolean;
    directAclErrorSemanticsParityPass: boolean;
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
  const outputPath = process.env.P14_SDK_PARITY_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-14/manifests/2026-03-03-p14-sdk-parity-check.json');

  const tsSdkPath = path.resolve(repoRoot, 'packages/sdk/src/index.ts');
  const pySdkPath = path.resolve(repoRoot, 'packages/sdk-python/telagent_sdk/client.py');
  const tsTestPath = path.resolve(repoRoot, 'packages/sdk/src/index.test.ts');
  const pyTestPath = path.resolve(repoRoot, 'packages/sdk-python/tests/test_client.py');

  const [tsContent, pyContent, tsTestContent, pyTestContent] = await Promise.all([
    fs.readFile(tsSdkPath, 'utf8'),
    fs.readFile(pySdkPath, 'utf8'),
    fs.readFile(tsTestPath, 'utf8'),
    fs.readFile(pyTestPath, 'utf8'),
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
  const coreMethodParityPass = methodChecks.every((check) => check.tsExists && check.pyExists);

  const tsApiPrefixCount = (tsContent.match(/\/api\/v1\//g) ?? []).length;
  const pyApiPrefixCount = (pyContent.match(/\/api\/v1\//g) ?? []).length;
  const apiPrefixParityPass = tsApiPrefixCount >= 3 && pyApiPrefixCount >= 3;

  const errorModelParityPass = tsContent.includes('export class TelagentSdkError')
    && tsContent.includes('normalizeProblem')
    && pyContent.includes('class TelagentSdkError')
    && pyContent.includes('_is_problem_response')
    && pyContent.includes('application/problem+json');

  const identityEncodingParityPass = tsContent.includes('encodeURIComponent(did)')
    && pyContent.includes("quote(did, safe='')");

  const directAclErrorSemanticsParityPass = tsTestContent.includes('FORBIDDEN')
    && tsTestContent.includes('direct conversation participant')
    && pyTestContent.includes('FORBIDDEN')
    && pyTestContent.includes('direct conversation participant');

  const report: Phase14SdkParityReport = {
    phase: 'Phase 14',
    taskId: 'TA-P14-005',
    generatedAt: new Date().toISOString(),
    summary: {
      coreMethodParityPass,
      apiPrefixParityPass,
      errorModelParityPass,
      identityEncodingParityPass,
      directAclErrorSemanticsParityPass,
    },
    decision:
      coreMethodParityPass
      && apiPrefixParityPass
      && errorModelParityPass
      && identityEncodingParityPass
      && directAclErrorSemanticsParityPass
        ? 'PASS'
        : 'FAIL',
    details: {
      files: {
        tsSdkPath,
        pySdkPath,
        tsTestPath,
        pyTestPath,
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

  console.log(`[TA-P14-005] coreMethodParityPass=${coreMethodParityPass}`);
  console.log(`[TA-P14-005] apiPrefixParityPass=${apiPrefixParityPass}`);
  console.log(`[TA-P14-005] errorModelParityPass=${errorModelParityPass}`);
  console.log(`[TA-P14-005] identityEncodingParityPass=${identityEncodingParityPass}`);
  console.log(`[TA-P14-005] directAclErrorSemanticsParityPass=${directAclErrorSemanticsParityPass}`);
  console.log(`[TA-P14-005] decision=${report.decision}`);
  console.log(`[TA-P14-005] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 14 SDK parity check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P14-005] execution failed');
  console.error(error);
  process.exitCode = 1;
});
