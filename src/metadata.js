/**
 * Git metadata collection module
 * Gathers information from GitHub Actions environment variables and git commands
 */

const { execSync } = require('child_process')

/**
 * Execute a git command and return trimmed output
 * @param {string} command - Git command to execute
 * @param {string} cwd - Working directory
 * @returns {string|null} Command output or null if failed
 */
function gitCommand(command, cwd) {
  try {
    return execSync(command, { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/**
 * Get the tree SHA for a commit
 * @param {string} commitSha - Commit SHA
 * @param {string} cwd - Working directory
 * @returns {string|null} Tree SHA
 */
function getTreeSha(commitSha, cwd) {
  return gitCommand(`git rev-parse ${commitSha}^{tree}`, cwd)
}

/**
 * Get the branch name from git
 * @param {string} cwd - Working directory
 * @returns {string|null} Branch name
 */
function getBranchFromGit(cwd) {
  // Try symbolic-ref first (works on non-detached HEAD)
  const symbolicRef = gitCommand('git symbolic-ref --short HEAD', cwd)
  if (symbolicRef) return symbolicRef

  // Fall back to describe
  return gitCommand('git describe --all --exact-match HEAD', cwd)
}

/**
 * Get the commit message for a commit
 * @param {string} commitSha - Commit SHA
 * @param {string} cwd - Working directory
 * @returns {string|null} Commit message (first line only)
 */
function getCommitMessage(commitSha, cwd) {
  // Get first line of commit message (subject)
  return gitCommand(`git log -1 --format=%s ${commitSha}`, cwd)
}

/**
 * Detect the CI provider from environment variables
 * @returns {string} CI provider name
 */
function detectCIProvider() {
  const env = process.env
  if (env.GITHUB_ACTIONS) return 'github-actions'
  if (env.BITBUCKET_BUILD_NUMBER) return 'bitbucket-pipelines'
  if (env.CIRCLECI) return 'circleci'
  if (env.TRAVIS) return 'travis-ci'
  if (env.GITLAB_CI) return 'gitlab-ci'
  if (env.JENKINS_URL) return 'jenkins'
  return 'unknown'
}

/**
 * Collect metadata from Bitbucket Pipelines environment
 * @param {Object} env - Environment variables
 * @param {string} repositoryPath - Path to git repository
 * @returns {Object} Git metadata
 */
function collectBitbucketMetadata(env, repositoryPath) {
  const commitSha = env.BITBUCKET_COMMIT
  const branch = env.BITBUCKET_BRANCH || getBranchFromGit(repositoryPath)
  const treeSha = getTreeSha(commitSha, repositoryPath)
  const commitMessage = getCommitMessage(commitSha, repositoryPath)
  const [owner, repo] = (env.BITBUCKET_REPO_FULL_NAME || '').split('/')

  return {
    commit: commitSha,
    commitMessage,
    branch,
    treeSha,
    owner,
    repo,
    prNumber: env.BITBUCKET_PR_ID || null,
    ciProvider: 'bitbucket-pipelines',
    buildId: env.BITBUCKET_PIPELINE_UUID,
    buildNumber: env.BITBUCKET_BUILD_NUMBER,
    buildUrl: env.BITBUCKET_PIPELINE_UUID
      ? `https://bitbucket.org/${env.BITBUCKET_REPO_FULL_NAME}/pipelines/results/${env.BITBUCKET_BUILD_NUMBER}`
      : null,
    triggeredBy: env.BITBUCKET_STEP_TRIGGERER_UUID || null,
    workflow: null,
    job: env.BITBUCKET_STEP_UUID || null,
    repositoryId: env.BITBUCKET_REPO_UUID,
    repoNameWithOwner: env.BITBUCKET_REPO_FULL_NAME,
    timestamp: new Date().toISOString()
  }
}

/**
 * Collect metadata from GitHub Actions environment
 * @param {Object} env - Environment variables
 * @param {string} repositoryPath - Path to git repository
 * @param {string} [overrideCommitSha] - Override commit SHA
 * @returns {Object} Git metadata
 */
function collectGitHubMetadata(env, repositoryPath, overrideCommitSha) {
  const commitSha = overrideCommitSha || env.GITHUB_SHA

  let branch = env.GITHUB_HEAD_REF
  if (!branch) {
    branch = env.GITHUB_REF_NAME
  }
  if (!branch && env.GITHUB_REF) {
    const match = env.GITHUB_REF.match(/^refs\/heads\/(.+)$/)
    if (match) branch = match[1]
  }
  if (!branch) {
    branch = getBranchFromGit(repositoryPath)
  }

  const treeSha = getTreeSha(commitSha, repositoryPath)
  const commitMessage = getCommitMessage(commitSha, repositoryPath)
  const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/')
  const prNumber = env.GITHUB_EVENT_NAME === 'pull_request' ? env.GITHUB_REF?.match(/refs\/pull\/(\d+)/)?.[1] : null

  return {
    commit: commitSha,
    commitMessage,
    branch,
    treeSha,
    owner,
    repo,
    prNumber,
    ciProvider: 'github-actions',
    buildId: env.GITHUB_RUN_ID,
    buildNumber: env.GITHUB_RUN_NUMBER,
    buildUrl: `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    triggeredBy: env.GITHUB_ACTOR,
    workflow: env.GITHUB_WORKFLOW,
    job: env.GITHUB_JOB,
    timestamp: new Date().toISOString()
  }
}

/**
 * Collect git metadata from environment and git commands
 * Supports GitHub Actions and Bitbucket Pipelines
 * @param {Object} options - Options
 * @param {string} options.repositoryPath - Path to git repository
 * @param {string} [options.commitSha] - Override commit SHA
 * @returns {Object} Git metadata
 */
function collectMetadata({ repositoryPath, commitSha: overrideCommitSha }) {
  const env = process.env
  const ciProvider = detectCIProvider()

  if (ciProvider === 'bitbucket-pipelines') {
    return collectBitbucketMetadata(env, repositoryPath)
  }

  return collectGitHubMetadata(env, repositoryPath, overrideCommitSha)
}

module.exports = {
  collectMetadata,
  detectCIProvider,
  getTreeSha,
  getBranchFromGit,
  getCommitMessage
}
