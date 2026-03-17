/**
 * BuildPulse GitHub Action
 * Uploads test results to BuildPulse for flaky test detection
 */

const core = require('@actions/core')
const glob = require('@actions/glob')
const path = require('path')
const fs = require('fs')
const os = require('os')

const { spawn } = require('child_process')

const { authenticate, validateAuthInputs } = require('./auth')
const { collectMetadata } = require('./metadata')
const { createArchive } = require('./archive')
const { upload } = require('./upload')
const { createSampler, getRunnerInfo } = require('./sampler')

/**
 * Parse space-separated input into array
 * @param {string} input - Space-separated string
 * @returns {string[]} Array of values
 */
function parseSpaceSeparated(input) {
  if (!input || !input.trim()) return []
  return input.trim().split(/\s+/).filter(Boolean)
}

/**
 * Get all matching files from glob pattern
 * @param {string} pattern - Glob pattern
 * @returns {Promise<string[]>} Array of file paths
 */
async function getFiles(pattern) {
  const globber = await glob.create(pattern, {
    followSymbolicLinks: true
  })
  return globber.glob()
}

/**
 * Run a command as a child process and return the exit code
 * Streams stdout/stderr through so users see their test output
 * @param {string} command - Shell command to execute
 * @returns {Promise<number>} Exit code
 */
function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const inputs = {
      apiToken: core.getInput('api-token'),
      account: core.getInput('account'),
      repository: core.getInput('repository'),
      key: core.getInput('key'),
      secret: core.getInput('secret'),
      path: core.getInput('path', { required: true }),
      repositoryPath: core.getInput('repository-path') || '.',
      commit: core.getInput('commit'),
      coverageFiles: core.getInput('coverage-files'),
      tags: core.getInput('tags'),
      quotaId: core.getInput('quota'),
      apiHost: core.getInput('api-host') || process.env.BUILDPULSE_API_HOST,
      command: core.getInput('command')
    }

    // Special handling for Dependabot - skip if no credentials available
    if (!inputs.apiToken && !inputs.key && !inputs.secret && process.env.GITHUB_ACTOR === 'dependabot[bot]') {
      core.warning('No credentials available for Dependabot. Skipping upload to BuildPulse.')
      core.warning('As of March 1, 2021, Dependabot PRs cannot access secrets in GitHub Actions.')
      return
    }

    // Validate auth inputs
    if (!validateAuthInputs(inputs)) {
      throw new Error(
        'Authentication required: provide api-token OR (account + repository + key + secret)'
      )
    }

    // Collect runner info (always included)
    const runner = getRunnerInfo()
    core.info(`Runner: ${runner.cpus} CPUs, ${runner.total_memory_mb} MB RAM, ${runner.os}/${runner.arch}`)

    // Run command in wrap mode if provided
    let execution = null
    if (inputs.command) {
      core.info(`Running command: ${inputs.command}`)
      const sampler = createSampler(1000)
      const startTime = Date.now()

      sampler.start()
      const exitCode = await runCommand(inputs.command)
      sampler.stop()

      const durationMs = Date.now() - startTime
      const metrics = sampler.getResults()

      execution = {
        command: inputs.command,
        exit_code: exitCode,
        duration_ms: durationMs,
        metrics
      }

      core.info(`Command finished in ${(durationMs / 1000).toFixed(1)}s (exit code ${exitCode})`)
      core.info(`Peak CPU: ${(metrics.cpu_load_peak * 100).toFixed(0)}%, Peak memory: ${metrics.memory_used_peak_mb} MB, Free min: ${metrics.memory_free_min_mb} MB`)

      // Set exit code output so workflows can react
      core.setOutput('command-exit-code', exitCode)
    }

    // Validate path input
    const testFiles = await getFiles(inputs.path)
    if (testFiles.length === 0) {
      throw new Error(`No test result files found matching: ${inputs.path}`)
    }

    core.info(`Found ${testFiles.length} test result file(s)`)
    for (const file of testFiles) {
      core.debug(`  - ${file}`)
    }

    // Validate repository path
    if (!fs.existsSync(inputs.repositoryPath)) {
      throw new Error(`Repository path does not exist: ${inputs.repositoryPath}`)
    }

    // Get auth configuration
    const auth = authenticate(inputs)

    // Collect git metadata
    const metadata = collectMetadata({
      repositoryPath: inputs.repositoryPath,
      commitSha: inputs.commit || process.env.GITHUB_SHA
    })

    core.info(`Commit: ${metadata.commit}`)
    core.info(`Branch: ${metadata.branch || 'unknown'}`)
    core.info(`Build: ${metadata.buildNumber}`)

    // Parse optional inputs
    const tags = parseSpaceSeparated(inputs.tags)
    const coverageFiles = parseSpaceSeparated(inputs.coverageFiles)

    // Log coverage file status
    if (coverageFiles.length > 0) {
      for (const file of coverageFiles) {
        if (fs.existsSync(file)) {
          const size = fs.statSync(file).size
          core.info(`Coverage file found: ${file} (${(size / 1024).toFixed(1)} KB)`)
        } else {
          core.warning(`Coverage file not found: ${file} (cwd: ${process.cwd()})`)
        }
      }
    }

    // Create archive
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildpulse-'))
    const archivePath = path.join(tempDir, 'test-results.tar.gz')

    core.info('Creating archive...')
    await createArchive({
      files: testFiles,
      metadata,
      outputPath: archivePath,
      options: {
        tags,
        coverageFiles,
        quotaId: inputs.quotaId,
        runner,
        execution
      }
    })

    const archiveSize = fs.statSync(archivePath).size
    core.info(`Archive created: ${(archiveSize / 1024).toFixed(1)} KB`)

    // Determine repository ID
    // For legacy auth, repositoryId comes from inputs
    // For new auth, use GITHUB_REPOSITORY_ID (available natively in GitHub Actions)
    const repositoryId = inputs.repository || process.env.GITHUB_REPOSITORY_ID

    if (!repositoryId) {
      throw new Error('Repository ID is required. Provide it via the repository input or set GITHUB_REPOSITORY_ID.')
    }

    // Upload to BuildPulse
    core.info('Uploading to BuildPulse...')
    const result = await upload({
      auth,
      repositoryId,
      archivePath,
      apiHost: inputs.apiHost
    })

    core.info(`Upload complete! Upload ID: ${result.uploadId}`)

    // Set outputs
    core.setOutput('upload-id', result.uploadId)
    core.setOutput('account-id', result.accountId)
    core.setOutput('repository-id', result.repositoryId)

    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }

    // If wrap mode was used and the command failed, fail the action step
    if (execution && execution.exit_code !== 0) {
      core.setFailed(`Command exited with code ${execution.exit_code}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
