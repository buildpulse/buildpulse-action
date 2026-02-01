# GitHub Action for BuildPulse [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/buildpulse/buildpulse-action/main/LICENSE)

Easily connect your GitHub Actions CI workflows to [BuildPulse][buildpulse.io] to help you find and [fix flaky tests](https://buildpulse.io/products/flaky-tests).

## Usage

### Recommended: API Token Authentication

1. Create an API token in your BuildPulse organization settings
2. In the GitHub settings for your repository, [create an encrypted secret](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets#creating-encrypted-secrets) named `BUILDPULSE_API_TOKEN` and set its value to your API token
3. Add a step to your GitHub Actions workflow:

    ```yaml
    steps:
    - name: Check out code
      uses: actions/checkout@v4

    - name: Run tests
      run: echo "Run your tests and generate XML reports for your test results"

    - name: Upload test results to BuildPulse for flaky test detection
      if: '!cancelled()' # Run this step even when the tests fail. Skip if the workflow is cancelled.
      uses: buildpulse/buildpulse-action@v2
      with:
        api-token: ${{ secrets.BUILDPULSE_API_TOKEN }}
        path: reports/junit.xml
        coverage-files: coverage/report.xml # OPTIONAL
        tags: e2e team1 staging # OPTIONAL
    ```

### Legacy: Access Key/Secret Authentication

If you have existing workflows using the legacy authentication method, they will continue to work:

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

### `api-token`

The BuildPulse API token for authentication. Create one in your organization settings.

This is the recommended authentication method. When using `api-token`, you don't need to provide `account`, `repository`, `key`, or `secret`.

### `path`

**Required** The path to the XML file(s) for the test results. Can be a directory (e.g., `test/reports`), a single file (e.g., `reports/junit.xml`), or a glob (e.g., `app/*/results/*.xml`).

### `account`

The unique numeric identifier for the BuildPulse account that owns the repository.

Required when using legacy `key`/`secret` authentication. Not needed when using `api-token`.

### `repository`

The unique numeric identifier for the repository being built.

Required when using legacy `key`/`secret` authentication. Not needed when using `api-token`.

### `key`

The `BUILDPULSE_ACCESS_KEY_ID` for the account that owns the repository.

Legacy authentication method. We recommend using `api-token` instead.

### `secret`

The `BUILDPULSE_SECRET_ACCESS_KEY` for the account that owns the repository.

Legacy authentication method. We recommend using `api-token` instead.

### `commit`

_Optional_ The SHA for the commit that produced the test results (default: the value of [`${{ github.sha }}`](https://docs.github.com/en/actions/learn-github-actions/contexts#github-context), which is the commit that triggered the workflow).

If your workflow checks out a _different_ commit than the commit that triggered the workflow, then use this input to specify the commit SHA that your workflow checked out. For example, if your workflow is triggered by the [`pull_request` event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request), but you [customize the workflow to check out the pull request HEAD commit](https://github.com/actions/checkout/tree/v3.0.2#checkout-pull-request-head-commit-instead-of-merge-commit), then you'll want to set this input to the pull request HEAD commit SHA.

### `repository-path`

_Optional_ The path to the local git clone of the repository (default: ".").

### `coverage-files`

_Optional_ The paths to the coverage file(s) for the test results (space-separated).

### `tags`

_Optional_ Tags to apply to this build (space-separated).

### `quota`

_Optional_ Quota ID to count this upload against. Please set on BuildPulse Dashboard first.

## Outputs

### `upload-id`

The unique identifier for this upload.

### `account-id`

The BuildPulse account ID.

### `repository-id`

The BuildPulse repository ID.

[buildpulse.io]: https://buildpulse.io
