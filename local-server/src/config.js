import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const autoKeyPath = resolve(__dirname, '..', 'vtt-public.pem')

const DEFAULTS = {
  port: 3001,
  dataDir: './data',
  publicKeyPath: existsSync(autoKeyPath) ? autoKeyPath : null,
  siteBaseUrl: 'https://hunt-website.pages.dev',
}

export function loadConfig() {
  const config = { ...DEFAULTS }

  if (process.env.LGS_PORT) config.port = parseInt(process.env.LGS_PORT, 10)
  if (process.env.LGS_DATA_DIR) config.dataDir = resolve(process.env.LGS_DATA_DIR)
  if (process.env.LGS_PUBLIC_KEY_PATH) config.publicKeyPath = resolve(process.env.LGS_PUBLIC_KEY_PATH)
  if (process.env.LGS_SITE_BASE_URL) config.siteBaseUrl = process.env.LGS_SITE_BASE_URL
  if (process.env.LGS_SERVER_URL) config.serverUrl = process.env.LGS_SERVER_URL
  if (process.env.LGS_AUTH_TOKEN) config.authToken = process.env.LGS_AUTH_TOKEN

  // Ensure data directory exists
  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true })
  }

  return config
}
