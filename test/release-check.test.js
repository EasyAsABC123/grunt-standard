'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync, execFileSync } = require('node:child_process')
const { validateBuild, classifyRegistry } = require('../scripts/release-check')

const canonical = 'EasyAsABC123/grunt-standard'
const repositoryUrl = 'git+https://github.com/EasyAsABC123/grunt-standard.git'
const sha = 'a'.repeat(40)

function build (overrides = {}) {
  return {
    repository: canonical,
    repositoryUrl,
    name: 'grunt-standard',
    version: '4.0.0',
    branch: 'master',
    headSha: sha,
    branchSha: sha,
    eventName: 'workflow_run',
    event: {
      action: 'completed',
      workflow_run: {
        name: 'CI',
        path: '.github/workflows/ci.yml',
        event: 'push',
        conclusion: 'success',
        head_sha: sha,
        head_branch: 'master',
        head_repository: { full_name: canonical }
      }
    },
    ...overrides
  }
}

test('release eligibility requires the exact successful canonical CI branch source', () => {
  assert.equal(validateBuild(build()), true)
  assert.equal(validateBuild(build({ version: '10.20.30' })), true)
  assert.equal(validateBuild(build({ version: '0.0.0' })), true)
  assert.equal(validateBuild(build({ branchSha: 'b'.repeat(40) })), false, 'stale successful builds are skipped')
  const main = build({ branch: 'main' })
  main.event.workflow_run.head_branch = 'main'
  assert.equal(validateBuild(main), true)
  for (const [field, values] of Object.entries({
    name: ['other', undefined],
    repository: ['fork/grunt-standard', undefined],
    repositoryUrl: ['git+https://github.com/fork/grunt-standard.git', undefined],
    version: ['', undefined, 'v4.0.0', '04.0.0', '4.0', '4.0.0-rc.1', '4.0.0+build', '4.0.0\n'],
    branch: ['', 'feature', 'master;echo bad'],
    headSha: ['', 'a'.repeat(39), 'G'.repeat(40), undefined],
    branchSha: ['', undefined]
  })) {
    for (const value of values) assert.throws(() => validateBuild(build({ [field]: value })), `${field}: ${value}`)
  }
})

test('release eligibility rejects forged, failed, mismatched and unrelated workflow runs', () => {
  for (const [field, value] of Object.entries({
    name: 'Other CI',
    path: '.github/workflows/evil.yml',
    event: 'pull_request',
    conclusion: 'failure',
    head_sha: 'b'.repeat(40),
    head_branch: 'main',
    head_repository: { full_name: 'fork/grunt-standard' }
  })) {
    const input = build()
    input.event.workflow_run[field] = value
    assert.throws(() => validateBuild(input), /successful canonical CI push/)
  }
  for (const event of [undefined, {}, { action: 'requested' }, { action: 'completed' },
    { action: 'completed', workflow_run: { conclusion: 'success' } }]) {
    assert.throws(() => validateBuild(build({ event })))
  }
  assert.throws(() => validateBuild(build({ eventName: 'release' })), /Only successful CI/)
})

test('manual runs accept only canonical branch dry runs', () => {
  assert.equal(validateBuild(build({ eventName: 'workflow_dispatch', event: { inputs: { ref: 'master' } } })), true)
  assert.equal(validateBuild(build({ eventName: 'workflow_dispatch', event: {} })), true)
  assert.throws(() => validateBuild(build({ eventName: 'workflow_dispatch', event: { inputs: { ref: 'main' } } })))
})

test('only exact registry E404 means unpublished; every other failure blocks', () => {
  assert.equal(classifyRegistry({ status: 0, stdout: '"4.0.0"' }, '4.0.0'), false)
  assert.equal(classifyRegistry({ status: 1, stdout: '{"error":{"code":"E404"}}' }, '4.0.0'), true)
  for (const result of [
    { status: 1, stdout: '{"error":{"code":"E401"}}' },
    { status: 1, stdout: '{"error":{"code":"ENETWORK"}}' },
    { status: 0, stdout: '{"error":{"code":"E404"}}' },
    { status: 0, stdout: '"3.2.0"' }, { status: 0, stdout: 'null' },
    { status: 1, stdout: '{}' }, { status: 1, stdout: 'not json' },
    { status: 2, stdout: '{"error":{"code":"E404"}}' },
    { status: null, signal: 'SIGTERM', stdout: '' },
    { status: null, error: new Error('missing npm'), stdout: '' }
  ]) assert.throws(() => classifyRegistry(result, '4.0.0'))
})

function fixture (t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grunt-standard-release-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const cwd = path.join(root, 'repository')
  const bin = path.join(root, 'bin')
  fs.mkdirSync(cwd)
  fs.mkdirSync(bin)
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git(['init', '--quiet', '--initial-branch=master', '--template='])
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'grunt-standard', version: '4.0.0', repository: { url: repositoryUrl } }))
  git(['add', 'package.json'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture'])
  const commit = git(['rev-parse', 'HEAD'])
  git(['update-ref', 'refs/remotes/origin/master', commit])
  const eventFile = path.join(root, 'event.json')
  const output = path.join(root, 'output')
  fs.writeFileSync(path.join(bin, 'npm'), `#!${process.execPath}
process.stdout.write(process.env.REGISTRY_RESPONSE)
process.exit(Number(process.env.REGISTRY_STATUS))
`, { mode: 0o755 })
  return {
    git,
    commit,
    cwd,
    output,
    run: (eventName = 'workflow_run', changes = {}, response = '{"error":{"code":"E404"}}', status = 1) => {
      const input = build({ headSha: commit, branchSha: commit })
      input.event.workflow_run.head_sha = commit
      const event = eventName === 'workflow_dispatch' ? { inputs: { ref: 'master' } } : input.event
      fs.writeFileSync(eventFile, JSON.stringify(event))
      fs.rmSync(output, { force: true })
      return spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/release-check.js')], {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          GITHUB_EVENT_PATH: eventFile,
          GITHUB_EVENT_NAME: eventName,
          GITHUB_REPOSITORY: canonical,
          RELEASE_BRANCH: 'master',
          GITHUB_OUTPUT: output,
          REGISTRY_RESPONSE: response,
          REGISTRY_STATUS: String(status),
          ...changes
        }
      })
    }
  }
}

test('release CLI emits publishing eligibility, skips duplicates and never publishes manual runs',
  { skip: process.platform === 'win32' }, t => {
    const app = fixture(t)
    for (const [event, response, status, eligible, publish] of [
      ['workflow_run', '{"error":{"code":"E404"}}', 1, true, true],
      ['workflow_run', '"4.0.0"', 0, false, false],
      ['workflow_dispatch', '"4.0.0"', 0, true, false]
    ]) {
      const run = app.run(event, {}, response, status)
      assert.ifError(run.error)
      assert.equal(run.status, 0, run.stderr)
      assert.match(fs.readFileSync(app.output, 'utf8'), new RegExp(`eligible=${eligible}\\npublish=${publish}\\nversion=4.0.0\\ncommit=[a-f0-9]{40}\\n`))
    }
    assert.equal(app.run('workflow_dispatch', { GITHUB_OUTPUT: '' }).status, 0)
    app.git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '--quiet', '--no-gpg-sign', '-m', 'advance'])
    app.git(['update-ref', 'refs/remotes/origin/master', 'HEAD'])
    app.git(['checkout', '--quiet', '--detach', app.commit])
    const stale = app.run('workflow_run', {}, 'not json', 2)
    assert.equal(stale.status, 0, stale.stderr)
    assert.match(stale.stdout, /Skipping stale CI commit/)
    assert.match(fs.readFileSync(app.output, 'utf8'), /eligible=false\npublish=false/)
  })

test('release CLI blocks invalid branches, registry failures, missing metadata and branch refs',
  { skip: process.platform === 'win32' }, t => {
    const app = fixture(t)
    for (const changes of [
      { RELEASE_BRANCH: 'feature' }, { GITHUB_REPOSITORY: 'fork/grunt-standard' },
      { GITHUB_EVENT_PATH: path.join(app.cwd, 'missing.json') }, { GITHUB_OUTPUT: app.cwd }
    ]) {
      const run = app.run('workflow_run', changes)
      assert.ifError(run.error)
      assert.equal(run.status, 1)
      assert.match(run.stderr, /Release blocked:/)
    }
    const badRegistry = app.run('workflow_run', {}, '{"error":{"code":"E401"}}', 1)
    assert.equal(badRegistry.status, 1)
    app.git(['update-ref', '-d', 'refs/remotes/origin/master'])
    assert.equal(app.run().status, 1)
  })
