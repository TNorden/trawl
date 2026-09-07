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

    // Check if already verified
    const isAlreadyVerified = await page
      .evaluate((sel) => {
        const input = document.querySelector(sel)
        if (input instanceof HTMLInputElement && input.value.length > 10) return true
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

    // Trigger verification: click button or checkbox inside widget / shadow DOM
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
          if (input instanceof HTMLInputElement && input.value.length > 10) return true
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
      await new Promise((r) => setTimeout(r, 400))
    }

    return false
  } catch (err) {
    console.log("[friendly-captcha] error:", err instanceof Error ? err.message : err)
    return false
  }
}
