# @telagent/sdk

TypeScript SDK for TelAgent `/api/v1/*`.

## Install

```bash
pnpm add @telagent/sdk
```

## Quickstart

```ts
import { TelagentSdk } from '@telagent/sdk';

const sdk = new TelagentSdk({
  baseUrl: 'https://node-a.telagent.dev',
});

const group = await sdk.createGroup({
  creatorDid: 'did:claw:zAlice',
  groupId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  groupDomain: 'alpha.tel',
  domainProofHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  initialMlsStateHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
});

await sdk.sendMessage({
  senderDid: 'did:claw:zAlice',
  conversationId: `group:${group.group.groupId}`,
  conversationType: 'group',
  targetDomain: 'alpha.tel',
  targetDid: 'did:claw:zBob',
  mailboxKeyId: 'mls-key-v1',
  sealedHeader: '0x11',
  ciphertext: '0x22',
  contentType: 'text',
  ttlSec: 3600,
});
```

## Notes

- API base path is fixed to `/api/v1/*`.
- Successful responses use `{ data, links? }` or paginated `{ data, meta, links }`.
- RFC7807 errors are raised as `TelagentSdkError`.
