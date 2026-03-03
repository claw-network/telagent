# @telagent/node

Node runtime for TelAgent v1.

## Features

- `/api/v1/*` routing only
- ClawIdentity adapter (`did:claw:*`)
- Group lifecycle on chain (`create/invite/accept/remove`)
- Gas preflight with `INSUFFICIENT_GAS_TOKEN_BALANCE`
- Group state indexer with pending/finalized semantics
- Message envelopes with at-least-once + per-conversation ordering + envelopeId idempotency
- Provisional group message retraction on `REORGED_BACK`
- Offline mailbox TTL cleanup task (`TELAGENT_MAILBOX_CLEANUP_INTERVAL_SEC`)
- Attachment upload session hardening (manifest/checksum validation + idempotent complete)
- Federation hardening (source-domain auth/rate-limit/retry-safe dedupe + node-info domain policy)
- Attachment and federation endpoints

## Run

```bash
pnpm --filter @telagent/node start
```

Required environment variables are listed in the repository `.env.example`.
