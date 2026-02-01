/**
 * Authentication module for BuildPulse action
 * Supports both new API tokens (bp_xxx...) and legacy AWS credentials
 */

/**
 * Determine auth method and return headers/body for API calls
 * @param {Object} inputs - Action inputs
 * @param {string} [inputs.apiToken] - New-style API token
 * @param {string} [inputs.account] - Legacy account ID
 * @param {string} [inputs.repository] - Legacy repository ID
 * @param {string} [inputs.key] - Legacy access key
 * @param {string} [inputs.secret] - Legacy secret key
 * @returns {Object} Auth configuration with headers and body
 */
function authenticate(inputs) {
  const { apiToken, account, repository, key, secret } = inputs

  if (apiToken) {
    // New flow: API token (org-level)
    return {
      headers: { Authorization: `Bearer ${apiToken}` },
      body: {}
    }
  }

  if (key && secret && account && repository) {
    // Legacy flow: AWS IAM credentials
    return {
      headers: {
        'X-BuildPulse-Access-Key': key,
        'X-BuildPulse-Secret-Key': secret
      },
      body: { accountId: account, repositoryId: repository }
    }
  }

  throw new Error(
    'Authentication required: provide api-token OR (account + repository + key + secret)'
  )
}

/**
 * Validate that required auth inputs are provided
 * @param {Object} inputs - Action inputs
 * @returns {boolean} True if valid
 */
function validateAuthInputs(inputs) {
  const { apiToken, account, repository, key, secret } = inputs

  // New auth method
  if (apiToken) {
    return true
  }

  // Legacy auth method - all four are required
  if (key && secret && account && repository) {
    return true
  }

  return false
}

module.exports = {
  authenticate,
  validateAuthInputs
}
