// Proof-of-Work (PoW) and Wasm interstitial challenge waiter.
//
// In Tier 3 / Tier 4 (Patchright / Camoufox), JavaScript and WebAssembly run natively.
// When an interstitial challenge appears:
//   1. Check if an interactive start/verify button or checkbox is present and trigger it.
//   2. Wait for background Web Worker / WebAssembly PoW computation to finish.
//   3. Wait for the page to navigate away, auto-submit, or clear the challenge markers.
//   4. If clearance was achieved but page hasn't navigated, re-navigate to the original URL.

import type { Page } from "patchright"
import { hasPowChallenge } from "./detect"

type Resolution = "ok" | "ip-blocked" | "timeout"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function waitForPowResolution(page: Page, timeoutMs: number, originalUrl?: string): Promise<Resolution> {
  if (timeoutMs <= 0) return "timeout"

  const deadline = Date.now() + Math.max(timeoutMs, 0)

  // Early check: if already cleared
  const earlyHtml = await page.content().catch(() => "")
  if (earlyHtml && !hasPowChallenge(earlyHtml)) {
    await page.waitForLoadState("load", { timeout: Math.min(5000, timeoutMs) }).catch(() => {})
    return "ok"
  }

  if (Date.now() >= deadline) return "timeout"

  // Attempt to trigger interactive elements if the PoW challenge requires user activation
  await page
    .evaluate(() => {
      // 1. Altcha widget inside shadow DOM or custom element
      const altcha = document.querySelector("altcha-widget, .altcha")
      if (altcha) {
        const root = (altcha as HTMLElement).shadowRoot ?? altcha
        const btn = root.querySelector('input[type="checkbox"], button, .altcha-checkbox') as HTMLElement | null
        if (btn) btn.click()
      }

      // 2. Friendly Captcha button
      const frcBtn = document.querySelector(".frc-button, friendly-captcha button") as HTMLElement | null
      if (frcBtn) frcBtn.click()

      // 3. Generic PoW start button
      const genericBtn = document.querySelector(
        'button[type="submit"], input[type="submit"], #start-challenge, .pow-button, button.verify-btn',
      ) as HTMLElement | null
      if (genericBtn && !genericBtn.hasAttribute("disabled")) {
        genericBtn.click()
      }
    })
    .catch(() => {})

  let clearedAt: number | undefined
  let navigatedOnce = false

  while (Date.now() < deadline) {
    const html = await page.content().catch(() => "")

    // If challenge markers are gone, wait for page to settle and return ok
    if (html && !hasPowChallenge(html)) {
      await page
        .waitForLoadState("load", { timeout: Math.min(5000, Math.max(deadline - Date.now(), 1000)) })
        .catch(() => {})
      return "ok"
    }

    // Check if form or token was submitted/verified but page is lingering
    const isVerifiedInDom = await page
      .evaluate(() => {
        const altchaInput = document.querySelector('input[name="altcha"]')
        if (altchaInput instanceof HTMLInputElement && altchaInput.value.length > 20) return true
        const frcInput = document.querySelector('input[name="frc-captcha-solution"]')
        if (frcInput instanceof HTMLInputElement && frcInput.value.length > 10) return true
        return false
      })
      .catch(() => false)

    if (isVerifiedInDom) {
      clearedAt ??= Date.now()
      // If token is present and verified for > 2s but page didn't auto-redirect:
      if (!navigatedOnce && originalUrl && Date.now() - clearedAt > 2000) {
        navigatedOnce = true
        console.log("[pow] challenge verified in DOM, navigating to target URL")
        await page
          .goto(originalUrl, {
            waitUntil: "domcontentloaded",
            timeout: Math.min(10000, Math.max(deadline - Date.now(), 1000)),
          })
          .catch(() => {})
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {})
        const resolvedHtml = await page.content().catch(() => "")
        return resolvedHtml && !hasPowChallenge(resolvedHtml) ? "ok" : "ip-blocked"
      }
    }

    await sleep(Math.min(400, Math.max(deadline - Date.now(), 0)))
  }

  return "timeout"
}
