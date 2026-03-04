import { ErrorCodes, TelagentError } from '@telagent/protocol';
import { formatEther } from 'ethers';

import type { ContractProvider } from './contract-provider.js';

export interface GasPreflightResult {
  signer: string;
  nativeBalanceWei: bigint;
  estimatedGas: bigint;
  estimatedFeeWei: bigint;
  gasPriceWei: bigint;
  sufficient: boolean;
}

export class GasService {
  constructor(private readonly contracts: ContractProvider) {}

  async getNativeGasBalance(address?: string): Promise<bigint> {
    return this.contracts.provider.getBalance(address ?? this.contracts.signerAddress);
  }

  // getTokenBalance() 已删除 — Token 余额通过 ClawNet SDK 查询:
  // clawnetGateway.getBalance({ did })

  async preflight(tx: { to: string; data: string }): Promise<GasPreflightResult> {
    const signer = this.contracts.signerAddress;

    const [nativeBalanceWei, feeData, estimatedGas] = await Promise.all([
      this.contracts.provider.getBalance(signer),
      this.contracts.provider.getFeeData(),
      this.contracts.provider.estimateGas({ from: signer, to: tx.to, data: tx.data }),
    ]);

    const gasPriceWei = feeData.gasPrice ?? 0n;
    const estimatedFeeWei = estimatedGas * gasPriceWei;
    const sufficient = nativeBalanceWei >= estimatedFeeWei;

    return {
      signer,
      nativeBalanceWei,
      estimatedGas,
      estimatedFeeWei,
      gasPriceWei,
      sufficient,
    };
  }

  assertSufficient(result: GasPreflightResult): void {
    if (result.sufficient) {
      return;
    }

    throw new TelagentError(
      ErrorCodes.INSUFFICIENT_GAS_TOKEN_BALANCE,
      `Insufficient gas token balance: have ${formatEther(result.nativeBalanceWei)} native, need ${formatEther(result.estimatedFeeWei)} native`,
    );
  }
}
