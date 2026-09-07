import { describe, expect, test } from "bun:test"
import { runTier1 } from "../src/tiers/1"
import {
  detectChallengeType,
  hasDuckDuckGoChallenge,
  isBlocked,
  isChallengeWall,
  isCloudflarePage,
  needsJs,
} from "../src/utils/detect"
import { DUCKDUCKGO_ANOMALY_CHALLENGE, DUCKDUCKGO_SEARCH_PAGE } from "./fixtures/duckduckgo"

async function withFetch(response: Response, run: () => Promise<void>) {
  const original = globalThis.fetch
  ;(globalThis as { fetch: typeof fetch }).fetch = (async () => response) as typeof fetch
  try {
    await run()
  } finally {
    ;(globalThis as { fetch: typeof fetch }).fetch = original
  }
}

const htmlResponse = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } })

describe("DuckDuckGo anomaly challenge detection", () => {
  test("classifies a real anomaly challenge independently from Cloudflare", () => {
    expect(hasDuckDuckGoChallenge(DUCKDUCKGO_ANOMALY_CHALLENGE)).toBe(true)
    expect(detectChallengeType(DUCKDUCKGO_ANOMALY_CHALLENGE)).toBe("duckduckgo")
    expect(isCloudflarePage(DUCKDUCKGO_ANOMALY_CHALLENGE, {})).toBe(false)
    expect(needsJs(DUCKDUCKGO_ANOMALY_CHALLENGE, {})).toBe(true)
    expect(isBlocked(202, DUCKDUCKGO_ANOMALY_CHALLENGE)).toBe(true)
    expect(isChallengeWall(202, DUCKDUCKGO_ANOMALY_CHALLENGE.length, "duckduckgo")).toBe(true)
    expect(isChallengeWall(200, DUCKDUCKGO_ANOMALY_CHALLENGE.length, "duckduckgo")).toBe(true)
  })

  test("does not classify an ordinary DuckDuckGo search result page", () => {
    expect(hasDuckDuckGoChallenge(DUCKDUCKGO_SEARCH_PAGE)).toBe(false)
    expect(detectChallengeType(DUCKDUCKGO_SEARCH_PAGE)).toBe("none")
    expect(isChallengeWall(200, DUCKDUCKGO_SEARCH_PAGE.length, "none")).toBe(false)
  })

  test("does not classify a bare provider mention or text search query mentioning anomaly", () => {
    const html = "<p>DuckDuckGo anomaly detection system documentation</p>"
    expect(hasDuckDuckGoChallenge(html)).toBe(false)
    expect(detectChallengeType(html)).toBe("none")
  })

  test("lets authoritative Cloudflare headers win", () => {
    const headers = { "CF-Mitigated": "Challenge" }
    expect(detectChallengeType(DUCKDUCKGO_ANOMALY_CHALLENGE, headers)).toBe("cloudflare-interstitial")
    expect(isCloudflarePage(DUCKDUCKGO_ANOMALY_CHALLENGE, headers)).toBe(true)
  })

  test("Tier 1 escalates DuckDuckGo anomaly challenge to needs-js", async () => {
    await withFetch(htmlResponse(DUCKDUCKGO_ANOMALY_CHALLENGE, 202, { "x-test": "forwarded" }), async () => {
      const result = await runTier1("https://html.duckduckgo.com/html/")
      expect(result.status).toBe("needs-js")
      expect(result.reason).toBe("duckduckgo-anomaly-challenge")
      expect(result.challenge).toBe("duckduckgo")
      expect(result.statusCode).toBe(202)
      expect(result.responseHeaders?.["x-test"]).toBe("forwarded")
    })
  })
})
