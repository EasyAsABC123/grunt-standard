'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const advisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
const knownChain = {
  braces: [],
  micromatch: ['braces'],
  'findup-sync': ['micromatch'],
  liftup: ['findup-sync'],
  'grunt-cli': ['liftup'],
  grunt: ['findup-sync', 'grunt-cli']
}

const reviewedNodes = {
  braces: ['node_modules/braces'],
  micromatch: ['node_modules/micromatch'],
  'findup-sync': ['node_modules/findup-sync', 'node_modules/liftup/node_modules/findup-sync'],
  liftup: ['node_modules/liftup'],
  'grunt-cli': ['node_modules/grunt-cli'],
  grunt: ['node_modules/grunt']
}
const reviewedEdges = {
  '': ['node_modules/grunt'],
  'node_modules/grunt': ['node_modules/findup-sync', 'node_modules/grunt-cli'],
  'node_modules/grunt-cli': ['node_modules/liftup'],
  'node_modules/liftup': ['node_modules/liftup/node_modules/findup-sync'],
  'node_modules/findup-sync': ['node_modules/micromatch'],
  'node_modules/liftup/node_modules/findup-sync': ['node_modules/micromatch'],
  'node_modules/micromatch': ['node_modules/braces'],
  'node_modules/braces': []
}

function validateScope (lock) {
  if (!lock || lock.lockfileVersion !== 3 || !lock.packages ||
      typeof lock.packages !== 'object' || Array.isArray(lock.packages) || !lock.packages['']) {
    throw new Error('A valid repository lockfile is required for the audit exception')
  }
  const packages = lock.packages
  const expectedLocations = Object.values(reviewedNodes).flat()
  for (const location of expectedLocations) {
    if (!packages[location] || packages[location].dev !== true || packages[location].link) {
      throw new Error(`Audit exception requires a development-only locked dependency: ${location}`)
    }
  }

  function resolveDependency (parent, name) {
    let directory = parent
    while (true) {
      const location = path.posix.join(directory, 'node_modules', name)
      if (Object.hasOwn(packages, location)) return location
      if (directory === '') throw new Error(`Unresolved exception dependency: ${parent} -> ${name}`)
      directory = path.posix.dirname(directory)
      if (directory === '.') directory = ''
    }
  }

  const foundEdges = new Set()
  for (const [location, entry] of Object.entries(packages)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Malformed locked dependency: ${location}`)
    }
    const name = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length)
    if (location && Object.hasOwn(reviewedNodes, name) && !reviewedNodes[name].includes(location)) {
      throw new Error(`Unreviewed exception dependency location: ${location}`)
    }
    const sections = location
      ? ['dependencies', 'optionalDependencies', 'peerDependencies']
      : ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
    for (const section of sections) {
      const dependencies = entry[section]
      if (dependencies === undefined) continue
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        throw new Error(`Malformed locked dependency declarations: ${location} ${section}`)
      }
      for (const dependency of Object.keys(dependencies)) {
        if (!Object.hasOwn(reviewedNodes, dependency)) continue
        const target = resolveDependency(location, dependency)
        const expectedSection = location ? 'dependencies' : 'devDependencies'
        if (section !== expectedSection || !reviewedEdges[location]?.includes(target)) {
          throw new Error(`Unreviewed exception dependency consumer: ${location || 'root'} -> ${dependency}`)
        }
        foundEdges.add(`${location}->${target}`)
      }
    }
  }
  for (const [parent, targets] of Object.entries(reviewedEdges)) {
    for (const target of targets) {
      if (!foundEdges.has(`${parent}->${target}`)) {
        throw new Error(`Missing reviewed exception dependency edge: ${parent || 'root'} -> ${target}`)
      }
    }
  }
}

function classifyAudit (report, lock) {
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
  if (names.length > 0) {
    for (const name of names) {
      const nodes = vulnerabilities[name].nodes
      if (!Array.isArray(nodes) || nodes.length !== reviewedNodes[name].length ||
          new Set(nodes).size !== nodes.length || nodes.some(node => !reviewedNodes[name].includes(node))) {
        throw new Error(`Unreviewed or malformed audit dependency nodes: ${name}`)
      }
    }
    validateScope(lock)
  }
  return names.length > 0
}

function main () {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: path.resolve(__dirname, '..'),
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
    const report = JSON.parse(result.stdout)
    const lock = Object.keys(report.vulnerabilities || {}).length > 0
      ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package-lock.json'), 'utf8'))
      : undefined
    const hasKnownFindings = classifyAudit(report, lock)
    if (hasKnownFindings) {
      const message = 'Unresolved Grunt development dependency advisory GHSA-vfj7-8cjw-p6xm; see SECURITY.md. Only this exact advisory and dependency chain are excepted.'
      console.warn(message)
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.warn(`::warning::${message}`)
        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
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
