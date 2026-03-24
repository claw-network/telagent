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

For a fresh machine with Node.js >= 22:

**Linux / macOS:**
```bash
curl -fsSL https://install.telagent.org/setup.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://install.telagent.org/setup.ps1 | iex
```

**Windows CMD:**
```cmd
curl -fsSL https://install.telagent.org/setup.cmd -o setup.cmd && setup.cmd && del setup.cmd
```

This clones the repo, installs dependencies, generates a private key and passphrase, creates `.env`, builds workspace packages, and installs a background service. After completion the node should already be running; use `pnpm dev` only when you want a foreground local-dev process from the repo checkout.

Set `TELAGENT_INSTALL_DIR` to customize the install directory (default: `~/telagent` on Linux/macOS, `%USERPROFILE%\\telagent` on Windows).

## Instruction Files

Detailed instructions are in the following files (read them when needed):

| File | Purpose |
|------|---------|
| `skills/telagent/install-and-configure.md` | Node installation, `.env` configuration, key generation, startup |
| `skills/telagent/messaging-api.md` | REST API for contacts, conversations, messages, attachments, rich content |
| `docs/local-dev-setup.md` | Full local development setup guide |
