import { describe, expect, test } from "bun:test"
import type { Page } from "patchright"
import { hasAltchaWidget, hasFriendlyCaptchaWidget, solveAltcha, solveFriendlyCaptcha } from "../src/solvers"
import {
  detectChallengeType,
  hasPowChallenge,
  isBlocked,
  isChallengeWall,
  isCloudflarePage,
  needsJs,
} from "../src/utils/detect"
import { waitForPowResolution } from "../src/utils/powWait"
import {
  ALTCHA_INTERSTITIAL_HTML,
  ALTCHA_WIDGET_HTML,
  FRIENDLY_CAPTCHA_WIDGET_HTML,
  POW_INTERSTITIAL_HTML,
} from "./fixtures/pow"

describe("Proof-of-Work (PoW) detection", () => {
  test("detects PoW interstitial markers in HTML", () => {
    expect(hasPowChallenge(POW_INTERSTITIAL_HTML)).toBe(true)
    expect(detectChallengeType(POW_INTERSTITIAL_HTML)).toBe("pow")
    expect(isCloudflarePage(POW_INTERSTITIAL_HTML, {})).toBe(false)
    expect(needsJs(POW_INTERSTITIAL_HTML, {})).toBe(true)
    expect(isBlocked(200, POW_INTERSTITIAL_HTML)).toBe(true)
    expect(isChallengeWall(200, POW_INTERSTITIAL_HTML.length, "pow")).toBe(true)
  })

  test("detects Altcha gate interstitial in HTML", () => {
    expect(hasPowChallenge(ALTCHA_INTERSTITIAL_HTML)).toBe(true)
    expect(detectChallengeType(ALTCHA_INTERSTITIAL_HTML)).toBe("pow")
    expect(needsJs(ALTCHA_INTERSTITIAL_HTML, {})).toBe(true)
    expect(isBlocked(403, ALTCHA_INTERSTITIAL_HTML)).toBe(true)
  })

  test("detects PoW from response headers", () => {
    expect(hasPowChallenge("", { "X-PoW-Challenge": "required" })).toBe(true)
    expect(hasPowChallenge("", { "X-Altcha-Challenge": "pending" })).toBe(true)
    expect(detectChallengeType("", { "x-pow-challenge": "true" })).toBe("pow")
  })

  test("lets authoritative Cloudflare challenge header win", () => {
    const headers = { "CF-Mitigated": "Challenge" }
    expect(detectChallengeType(POW_INTERSTITIAL_HTML, headers)).toBe("cloudflare-interstitial")
    expect(isCloudflarePage(POW_INTERSTITIAL_HTML, headers)).toBe(true)
  })

  test("does not false-positive on ordinary pages", () => {
    const normalHtml = "<!DOCTYPE html><html><body><h1>Welcome to our site</h1></body></html>"
    expect(hasPowChallenge(normalHtml)).toBe(false)
    expect(detectChallengeType(normalHtml)).toBe("none")
    expect(needsJs(normalHtml, {})).toBe(false)
    expect(isBlocked(200, normalHtml)).toBe(false)
  })
})

describe("In-page PoW widget solvers", () => {
  test("fixtures define valid widget structures", () => {
    expect(/altcha-widget|\.altcha/.test(ALTCHA_WIDGET_HTML)).toBe(true)
    expect(/frc-captcha|friendly-captcha/.test(FRIENDLY_CAPTCHA_WIDGET_HTML)).toBe(true)
  })

  test("hasAltchaWidget detects widget presence via evaluate", async () => {
    const mockPage = {
      evaluate: async () => true,
    } as unknown as Page

    expect(await hasAltchaWidget(mockPage, 100)).toBe(true)
  })

  test("hasFriendlyCaptchaWidget detects widget presence via evaluate", async () => {
    const mockPage = {
      evaluate: async () => true,
    } as unknown as Page

    expect(await hasFriendlyCaptchaWidget(mockPage, 100)).toBe(true)
  })

  test("solveAltcha completes when widget is already verified", async () => {
    const mockPage = {
      evaluate: async () => true,
    } as unknown as Page

    expect(await solveAltcha(mockPage, 1000)).toBe(true)
  })

  test("solveFriendlyCaptcha completes when widget is already verified", async () => {
    const mockPage = {
      evaluate: async () => true,
    } as unknown as Page

    expect(await solveFriendlyCaptcha(mockPage, 1000)).toBe(true)
  })

  test("solveAltcha returns false if no widget found", async () => {
    const mockPage = {
      evaluate: async () => false,
    } as unknown as Page

    expect(await solveAltcha(mockPage, 100)).toBe(false)
  })

  test("solveFriendlyCaptcha returns false if no widget found", async () => {
    const mockPage = {
      evaluate: async () => false,
    } as unknown as Page

    expect(await solveFriendlyCaptcha(mockPage, 100)).toBe(false)
  })
})

describe("waitForPowResolution", () => {
  test("returns ok when page content clears challenge markers", async () => {
    let reads = 0
    const mockPage = {
      content: async () => {
        reads++
        return reads > 1 ? "<html><h1>Welcome</h1></html>" : POW_INTERSTITIAL_HTML
      },
      evaluate: async () => {},
      waitForLoadState: async () => {},
    } as unknown as Page

    const res = await waitForPowResolution(mockPage, 2000)
    expect(res).toBe("ok")
  })

  test("returns timeout when deadline exceeded and challenge persists", async () => {
    const mockPage = {
      content: async () => POW_INTERSTITIAL_HTML,
      evaluate: async () => false,
    } as unknown as Page

    const res = await waitForPowResolution(mockPage, 50)
    expect(res).toBe("timeout")
  })
})
