import { describe, expect, test } from "bun:test"
import type { BrowserHandle } from "@trawl/browser"
import type { OrchestratorDeps } from "@trawl/tiers"
import type { SessionData } from "@trawl/types"
import { scrapeRoute } from "./scrape"

const WALL_HTML = `<html><head><title>Access denied</title></head><body><h1>403</h1>${"blocked ".repeat(40)}</body></html>`
const JPEG_BASE64 = Buffer.from("fake-jpeg-bytes").toString("base64")

const session: SessionData = { cookies: [], userAgent: "cached-user-agent", savedAt: 1 }

const mainFrame = {}
const wallPage = {
  url: () => "https://example.com/blocked",
  title: async () => "Access denied",
  content: async () => WALL_HTML,
  goto: async () => {},
  on: (event: string, handler: (response: unknown) => void) => {
    if (event !== "response") return
    handler({
      url: () => "https://example.com/blocked",
      status: () => 403,
      headers: () => ({}),
      body: async () => Buffer.from(WALL_HTML),
      request: () => ({ isNavigationRequest: () => true, frame: () => mainFrame }),
    })
  },
  off: () => {},
  once: () => {},
  mainFrame: () => mainFrame,
  frames: () => [],
  context: () => ({ cookies: async () => [] }),
  evaluate: async () => "test-agent",
  setExtraHTTPHeaders: async () => {},
  waitForLoadState: async () => {},
  close: async () => {},
  screenshot: async () => Buffer.from("fake-jpeg-bytes"),
}

const blockedDeps = (): OrchestratorDeps => ({
  acquireBrowser: async () =>
    ({
      id: 1,
      lease: 1,
      headful: false,
      context: { newPage: async () => wallPage, addCookies: async () => {}, cookies: async () => [] },
      browser: {},
      fingerprint: { userAgent: "test-agent", platform: "Linux x86_64", locale: "en-US", timezone: "UTC" },
    }) satisfies BrowserHandle,
  releaseBrowser: () => {},
  loadSession: async () => session,
  saveSession: async () => {},
  invalidateSession: async () => {},
})

const post = (body: unknown) =>
  scrapeRoute(blockedDeps, () => ({})).handle(
    new Request("http://localhost/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )

const blockedRequest = { url: "https://example.com", skipHttp: true, maxTier: 2, maxTimeout: 4_000 }

describe("POST /scrape on a blocked outcome", () => {
  test("still answers 500 with the per-tier attempt history", async () => {
    const response = await post(blockedRequest)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toContain("Max tier reached without success")
    expect(body.timings).toEqual([{ tier: 2, status: "blocked", durationMs: expect.any(Number), reason: "http-403" }])
    expect(body.blockedEvidence).toBeUndefined()
  })

  test("carries the challenge wall when the request asked for it", async () => {
    const response = await post({ ...blockedRequest, blockedEvidence: true, screenshot: true })

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.timings[0].reason).toBe("http-403")
    expect(body.blockedEvidence).toMatchObject({
      tier: 2,
      status: "blocked",
      reason: "http-403",
      url: "https://example.com/blocked",
      statusCode: 403,
      screenshot: JPEG_BASE64,
    })
    expect(body.blockedEvidence.html).toContain("Access denied")
  })

  test("omits the image when only the markup was asked for", async () => {
    const response = await post({ ...blockedRequest, blockedEvidence: true })

    const body = await response.json()
    expect(body.blockedEvidence.html).toContain("Access denied")
    expect(body.blockedEvidence.screenshot).toBeUndefined()
  })
})
