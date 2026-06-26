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
# Run unit tests for upload-test-results
cd actions/upload-test-results && node --test
```
