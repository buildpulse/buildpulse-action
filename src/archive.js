/**
 * Archive creation module
 * Creates .tar.gz archives with test result files and metadata
 */

const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const yaml = require('yaml')

/**
 * Create a buildpulse.yml metadata file content
 * @param {Object} metadata - Git and CI metadata
 * @param {Object} options - Additional options
 * @param {string[]} [options.tags] - Tags to apply
 * @param {string[]} [options.coverageFiles] - Coverage file paths
 * @param {string} [options.quotaId] - Quota ID
 * @returns {string} YAML content
 */
function createMetadataYaml(metadata, options = {}) {
  const content = {
    version: '1.0',
    source: 'buildpulse-action',
    timestamp: metadata.timestamp,
    git: {
      commit: metadata.commit,
      branch: metadata.branch,
      tree: metadata.treeSha,
      repository: {
        owner: metadata.owner,
        name: metadata.repo
      }
    },
    ci: {
      provider: metadata.ciProvider,
      build_id: metadata.buildId,
      build_number: metadata.buildNumber,
      build_url: metadata.buildUrl,
      triggered_by: metadata.triggeredBy,
      workflow: metadata.workflow,
      job: metadata.job
    }
  }

  if (metadata.prNumber) {
    content.git.pull_request = {
      number: parseInt(metadata.prNumber, 10)
    }
  }

  if (options.tags && options.tags.length > 0) {
    content.tags = options.tags
  }

  if (options.coverageFiles && options.coverageFiles.length > 0) {
    content.coverage_files = options.coverageFiles
  }

  if (options.quotaId) {
    content.quota_id = options.quotaId
  }

  return yaml.stringify(content)
}

/**
 * Create a .tar.gz archive with test result files and metadata
 * @param {Object} params - Parameters
 * @param {string[]} params.files - Array of file paths to include
 * @param {Object} params.metadata - Git and CI metadata
 * @param {string} params.outputPath - Path for output archive
 * @param {Object} [params.options] - Additional options (tags, coverageFiles, quotaId)
 * @returns {Promise<string>} Path to created archive
 */
async function createArchive({ files, metadata, outputPath, options = {} }) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    })

    output.on('close', () => resolve(outputPath))
    archive.on('error', (err) => reject(err))
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        console.warn('Archive warning:', err)
      }
    })

    archive.pipe(output)

    // Add buildpulse.yml metadata file
    const metadataYaml = createMetadataYaml(metadata, options)
    archive.append(metadataYaml, { name: 'buildpulse.yml' })

    // Add test result files
    for (const file of files) {
      const filename = path.basename(file)
      archive.file(file, { name: `test-results/${filename}` })
    }

    // Add coverage files if provided
    if (options.coverageFiles) {
      for (const file of options.coverageFiles) {
        if (fs.existsSync(file)) {
          const filename = path.basename(file)
          archive.file(file, { name: `coverage/${filename}` })
        }
      }
    }

    archive.finalize()
  })
}

module.exports = {
  createArchive,
  createMetadataYaml
}
