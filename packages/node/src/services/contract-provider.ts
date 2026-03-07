import { readFileSync } from 'node:fs';

import {
  Contract,
  FeeData,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  type Signer,
} from 'ethers';

import type { ChainConfig } from './chain-config.js';
import { TELAGENT_GROUP_REGISTRY_ABI } from './abis.js';

export class ContractProvider {
  readonly provider: JsonRpcProvider;
  readonly signer: NonceManager;
  readonly signerAddress: string;

  // 仅保留 TelAgent 自有合约
  readonly telagentGroupRegistry: Contract;

  constructor(readonly config: ChainConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: 'clawnet',
    });

    // ClawNet is a zero-gas chain — override fee data to avoid querying the node
    this.provider.getFeeData = async () => new FeeData(0n, 0n, 0n);

    const signer = this.resolveSigner();
    this.signer = new NonceManager(signer);
    this.signerAddress = signer.address;

    this.telagentGroupRegistry = new Contract(
      config.contracts.telagentGroupRegistry,
      TELAGENT_GROUP_REGISTRY_ABI,
      this.signer,
    );
  }

  async destroy(): Promise<void> {
    this.provider.destroy();
  }

  private resolveSigner(): Wallet {
    const cfg = this.config.signer;

    if (cfg.type === 'env') {
      const privateKey = process.env[cfg.envVar];
      if (!privateKey) {
        throw new Error(`Signer env var ${cfg.envVar} is not set`);
      }
      return new Wallet(privateKey, this.provider);
    }

    if (cfg.type === 'keyfile') {
      const raw = readFileSync(cfg.path, 'utf8').trim();
      let privateKey: string;
      try {
        const parsed = JSON.parse(raw) as { privateKey?: string };
        privateKey = parsed.privateKey ?? raw;
      } catch {
        privateKey = raw;
      }
      return new Wallet(privateKey, this.provider);
    }

    const mnemonic = process.env[cfg.envVar];
    if (!mnemonic) {
      throw new Error(`Mnemonic env var ${cfg.envVar} is not set`);
    }
    const path = `m/44'/60'/0'/0/${cfg.index}`;
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    return new Wallet(wallet.privateKey, this.provider);
  }
}
