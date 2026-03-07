import assert from 'node:assert/strict';
import test from 'node:test';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { GasService } from './gas-service.js';

test('assertSufficient throws INSUFFICIENT_GAS_TOKEN_BALANCE when native balance is not enough', () => {
  const service = new GasService({} as never);

  assert.throws(
    () =>
      service.assertSufficient({
        signer: '0x0000000000000000000000000000000000000001',
        nativeBalance: 1n,
        estimatedGas: 21_000n,
        estimatedFee: 2n,
        gasPrice: 1n,
        sufficient: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TelagentError);
      assert.equal(error.code, ErrorCodes.INSUFFICIENT_GAS_TOKEN_BALANCE);
      return true;
    },
  );
});
