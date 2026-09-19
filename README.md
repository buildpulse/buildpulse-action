# BuildPulse GitHub Action

Upload test results from your CI pipeline to [BuildPulse](https://buildpulse.io) for flaky test detection.

> **Setting up BuildPulse for the first time?** Use [`BuildPulseLLC/test-reporter-action@v3`](https://github.com/BuildPulseLLC/test-reporter-action), the current test reporter. This action keeps working for existing workflows.
>
> **Want faster CI too?** [BuildPulse runners](https://buildpulse.io/products/runners?utm_source=github&utm_medium=action&utm_content=buildpulse-action) run your GitHub Actions jobs 2x faster at half the cost of GitHub-hosted runners, with a one-line `runs-on` change.

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
- Test output (stdout/stderr) streams through normally, so you still see it in your CI logs
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
| `path` | Yes | Path to JUnit XML file(s): a file, directory, or glob |
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
