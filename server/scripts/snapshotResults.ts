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
const headless = (process.env.SCRAPER_HEADLESS ?? 'true') === 'true'
const timeoutMs = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '30000', 10)
const debugDir = process.env.SCRAPER_DEBUG_DIR ?? './.scraper'

const ensureDebugDir = async () => {
  await mkdir(debugDir, { recursive: true })
  return debugDir
}

const saveHtml = async (name: string, html: string) => {
  const dir = await ensureDebugDir()
  const filePath = join(dir, name)
  await writeFile(filePath, html, 'utf8')
  return filePath
}

const run = async () => {
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

    await page.getByRole('link', { name: /login/i }).click()
    await page
      .locator('#login-modal')
      .getByPlaceholder('Username or Email ID')
      .fill(username)
    await page.locator('#login_password').fill(password)
    await page
      .locator('form')
      .filter({ hasText: 'Login Type your username and' })
      .locator('button')
      .click()

    try {
      await page.waitForURL(/\/student\//i, { timeout: timeoutMs })
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

    await page.getByRole('link', { name: /my results/i }).click()
    await page.waitForLoadState('networkidle', { timeout: timeoutMs })

    const html = await page.content()
    const savedPath = await saveHtml('results.html', html)

    const title = await page.title()
    const snippet = await page.locator('body').innerText()
    const trimmed = snippet.replace(/\s+/g, ' ').trim()

    console.log(`Saved ${savedPath}`)
    console.log(`Title: ${title}`)
    console.log(`Body preview: ${trimmed.slice(0, 400)}...`)
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
