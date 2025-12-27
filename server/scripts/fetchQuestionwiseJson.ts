import { chromium } from 'playwright'
import { config } from 'dotenv'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

config()

const requiredEnv = (key: string) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing ${key} in environment.`)
  }
  return value
}

const baseUrl = process.env.SCRAPER_BASE_URL ?? 'https://test.z7i.in'
const username = requiredEnv('TEST_Z7I_USERNAME')
const password = requiredEnv('TEST_Z7I_PASSWORD')
const otp = process.env.TEST_Z7I_OTP
const reportId = process.argv[2] ?? process.env.TEST_Z7I_REPORT_ID
const headless = (process.env.SCRAPER_HEADLESS ?? 'true') === 'true'
const timeoutMs = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '30000', 10)
const debugDir = process.env.SCRAPER_DEBUG_DIR ?? './.scraper'

const ensureDebugDir = async () => {
  await mkdir(debugDir, { recursive: true })
  return debugDir
}

const saveFile = async (name: string, payload: string) => {
  const dir = await ensureDebugDir()
  const filePath = join(dir, name)
  await writeFile(filePath, payload, 'utf8')
  console.log(`Saved ${filePath}`)
}

const login = async (page: import('playwright').Page) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

  if (page.url().includes('/student/')) {
    return
  }

  const loginTrigger = page.locator('a.login').first()
  await loginTrigger.waitFor({ state: 'attached', timeout: timeoutMs })
  if (await loginTrigger.isVisible()) {
    await loginTrigger.click()
  } else {
    await loginTrigger.evaluate((node) => (node as HTMLElement).click())
  }

  const loginModal = page.locator('#login-modal')
  await loginModal.waitFor({ state: 'visible', timeout: timeoutMs })

  await loginModal.getByPlaceholder('Username or Email ID').fill(username)
  await page.locator('#login_password').fill(password)
  await page.locator('#login-modal button.log-in').click()

  try {
    await page.waitForURL(/\/student\//i, { timeout: timeoutMs })
    return
  } catch {
    const errorText = await page
      .locator('#login-modal .err.text-left')
      .first()
      .textContent()
    if (errorText?.trim()) {
      throw new Error(`Login failed: ${errorText.trim()}`)
    }

    const verifyModal = page.locator('#verify-modal')
    if (await verifyModal.isVisible()) {
      if (!otp) {
        throw new Error('Verification code required. Set TEST_Z7I_OTP and retry.')
      }
      await page.locator('input[ng-model="verify.code"]').fill(otp)
      await page.locator('#verify-modal button.log-in').click()
      await page.waitForURL(/\/student\//i, { timeout: timeoutMs })
    }
  }
}

const run = async () => {
  if (!reportId) {
    throw new Error('Provide a report id as arg or TEST_Z7I_REPORT_ID.')
  }

  const browser = await chromium.launch({ headless })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await login(page)

    const url = `${baseUrl}/student/reports/questionwise/${reportId}`
    const response = await context.request.get(url, {
      timeout: timeoutMs,
      headers: { accept: 'application/json' },
    })
    const contentType = response.headers()['content-type'] ?? ''
    const body = await response.text()
    const trimmed = body.trim()
    const isJsonLike = trimmed.startsWith('{') || trimmed.startsWith('[')

    if (response.ok() && isJsonLike) {
      const parsed = JSON.parse(trimmed) as unknown
      await saveFile(
        `questionwise-${reportId}.json`,
        JSON.stringify(parsed, null, 2),
      )
    } else {
      await saveFile(
        `questionwise-${reportId}.txt`,
        `status=${response.status()}\ncontent-type=${contentType}\n\n${body}`,
      )
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
