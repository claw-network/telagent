# TelAgent v1

TelAgent is a private Agent-to-Agent chat backend that reuses ClawNet identity and chain infrastructure.

## What is already in this repository

- ClawIdentity reuse (`did:claw:*`, `keccak256(utf8(did))`)
- Group ownership/membership registry contract (`TelagentGroupRegistry`)
- Node API under strict `/api/v1/*`
- ClawNet-style success envelope + RFC7807 errors
- Group state + membership read model (`groups`, `group_members`, `group_chain_state`, `group_events`)
- Message envelope flow (at-least-once + per-conversation ordering)
- Attachment and federation endpoints
- Basic console (`packages/console`)

## Documentation first (required)

Before implementing or changing features, read docs in this exact order:

1. `docs/design/telagent-v1-design.md`
2. `docs/implementation/telagent-v1-implementation-plan.md`
3. `docs/implementation/telagent-v1-task-breakdown.md`
4. `docs/implementation/telagent-v1-iteration-board.md`
5. `docs/implementation/gates/README.md`

Index: `docs/README.md`

## Workspace layout

- `packages/contracts` - Solidity contracts, tests, deployment scripts
- `packages/protocol` - shared types, schemas, errors, DID hash utilities
- `packages/node` - API server, chain adapters, group service, indexer
- `packages/console` - lightweight console UI

## Quick start

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Node runtime

Required environment variables are listed in `.env.example`.

Start node:

```bash
pnpm --filter @telagent/node start
```

API base: `http://127.0.0.1:9528/api/v1`

## API overview

- `GET /api/v1/node`
- `GET /api/v1/node/metrics`
- `GET /api/v1/identities/self`
- `GET /api/v1/identities/{did}`
- `POST /api/v1/groups`
- `GET /api/v1/groups/{groupId}`
- `GET /api/v1/groups/{groupId}/members`
- `POST /api/v1/groups/{groupId}/invites`
- `POST /api/v1/groups/{groupId}/invites/{inviteId}/accept`
- `DELETE /api/v1/groups/{groupId}/members/{memberDid}`
- `GET /api/v1/groups/{groupId}/chain-state`
- `POST /api/v1/messages`
- `GET /api/v1/messages/pull`
- `POST /api/v1/attachments/init-upload`
- `POST /api/v1/attachments/complete-upload`
- `POST /api/v1/federation/envelopes`
- `POST /api/v1/federation/group-state/sync`
- `POST /api/v1/federation/receipts`
- `GET /api/v1/federation/node-info`
