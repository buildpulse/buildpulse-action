/**
 * System resource sampler module
 * Collects CPU and memory metrics at regular intervals during test execution
 */

const os = require('os')

/**
 * Calculate CPU usage percentage from os.cpus() snapshots
 * @param {Object[]} startCpus - CPU info at start
 * @param {Object[]} endCpus - CPU info at end
 * @returns {number} CPU usage ratio (0-1)
 */
function calculateCpuUsage(startCpus, endCpus) {
  let totalIdle = 0
  let totalTick = 0

  for (let i = 0; i < endCpus.length; i++) {
    const startTimes = startCpus[i].times
    const endTimes = endCpus[i].times

    const idleDiff = endTimes.idle - startTimes.idle
    const totalDiff =
      (endTimes.user - startTimes.user) +
      (endTimes.nice - startTimes.nice) +
      (endTimes.sys - startTimes.sys) +
      (endTimes.irq - startTimes.irq) +
      idleDiff

    totalIdle += idleDiff
    totalTick += totalDiff
  }

  return totalTick > 0 ? 1 - totalIdle / totalTick : 0
}

/**
 * Get static runner information
 * @returns {Object} Runner specs
 */
function getRunnerInfo() {
  const cpus = os.cpus()
  return {
    cpus: cpus.length,
    cpu_model: cpus[0]?.model || 'unknown',
    total_memory_mb: Math.round(os.totalmem() / (1024 * 1024)),
    os: os.platform(),
    arch: os.arch(),
    os_version: os.release()
  }
}

/**
 * Create a resource sampler that collects metrics at a fixed interval
 * @param {number} intervalMs - Sampling interval in milliseconds
 * @returns {Object} Sampler with start() and stop() methods
 */
function createSampler(intervalMs = 1000) {
  let timer = null
  let prevCpus = null
  const samples = {
    cpu_load: [],
    memory_used_mb: [],
    memory_free_mb: []
  }

  function takeSample() {
    const currentCpus = os.cpus()

    if (prevCpus) {
      const cpuUsage = calculateCpuUsage(prevCpus, currentCpus)
      samples.cpu_load.push(cpuUsage)
    }

    prevCpus = currentCpus

    const freeMem = os.freemem()
    const totalMem = os.totalmem()
    const usedMb = Math.round((totalMem - freeMem) / (1024 * 1024))
    const freeMb = Math.round(freeMem / (1024 * 1024))

    samples.memory_used_mb.push(usedMb)
    samples.memory_free_mb.push(freeMb)
  }

  return {
    start() {
      prevCpus = os.cpus()
      timer = setInterval(takeSample, intervalMs)
      // Take first memory sample immediately
      const freeMem = os.freemem()
      const totalMem = os.totalmem()
      samples.memory_used_mb.push(Math.round((totalMem - freeMem) / (1024 * 1024)))
      samples.memory_free_mb.push(Math.round(freeMem / (1024 * 1024)))
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      // Take final sample
      takeSample()
    },

    getResults() {
      const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      const max = (arr) => arr.length > 0 ? Math.max(...arr) : 0
      const min = (arr) => arr.length > 0 ? Math.min(...arr) : 0

      return {
        samples: samples.cpu_load.length,
        interval_ms: intervalMs,
        cpu_load_avg: Math.round(avg(samples.cpu_load) * 1000) / 1000,
        cpu_load_peak: Math.round(max(samples.cpu_load) * 1000) / 1000,
        memory_used_avg_mb: Math.round(avg(samples.memory_used_mb)),
        memory_used_peak_mb: max(samples.memory_used_mb),
        memory_free_min_mb: min(samples.memory_free_mb)
      }
    }
  }
}

module.exports = {
  createSampler,
  getRunnerInfo
}
