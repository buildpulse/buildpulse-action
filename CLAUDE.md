# buildpulse-action

Notes for AI coding agents (and people) working in this repo.

**This repository is public.** Don't put internal system names, infrastructure details (hosts,
storage, regions, accounts, service names), customer names, or internal process notes into code,
comments, docs, commit messages, or pull requests. Describe what the action does, not how
BuildPulse runs behind it.

## What this action does

Collects JUnit XML test results, optionally runs the test command to sample CPU and memory
("wrap mode"), packages everything with CI metadata, and uploads it to BuildPulse for flaky test
detection. It runs in customers' CI pipelines, so every change reaches every user of the action.

New setups should use [`BuildPulseLLC/test-reporter-action@v3`](https://github.com/BuildPulseLLC/test-reporter-action).
This action stays supported for existing workflows.

## Layout

| Path | Purpose |
|---|---|
| `action.yml` | Inputs, outputs, and the entrypoint (`dist/index.js` on node20) |
| `src/index.js` | Orchestrates a run |
| `src/archive.js` | Tar/gzip packaging of test result files |
| `src/upload.js` | Requests an upload URL from the BuildPulse API, then uploads the archive to it |
| `src/auth.js` | API token (recommended) or legacy key/secret |
| `src/metadata.js` | Git and CI metadata (commit, branch, timestamps) |
| `src/sampler.js` | CPU/memory sampling for wrap mode |
| `dist/` | The `ncc` bundle GitHub actually runs. Committed. |

## Commands

```bash
npm install
npm test        # Jest; mock @actions/core and @actions/github as needed
npm run lint
npm run build   # regenerates dist/; commit it alongside any src/ change
```

## Authentication

1. **API token (recommended):** sent as `Authorization: Bearer <token>` when requesting the upload URL.
2. **Legacy key/secret:** deprecated but still supported. Don't remove it without a major version.

The upload-URL request and response are a contract with the BuildPulse API. Keep `src/upload.js`
backwards compatible, and treat any change to that shape as coordinated with the API.

## Versioning and branches

Users pin a major version tag. Breaking changes need a new major tag; never move an existing major
tag onto a breaking change. Some long-lived branches depend on server-side changes, so don't merge
a branch into `main` unless its pull request says it's ready.
