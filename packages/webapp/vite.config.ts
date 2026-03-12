import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Detect mkcert certificates for local HTTPS
const certPath = process.env.TELAGENT_TLS_CERT || path.join(homedir(), ".telagent", "tls", "cert.pem")
const keyPath = process.env.TELAGENT_TLS_KEY || path.join(homedir(), ".telagent", "tls", "key.pem")
const httpsConfig = existsSync(certPath) && existsSync(keyPath)
  ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
  : undefined

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
      "@telagent/sdk": path.resolve(dirname, "../sdk/src/index.ts"),
      "@telagent/protocol": path.resolve(dirname, "../protocol/src/index.ts"),
    },
  },
  server: {
    https: httpsConfig,
  },
})
