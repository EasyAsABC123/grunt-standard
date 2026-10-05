'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { classifyAudit } = require('../scripts/audit')

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
    entries[name] = { name, via, severity: 'high' }
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

function auditRunner (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grunt-standard-audit-runner-'))
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }))
  const npm = path.join(directory, 'npm')
  fs.writeFileSync(npm, `#!${process.execPath}
'use strict'
if (process.argv.slice(2).join(' ') !== 'audit --json') process.exit(9)
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
