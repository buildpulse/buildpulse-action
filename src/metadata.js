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
 * Collect git metadata from environment and git commands
 * @param {Object} options - Options
 * @param {string} options.repositoryPath - Path to git repository
 * @param {string} [options.commitSha] - Override commit SHA
 * @returns {Object} Git metadata
 */
function collectMetadata({ repositoryPath, commitSha: overrideCommitSha }) {
  const env = process.env

  // Commit SHA
  const commitSha = overrideCommitSha || env.GITHUB_SHA

  // Branch name - try multiple sources
  let branch = env.GITHUB_HEAD_REF // For pull requests
  if (!branch) {
    branch = env.GITHUB_REF_NAME // For push events
  }
  if (!branch && env.GITHUB_REF) {
    // Extract from refs/heads/xxx
    const match = env.GITHUB_REF.match(/^refs\/heads\/(.+)$/)
    if (match) branch = match[1]
  }
  if (!branch) {
    branch = getBranchFromGit(repositoryPath)
  }

  // Tree SHA
  const treeSha = getTreeSha(commitSha, repositoryPath)

  // Commit message
  const commitMessage = getCommitMessage(commitSha, repositoryPath)

  // Repository info
  const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/')

  // Pull request info
  const prNumber = env.GITHUB_EVENT_NAME === 'pull_request' ? env.GITHUB_REF?.match(/refs\/pull\/(\d+)/)?.[1] : null

  // CI info
  const ciProvider = 'github-actions'
  const buildId = env.GITHUB_RUN_ID
  const buildNumber = env.GITHUB_RUN_NUMBER
  const buildUrl = `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`

  // Actor info
  const triggeredBy = env.GITHUB_ACTOR

  // Workflow info
  const workflow = env.GITHUB_WORKFLOW
  const job = env.GITHUB_JOB

  return {
    commit: commitSha,
    commitMessage,
    branch,
    treeSha,
    owner,
    repo,
    prNumber,
    ciProvider,
    buildId,
    buildNumber,
    buildUrl,
    triggeredBy,
    workflow,
    job,
    timestamp: new Date().toISOString()
  }
}

module.exports = {
  collectMetadata,
  getTreeSha,
  getBranchFromGit,
  getCommitMessage
}
