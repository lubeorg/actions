# Lube GitHub Actions

Official GitHub Actions for integrating with the [Lube](https://lube.dev) platform.

## Actions

### `lubeorg/actions/actions/mark-deployment`

Record a deployment in Lube. Supports `auto` mode (wraps the whole job), or explicit `start`/`finish` steps for accurate failure reporting.

```yaml
# Recommended: explicit start + always() finish
- name: Mark deployment started
  id: deploy_start
  uses: lubeorg/actions/actions/mark-deployment@v2
  with:
    api-key: ${{ secrets.LUBE_API_KEY }}
    product-id: ${{ vars.LUBE_PRODUCT_ID }}
    environment-id: ${{ vars.LUBE_ENV_ID_PRODUCTION }}
    command: start
    service-name: my-api

- name: Deploy
  run: ./scripts/deploy.sh

- name: Mark deployment finished
  if: always()
  uses: lubeorg/actions/actions/mark-deployment@v2
  with:
    api-key: ${{ secrets.LUBE_API_KEY }}
    product-id: ${{ vars.LUBE_PRODUCT_ID }}
    environment-id: ${{ vars.LUBE_ENV_ID_PRODUCTION }}
    command: finish
    deployment-id: ${{ steps.deploy_start.outputs.deployment-id }}
    status: ${{ job.status }}
```

**Inputs**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | Lube API key (store as a secret) |
| `product-id` | Yes | — | Stable Lube product ID (from dashboard) |
| `environment-id` | Yes | — | Stable Lube environment ID (from dashboard) |
| `command` | No | `auto` | `auto`, `start`, or `finish` |
| `service-id` | No | — | Stable Lube service ID (preferred once known) |
| `service-name` | No | — | Service name (e.g. `api-primary`); matched or auto-created |
| `deployment-id` | No | — | Deployment ID to finish (from a prior `start` step) |
| `status` | No | — | Final status for `finish`: `success`, `failure`, `cancelled`, `error` |
| `version` | No | — | Human-readable version or tag |
| `group-id` | No | — | Correlation ID to group a multi-service release |
| `deployment-type` | No | `basic` | `basic`, `blue_green`, `canary`, or `rolling` |
| `trigger` | No | `push` | `push`, `manual`, `api`, `promote`, `rollback`, or `schedule` |
| `environment-url` | No | — | URL of the deployed environment |
| `failure-mode` | No | `strict` | `strict` fails the workflow on API errors; `warn` logs and continues |
| `api-url` | No | `https://api.lube.work` | Override for self-hosted |

**Outputs**

| Output | Description |
|--------|-------------|
| `deployment-id` | Lube deployment record ID |
| `service-id` | Stable Lube service ID resolved for this run |
| `service-name` | Service name used or resolved |
| `service-created` | `"true"` when Lube auto-created the service |
| `service-resolution` | How the service was resolved: `service_id`, `matched_by_name`, `created_from_name`, or `none` |

---

### `lubeorg/actions/actions/upload-test-results`

Upload a test report to Lube. Supports JUnit XML and native JSON reporters from Vitest, Jest, Go, Rust (nextest), Python (pytest), and Ruby (RSpec). Always add `if: always()` so failing runs still upload.

```yaml
- name: Upload test results to Lube
  if: always()
  uses: lubeorg/actions/actions/upload-test-results@v2
  with:
    api-key: ${{ secrets.LUBE_API_KEY }}
    app-id: ${{ vars.LUBE_APP_ID }}
    file: reports/junit.xml
```

**Inputs**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | Lube API key (store as a secret) |
| `app-id` | Yes | — | Stable Lube application ID (from dashboard) |
| `file` | No | — | Path to the report file; auto-detected when omitted |
| `format` | No | — | `junit_xml`, `vitest_json`, `jest_json`, `gotest_json`, `gotestsum_json`, `nextest_json`, `pytest_json`, `rspec_json`; auto-detected when omitted |
| `environment` | No | — | Environment label (e.g. `staging`, `production`) |
| `service-id` | No | — | Stable Lube service ID |
| `service-name` | No | — | Service name; matched or auto-created |
| `version` | No | `0.6.0` | Version of `@lubed/test-uploader` to run via npx |
| `working-directory` | No | `.` | Directory for file auto-detection |
| `fail-on-error` | No | `true` | Set `false` to make uploads non-blocking |
| `api-url` | No | `https://api.lube.work` | Override for self-hosted |

**Outputs**

| Output | Description |
|--------|-------------|
| `run-id` | Lube test run ID |
| `dashboard-url` | URL to view the run in the Lube dashboard |
| `total` | Total number of tests |
| `passed` | Number of passed tests |
| `failed` | Number of failed tests |
| `skipped` | Number of skipped tests |

---

### `lubeorg/actions/actions/upload-lighthouse-report`

Upload an existing Lighthouse JSON report to Lube. Use this when your workflow
already runs Lighthouse, Lighthouse CI, Playwright, or another wrapper that
produces a report file.

```yaml
- name: Upload Lighthouse report to Lube
  if: always()
  uses: lubeorg/actions/actions/upload-lighthouse-report@v2
  with:
    api-key: ${{ secrets.LUBE_API_KEY }}
    target-id: ${{ vars.LUBE_PERFORMANCE_TARGET_ID }}
    file: lhci/lighthouse-report.json
    environment: Preview
    service-name: web-app
    target-url: ${{ steps.deploy.outputs.preview-url }}
```

**Inputs**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | Lube API key (store as a secret). Needs the `performanceRun.create` grant. |
| `target-id` | Yes | - | Stable Lube performance target ID from the dashboard |
| `file` | No | auto-detected | Path to the Lighthouse JSON report |
| `environment` | No | - | Environment label (e.g. `Preview`, `staging`, `production`) |
| `service-id` | No | - | Stable Lube service ID |
| `service-name` | No | - | Service name; matched or auto-created |
| `target-url` | No | - | URL that was tested by Lighthouse |
| `version` | No | `0.8.0` | Version of `@lubed/performance-uploader` to run via npx |
| `working-directory` | No | `.` | Directory for report auto-detection |
| `fail-on-error` | No | `true` | Set `false` to make uploads non-blocking |
| `api-url` | No | `https://api.lube.work` | Override for self-hosted |

**Outputs**

| Output | Description |
|--------|-------------|
| `run-id` | Lube performance run ID |
| `dashboard-url` | URL to view the run in the Lube dashboard |
| `performance-score` | Lighthouse performance category score |
| `lcp-ms` | Largest Contentful Paint in milliseconds |
| `cls` | Cumulative Layout Shift |
| `tbt-ms` | Total Blocking Time in milliseconds |
| `budget-status` | Performance budget status, when evaluated |
| `ingest-failed` | Whether server-side normalization failed after upload |
| `summary-status` | Compact server-side summary status |
| `upload-exit-code` | Exit code returned by the performance uploader CLI |

---

### `lubeorg/actions/actions/run-lighthouse`

Run Lighthouse against a URL, write a JSON report, and upload that report to
Lube. Use this when you do not want to hand-write the Lighthouse command in each
repository.

```yaml
- name: Run Lighthouse and upload to Lube
  if: always()
  uses: lubeorg/actions/actions/run-lighthouse@v2
  with:
    api-key: ${{ secrets.LUBE_API_KEY }}
    target-id: ${{ vars.LUBE_PERFORMANCE_TARGET_ID }}
    url: ${{ steps.deploy.outputs.preview-url }}
    environment: Preview
    service-name: web-app
    fail-on-upload-error: "false"
```

For authenticated pages, run your login/setup step before this action and pass
any required Lighthouse config or Chrome flags through `config-path`,
`chrome-flags`, or `extra-args`.

This action is optimized for GitHub-hosted Ubuntu runners, where Node and Chrome
are already available. On self-hosted runners, install Node and Chrome first or
pass `chrome-path`.

**Inputs**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | Lube API key (store as a secret). Needs the `performanceRun.create` grant. |
| `target-id` | Yes | - | Stable Lube performance target ID from the dashboard |
| `url` | Yes | - | URL for Lighthouse to test |
| `report-path` | No | `lhci/lighthouse-report.json` | Path where the generated JSON report is written |
| `config-path` | No | - | Optional Lighthouse config file |
| `chrome-flags` | No | `--headless=new --no-sandbox` | Chrome flags passed to Lighthouse |
| `chrome-path` | No | - | Chrome executable path for self-hosted runners |
| `extra-args` | No | - | Additional Lighthouse CLI arguments, one per line |
| `environment` | No | - | Environment label (e.g. `Preview`, `staging`, `production`) |
| `service-id` | No | - | Stable Lube service ID |
| `service-name` | No | - | Service name; matched or auto-created |
| `uploader-version` | No | `0.8.0` | Version of `@lubed/performance-uploader` to run via npx |
| `lighthouse-version` | No | `13.4.0` | Version of `lighthouse` to run via npx |
| `working-directory` | No | `.` | Directory to run Lighthouse and upload from |
| `fail-on-lighthouse-error` | No | `true` | Fail after upload when Lighthouse exits non-zero |
| `fail-on-upload-error` | No | `true` | Fail when uploading to Lube fails |
| `api-url` | No | `https://api.lube.work` | Override for self-hosted |

**Outputs**

| Output | Description |
|--------|-------------|
| `report-path` | Path to the generated Lighthouse JSON report |
| `lighthouse-exit-code` | Exit code returned by Lighthouse |
| `report-exists` | Whether the Lighthouse JSON report was created |
| `run-id` | Lube performance run ID |
| `dashboard-url` | URL to view the run in the Lube dashboard |
| `performance-score` | Lighthouse performance category score |
| `lcp-ms` | Largest Contentful Paint in milliseconds |
| `cls` | Cumulative Layout Shift |
| `tbt-ms` | Total Blocking Time in milliseconds |
| `budget-status` | Performance budget status, when evaluated |
| `ingest-failed` | Whether server-side normalization failed after upload |
| `summary-status` | Compact server-side summary status |
| `upload-exit-code` | Exit code returned by the performance uploader CLI |

---

## Full pipeline example

```yaml
jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # required for commit range tracking

      - name: Run tests
        run: npm test -- --reporter=junit --outputFile=reports/junit.xml

      - name: Upload test results
        if: always()
        uses: lubeorg/actions/actions/upload-test-results@v2
        with:
          api-key: ${{ secrets.LUBE_API_KEY }}
          app-id: ${{ vars.LUBE_APP_ID }}
          file: reports/junit.xml

      - name: Run Lighthouse
        if: always()
        uses: lubeorg/actions/actions/run-lighthouse@v2
        with:
          api-key: ${{ secrets.LUBE_API_KEY }}
          target-id: ${{ vars.LUBE_PERFORMANCE_TARGET_ID }}
          url: ${{ steps.deploy_preview.outputs.preview-url }}
          environment: Preview
          service-name: my-app
          fail-on-upload-error: "false"

      - name: Mark deployment started
        id: deploy_start
        uses: lubeorg/actions/actions/mark-deployment@v2
        with:
          api-key: ${{ secrets.LUBE_API_KEY }}
          product-id: ${{ vars.LUBE_PRODUCT_ID }}
          environment-id: ${{ vars.LUBE_ENV_ID_PRODUCTION }}
          command: start
          service-name: my-app

      - name: Deploy
        run: ./scripts/deploy.sh

      - name: Mark deployment finished
        if: always()
        uses: lubeorg/actions/actions/mark-deployment@v2
        with:
          api-key: ${{ secrets.LUBE_API_KEY }}
          product-id: ${{ vars.LUBE_PRODUCT_ID }}
          environment-id: ${{ vars.LUBE_ENV_ID_PRODUCTION }}
          command: finish
          deployment-id: ${{ steps.deploy_start.outputs.deployment-id }}
          status: ${{ job.status }}
```

## Development

No build step required — both actions are self-contained.

```bash
# Run unit tests for action output parsers
node --test actions/*/*.test.mjs
```
