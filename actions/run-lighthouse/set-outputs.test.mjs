import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildOutputs } from "./set-outputs.mjs"

describe("run-lighthouse output parser", () => {
  test("reuses the Lighthouse upload parser contract for uploaded run outputs", () => {
    const outputs = buildOutputs(
      JSON.stringify({
        runId: "run_123",
        dashboardUrl: "https://app.lube.work/performance/runs/run_123",
        performanceScore: 0.91,
        lcpMs: 1800,
        cls: 0.02,
        tbtMs: 120,
        budgetStatus: "passed",
        ingestFailed: false,
        summaryStatus: "passed",
      }),
    )

    assert.equal(outputs["run-id"], "run_123")
    assert.equal(outputs["performance-score"], "0.91")
    assert.equal(outputs["summary-status"], "passed")
  })
})
