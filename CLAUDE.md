# BuildPulse System Overview

BuildPulse is a CI analytics platform for detecting and tracking flaky tests. It is a multi-repo monorepo with 6 repositories:

| Repo | Tech Stack | Purpose |
|------|-----------|---------|
| `web-client/` | Next.js 16, React 19, TypeScript, MUI 7 | Main web application — dashboards, org/repo management, notifications |
| `buildpulse-action/` | Node.js | GitHub Action — uploads test results from customer CI pipelines |
| `cognito-lambdas/` | Go 1.23, AWS Lambda | Cognito triggers — pre-sign-up validation, pre-token JWT enrichment |
| `migration-lambdas/` | Go 1.23, AWS Lambda | Data migration — PostgreSQL → MongoDB at user login + bulk backfill |
| `test-reporter-lambdas/` | Go 1.23, AWS Lambda | Test result processing — parse JUnit XML, detect flaky tests, send notifications |
| `environment/` | Terraform | Shared AWS infrastructure — VPC, ECS, S3, Cognito, SNS/SQS, DynamoDB, IAM |

## System Data Flow

```
Customer CI → buildpulse-action → S3 (test results archive)
                                       ↓
                             process-test-results Lambda
                                       ↓
                                   MongoDB ←──── migration-orchestrator (at login)
                                       ↓
                          web-client (ECS Fargate) → User browser
                                       ↓
                         send-notifications Lambda (DynamoDB-triggered)
```

## Authentication Flow

```
User signup → Cognito pre-sign-up Lambda (validate)
User login  → Cognito pre-token-generation Lambda (enrich JWT with org/role claims)
                                ↓
                     SNS user-migration topic
                                ↓
                  migration-orchestrator Lambda (migrate PostgreSQL → MongoDB)
```

## Current Migration Status (as of 2026-02-28)

- **Database**: PostgreSQL → MongoDB migration in progress. Bulk migration complete (29,601 repos migrated). On-demand migration at login still active for stragglers. PostgreSQL is read-only and will be decommissioned after full migration.
- **Auth**: GitHub OAuth → GitHub App migration code-complete, pending branch merge (`v2-modernization` branch in `buildpulse-action/`)
- **Notifications**: DynamoDB-based per-repo scheduled notifications live in production
- **Legacy uploads**: S3 dual-write forwarding from new bucket → `buildpulse-uploads` (legacy) is active

## AWS Infrastructure

- **Region**: Always `us-west-2` — never `us-east-1`
- **ECS Fargate**: `web-client` runs here (production + staging clusters)
- **Lambdas**: All Go Lambdas use `provided.al2023` runtime, `bootstrap` handler
- **Terraform state**: Each Lambda's `.infra/backend.tf` references `environment/` remote state via S3
- **Lambda descriptions**: Must NOT contain commas (Terraform validation error)
- **Go Lambda CI**: Always include `use_lockfile` in GitHub Actions workflows

---

# buildpulse-action — Repo-Specific Rules

## What This Repo Does

Packages JUnit XML test results and uploads them to BuildPulse. This is a **customer-facing** GitHub Action — any changes affect all BuildPulse users.

## Architecture

- `action.yml` — GitHub Action definition (inputs, outputs, entrypoint)
- `src/index.js` — Main orchestration logic
- `src/archive.js` — Tar/gzip packaging of test result files
- `src/upload.js` — Signed URL fetch + S3 upload
- `src/auth.js` — API token auth vs legacy key/secret auth
- `src/metadata.js` — Git metadata collection (commit SHA, branch, repo info)

## Authentication Modes

1. **API Token (recommended)**: Sends `Authorization: Bearer <token>` to web-client's `/api/test-results/upload-url` endpoint
2. **Legacy key/secret**: Uses `BUILDPULSE_ACCESS_KEY_ID` + `BUILDPULSE_SECRET_ACCESS_KEY` — still supported but deprecated

## Critical Branch Warning

**DO NOT merge `v2-modernization` branch** without coordinating with:
- `web-client/` — needs GitHub App token verification logic
- `environment/` — needs GitHub App infrastructure

## Upload URL Endpoint

The action calls `web-client`'s `POST /api/test-results/upload-url` to get a signed S3 URL, then uploads directly to S3. If you change the request/response shape of this endpoint, update `src/upload.js` accordingly.

## Testing

```bash
npm install
npm test
```

Tests use Jest. Mock the GitHub Actions toolkit (`@actions/core`, `@actions/github`) as needed.

## Versioning

Users pin to `buildpulse/buildpulse-action@v2`. Breaking changes require a new major version tag.
