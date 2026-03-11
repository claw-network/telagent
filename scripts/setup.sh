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
#      - Windows: NSSM Windows service (auto-downloads nssm.exe if needed)

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

install_windows_service() {
  info "Setting up Windows service via NSSM..."
  LOG_DIR="$HOME/.telagent/logs"
  mkdir -p "$LOG_DIR"

  # Convert Git Bash paths to Windows paths
  WIN_INSTALL_DIR=$(cygpath -w "$INSTALL_DIR")
  WIN_PNPM_PATH=$(cygpath -w "$PNPM_PATH" 2>/dev/null || echo "$PNPM_PATH")
  WIN_NODE_DIR=$(cygpath -w "${NODE_PATH%/*}" 2>/dev/null || echo "${NODE_PATH%/*}")
  WIN_LOG_DIR=$(cygpath -w "$LOG_DIR")

  # Use pnpm.cmd on Windows
  PNPM_CMD="${WIN_PNPM_PATH%.exe}"
  if [ -f "$(cygpath "${WIN_NODE_DIR}/pnpm.cmd" 2>/dev/null)" ]; then
    PNPM_CMD="${WIN_NODE_DIR}\\pnpm.cmd"
  fi

  # Check if NSSM is available
  NSSM_PATH=""
  if command -v nssm &>/dev/null; then
    NSSM_PATH="nssm"
  elif [ -f "$INSTALL_DIR/tools/nssm.exe" ]; then
    NSSM_PATH="$INSTALL_DIR/tools/nssm.exe"
  fi

  # Download NSSM if not found
  if [ -z "$NSSM_PATH" ]; then
    info "Downloading NSSM..."
    NSSM_DIR="$INSTALL_DIR/tools"
    mkdir -p "$NSSM_DIR"
    NSSM_ZIP="$NSSM_DIR/nssm.zip"

    powershell.exe -NoProfile -Command \
      "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '$(cygpath -w "$NSSM_ZIP")'" \
      || fail "Failed to download NSSM. Download manually from https://nssm.cc and place nssm.exe in $NSSM_DIR"

    # Extract the correct architecture binary
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
      NSSM_SUBDIR="nssm-2.24/win64"
    else
      NSSM_SUBDIR="nssm-2.24/win32"
    fi

    powershell.exe -NoProfile -Command \
      "Expand-Archive -Path '$(cygpath -w "$NSSM_ZIP")' -DestinationPath '$(cygpath -w "$NSSM_DIR")' -Force"

    cp "$NSSM_DIR/$NSSM_SUBDIR/nssm.exe" "$NSSM_DIR/nssm.exe"
    rm -rf "$NSSM_DIR/nssm-2.24" "$NSSM_ZIP"
    NSSM_PATH="$NSSM_DIR/nssm.exe"
    ok "NSSM downloaded to $NSSM_DIR/nssm.exe"
  fi

  # Remove existing service if present (ignore errors)
  "$NSSM_PATH" stop TelAgent 2>/dev/null || true
  "$NSSM_PATH" remove TelAgent confirm 2>/dev/null || true

  # Install the service
  "$NSSM_PATH" install TelAgent "$PNPM_CMD" "--filter @telagent/node start"
  "$NSSM_PATH" set TelAgent AppDirectory "$WIN_INSTALL_DIR"
  "$NSSM_PATH" set TelAgent DisplayName "TelAgent Node"
  "$NSSM_PATH" set TelAgent Description "TelAgent decentralized messaging node"
  "$NSSM_PATH" set TelAgent Start SERVICE_AUTO_START
  "$NSSM_PATH" set TelAgent AppStdout "$WIN_LOG_DIR\\telagent-stdout.log"
  "$NSSM_PATH" set TelAgent AppStderr "$WIN_LOG_DIR\\telagent-stderr.log"
  "$NSSM_PATH" set TelAgent AppStdoutCreationDisposition 4
  "$NSSM_PATH" set TelAgent AppStderrCreationDisposition 4
  "$NSSM_PATH" set TelAgent AppRotateFiles 1
  "$NSSM_PATH" set TelAgent AppRotateBytes 10485760
  "$NSSM_PATH" set TelAgent AppExit Default Restart
  "$NSSM_PATH" set TelAgent AppRestartDelay 3000

  # Start the service
  "$NSSM_PATH" start TelAgent

  ok "Windows service 'TelAgent' installed and started"
  echo ""
  echo "  Manage the service:"
  echo "    nssm status TelAgent"
  echo "    nssm stop TelAgent"
  echo "    nssm start TelAgent"
  echo "    nssm restart TelAgent"
  echo "    nssm edit TelAgent                                  # GUI editor"
  echo "    type %USERPROFILE%\\.telagent\\logs\\telagent-stderr.log   # logs"
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
    install_windows_service
    ;;
  *)
    start_foreground
    ;;
esac

# ── Wait for node to be ready ─────────────────────────────────────────
info "Waiting for TelAgent node to start..."
READY=false
for i in $(seq 1 15); do
  if curl -fs http://127.0.0.1:9529/api/v1/node/ &>/dev/null; then
    READY=true
    break
  fi
  sleep 2
done

echo ""
if [ "$READY" = true ]; then
  printf "${GREEN}${BOLD}TelAgent is running!${RESET}\n"
  echo ""
  NODE_INFO=$(curl -fs http://127.0.0.1:9529/api/v1/identities/self 2>/dev/null || echo '{}')
  DID=$(echo "$NODE_INFO" | jq -r '.data.did // empty' 2>/dev/null || true)
  if [ -n "$DID" ]; then
    printf "  ${BOLD}Your DID:${RESET}  %s\n" "$DID"
  fi
  echo ""
  echo "  Node API:  http://127.0.0.1:9529"
  echo ""
  echo "  Start the WebApp (optional):"
  echo "    cd ${INSTALL_DIR} && pnpm --filter @telagent/webapp dev"
  echo "    Then open http://localhost:5173 and enter your passphrase to connect."
else
  printf "${YELLOW}${BOLD}TelAgent installed but node may still be starting.${RESET}\n"
  echo ""
  echo "  Check status:"
  case "$OS" in
    Darwin*)
      echo "    launchctl list | grep telagent"
      echo "    tail -f ~/.telagent/logs/telagent-stderr.log"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "    nssm status TelAgent"
      echo "    type %USERPROFILE%\\.telagent\\logs\\telagent-stderr.log"
      ;;
    *)
      echo "    systemctl --user status telagent"
      echo "    journalctl --user -u telagent -f"
      ;;
  esac
  echo ""
  echo "  Once running, the API is at http://127.0.0.1:9529"
fi
echo ""
