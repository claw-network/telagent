import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ChainConfigSchema, type ChainConfig } from './services/chain-config.js';

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  chain: ChainConfig;
}

export function loadConfigFromEnv(): AppConfig {
  const dataDir = process.env.TELAGENT_DATA_DIR || '.telagent';
  mkdirSync(dataDir, { recursive: true });

  const chain = ChainConfigSchema.parse({
    rpcUrl: process.env.TELAGENT_CHAIN_RPC_URL,
    chainId: Number(process.env.TELAGENT_CHAIN_ID || 7625),
    contracts: {
      identity: process.env.TELAGENT_IDENTITY_CONTRACT,
      token: process.env.TELAGENT_TOKEN_CONTRACT,
      router: process.env.TELAGENT_ROUTER_CONTRACT,
      telagentGroupRegistry: process.env.TELAGENT_GROUP_REGISTRY_CONTRACT,
    },
    signer: {
      type: process.env.TELAGENT_SIGNER_TYPE || 'env',
      envVar: process.env.TELAGENT_SIGNER_ENV || 'TELAGENT_PRIVATE_KEY',
      path: process.env.TELAGENT_SIGNER_PATH,
      index: Number(process.env.TELAGENT_SIGNER_INDEX || 0),
    },
    selfDid: process.env.TELAGENT_SELF_DID,
    finalityDepth: Number(process.env.TELAGENT_FINALITY_DEPTH || 12),
  });

  return {
    host: process.env.TELAGENT_API_HOST || '127.0.0.1',
    port: Number(process.env.TELAGENT_API_PORT || 9528),
    dataDir,
    chain,
  };
}

export function resolveDataPath(dataDir: string, filename: string): string {
  return join(dataDir, filename);
}
