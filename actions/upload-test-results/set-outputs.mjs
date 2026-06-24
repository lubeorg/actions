// Parses the `@lubed/test-uploader --json` payload and exposes its fields as
// GitHub Action step outputs. Kept dependency-free and pure (buildOutputs) so
// the parsing contract can be unit-tested with `node --test` without a runner.

import { appendFileSync } from "node:fs"

/**
 * Extracts the action output map from the CLI's captured stdout.
 *
 * The CLI prints exactly one JSON object on stdout under `--json`, but the
 * surrounding `npx` invocation can emit install/progress noise on preceding
 * lines, so we parse the LAST non-empty line rather than the whole buffer.
 *
 * @param {string} rawStdout Raw stdout captured from the upload command.
 * @returns {{ "run-id": string, "dashboard-url": string, total: string, passed: string, failed: string, skipped: string }}
 *   Output key/value pairs (all stringified; missing values become "").
 * @throws {Error} When there is no JSON line to parse (e.g. the upload failed).
 */
export function buildOutputs(rawStdout) {
  const lines = rawStdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error("No upload output to parse — the upload produced no stdout.")
  }

  const payload = JSON.parse(lines[lines.length - 1])
  const totals = payload.totals ?? {}

  // Coerce every value to a string and fall back to "" so downstream
  // `steps.*.outputs.*` references are always defined.
  const asOutput = (value) => (value === undefined || value === null ? "" : String(value))

  return {
    "run-id": asOutput(payload.runId),
    "dashboard-url": asOutput(payload.dashboardUrl),
    total: asOutput(totals.total),
    passed: asOutput(totals.passed),
    failed: asOutput(totals.failed),
    skipped: asOutput(totals.skipped),
  }
}

/**
 * Appends the resolved outputs to the GitHub Actions `$GITHUB_OUTPUT` file.
 *
 * @param {Record<string, string>} outputs Output key/value pairs.
 * @param {string} githubOutputPath Path from `process.env.GITHUB_OUTPUT`.
 */
export function writeOutputs(outputs, githubOutputPath) {
  const body = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  appendFileSync(githubOutputPath, `${body}\n`)
}

// CLI entry: read stdout from stdin, write outputs to $GITHUB_OUTPUT, and echo
// the resolved outputs back for the action log. Guarded so importing this
// module in tests does not trigger the stdin read.
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
