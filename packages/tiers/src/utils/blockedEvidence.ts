import type { BlockedEvidence, TierResult } from "@trawl/types"
import type { Page } from "patchright"
import { capturePageScreenshot } from "../screenshot"

// The wall is the only artifact a blocked scrape has to hand back, and it is terminal-path
// data: a request that did not ask for it attaches nothing and reads nothing, and a capture
// that fails degrades the evidence rather than the outcome. One wall is kept per request,
// so the only unbounded dimension is the markup.
const MAX_HTML_CHARS = Number(process.env.BLOCKED_EVIDENCE_MAX_HTML_CHARS ?? 512_000)

export interface BlockedEvidenceSink {
  // Take an image of the wall too, on the branches that have not already taken one.
  screenshot?: boolean
  report(evidence: BlockedEvidence): void
}

export interface BlockedOutcome {
  tier: 2 | 3 | 4
  status: TierResult["status"]
  reason?: string
  statusCode?: number
  // Markup and image the branch already holds; read from the page when absent.
  html?: string
  screenshot?: string
}

export async function reportBlocked(
  page: Page,
  sink: BlockedEvidenceSink | undefined,
  outcome: BlockedOutcome,
): Promise<void> {
  if (!sink) return
  try {
    const html = outcome.html ?? (await page.content().catch(() => undefined))
    // settle: false — a challenge wall never reaches network idle, so waiting for it only
    // spends the budget the next tier still needs.
    const screenshot =
      outcome.screenshot ??
      (sink.screenshot ? await capturePageScreenshot(page, Number.POSITIVE_INFINITY, { settle: false }) : undefined)
    sink.report({
      tier: outcome.tier,
      status: outcome.status,
      reason: outcome.reason,
      url: page.url(),
      statusCode: outcome.statusCode,
      html: html?.slice(0, MAX_HTML_CHARS),
      htmlTruncated: html !== undefined && html.length > MAX_HTML_CHARS ? true : undefined,
      screenshot,
    })
  } catch (err) {
    console.log(`[blocked-evidence] capture failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
