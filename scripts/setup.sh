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
#   7. Installs and starts TelAgent as a system service
#      - Linux: systemd user service (~/.config/systemd/user/telagent.service)
#      - macOS: launchd agent (~/Library/LaunchAgents/org.telagent.node.plist)
#
# Windows users should use setup.ps1 (PowerShell) or setup.cmd instead.

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
  BACKUP=".env.backup.$(date +%Y%m%d%H%M%S)"
  warn ".env already exists, backing up to ${BACKUP}"
  cp .env "$BACKUP"
fi
{
  # Generate a random passphrase for ClawNet (32 hex chars)
  PASSPHRASE=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  # Generate a random keyfile password
  KEYFILE_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  # Generate keyfile (encrypted JSON keystore)
  KEYFILE_DIR="$HOME/.telagent/secrets"
  KEYFILE_PATH="$KEYFILE_DIR/signer-key.json"
  mkdir -p "$KEYFILE_DIR"
  chmod 700 "$KEYFILE_DIR"

  info "Generating encrypted keyfile..."
  KEY_OUTPUT=$(cd packages/node && node --input-type=module -e "
    import { Wallet } from 'ethers';
    import { writeFileSync } from 'node:fs';
    const w = Wallet.createRandom();
    const json = await w.encrypt('${KEYFILE_PASSWORD}');
    writeFileSync('${KEYFILE_PATH}', json, { mode: 0o600 });
    console.log(JSON.stringify({ address: w.address }));
  ")
  ADDRESS=$(echo "$KEY_OUTPUT" | jq -r '.address' 2>/dev/null || echo "$KEY_OUTPUT" | sed -n 's/.*"address":"\([^"]*\)".*/\1/p')

  info "Creating .env..."
  cp .env.example .env

  # Switch signer type from env to keyfile
  sed -i.bak "s|TELAGENT_SIGNER_TYPE=env|TELAGENT_SIGNER_TYPE=keyfile|" .env
  sed -i.bak "s|TELAGENT_SIGNER_ENV=TELAGENT_PRIVATE_KEY|# TELAGENT_SIGNER_ENV=TELAGENT_PRIVATE_KEY|" .env
  sed -i.bak "s|TELAGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY|# TELAGENT_PRIVATE_KEY=|" .env
  sed -i.bak "s|# TELAGENT_SIGNER_PATH=/absolute/path/to/signer.key|TELAGENT_SIGNER_PATH=${KEYFILE_PATH}|" .env
  sed -i.bak "s|TELAGENT_CLAWNET_PASSPHRASE=replace_with_secure_passphrase|TELAGENT_CLAWNET_PASSPHRASE=${PASSPHRASE}|" .env
  sed -i.bak "s|TELAGENT_GROUP_REGISTRY_CONTRACT=0x0000000000000000000000000000000000000000|TELAGENT_GROUP_REGISTRY_CONTRACT=0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e|" .env
  # Sync CLAW_SIGNER_* for on-chain identity registration (same keyfile)
  sed -i.bak "s|CLAW_SIGNER_TYPE=env|CLAW_SIGNER_TYPE=keyfile|" .env
  sed -i.bak "s|CLAW_SIGNER_ENV=TELAGENT_PRIVATE_KEY|# CLAW_SIGNER_ENV=TELAGENT_PRIVATE_KEY|" .env
  # Also set keyfile password so the node can decrypt it
  echo "" >> .env
  echo "# Keyfile decryption password (auto-generated by setup.sh)" >> .env
  echo "TELAGENT_SIGNER_PASSWORD=${KEYFILE_PASSWORD}" >> .env
  rm -f .env.bak

  ok ".env created"
  echo ""
  printf "  ${BOLD}Wallet address:${RESET}  %s\n" "$ADDRESS"
  printf "  ${BOLD}Keyfile:${RESET}         %s\n" "$KEYFILE_PATH"
  printf "  ${BOLD}Passphrase:${RESET}      %s\n" "$PASSPHRASE"
  echo ""
  warn "Save these values! The keyfile is encrypted at ${KEYFILE_PATH}."
  warn "The keyfile password and passphrase are in .env — do not commit it to git."
}

# ── Step 4b: Generate local TLS certificates (mkcert) ─────────────────
info "Setting up local HTTPS certificates..."
if bash "${INSTALL_DIR}/scripts/ensure-local-certs.sh"; then
  CERT_DIR="${TELAGENT_HOME:-$HOME/.telagent}/tls"
  MKCERT_BIN="${TELAGENT_HOME:-$HOME/.telagent}/bin/mkcert"
  # Also check PATH
  command -v mkcert &>/dev/null && MKCERT_BIN="$(command -v mkcert)"

  if [ -f "${CERT_DIR}/cert.pem" ] && [ -f "${CERT_DIR}/key.pem" ]; then
    # Enable TLS in .env
    sed -i.bak "s|# TELAGENT_TLS_CERT=/path/to/cert.pem|TELAGENT_TLS_CERT=${CERT_DIR}/cert.pem|" .env
    sed -i.bak "s|# TELAGENT_TLS_KEY=/path/to/key.pem|TELAGENT_TLS_KEY=${CERT_DIR}/key.pem|" .env
    sed -i.bak "s|# TELAGENT_TLS_PORT=9443|TELAGENT_TLS_PORT=9443|" .env
    rm -f .env.bak

    # Set NODE_EXTRA_CA_CERTS so Node.js trusts the mkcert CA
    CA_ROOT=$("$MKCERT_BIN" -CAROOT 2>/dev/null || true)
    if [ -n "$CA_ROOT" ] && [ -f "${CA_ROOT}/rootCA.pem" ]; then
      echo "" >> .env
      echo "# mkcert root CA (so Node.js trusts locally-issued certs)" >> .env
      echo "NODE_EXTRA_CA_CERTS=${CA_ROOT}/rootCA.pem" >> .env
    fi
    ok "TLS enabled: https://127.0.0.1:9443"
  fi
else
  warn "Certificate setup failed — continuing without TLS (plain HTTP)"
fi

# ── Step 5: Build workspace packages ─────────────────────────────────
info "Building workspace packages..."
pnpm --filter @telagent/protocol build
pnpm --filter @telagent/sdk build
ok "Workspace packages built"

# ── Step 6: Detect OS and install service ─────────────────────────────
OS="$(uname -s)"
PNPM_PATH="$(command -v pnpm)"
NODE_PATH="$(command -v node)"

install_linux_service() {
  info "Setting up systemd service..."
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"

  cat > "$SYSTEMD_DIR/telagent.service" << EOF
[Unit]
Description=TelAgent Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${PNPM_PATH} --filter @telagent/node start
Restart=always
RestartSec=3
Environment=PATH=${NODE_PATH%/*}:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable telagent.service
  systemctl --user start telagent.service

  # Enable lingering so the user service runs without an active login session
  if command -v loginctl &>/dev/null; then
    loginctl enable-linger "$(whoami)" 2>/dev/null || true
  fi

  ok "systemd user service installed and started"
  echo ""
  echo "  Manage the service:"
  echo "    systemctl --user status telagent"
  echo "    systemctl --user stop telagent"
  echo "    systemctl --user restart telagent"
  echo "    journalctl --user -u telagent -f"
}

install_macos_service() {
  info "Setting up launchd agent..."
  LAUNCH_DIR="$HOME/Library/LaunchAgents"
  PLIST="$LAUNCH_DIR/org.telagent.node.plist"
  LOG_DIR="$HOME/.telagent/logs"
  mkdir -p "$LAUNCH_DIR" "$LOG_DIR"

  cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>org.telagent.node</string>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PNPM_PATH}</string>
    <string>--filter</string>
    <string>@telagent/node</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${NODE_PATH%/*}:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/telagent-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/telagent-stderr.log</string>
</dict>
</plist>
EOF

  # Unload first if already loaded (ignore errors)
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"

  ok "launchd agent installed and started"
  echo ""
  echo "  Manage the service:"
  echo "    launchctl list | grep telagent"
  echo "    launchctl unload ~/Library/LaunchAgents/org.telagent.node.plist   # stop"
  echo "    launchctl load ~/Library/LaunchAgents/org.telagent.node.plist     # start"
  echo "    tail -f ~/.telagent/logs/telagent-stderr.log                     # logs"
}

start_foreground() {
  warn "Unsupported OS for service install: ${OS}"
  warn "Starting TelAgent in the foreground instead..."
  echo ""
  echo "  To start manually later:"
  echo "    cd ${INSTALL_DIR} && pnpm dev"
  echo ""
  cd "$INSTALL_DIR"
  exec pnpm dev
}

# ── Step 7: Start the service ─────────────────────────────────────────
echo ""
case "$OS" in
  Linux*)
    if command -v systemctl &>/dev/null; then
      install_linux_service
    else
      start_foreground
    fi
    ;;
  Darwin*)
    install_macos_service
    ;;
  MINGW*|MSYS*|CYGWIN*)
    fail "Windows detected. Please use setup.ps1 or setup.cmd instead:\n  PowerShell: iwr -useb https://install.telagent.org/setup.ps1 | iex\n  CMD:        curl -fsSL https://install.telagent.org/setup.cmd -o setup.cmd && setup.cmd && del setup.cmd"
    ;;
  *)
    start_foreground
    ;;
esac

# ── Wait for node to be ready ─────────────────────────────────────────
info "Waiting for TelAgent node to start..."
READY=false

# Determine health check URL based on TLS config
HEALTH_URL="http://127.0.0.1:9529/api/v1/node/"
API_URL="http://127.0.0.1:9529"
WEBAPP_URL="http://localhost:5173"
CURL_OPTS="-fs"
if grep -q '^TELAGENT_TLS_CERT=' .env 2>/dev/null; then
  HEALTH_URL="https://127.0.0.1:9443/api/v1/node/"
  API_URL="https://127.0.0.1:9443"
  WEBAPP_URL="https://localhost:5173"
  # Use --cacert if NODE_EXTRA_CA_CERTS is configured, otherwise --insecure
  CA_PEM=$(grep '^NODE_EXTRA_CA_CERTS=' .env 2>/dev/null | cut -d= -f2)
  if [ -n "$CA_PEM" ] && [ -f "$CA_PEM" ]; then
    CURL_OPTS="-fs --cacert ${CA_PEM}"
  else
    CURL_OPTS="-fsk"
  fi
fi

for i in $(seq 1 15); do
  if curl $CURL_OPTS "$HEALTH_URL" &>/dev/null; then
    READY=true
    break
  fi
  sleep 2
done

echo ""
if [ "$READY" = true ]; then
  printf "${GREEN}${BOLD}TelAgent is running!${RESET}\n"
  echo ""
  NODE_INFO=$(curl $CURL_OPTS "${API_URL}/api/v1/identities/self" 2>/dev/null || echo '{}')
  DID=$(echo "$NODE_INFO" | jq -r '.data.did // empty' 2>/dev/null || true)
  if [ -n "$DID" ]; then
    printf "  ${BOLD}Your DID:${RESET}  %s\n" "$DID"
  fi
  echo ""
  echo "  Node API:  ${API_URL}"
  echo ""
  echo "  Start the WebApp (optional):"
  echo "    cd ${INSTALL_DIR} && pnpm --filter @telagent/webapp dev"
  echo "    Then open ${WEBAPP_URL} and enter your passphrase to connect."
else
  printf "${YELLOW}${BOLD}TelAgent installed but node may still be starting.${RESET}\n"
  echo ""
  echo "  Check status:"
  case "$OS" in
    Darwin*)
      echo "    launchctl list | grep telagent"
      echo "    tail -f ~/.telagent/logs/telagent-stderr.log"
      ;;
    *)
      echo "    systemctl --user status telagent"
      echo "    journalctl --user -u telagent -f"
      ;;
  esac
  echo ""
  echo "  Once running, the API is at ${API_URL}"
fi
echo ""
