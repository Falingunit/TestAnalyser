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

const saveStep = async (name: string, html: string) => {
  const dir = await ensureDebugDir()
  const filePath = join(dir, name)
  await writeFile(filePath, html, 'utf8')
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

const clickAndCapture = async (
  page: import('playwright').Page,
  name: string,
  action: () => Promise<void>,
) => {
  await action()
  await page.waitForLoadState('networkidle', { timeout: timeoutMs })
  await saveStep(name, await page.content())
}

const run = async () => {
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await login(page)

    const myResultsLink = page.getByRole('link', { name: /my results/i })
    if (await myResultsLink.count()) {
      await clickAndCapture(page, '01-my-results.html', async () => {
        await myResultsLink.first().click()
      })
    } else {
      await page.goto(`${baseUrl}/student/reports`, {
        waitUntil: 'networkidle',
        timeout: timeoutMs,
      })
      await saveStep('01-my-results.html', await page.content())
    }

    await clickAndCapture(page, '02-report.html', async () => {
      await page.getByRole('link', { name: /report/i }).first().click()
    })

    await clickAndCapture(page, '03-subject-wise.html', async () => {
      await page.getByRole('link', { name: /subject wise/i }).click()
    })

    await clickAndCapture(page, '04-question-wise.html', async () => {
      await page.getByRole('link', { name: /question wise/i }).click()
    })

    await clickAndCapture(page, '05-time-wise.html', async () => {
      await page.getByRole('link', { name: /time wise/i }).click()
    })

    await clickAndCapture(page, '06-solution.html', async () => {
      await page.getByRole('link', { name: /solution/i }).click()
    })

    const subjectSelections = [
      { label: 'PHYSICS', file: '07-solution-physics.html' },
      { label: 'CHEMISTRY', file: '08-solution-chemistry.html' },
      { label: 'MATHEMATICS', file: '09-solution-mathematics.html' },
    ]

    for (const subject of subjectSelections) {
      await page.locator('.select2-selection__arrow > b').first().click()
      await page.getByRole('treeitem', { name: subject.label }).click()
      await page.waitForTimeout(800)
      await saveStep(subject.file, await page.content())
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
