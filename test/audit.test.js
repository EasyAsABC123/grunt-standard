'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
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
