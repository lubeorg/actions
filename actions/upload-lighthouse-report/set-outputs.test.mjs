import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { buildOutputs, writeOutputs } from "./set-outputs.mjs"

const jsonLine = JSON.stringify({
  runId: "run_123",
  dashboardUrl: "https://app.lube.work/performance/runs/run_123",
  performanceScore: 0.82,
  lcpMs: 2500,
  cls: 0.01,
  tbtMs: 180,
  budgetStatus: "warning",
  ingestFailed: false,
  summaryStatus: "warning",
})

describe("buildOutputs", () => {
  test("sets run id, metric, and status outputs from the CLI JSON payload", () => {
    const outputs = buildOutputs(jsonLine)
    assert.equal(outputs["run-id"], "run_123")
    assert.equal(outputs["dashboard-url"], "https://app.lube.work/performance/runs/run_123")
    assert.equal(outputs["performance-score"], "0.82")
    assert.equal(outputs["lcp-ms"], "2500")
    assert.equal(outputs.cls, "0.01")
    assert.equal(outputs["tbt-ms"], "180")
    assert.equal(outputs["budget-status"], "warning")
    assert.equal(outputs["ingest-failed"], "false")
    assert.equal(outputs["summary-status"], "warning")
  })

  test("parses the last JSON line so npx install noise does not break parsing", () => {
    const noisy = `npm warn exec The following package was not found and will be installed\n${jsonLine}`
    const outputs = buildOutputs(noisy)
    assert.equal(outputs["run-id"], "run_123")
  })

  test("coerces optional null values to empty strings so every output is defined", () => {
    const outputs = buildOutputs(
      JSON.stringify({
        runId: "run_456",
        dashboardUrl: null,
        performanceScore: null,
        lcpMs: null,
        cls: null,
        tbtMs: null,
        budgetStatus: null,
        ingestFailed: false,
        summaryStatus: "passed",
      }),
    )
    assert.equal(outputs["dashboard-url"], "")
    assert.equal(outputs["performance-score"], "")
    assert.equal(outputs["budget-status"], "")
    assert.equal(outputs["ingest-failed"], "false")
  })

  test("throws when there is no stdout to parse", () => {
    assert.throws(() => buildOutputs("   \n  \n"), /No Lighthouse upload output to parse/)
  })
})

describe("writeOutputs", () => {
  let dir
  let outputPath

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lighthouse-set-outputs-"))
    outputPath = join(dir, "github_output")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("appends key-value lines to the GitHub output file", () => {
    writeOutputs({ "run-id": "run_123", "performance-score": "0.82" }, outputPath)
    const written = readFileSync(outputPath, "utf8")
    assert.match(written, /run-id=run_123/)
    assert.match(written, /performance-score=0.82/)
  })
})
