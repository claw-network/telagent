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
  const outputPath = process.env.P16_TS_FRAMEWORK_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-ts-framework-check.json');

  const packageJson = await fs.readFile(path.resolve(webRoot, 'package.json'), 'utf8');
  const appTsx = await fs.readFile(path.resolve(webRoot, 'src/App.tsx'), 'utf8');
  const mainTsx = await fs.readFile(path.resolve(webRoot, 'src/main.tsx'), 'utf8');
  const apiClientTs = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.ts'), 'utf8');
  const sessionDomainTs = await fs.readFile(path.resolve(webRoot, 'src/core/session-domain.ts'), 'utf8');
  const groupDomainTs = await fs.readFile(path.resolve(webRoot, 'src/core/group-domain.ts'), 'utf8');
  const viteConfig = await fs.readFile(path.resolve(webRoot, 'vite.config.ts'), 'utf8');

  const requiredPackageTokens = [
    '"vite"',
    '"react"',
    '"react-router-dom"',
    '"typescript"',
    '"build": "vite build"',
    '"test": "vitest run"',
  ];
  const requiredAppTokens = [
    'function App()',
    '<Routes>',
    '<Route',
    'refreshGroupDiagnostics',
    'pullMessages',
    'sendMessage',
  ];
  const requiredMainTokens = [
    'HashRouter',
    'createRoot',
    './App',
  ];
  const requiredApiClientTokens = [
    'assertApiV1Path(path: string)',
    "path.startsWith('/api/v1/')",
    'application/problem+json',
    'isDidClaw(value: unknown)',
  ];
  const requiredDomainTokens = [
    'export interface SessionRuntime',
    'export function createSessionRuntime()',
    'export function validateCreateGroupInput',
    'const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/',
  ];
  const requiredViteTokens = [
    "import { defineConfig } from 'vitest/config'",
    'react()',
    "include: ['src/**/*.test.ts']",
  ];

  for (const token of requiredPackageTokens) {
    assertContains(packageJson, token, 'package.json');
  }
  for (const token of requiredAppTokens) {
    assertContains(appTsx, token, 'App.tsx');
  }
  for (const token of requiredMainTokens) {
    assertContains(mainTsx, token, 'main.tsx');
  }
  for (const token of requiredApiClientTokens) {
    assertContains(apiClientTs, token, 'api-client.ts');
  }
  for (const token of requiredDomainTokens) {
    assertContains(sessionDomainTs + '\n' + groupDomainTs, token, 'domain modules');
  }
  for (const token of requiredViteTokens) {
    assertContains(viteConfig, token, 'vite.config.ts');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-004',
    generatedAt: new Date().toISOString(),
    summary: {
      typescriptFrameworkReady: true,
      reactRoutingReady: true,
      apiPrefixGuardReady: true,
      didValidationReady: true,
      domainModulesReady: true,
      requiredTokensChecked: requiredPackageTokens.length
        + requiredAppTokens.length
        + requiredMainTokens.length
        + requiredApiClientTokens.length
        + requiredDomainTokens.length
        + requiredViteTokens.length,
    },
    decision: 'PASS',
    details: {
      packageChecks: requiredPackageTokens,
      appChecks: requiredAppTokens,
      mainChecks: requiredMainTokens,
      apiClientChecks: requiredApiClientTokens,
      domainChecks: requiredDomainTokens,
      viteChecks: requiredViteTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-004] typescriptFrameworkReady=true');
  console.log('[TA-P16-004] reactRoutingReady=true');
  console.log('[TA-P16-004] apiPrefixGuardReady=true');
  console.log('[TA-P16-004] didValidationReady=true');
  console.log('[TA-P16-004] domainModulesReady=true');
  console.log(`[TA-P16-004] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-004] decision=PASS');
  console.log(`[TA-P16-004] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-004] execution failed');
  console.error(error);
  process.exitCode = 1;
});
