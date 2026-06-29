import { appendFileSync } from "node:fs"

export function buildOutputs(rawStdout) {
  const lines = rawStdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error("No Lighthouse upload output to parse - the upload produced no stdout.")
  }

  const payload = JSON.parse(lines[lines.length - 1])
  const asOutput = (value) => (value === undefined || value === null ? "" : String(value))

  return {
    "run-id": asOutput(payload.runId),
    "dashboard-url": asOutput(payload.dashboardUrl),
    "performance-score": asOutput(payload.performanceScore),
    "lcp-ms": asOutput(payload.lcpMs),
    cls: asOutput(payload.cls),
    "tbt-ms": asOutput(payload.tbtMs),
    "budget-status": asOutput(payload.budgetStatus),
    "ingest-failed": asOutput(payload.ingestFailed),
    "summary-status": asOutput(payload.summaryStatus),
  }
}

export function writeOutputs(outputs, githubOutputPath) {
  const body = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  appendFileSync(githubOutputPath, `${body}\n`)
}

const invokedAsScript = process.argv[1] && process.argv[1].endsWith("set-outputs.mjs")
if (invokedAsScript) {
  let raw = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    raw += chunk
  })
  process.stdin.on("end", () => {
    const outputs = buildOutputs(raw)
    const githubOutputPath = process.env.GITHUB_OUTPUT
    if (githubOutputPath) writeOutputs(outputs, githubOutputPath)
    process.stdout.write(`${JSON.stringify(outputs)}\n`)
  })
}
