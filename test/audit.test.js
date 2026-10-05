'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { classifyAudit: auditPolicy } = require('../scripts/audit')
const repositoryLock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package-lock.json'), 'utf8'))

function classifyAudit (report, lock = repositoryLock) {
  return auditPolicy(report, lock)
}

function nodeLocations (name) {
  return Object.keys(repositoryLock.packages).filter(location => location.endsWith('node_modules/' + name))
}

function report (vulnerabilities = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }
  }
}

function knownBraces () {
  return {
    name: 'braces',
    severity: 'high',
    nodes: ['node_modules/braces'],
    via: [{
      source: 1240992,
      name: 'braces',
      dependency: 'braces',
      severity: 'high',
      url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
    }]
  }
}

test('audit permits clean reports and only the tracked Grunt chain', () => {
  assert.equal(classifyAudit(report()), false)
  const entries = { braces: knownBraces() }
  const dependencies = {
    micromatch: ['braces'],
    'findup-sync': ['micromatch'],
    liftup: ['findup-sync'],
    'grunt-cli': ['liftup'],
    grunt: ['findup-sync', 'grunt-cli']
  }
  for (const [name, via] of Object.entries(dependencies)) {
    entries[name] = { name, via, severity: 'high', nodes: nodeLocations(name) }
  }
  assert.equal(classifyAudit(report(entries)), true)
})

test('audit blocks new advisories even in an excepted package', () => {
  const braces = knownBraces()
  braces.via.push({ ...braces.via[0], url: 'https://github.com/advisories/GHSA-new-advisory' })
  assert.throws(() => classifyAudit(report({ braces })), /Unexpected advisory/)
  const changedSource = knownBraces()
  changedSource.via[0].source = 9999999
  assert.throws(() => classifyAudit(report({ braces: changedSource })), /Unexpected advisory/)
})

test('audit blocks unknown packages and changed dependency relationships', () => {
  assert.throws(() => classifyAudit(report({ other: knownBraces() })), /Unexpected vulnerability/)
  assert.throws(() => classifyAudit(report({
    braces: knownBraces(),
    grunt: { name: 'grunt', severity: 'high', via: ['braces'] }
  })), /Unexpected vulnerability source/)
})

test('audit rejects failed, malformed, inconsistent and disconnected reports', () => {
  assert.throws(() => classifyAudit({ error: { code: 'ENETWORK' } }))
  assert.throws(() => classifyAudit({ ...report(), auditReportVersion: 3 }))
  assert.throws(() => classifyAudit({ ...report(), metadata: {} }))
  assert.throws(() => classifyAudit(report({
    grunt: { name: 'grunt', severity: 'high', via: ['findup-sync'] }
  })), /Unexpected vulnerability/)
})

test('audit rejects every changed identity field of the known advisory', () => {
  const changes = {
    source: [undefined, null, '1240992', 0, 9999999],
    name: [undefined, 'micromatch'],
    dependency: [undefined, 'grunt'],
    severity: [undefined, 'low', 'moderate', 'critical'],
    url: [undefined, 'http://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
      'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm/extra',
      'https://evil.example/advisories/GHSA-vfj7-8cjw-p6xm']
  }
  for (const [field, values] of Object.entries(changes)) {
    for (const value of values) {
      const braces = knownBraces()
      braces.via[0][field] = value
      assert.throws(() => classifyAudit(report({ braces })), /Unexpected advisory/, `${field}: ${value}`)
    }
  }
})

test('audit rejects missing and malformed vulnerability entries or sources', () => {
  for (const entry of [null, false, 'braces', {}, { ...knownBraces(), name: 'other' },
    { ...knownBraces(), severity: 'critical' }]) {
    assert.throws(() => classifyAudit(report({ braces: entry })), /Unexpected vulnerability/)
  }
  for (const via of [undefined, null, {}, 'braces', []]) {
    assert.throws(() => classifyAudit(report({ braces: { ...knownBraces(), via } })), /Unexpected vulnerability/)
  }
  for (const source of [null, false, 1240992, {}, [], 'unrecognized', 'braces']) {
    assert.throws(() => classifyAudit(report({ braces: { ...knownBraces(), via: [source] } })))
  }
  const misplacedAdvisory = { ...knownBraces(), name: 'micromatch' }
  assert.throws(() => classifyAudit(report({ micromatch: misplacedAdvisory })), /Unexpected advisory/)
})

test('audit rejects malformed reports, inconsistent totals and cyclic dependency sources', () => {
  for (const value of [undefined, null, false, [], {}, { ...report(), vulnerabilities: [] },
    { ...report(), vulnerabilities: 'wrong' }, { ...report(), error: 'network' }]) {
    assert.throws(() => classifyAudit(value))
  }
  for (const total of [undefined, -1, 1, '0']) {
    assert.throws(() => classifyAudit({ ...report(), metadata: { vulnerabilities: { total } } }))
  }
  assert.throws(() => classifyAudit(report({
    braces: { ...knownBraces(), via: ['micromatch'] },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] }
  })), /Unexpected vulnerability source/)
})

test('audit requires a valid reviewed lock scope only when findings are excepted', () => {
  assert.equal(auditPolicy(report()), false)
  for (const lock of [undefined, null, {}, { lockfileVersion: 2, packages: repositoryLock.packages },
    { lockfileVersion: 3, packages: [] }, { lockfileVersion: 3, packages: {} }]) {
    assert.throws(() => auditPolicy(report({ braces: knownBraces() }), lock), /valid repository lockfile/)
  }
  assert.equal(classifyAudit(report({ braces: knownBraces() })), true)
})

test('audit rejects extra, missing, duplicate or malformed audited nodes', () => {
  for (const nodes of [undefined, null, 'node_modules/braces', [], [null],
    ['node_modules/braces', 'node_modules/braces'],
    ['node_modules/unrelated-tool/node_modules/braces'],
    ['node_modules/braces', 'node_modules/unrelated-tool/node_modules/braces']]) {
    assert.throws(() => classifyAudit(report({ braces: { ...knownBraces(), nodes } })), /audit dependency nodes/)
  }
})

test('audit rejects production markers, links and extra locked exception packages', () => {
  for (const dev of [undefined, false, 'true']) {
    const lock = structuredClone(repositoryLock)
    lock.packages['node_modules/braces'].dev = dev
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /development-only/)
  }
  const linked = structuredClone(repositoryLock)
  linked.packages['node_modules/braces'].link = true
  assert.throws(() => classifyAudit(report({ braces: knownBraces() }), linked), /development-only/)
  const missing = structuredClone(repositoryLock)
  delete missing.packages['node_modules/braces']
  assert.throws(() => classifyAudit(report({ braces: knownBraces() }), missing), /development-only/)
  const extra = structuredClone(repositoryLock)
  extra.packages['node_modules/unrelated/node_modules/braces'] = extra.packages['node_modules/braces']
  assert.throws(() => classifyAudit(report({ braces: knownBraces() }), extra), /Unreviewed exception dependency location/)
})

test('audit rejects new consumers of hoisted packages and direct production or dev additions', () => {
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    const lock = structuredClone(repositoryLock)
    lock.packages[''][section] = { ...lock.packages[''][section], braces: '^3.0.3' }
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /Unreviewed exception dependency consumer/)
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    const lock = structuredClone(repositoryLock)
    lock.packages['node_modules/unrelated-tool'] = { dev: true, version: '1.0.0', [section]: { braces: '^3.0.3' } }
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /Unreviewed exception dependency consumer/)
  }
  const productionGrunt = structuredClone(repositoryLock)
  productionGrunt.packages[''].dependencies.grunt = '^1.6.3'
  assert.throws(() => classifyAudit(report({ braces: knownBraces() }), productionGrunt), /Unreviewed exception dependency consumer/)
})

test('audit verifies every reviewed graph edge and rejects malformed declarations', () => {
  for (const [parent, dependency] of [
    ['', 'grunt'], ['node_modules/grunt', 'findup-sync'], ['node_modules/grunt', 'grunt-cli'],
    ['node_modules/grunt-cli', 'liftup'], ['node_modules/liftup', 'findup-sync'],
    ['node_modules/findup-sync', 'micromatch'], ['node_modules/liftup/node_modules/findup-sync', 'micromatch'],
    ['node_modules/micromatch', 'braces']
  ]) {
    const lock = structuredClone(repositoryLock)
    delete lock.packages[parent][parent ? 'dependencies' : 'devDependencies'][dependency]
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /Missing reviewed exception dependency edge/)
  }
  for (const declaration of [null, false, [], 'braces']) {
    const lock = structuredClone(repositoryLock)
    lock.packages['node_modules/unrelated-tool'] = { version: '1.0.0', dependencies: declaration }
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /Malformed locked dependency declarations/)
  }
  for (const entry of [null, false, [], 'unrelated-tool']) {
    const lock = structuredClone(repositoryLock)
    lock.packages['node_modules/unrelated-tool'] = entry
    assert.throws(() => classifyAudit(report({ braces: knownBraces() }), lock), /Malformed locked dependency/)
  }
})

function auditRunner (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grunt-standard-audit-runner-'))
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }))
  const npm = path.join(directory, 'npm')
  fs.writeFileSync(npm, `#!${process.execPath}
'use strict'
if (process.argv.slice(2).join(' ') !== 'audit --json') process.exit(9)
if (process.cwd() !== process.env.FAKE_EXPECTED_CWD) process.exit(8)
process.stdout.write(process.env.FAKE_AUDIT_REPORT || '')
process.stderr.write(process.env.FAKE_AUDIT_STDERR || '')
if (process.env.FAKE_AUDIT_SIGNAL) process.kill(process.pid, 'SIGTERM')
else process.exit(Number(process.env.FAKE_AUDIT_STATUS || 0))
`, { mode: 0o755 })
  return {
    directory,
    npm,
    run: (output, status = 0, environment = {}) => spawnSync(process.execPath,
      [path.resolve(__dirname, '../scripts/audit.js')], {
        encoding: 'utf8',
        cwd: directory,
        timeout: 5000,
        env: {
          ...process.env,
          PATH: directory,
          GITHUB_ACTIONS: 'false',
          GITHUB_STEP_SUMMARY: '',
          FAKE_AUDIT_REPORT: typeof output === 'string' ? output : JSON.stringify(output),
          FAKE_AUDIT_STATUS: String(status),
          FAKE_AUDIT_STDERR: '',
          FAKE_AUDIT_SIGNAL: '',
          FAKE_EXPECTED_CWD: path.resolve(__dirname, '..'),
          ...environment
        }
      })
  }
}

test('audit runner accepts clean reports and prints the complete known exception with GitHub summary',
  { skip: process.platform === 'win32' }, t => {
    const runner = auditRunner(t)
    const clean = runner.run(report())
    assert.ifError(clean.error)
    assert.equal(clean.status, 0)
    assert.deepEqual(JSON.parse(clean.stdout), report())
    assert.equal(clean.stderr, '')
    const known = report({ braces: knownBraces() })
    // The runner invokes the script from this unrelated directory; neither its
    // audit cwd nor lockfile must be replaced by caller-controlled project data.
    fs.writeFileSync(path.join(runner.directory, 'package-lock.json'), '{}')
    const summary = path.join(runner.directory, 'summary.md')
    const result = runner.run(known, 1, {
      GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary, FAKE_AUDIT_STDERR: 'npm diagnostic\n'
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(result.stdout), known)
    assert.match(result.stderr, /npm diagnostic/)
    assert.match(result.stderr, /::warning::.*GHSA-vfj7-8cjw-p6xm/)
    assert.match(fs.readFileSync(summary, 'utf8'), /Unresolved development dependency advisory/)
    assert.match(fs.readFileSync(summary, 'utf8'), /SECURITY\.md/)
  })

test('audit runner blocks malformed JSON, endpoint errors, unexpected findings and process failures',
  { skip: process.platform === 'win32' }, t => {
    const runner = auditRunner(t)
    const unexpected = knownBraces()
    unexpected.via[0].url = 'https://github.com/advisories/GHSA-other-advisory'
    const cases = [
      ['not json', 0, {}],
      [{ error: { code: 'ENETWORK' } }, 1, {}],
      [report({ braces: unexpected }), 1, {}],
      [report(), 1, {}],
      [report(), 2, {}],
      [report(), 0, { FAKE_AUDIT_SIGNAL: 'yes' }],
      [report({ braces: knownBraces() }), 1, { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: runner.directory }]
    ]
    for (const [output, status, environment] of cases) {
      const result = runner.run(output, status, environment)
      assert.ifError(result.error)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Dependency audit blocked:/)
      assert.equal(result.stdout, typeof output === 'string' ? output : JSON.stringify(output))
    }
    fs.unlinkSync(runner.npm)
    const missing = runner.run(report())
    assert.ifError(missing.error)
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /Dependency audit blocked:.*ENOENT/)
  })
