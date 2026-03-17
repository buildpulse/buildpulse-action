/**
 * Upload module
 * Handles API calls to get signed URLs and S3 uploads
 */

const fs = require('fs')
const https = require('https')
const http = require('http')
const { URL } = require('url')

const DEFAULT_API_HOST = 'https://app2.buildpulse.io'

/**
 * Make an HTTP/HTTPS request
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @param {string} [body] - Request body
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const protocol = parsedUrl.protocol === 'https:' ? https : http

    const req = protocol.request(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data })
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

/**
 * Get a signed upload URL from the BuildPulse API
 * @param {Object} params - Parameters
 * @param {Object} params.auth - Auth configuration from authenticate()
 * @param {string} params.repositoryId - Repository ID (required for legacy auth, optional for api-token)
 * @param {string} [params.apiHost] - Override API host
 * @returns {Promise<Object>} Upload URL response
 */
async function getUploadUrl({ auth, repositoryId, apiHost = DEFAULT_API_HOST }) {
  const url = `${apiHost}/api/test-results/upload-url`

  const body = JSON.stringify({
    ...auth.body,
    repositoryId
  })

  const response = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth.headers
    },
    timeout: 30000
  }, body)

  if (response.statusCode !== 200) {
    let errorMessage = `API request failed with status ${response.statusCode}`
    try {
      const errorBody = JSON.parse(response.body)
      if (errorBody.error) {
        errorMessage = errorBody.error
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage)
  }

  return JSON.parse(response.body)
}

/**
 * Upload a file to S3 using a signed URL
 * @param {string} signedUrl - Signed S3 PUT URL
 * @param {string} filePath - Path to file to upload
 * @returns {Promise<void>}
 */
async function uploadToS3(signedUrl, filePath) {
  const fileBuffer = fs.readFileSync(filePath)
  const fileSize = fs.statSync(filePath).size

  const parsedUrl = new URL(signedUrl)
  const protocol = parsedUrl.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = protocol.request(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': fileSize
      },
      timeout: 120000 // 2 minute timeout for upload
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          reject(new Error(`S3 upload failed with status ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Upload timeout'))
    })

    req.write(fileBuffer)
    req.end()
  })
}

/**
 * Complete upload flow: get signed URL and upload file
 * @param {Object} params - Parameters
 * @param {Object} params.auth - Auth configuration
 * @param {string} params.repositoryId - Repository ID
 * @param {string} params.archivePath - Path to archive file
 * @param {string} [params.apiHost] - Override API host
 * @returns {Promise<Object>} Upload result with uploadId
 */
async function upload({ auth, repositoryId, archivePath, apiHost }) {
  // Get signed URL
  const urlResponse = await getUploadUrl({ auth, repositoryId, apiHost })

  // Upload to S3
  await uploadToS3(urlResponse.uploadUrl, archivePath)

  return {
    uploadId: urlResponse.uploadId,
    accountId: urlResponse.accountId,
    repositoryId: urlResponse.repositoryId
  }
}

module.exports = {
  getUploadUrl,
  uploadToS3,
  upload
}
