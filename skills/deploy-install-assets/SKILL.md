---
name: deploy-install-assets
description: "Deploy setup.sh, setup.ps1, setup.cmd and mkcert binaries to the install.telagent.org static site on the Alex server. Handles upload, Caddy config verification, and HTTPS download validation. USE FOR: deploy setup.sh, deploy setup.ps1, deploy setup.cmd, upload mkcert binaries, update install.telagent.org, refresh install assets, publish install script. SSH key: ~/.ssh/id_ed25519_clawnet"
---

# Deploy Install Assets

Deploy the TelAgent one-click install scripts (`setup.sh`, `setup.ps1`, `setup.cmd`) and self-hosted mkcert binaries to `install.telagent.org` on the Alex server.

## What Gets Deployed

| Asset | Local Path | Remote Path | URL |
|-------|-----------|-------------|-----|
| setup.sh (Linux/Mac) | `scripts/setup.sh` | `/var/www/install.telagent.org/setup.sh` | `https://install.telagent.org/setup.sh` |
| setup.ps1 (Windows PowerShell) | `scripts/setup.ps1` | `/var/www/install.telagent.org/setup.ps1` | `https://install.telagent.org/setup.ps1` |
| setup.cmd (Windows CMD) | `scripts/setup.cmd` | `/var/www/install.telagent.org/setup.cmd` | `https://install.telagent.org/setup.cmd` |
| mkcert binaries (×6) | `scripts/mkcert/mkcert-v*` | `/var/www/install.telagent.org/binaries/mkcert/` | `https://install.telagent.org/binaries/mkcert/<name>` |

### mkcert Binary Variants (v1.4.4)

| Filename | Platform |
|----------|----------|
| `mkcert-v1.4.4-darwin-amd64` | macOS Intel |
| `mkcert-v1.4.4-darwin-arm64` | macOS Apple Silicon |
| `mkcert-v1.4.4-linux-amd64` | Linux x86_64 |
| `mkcert-v1.4.4-linux-arm` | Linux ARM 32-bit |
| `mkcert-v1.4.4-linux-arm64` | Linux ARM 64-bit |
| `mkcert-v1.4.4-windows-amd64.exe` | Windows x86_64 |

## Server Details

| Key | Value |
|-----|-------|
| Host | `173.249.46.252` (alex) |
| SSH User | `root` |
| SSH Key | `~/.ssh/id_ed25519_clawnet` |
| Web Root | `/var/www/install.telagent.org/` |
| Domain | `install.telagent.org` |
| Reverse Proxy | Caddy (auto-TLS via Let's Encrypt) |

## One-Click Deploy

```bash
bash scripts/deploy-install-assets.sh
```

The script performs all steps automatically:
1. **Pre-flight checks** — SSH key, local files (setup.sh/ps1/cmd), SSH connectivity
2. **Remote env checks** — Caddy active, site block exists, `file_server` directive, root dir, `@binaries` matcher
3. **Upload setup scripts** — scp setup.sh (chmod 755) + setup.ps1 + setup.cmd (chmod 644) + size verification
4. **Upload mkcert binaries** — scp all 6 variants + chmod 644
5. **Remote file listing** — prints uploaded files with sizes
6. **HTTPS verification** — curls every URL, expects HTTP 200

## Caddy Configuration

The `install.telagent.org` site in `/etc/caddy/Caddyfile` must have:

```caddyfile
install.telagent.org {
    root * /var/www/install.telagent.org

    @shellscript path *.sh
    header @shellscript Content-Type text/plain

    @binaries path /binaries/*
    header @binaries Content-Type application/octet-stream

    file_server
}
```

**Key points:**
- `@shellscript` matcher ensures `.sh` files are served as `text/plain` (for `curl | bash`)
- `@binaries` matcher ensures binary downloads get `application/octet-stream` (not `text/plain`)
- `.ps1` and `.cmd` files use Caddy's default MIME types (fine for `iwr | iex` and `curl -o`)
- Without matchers, all files inherit one Content-Type, breaking either script piping or binary downloads

## Manual Verification

```bash
# Verify setup.sh is downloadable and executable
curl -fsSL https://install.telagent.org/setup.sh | head -5

# Verify setup.ps1 is downloadable
curl -fsSL https://install.telagent.org/setup.ps1 | head -5

# Verify a mkcert binary returns correct Content-Type
curl -sI https://install.telagent.org/binaries/mkcert/mkcert-v1.4.4-darwin-arm64 | grep -i content-type
# → content-type: application/octet-stream

# End-user one-click install
# Linux/Mac:
curl -fsSL https://install.telagent.org/setup.sh | bash
# Windows PowerShell:
# iwr -useb https://install.telagent.org/setup.ps1 | iex
# Windows CMD:
# curl -fsSL https://install.telagent.org/setup.cmd -o setup.cmd && setup.cmd && del setup.cmd
```

## Related Files

- `scripts/deploy-install-assets.sh` — The deploy script
- `scripts/setup.sh` — Install script for Linux/Mac
- `scripts/setup.ps1` — Install script for Windows PowerShell
- `scripts/setup.cmd` — Install script for Windows CMD (thin wrapper, delegates to setup.ps1)
- `scripts/ensure-local-certs.sh` — Local cert generation (called by setup.sh)
- `scripts/mkcert/` — Local copy of mkcert binaries to upload
