# BuildPulse GitHub Action

GitHub Action that uploads test results from customer CI pipelines to BuildPulse for flaky test detection.

## Role in the System

This action runs in **customer CI pipelines**. It:
1. Optionally runs the test command and collects CPU/memory metrics during execution (wrap mode)
2. Collects JUnit XML test result files and runner hardware specs
3. Packages them into an archive with metadata (commit SHA, branch, timestamps, resource metrics)
4. Uploads the archive to BuildPulse's S3 bucket via a signed URL from the web-client API
5. The `process-test-results` Lambda then picks up the archive from S3

**Upload flow:** `buildpulse-action → POST /api/test-results/upload-url (web-client) → S3 → process-test-results Lambda`

## Related Repositories

| Repo | Role |
|------|------|
| `web-client` | Provides signed S3 upload URLs (`POST /api/test-results/upload-url`), manages API tokens |
| `test-reporter-lambdas` | `process-test-results` Lambda processes uploads from S3 |
| `environment` | S3 bucket infrastructure for test result archives |

## Usage

### Recommended: API Token Authentication

```yaml
steps:
- name: Run tests
  run: echo "Run your tests and generate XML reports"

- name: Upload test results to BuildPulse
  if: '!cancelled()'
  uses: buildpulse/buildpulse-action@v2
  with:
    api-token: ${{ secrets.BUILDPULSE_API_TOKEN }}
    path: reports/junit.xml
```

Create an API token in your BuildPulse organization settings. The repository is automatically detected from the GitHub Actions environment.

### With Pipeline Metrics (Wrap Mode)

Use the `command` input to let the action run your tests and capture CPU/memory metrics during execution. This helps identify flaky tests caused by resource pressure (e.g., OOM, CPU saturation).

```yaml
steps:
- name: Run tests & upload to BuildPulse
  if: '!cancelled()'
  uses: buildpulse/buildpulse-action@v2
  with:
    api-token: ${{ secrets.BUILDPULSE_API_TOKEN }}
    command: npm test
    path: reports/junit.xml
```

Works with any language or test framework:

```yaml
# Go
command: go test ./... -v -count=1

# Python
command: pytest --junitxml=reports/junit.xml

# Java
command: mvn test

# Ruby
command: bundle exec rspec --format RspecJunitFormatter --out reports/junit.xml
```

When using wrap mode:
- Test output (stdout/stderr) streams through normally — you see it in your CI logs
- Runner hardware specs (CPUs, memory, OS) are always captured
- CPU load and memory usage are sampled every second during the test command
- The action step fails if the test command exits non-zero
- Metrics are viewable on the build detail page in BuildPulse

### Legacy: Access Key/Secret Authentication

```yaml
steps:
- name: Upload test results to BuildPulse
  if: '!cancelled()'
  uses: buildpulse/buildpulse-action@v2
  with:
    account: <buildpulse-account-id>
    repository: <buildpulse-repository-id>
    path: reports/junit.xml
    key: ${{ secrets.BUILDPULSE_ACCESS_KEY_ID }}
    secret: ${{ secrets.BUILDPULSE_SECRET_ACCESS_KEY }}
```

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `api-token` | Recommended | BuildPulse API token from organization settings |
| `path` | Yes | Path to JUnit XML file(s) — file, directory, or glob |
| `account` | Legacy only | BuildPulse account ID |
| `repository` | Legacy only | BuildPulse repository ID |
| `key` | Legacy only | `BUILDPULSE_ACCESS_KEY_ID` |
| `secret` | Legacy only | `BUILDPULSE_SECRET_ACCESS_KEY` |
| `commit` | No | Commit SHA (default: `${{ github.sha }}`) |
| `repository-path` | No | Path to git clone (default: `.`) |
| `coverage-files` | No | Coverage file paths (space-separated) |
| `tags` | No | Tags to apply to this build (space-separated) |
| `command` | No | Test command to run in wrap mode (enables pipeline metrics) |
| `quota` | No | Quota ID to count upload against |

## Outputs

| Output | Description |
|--------|-------------|
| `upload-id` | Unique identifier for this upload |
| `account-id` | BuildPulse account ID |
| `repository-id` | BuildPulse repository ID |
| `command-exit-code` | Exit code of the test command (only set when using `command` input) |

## Development

```bash
npm install
npm test
```

### Source Files

| File | Purpose |
|------|---------|
| `src/index.js` | Entry point — orchestrates the upload flow |
| `src/archive.js` | Packages test result files into a tar archive |
| `src/upload.js` | Handles S3 upload via signed URL |
| `src/auth.js` | Authentication (API token and legacy key/secret) |
| `src/metadata.js` | Collects Git metadata (commit, branch, timestamps) |
| `src/sampler.js` | CPU/memory resource sampler for wrap mode metrics |
| `action.yml` | GitHub Action definition (inputs, outputs, runs) |

## Branch Status

- `main`: Stable v2 with API token auth
- `v2-modernization`: GitHub App authentication migration (**pending merge** — do not merge until coordinated with web-client and environment changes)
