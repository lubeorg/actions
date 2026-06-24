"use strict"

// Self-contained Node 20 action — no dependencies (uses built-in fetch + fs).
// Implements the save-state / post pattern manually so a single `uses:` step
// can create a deployment on entry (main run) and conclude it in the post run.
//
// Recommended usage is still an explicit start + always() finish so the finish
// step can pass the real `${{ job.status }}`; auto mode's post run reports
// best-effort (the `status` input wins when provided).

const fs = require("node:fs")
const { execFileSync } = require("node:child_process")

const MAX_COMMITS = 200
const DEFAULT_API_RETRY_DELAYS_MS = [0, 2_000, 5_000]
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 522, 523, 524])
// Unit separator between git log fields; never appears in commit text.
const GIT_FIELD_SEP = "\x1f"

/** Read an action input. GitHub exposes inputs as INPUT_<UPPERCASED NAME>. */
function getInput(name) {
  const value = process.env[`INPUT_${name.toUpperCase()}`]
  return value === undefined ? "" : value.trim()
}

/** Append `key=value` to a GitHub file-command file (GITHUB_OUTPUT / GITHUB_STATE). */
function appendFileCommand(envVar, key, value) {
  const filePath = process.env[envVar]
  if (!filePath) return
  fs.appendFileSync(filePath, `${key}=${value}\n`)
}

function setOutput(name, value) {
  appendFileCommand("GITHUB_OUTPUT", name, value)
}

function saveState(name, value) {
  appendFileCommand("GITHUB_STATE", name, value)
}

function logError(message) {
  process.stdout.write(`::error::${message}\n`)
}

function logNotice(message) {
  process.stdout.write(`${message}\n`)
}

function logWarning(message) {
  process.stdout.write(`::warning::${message}\n`)
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  fs.appendFileSync(summaryPath, `${markdown}\n`)
}

/** Map a GitHub job status (or a raw Lube status) onto a Lube deploy status. */
function resolveDeployStatus(rawStatus) {
  const normalized = (rawStatus || "").toLowerCase()
  const directStatuses = [
    "queued",
    "in_progress",
    "success",
    "failure",
    "error",
    "cancelled",
    "rolled_back",
    "inactive",
  ]
  if (directStatuses.includes(normalized)) {
    return normalized
  }
  // GitHub job.status values.
  if (normalized === "cancelled") return "cancelled"
  if (normalized === "failure" || normalized === "failed") return "failure"
  if (normalized === "success") return "success"
  // Default unknown/empty to success only when explicitly finishing; callers
  // should pass ${{ job.status }} for accuracy.
  return "success"
}

function buildContext() {
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com"
  const repository = process.env.GITHUB_REPOSITORY || ""
  const runId = process.env.GITHUB_RUN_ID || ""
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1"
  return {
    sha: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF || process.env.GITHUB_REF_NAME || null,
    actor: process.env.GITHUB_ACTOR || null,
    repositoryUrl: repository ? `${serverUrl}/${repository}` : null,
    externalId: runId || null,
    externalUrl: repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    runId,
    runAttempt,
  }
}

async function callApi(params) {
  let lastError = null
  const retryDelaysMs = getRetryDelaysMs()

  for (let attemptIndex = 0; attemptIndex < retryDelaysMs.length; attemptIndex += 1) {
    const delayMs = retryDelaysMs[attemptIndex]
    if (delayMs > 0) {
      await sleep(delayMs)
    }

    try {
      return await callApiOnce(params)
    } catch (error) {
      lastError = error
      if (!isRetryableApiError(error) || attemptIndex === retryDelaysMs.length - 1) {
        throw error
      }
      logWarning(
        `Lube API request failed; retrying (${attemptIndex + 1}/${retryDelaysMs.length - 1}): ${describeError(error)}`,
      )
    }
  }

  throw lastError || new Error("Lube API request failed.")
}

function getRetryDelaysMs() {
  const rawOverride = process.env.LUBE_REPORT_RETRY_DELAYS_MS
  if (!rawOverride) {
    return DEFAULT_API_RETRY_DELAYS_MS
  }

  const parsed = rawOverride
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)

  return parsed.length > 0 ? parsed : DEFAULT_API_RETRY_DELAYS_MS
}

async function callApiOnce(params) {
  const init = {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
  }
  // GET requests must not carry a body.
  if (params.body !== undefined) {
    init.body = JSON.stringify(params.body)
  }
  const response = await fetch(params.url, init)

  const text = await response.text()
  let parsed = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    const detail = parsed && parsed.message ? parsed.message : text || response.statusText
    const error = new Error(`Lube API ${params.method} ${params.url} failed: ${response.status} ${detail}`)
    error.status = response.status
    throw error
  }
  return parsed
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableApiError(error) {
  if (error && typeof error.status === "number") {
    return RETRYABLE_STATUS_CODES.has(error.status)
  }
  return error instanceof TypeError
}

function readConfig() {
  return {
    apiKey: getInput("api-key"),
    apiUrl: (getInput("api-url") || "https://api.lube.dev").replace(/\/+$/, ""),
    productId: getInput("product-id"),
    environmentId: getInput("environment-id"),
    serviceId: getInput("service-id") || null,
    serviceName: getInput("service-name") || null,
    version: getInput("version") || null,
    groupId: getInput("group-id") || null,
    deploymentType: getInput("deployment-type") || "basic",
    trigger: getInput("trigger") || "push",
    environmentUrl: getInput("environment-url") || null,
    failureMode: getInput("failure-mode") || "strict",
  }
}

/**
 * Extract a pull request number from a commit subject. Handles GitHub's squash
 * style "Title (#123)" and merge-commit style "Merge pull request #123 from ...".
 * Returns null when no PR reference is present.
 */
function extractPrNumber(subject) {
  if (!subject) {
    return null
  }
  const squashMatch = subject.match(/\(#(\d+)\)/)
  if (squashMatch) {
    return Number(squashMatch[1])
  }
  const mergeMatch = subject.match(/Merge pull request #(\d+)/)
  if (mergeMatch) {
    return Number(mergeMatch[1])
  }
  return null
}

/**
 * Parse `git log` output (one commit per line, fields joined by GIT_FIELD_SEP in
 * the order sha, subject, author, ISO commit date) into deployment commit inputs.
 */
function parseGitLogCommits(stdout, params) {
  const repositoryUrl = params && params.repositoryUrl ? params.repositoryUrl : null
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [commitSha, subject, author, committedAt] = line.split(GIT_FIELD_SEP)
      const prNumber = extractPrNumber(subject)
      return {
        commitSha,
        message: subject || null,
        author: author || null,
        committedAt: committedAt || null,
        prNumber,
        prUrl: prNumber && repositoryUrl ? `${repositoryUrl}/pull/${prNumber}` : null,
      }
    })
    .filter((commit) => Boolean(commit.commitSha))
}

function runGitLog(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
}

/** Find the commit SHA of the previous successful deployment for this scope, if any. */
function buildPreviousSuccessQuery(config) {
  const query = new URLSearchParams({ status: "success", limit: "1", environmentId: config.environmentId })
  if (config.serviceId) {
    query.set("serviceId", config.serviceId)
  }
  if (!config.serviceId && config.serviceName) {
    query.set("service", config.serviceName)
  }
  return query
}

/** Find the commit SHA of the previous successful deployment for this scope, if any. */
async function resolvePreviousSuccessSha(config) {
  const queryAttempts = [buildPreviousSuccessQuery(config)]

  if (config.serviceId && config.serviceName) {
    const legacyServiceNameQuery = buildPreviousSuccessQuery({ ...config, serviceId: null })
    queryAttempts.push(legacyServiceNameQuery)
  }

  for (const query of queryAttempts) {
    const url = `${config.apiUrl}/api/products/${encodeURIComponent(config.productId)}/deployments?${query.toString()}`
    const result = await callApi({ method: "GET", url, apiKey: config.apiKey })
    const items = result && Array.isArray(result.items) ? result.items : []
    if (items[0] && items[0].commitSha) {
      return items[0].commitSha
    }
  }

  return null
}

function buildDeploymentBody(params) {
  const { config, context, commits, idempotencyKey } = params
  return {
    productId: config.productId,
    environmentId: config.environmentId,
    serviceId: config.serviceId,
    serviceName: config.serviceName,
    repositoryUrl: context.repositoryUrl,
    status: "in_progress",
    deploymentType: config.deploymentType,
    trigger: config.trigger,
    provider: "github_actions",
    version: config.version,
    commitSha: context.sha,
    ref: context.ref,
    triggeredBy: context.actor,
    externalId: context.externalId,
    externalUrl: context.externalUrl,
    groupId: config.groupId,
    idempotencyKey,
    ...(commits.length > 0 ? { commits } : {}),
  }
}

function handleDeploymentCreateResponse(created, config) {
  const resolution = created && created.serviceResolution ? created.serviceResolution : null
  const advisories = created && Array.isArray(created.advisories) ? created.advisories : []

  if (resolution) {
    setOutput("service-id", resolution.serviceId || "")
    setOutput("service-name", resolution.serviceName || "")
    setOutput("service-created", resolution.created ? "true" : "false")
    setOutput("service-resolution", resolution.resolution || "none")
    saveState("service_id", resolution.serviceId || "")
  }

  for (const advisory of advisories) {
    if (advisory.code === "SERVICE_NAME_FALLBACK" && advisory.serviceId) {
      const message =
        advisory.message ||
        `Lube resolved service "${resolution && resolution.serviceName ? resolution.serviceName : config.serviceName}" to ${advisory.serviceId}. Use service-id for stable tracking across renames.`
      logWarning(message)
      appendStepSummary(
        [
          "### Lube service ID available",
          "",
          message,
          "",
          "```yaml",
          `service-id: ${advisory.serviceId}`,
          "```",
          "",
        ].join("\n"),
      )
    }
  }
}

/**
 * Collect the commits included in this deployment: the range since the previous
 * successful deploy of the same scope, falling back to just the current commit
 * when there is no prior deploy or git history is shallow (range unavailable).
 */
async function collectCommits(config, context) {
  if (!context.sha) {
    return []
  }
  const format = ["%H", "%s", "%an", "%cI"].join(GIT_FIELD_SEP)

  let fromSha = null
  try {
    fromSha = await resolvePreviousSuccessSha(config)
  } catch (error) {
    logNotice(`Could not look up the previous deployment for the commit range: ${describeError(error)}`)
  }

  if (fromSha && fromSha !== context.sha) {
    try {
      const stdout = runGitLog([
        "log",
        `--max-count=${MAX_COMMITS}`,
        `--pretty=format:${format}`,
        `${fromSha}..${context.sha}`,
      ])
      const commits = parseGitLogCommits(stdout, { repositoryUrl: context.repositoryUrl })
      if (commits.length > 0) {
        return commits
      }
    } catch {
      logNotice(
        `Commit range ${fromSha}..${context.sha} is unavailable (shallow clone? use actions/checkout fetch-depth: 0); recording the current commit only.`,
      )
    }
  }

  try {
    const stdout = runGitLog(["log", "-1", `--pretty=format:${format}`, context.sha])
    return parseGitLogCommits(stdout, { repositoryUrl: context.repositoryUrl })
  } catch {
    return []
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

async function runReportOperation(config, operation) {
  try {
    return await operation()
  } catch (error) {
    if (config.failureMode !== "warn") {
      throw error
    }

    const message = `Lube deployment reporting failed but failure-mode=warn is enabled: ${describeError(error)}`
    logWarning(message)
    appendStepSummary(["## Lube deployment report skipped", "", message, ""].join("\n"))
    return null
  }
}

async function startDeployment(config) {
  const context = buildContext()
  // Stable per run-attempt + product + service + environment so a re-run of the
  // same attempt does not create a duplicate, while two products reporting the
  // same service name and environment in one run still get distinct deployments.
  const idempotencyKey = [
    "gha",
    context.runId,
    context.runAttempt,
    config.productId,
    config.serviceId || config.serviceName || "default",
    config.environmentId,
  ].join(":")

  const commits = await collectCommits(config, context)

  const created = await callApi({
    method: "POST",
    url: `${config.apiUrl}/api/deployments`,
    apiKey: config.apiKey,
    body: buildDeploymentBody({ config, context, commits, idempotencyKey }),
  })

  if (commits.length > 0) {
    logNotice(`Attached ${commits.length} commit${commits.length === 1 ? "" : "s"} to the deployment.`)
  }

  const deploymentId = created && created.deployment ? created.deployment.id : null
  if (!deploymentId) {
    throw new Error("Lube API did not return a deployment id.")
  }

  handleDeploymentCreateResponse(created, config)
  setOutput("deployment-id", deploymentId)
  saveState("deployment_id", deploymentId)
  logNotice(`Lube deployment started: ${deploymentId}`)
  return deploymentId
}

async function finishDeployment(config, deploymentId, rawStatus) {
  const context = buildContext()
  const status = resolveDeployStatus(rawStatus)
  await callApi({
    method: "PATCH",
    url: `${config.apiUrl}/api/deployments/${deploymentId}/status`,
    apiKey: config.apiKey,
    body: {
      status,
      environmentUrl: config.environmentUrl,
      description: `Reported by GitHub Actions (${context.externalId || "run"}).`,
    },
  })
  logNotice(`Lube deployment ${deploymentId} concluded as ${status}.`)
}

async function run() {
  const command = (getInput("command") || "auto").toLowerCase()
  const isPostRun = Boolean(process.env.STATE_isPost)

  // Mark the main run so the post run can detect itself (mirrors @actions/core).
  if (!isPostRun) {
    saveState("isPost", "true")
  }

  const config = readConfig()
  if (!config.apiKey || !config.productId || !config.environmentId) {
    throw new Error("api-key, product-id, and environment-id are required.")
  }
  if (config.failureMode !== "strict" && config.failureMode !== "warn") {
    throw new Error("failure-mode must be strict or warn.")
  }

  if (command === "start") {
    if (isPostRun) return
    await runReportOperation(config, () => startDeployment(config))
    return
  }

  if (command === "finish") {
    if (isPostRun) return
    const deploymentId = getInput("deployment-id") || process.env.STATE_deployment_id
    if (!deploymentId) {
      throw new Error("command=finish requires deployment-id (or a prior start in the same job).")
    }
    await runReportOperation(config, () => finishDeployment(config, deploymentId, getInput("status")))
    return
  }

  // auto: create on the main run, conclude on the post run.
  if (!isPostRun) {
    await runReportOperation(config, () => startDeployment(config))
    return
  }

  const deploymentId = process.env.STATE_deployment_id
  if (!deploymentId) {
    logNotice("No Lube deployment was started; skipping post-run report.")
    return
  }
  // The `status` input wins; otherwise default to success (pass ${{ job.status }}
  // via command=finish for accurate failure reporting).
  await runReportOperation(config, () => finishDeployment(config, deploymentId, getInput("status")))
}

// Pure helpers are exported for unit testing; the action only runs when invoked
// directly by the GitHub Actions runner (not when required by a test).
module.exports = {
  extractPrNumber,
  parseGitLogCommits,
  resolveDeployStatus,
  buildPreviousSuccessQuery,
  resolvePreviousSuccessSha,
  buildDeploymentBody,
  handleDeploymentCreateResponse,
  readConfig,
  collectCommits,
  callApi,
  isRetryableApiError,
  getRetryDelaysMs,
  run,
}

if (require.main === module) {
  run().catch((error) => {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
