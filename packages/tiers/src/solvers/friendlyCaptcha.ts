// Friendly Captcha Proof-of-Work (PoW) CAPTCHA solver.
// Friendly Captcha is an open-source, privacy-friendly CAPTCHA alternative based on client-side SHA-256 PoW puzzles.
//
// Flow:
//   1. Check if the widget is already verified (input[name="frc-captcha-solution"] populated or state="success").
//   2. If unverified, click the start button / checkbox inside the widget or shadow DOM to initiate PoW hashing.
//   3. Wait for the client-side Web Worker / Wasm solver to complete and populate the solution token.

import type { Page } from "patchright"

const WIDGET_SELECTORS = ".frc-captcha, friendly-captcha, frc-captcha, [data-friendly-captcha]"
const SOLUTION_SELECTORS = 'input[name="frc-captcha-solution"], input[name="frc-captcha-response"]'

export async function hasFriendlyCaptchaWidget(page: Page, timeoutMs = 3000): Promise<boolean> {
  const POLL_INTERVAL = 300
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const detected = await page
      .evaluate(
        ({ widgetSel, solutionSel }) => {
          if (document.querySelector(widgetSel)) return true
          if (document.querySelector(solutionSel)) return true
          if (document.querySelector('iframe[src*="frcapi.com"], iframe[src*="friendlycaptcha"]')) return true
          return false
        },
        { widgetSel: WIDGET_SELECTORS, solutionSel: SOLUTION_SELECTORS },
      )
      .catch(() => false)

    if (detected) return true
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
  return false
}

export async function solveFriendlyCaptcha(page: Page, timeoutMs = 30_000): Promise<boolean> {
  try {
    const hasWidget = await hasFriendlyCaptchaWidget(page, 3000)
    if (!hasWidget) return false

    // Check if already verified (tokens must not be empty or status placeholders like .UNACTIVATED)
    const isAlreadyVerified = await page
      .evaluate((sel) => {
        const input = document.querySelector(sel)
        if (input instanceof HTMLInputElement && input.value.length > 20 && !input.value.startsWith(".")) return true
        const widget = document.querySelector(".frc-captcha, friendly-captcha, frc-captcha")
        if (widget?.classList.contains("frc-success")) return true
        if (widget?.getAttribute("data-state") === "success") return true
        return false
      }, SOLUTION_SELECTORS)
      .catch(() => false)

    if (isAlreadyVerified) {
      console.log("[friendly-captcha] already verified ✓")
      return true
    }

    // Trigger verification:
    // Case 1: If an iframe is used (Friendly Captcha v2)
    const frcFrame = page.frames().find((f) => {
      if (f === page.mainFrame()) return false
      const u = f.url()
      return u.includes("captcha/widget") || (u.includes("friendlycaptcha") && u.includes("widget"))
    })
    if (frcFrame) {
      const btn = frcFrame.locator('button[role="checkbox"], button.button, button').first()
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click({ timeout: 5000, force: true }).catch(() => {})
        console.log("[friendly-captcha] clicked verification button inside widget iframe")
      }
    }

    // Case 2: In-page button or custom element (Friendly Captcha v1 or custom v2 element)
    await page
      .evaluate((widgetSel) => {
        const widget = document.querySelector(widgetSel)
        if (widget) {
          const root = widget.shadowRoot ?? widget
          const btn = root.querySelector(
            ".frc-button, button, input[type='button'], input[type='checkbox']",
          ) as HTMLElement | null
          if (btn) btn.click()
        } else {
          const btn = document.querySelector(".frc-captcha .frc-button, .frc-button") as HTMLElement | null
          if (btn) btn.click()
        }
      }, WIDGET_SELECTORS)
      .catch(() => {})

    console.log("[friendly-captcha] triggered PoW challenge computation")

    // Poll until the solution input is populated or widget reaches success state
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const verified = await page
        .evaluate((sel) => {
          const input = document.querySelector(sel)
          if (input instanceof HTMLInputElement && input.value.length > 20 && !input.value.startsWith(".")) return true
          const widget = document.querySelector(".frc-captcha, friendly-captcha, frc-captcha")
          if (widget?.classList.contains("frc-success")) return true
          if (widget?.getAttribute("data-state") === "success") return true
          return false
        }, SOLUTION_SELECTORS)
        .catch(() => false)

      if (verified) {
        console.log("[friendly-captcha] verified successfully ✓")
        return true
      }

      // Check iframe state if present
      if (frcFrame) {
        const checked = await frcFrame
          .evaluate(() => {
            const btn = document.querySelector('button[role="checkbox"], button.button')
            return btn?.getAttribute("aria-checked") === "true"
          })
          .catch(() => false)
        if (checked) {
          console.log("[friendly-captcha] iframe marked verified ✓")
          return true
        }
      }

      await new Promise((r) => setTimeout(r, 400))
    }

    return false
  } catch (err) {
    console.log("[friendly-captcha] error:", err instanceof Error ? err.message : err)
    return false
  }
}
