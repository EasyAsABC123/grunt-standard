'use strict'

const fs = require('node:fs')
const { execFileSync, spawnSync } = require('node:child_process')

function validateBuild ({ repository, repositoryUrl, eventName, event, branch, name, version, headSha, branchSha }) {
  if (repository !== 'EasyAsABC123/grunt-standard' || name !== 'grunt-standard' ||
      repositoryUrl !== 'git+https://github.com/EasyAsABC123/grunt-standard.git') {
    throw new Error('Release must publish the canonical grunt-standard repository and package')
  }
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Package version must be a stable canonical N.N.N version')
  }
  if (!['master', 'main'].includes(branch)) throw new Error('Only master and main can publish')
  if (typeof headSha !== 'string' || !/^[a-f0-9]{40}$/.test(headSha) ||
      typeof branchSha !== 'string' || !/^[a-f0-9]{40}$/.test(branchSha)) {
    throw new Error('Source and branch commits must be valid SHA-1 hashes')
  }
  if (eventName === 'workflow_run') {
    const run = event?.workflow_run
    if (event?.action !== 'completed' || run?.conclusion !== 'success' || run.name !== 'CI' ||
        run.path !== '.github/workflows/ci.yml' || run.event !== 'push' || run.head_sha !== headSha ||
        run.head_branch !== branch || run.head_repository?.full_name !== repository) {
      throw new Error('Publishing requires the exact source of a successful canonical CI push build')
    }
  } else if (eventName !== 'workflow_dispatch' || (event?.inputs?.ref || 'master') !== branch) {
    throw new Error('Only successful CI builds and explicit branch dry runs are supported')
  }
  return headSha === branchSha
}

function classifyRegistry (result, version) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error('npm registry lookup failed')
  }
  let data
  try { data = JSON.parse(result.stdout) } catch { throw new Error('npm registry returned invalid JSON') }
  if (result.status === 0 && data === version) return false
  if (result.status === 1 && data?.error?.code === 'E404') return true
  throw new Error('npm registry lookup did not return an exact version or E404')
}

function main () {
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const branch = process.env.RELEASE_BRANCH
    if (!['master', 'main'].includes(branch)) throw new Error('Only master and main can publish')
    const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const headSha = git(['rev-parse', '--verify', 'HEAD^{commit}'])
    const branchSha = git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`])
    const current = validateBuild({
      repository: process.env.GITHUB_REPOSITORY,
      repositoryUrl: pkg.repository?.url,
      eventName: process.env.GITHUB_EVENT_NAME,
      event,
      branch,
      name: pkg.name,
      version: pkg.version,
      headSha,
      branchSha
    })
    let missing = false
    if (current) {
      missing = classifyRegistry(spawnSync('npm', [
        'view', `grunt-standard@${pkg.version}`, 'version', '--json', '--registry=https://registry.npmjs.org/'
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }), pkg.version)
    }
    const dryRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    const eligible = current && (dryRun || missing)
    console.log(!current ? 'Skipping stale CI commit' : missing ? 'Validated unpublished version' : 'Version is already published')
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT,
        `eligible=${eligible}\npublish=${eligible && !dryRun}\nversion=${pkg.version}\ncommit=${headSha}\n`)
    }
  } catch (error) {
    console.error(`Release blocked: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { validateBuild, classifyRegistry }
if (require.main === module) main()
