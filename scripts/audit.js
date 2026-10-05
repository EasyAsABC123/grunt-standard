'use strict'

const { spawnSync } = require('node:child_process')

const advisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
const knownChain = {
  braces: [],
  micromatch: ['braces'],
  'findup-sync': ['micromatch'],
  liftup: ['findup-sync'],
  'grunt-cli': ['liftup'],
  grunt: ['findup-sync', 'grunt-cli']
}

function classifyAudit (report) {
  if (!report || report.error || report.auditReportVersion !== 2 ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
      Array.isArray(report.vulnerabilities)) {
    throw new Error('Missing, unsupported, or failed npm audit report')
  }

  const vulnerabilities = report.vulnerabilities
  const names = Object.keys(vulnerabilities)
  if (report.metadata?.vulnerabilities?.total !== names.length) {
    throw new Error('Audit vulnerability totals do not match the report')
  }

  function checkChain (name, ancestors = []) {
    const entry = vulnerabilities[name]
    if (!Object.hasOwn(knownChain, name) || !entry || entry.name !== name ||
        entry.severity !== 'high' || !Array.isArray(entry.via) || entry.via.length === 0 ||
        ancestors.includes(name)) {
      throw new Error(`Unexpected vulnerability or dependency chain: ${name}`)
    }

    for (const source of entry.via) {
      if (typeof source === 'string') {
        if (!knownChain[name].includes(source)) {
          throw new Error(`Unexpected vulnerability source for ${name}: ${source}`)
        }
        checkChain(source, [...ancestors, name])
      } else if (name !== 'braces' || !source || source.url !== advisory ||
                 source.name !== 'braces' || source.dependency !== 'braces' ||
                 source.severity !== 'high' || source.source !== 1240992) {
        throw new Error(`Unexpected advisory for ${name}`)
      }
    }
  }

  for (const name of names) checkChain(name)
  return names.length > 0
}

function main () {
  const result = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120000
  })
  // Preserve every finding, including the explicitly tracked upstream exception.
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  try {
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw result.error || new Error(`npm audit failed: ${result.signal || result.status}`)
    }
    const hasKnownFindings = classifyAudit(JSON.parse(result.stdout))
    if (hasKnownFindings) {
      const message = 'Unresolved Grunt development dependency advisory GHSA-vfj7-8cjw-p6xm; see SECURITY.md. Only this exact advisory and dependency chain are excepted.'
      console.warn(message)
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.warn(`::warning::${message}`)
        if (process.env.GITHUB_STEP_SUMMARY) {
          require('node:fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY,
            `## Unresolved development dependency advisory\n\n${message}\n\nFull findings are printed in the audit step log.\n`)
        }
      }
    } else if (result.status !== 0) {
      throw new Error('npm audit failed despite reporting no vulnerabilities')
    }
  } catch (error) {
    console.error(`Dependency audit blocked: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { classifyAudit }
if (require.main === module) main()
