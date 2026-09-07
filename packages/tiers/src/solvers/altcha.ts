// Altcha Proof-of-Work (PoW) CAPTCHA solver.
// Altcha is an open-source, privacy-first CAPTCHA alternative based on SHA-256 PoW.
//
// Flow:
//   1. Check if the widget is already verified (input[name="altcha"] populated or state="verified").
//   2. If unverified, click the checkbox/button inside the widget or shadow DOM to initiate PoW hashing.
//   3. Wait for the client-side Web Worker / Wasm solver to complete and populate the verification payload.

import type { Page } from "patchright"

export async function hasAltchaWidget(page: Page, timeoutMs = 3000): Promise<boolean> {
  const POLL_INTERVAL = 300
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const detected = await page
      .evaluate(() => {
        if (document.querySelector("altcha-widget, .altcha, [data-altcha]")) return true
        const input = document.querySelector('input[name="altcha"]')
        if (input) return true
        return false
      })
      .catch(() => false)

    if (detected) return true
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
  return false
}

export async function solveAltcha(page: Page, timeoutMs = 30_000): Promise<boolean> {
  try {
    const hasWidget = await hasAltchaWidget(page, 3000)
    if (!hasWidget) return false

    // Check if already auto-verified
    const isAlreadyVerified = await page
      .evaluate(() => {
        const input = document.querySelector('input[name="altcha"]')
        if (input instanceof HTMLInputElement && input.value.length > 20) return true
        const widget = document.querySelector("altcha-widget")
        if (widget?.getAttribute("state") === "verified") return true
        return false
      })
      .catch(() => false)

    if (isAlreadyVerified) {
      console.log("[altcha] already verified ✓")
      return true
    }

    // Trigger verification:
    // 1. Playwright locator click (pierces shadow DOM automatically)
    const widgetLocator = page.locator(
      'altcha-widget input[type="checkbox"], altcha-widget, .altcha input[type="checkbox"], .altcha',
    )
    await widgetLocator
      .first()
      .click({ timeout: 2000, force: true })
      .catch(() => {})

    // 2. DOM evaluate fallback
    await page
      .evaluate(() => {
        const widget = document.querySelector("altcha-widget")
        if (widget) {
          const root = widget.shadowRoot ?? widget
          const btn = root.querySelector('input[type="checkbox"], button, .altcha-checkbox') as HTMLElement | null
          if (btn) btn.click()
        } else {
          const btn = document.querySelector('.altcha input[type="checkbox"], .altcha-checkbox') as HTMLElement | null
          if (btn) btn.click()
        }
      })
      .catch(() => {})

    console.log("[altcha] triggered PoW challenge computation")

    // Poll until the state reaches 'verified' or the payload input is set
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const verified = await page
        .evaluate(() => {
          const input = document.querySelector('input[name="altcha"]')
          if (input instanceof HTMLInputElement && input.value.length > 20) return true
          const widget = document.querySelector("altcha-widget")
          if (widget?.getAttribute("state") === "verified") return true
          return false
        })
        .catch(() => false)

      if (verified) {
        console.log("[altcha] verified successfully ✓")
        return true
      }
      await new Promise((r) => setTimeout(r, 400))
    }

    return false
  } catch (err) {
    console.log("[altcha] error:", err instanceof Error ? err.message : err)
    return false
  }
}
