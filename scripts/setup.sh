#!/usr/bin/env bash
# TelAgent one-click local setup script
# Usage: curl -fsSL https://install.telagent.org/setup.sh | bash
#
# What it does:
#   1. Checks prerequisites (Node.js >=22, pnpm >=10, git, jq)
#   2. Clones the TelAgent repo (or pulls if already cloned)
#   3. Installs dependencies via pnpm
#   4. Generates a private key and passphrase
#   5. Creates .env from template with generated values
#   6. Builds workspace packages
#   7. Prints next steps

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}[info]${RESET}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ok]${RESET}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[warn]${RESET}  %s\n" "$*"; }
fail()  { printf "${RED}[error]${RESET} %s\n" "$*"; exit 1; }

# ── Config ────────────────────────────────────────────────────────────
REPO_URL="https://github.com/claw-network/telagent.git"
INSTALL_DIR="${TELAGENT_INSTALL_DIR:-$HOME/telagent}"
NODE_MIN=22
NODE_MAX=24

# ── Step 1: Prerequisites ────────────────────────────────────────────
info "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js >= ${NODE_MIN} first: https://nodejs.org or use fnm/nvm"
fi
NODE_VER=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt "$NODE_MIN" ] || [ "$NODE_MAJOR" -gt "$NODE_MAX" ]; then
  fail "Node.js v${NODE_VER} is not supported. Need >= ${NODE_MIN} < $((NODE_MAX + 1)). Use: fnm install ${NODE_MIN} && fnm use ${NODE_MIN}"
fi
ok "Node.js v${NODE_VER}"

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "pnpm not found, installing via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
PNPM_VER=$(pnpm -v)
PNPM_MAJOR=$(echo "$PNPM_VER" | cut -d. -f1)
if [ "$PNPM_MAJOR" -lt 10 ]; then
  fail "pnpm ${PNPM_VER} is too old. Need >= 10. Run: corepack prepare pnpm@latest --activate"
fi
ok "pnpm v${PNPM_VER}"

# git
if ! command -v git &>/dev/null; then
  fail "git not found. Install git first."
fi
ok "git $(git --version | awk '{print $3}')"

# jq (optional but recommended)
if ! command -v jq &>/dev/null; then
  warn "jq not found. Optional but recommended for API usage. Install: brew install jq (macOS) or apt install jq (Linux)"
fi

# ── Step 2: Clone or update repo ─────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing repo found at ${INSTALL_DIR}, pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning TelAgent to ${INSTALL_DIR}..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repo ready at ${INSTALL_DIR}"

cd "$INSTALL_DIR"

# ── Step 3: Install dependencies ─────────────────────────────────────
info "Installing dependencies (this may take a minute)..."
pnpm install --frozen-lockfile
ok "Dependencies installed"

# ── Step 4: Generate .env ─────────────────────────────────────────────
if [ -f .env ]; then
  warn ".env already exists, skipping generation. Delete it and re-run to regenerate."
else
  info "Generating private key..."

  KEY_OUTPUT=$(cd packages/node && node --input-type=module -e "
    import { Wallet } from 'ethers';
    const w = Wallet.createRandom();
    console.log(JSON.stringify({ privateKey: w.privateKey, address: w.address }));
  ")
  PRIVATE_KEY=$(echo "$KEY_OUTPUT" | jq -r '.privateKey' 2>/dev/null || echo "$KEY_OUTPUT" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')
  ADDRESS=$(echo "$KEY_OUTPUT" | jq -r '.address' 2>/dev/null || echo "$KEY_OUTPUT" | sed -n 's/.*"address":"\([^"]*\)".*/\1/p')

  # Generate a random passphrase (32 hex chars)
  PASSPHRASE=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  info "Creating .env..."
  cp .env.example .env

  # Replace placeholder values
  sed -i.bak "s|TELAGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY|TELAGENT_PRIVATE_KEY=${PRIVATE_KEY}|" .env
  sed -i.bak "s|TELAGENT_CLAWNET_PASSPHRASE=replace_with_secure_passphrase|TELAGENT_CLAWNET_PASSPHRASE=${PASSPHRASE}|" .env
  rm -f .env.bak

  ok ".env created"
  echo ""
  printf "  ${BOLD}Wallet address:${RESET}  %s\n" "$ADDRESS"
  printf "  ${BOLD}Passphrase:${RESET}      %s\n" "$PASSPHRASE"
  echo ""
  warn "Save these values! The private key is in .env — do not commit it to git."
fi

# ── Step 5: Build workspace packages ─────────────────────────────────
info "Building workspace packages..."
pnpm --filter @telagent/protocol build
pnpm --filter @telagent/sdk build
ok "Workspace packages built"

# ── Done ──────────────────────────────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}TelAgent is ready!${RESET}\n"
echo ""
echo "  Start the node:"
echo "    cd ${INSTALL_DIR} && pnpm dev"
echo ""
echo "  Start the WebApp (in another terminal):"
echo "    cd ${INSTALL_DIR} && pnpm --filter @telagent/webapp dev"
echo ""
echo "  Then open http://localhost:5173 and enter your passphrase to connect."
echo ""
