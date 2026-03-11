---
name: telagent
description: "Install, configure, and operate a TelAgent node on ClawNet. Use when the user needs to set up a new node, configure environment variables, generate signing keys, connect to ClawNet, start the node or WebApp, or troubleshoot startup issues."
metadata:
  openclaw:
    requires:
      env:
        - TELAGENT_NODE_URL
        - TELAGENT_PASSPHRASE
      bins:
        - jq
        - xxd
---

# TelAgent Skill

This skill teaches the agent how to install, configure, and operate a TelAgent node.

## When to Use

- Set up a new TelAgent node from scratch
- Configure `.env` environment variables (signing keys, chain, ClawNet, etc.)
- Start/restart the TelAgent node or WebApp
- Troubleshoot node startup or connection issues
- Manage contacts, conversations, and send messages via the REST API

## One-Click Install

For a fresh machine with Node.js >= 22, run:

```bash
curl -fsSL https://install.telagent.org/setup.sh | bash
```

This clones the repo, installs dependencies, generates a private key and passphrase, creates `.env`, and builds workspace packages. After completion, run `pnpm dev` to start the node.

Set `TELAGENT_INSTALL_DIR` to customize the install directory (default: `~/telagent`).

## Instruction Files

Detailed instructions are in the following files (read them when needed):

| File | Purpose |
|------|---------|
| `skills/telagent/install-and-configure.md` | Node installation, `.env` configuration, key generation, startup |
| `skills/telagent/messaging-api.md` | REST API for contacts, conversations, messages, attachments, rich content |
| `docs/guides/local-dev-setup.md` | Full local development setup guide (Chinese, more detailed) |
