import { z } from 'zod';

const EthAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

export const ContractAddressesSchema = z.object({
  identity: EthAddress,
  token: EthAddress,
  router: EthAddress.optional(),
  telagentGroupRegistry: EthAddress,
});

export const SignerConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('env'),
    envVar: z.string().default('TELAGENT_PRIVATE_KEY'),
  }),
  z.object({
    type: z.literal('keyfile'),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal('mnemonic'),
    envVar: z.string().default('TELAGENT_MNEMONIC'),
    index: z.number().int().nonnegative().default(0),
  }),
]);

export const ChainConfigSchema = z.object({
  rpcUrl: z.string().min(1),
  chainId: z.number().int().positive(),
  contracts: ContractAddressesSchema,
  signer: SignerConfigSchema,
  selfDid: z.string().regex(/^did:claw:[A-Za-z0-9]+$/),
  finalityDepth: z.number().int().min(1).default(12),
});

export type ChainConfig = z.infer<typeof ChainConfigSchema>;
export type ContractAddresses = z.infer<typeof ContractAddressesSchema>;
export type SignerConfig = z.infer<typeof SignerConfigSchema>;
