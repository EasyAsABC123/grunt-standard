'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { stripVTControlCharacters } = require('node:util')
const chalk = require('chalk').default
const { reporter } = require('../lib/reporter')

function logger (verbose = false) {
  const logs = []
  const validations = []
  return {
    logs,
    validations,
    option: name => {
      assert.equal(name, 'verbose')
      return verbose
    },
    log: { writeln: message => logs.push(message) },
    verbose: { writeln: message => validations.push(message) },
    util: { pluralize: (count, forms) => forms.split('/')[count === 1 ? 0 : 1] }
  }
}

function diagnostic (message, overrides = {}) {
  return { line: 2, column: 3, message, ruleId: 'test-rule', ...overrides }
}

function file (name, messages) {
  return { filePath: path.resolve(name), messages }
}

test('reporter renders mixed files, counts, positions and plural forms', () => {
  const grunt = logger()
  const data = {
    errorCount: 2,
    warningCount: 1,
    results: [
      file('clean.js', []),
      file('one.js', [diagnostic('first error'), diagnostic('second error', { line: 12, column: 20 })]),
      file('two.js', [diagnostic('one warning')])
    ]
  }
  assert.equal(reporter(grunt, data), false)
  assert.equal(grunt.logs.length, 1)
  assert.deepEqual(grunt.validations, ['- Validating one.js', '- Validating two.js'])
  const output = stripVTControlCharacters(grunt.logs[0])
  assert.match(output, /line 12\s+col 20\s+second error/)
  assert.match(output, /✖ 3 problems\n2 errors - 1 warning/)
  assert.doesNotMatch(output, /clean\.js|test-rule/)
})

test('reporter displays rule identifiers only in verbose diagnostics', () => {
  for (const verbose of [true, false]) {
    const grunt = logger(verbose)
    assert.equal(reporter(grunt, {
      errorCount: 1,
      warningCount: 0,
      results: [file('source.js', [diagnostic('syntax error'), diagnostic('no rule', { ruleId: null })])]
    }), false)
    assert.equal(grunt.logs[0].includes('test-rule'), verbose)
    assert.doesNotMatch(grunt.logs[0], /null|undefined/)
  }
})

test('reporter singular counts and warning-only findings fail', () => {
  for (const [errorCount, warningCount, expected] of [[1, 0, '1 error - 0 warnings'], [0, 1, '0 errors - 1 warning']]) {
    const grunt = logger()
    assert.equal(reporter(grunt, {
      errorCount,
      warningCount,
      results: [file('one.js', [diagnostic('problem')])]
    }), false)
    assert.ok(grunt.logs[0].includes(expected))
    assert.match(grunt.logs[0], /✖ 1 problem\n/)
  }
})

test('reporter aggregate failures remain failures even without messages', () => {
  for (const [errorCount, warningCount] of [[0, 0], [1, 0], [0, 1], [2, 3]]) {
    const grunt = logger()
    const success = reporter(grunt, { errorCount, warningCount, results: [file('empty.js', [])] })
    assert.equal(success, errorCount === 0 && warningCount === 0)
    assert.deepEqual(grunt.validations, [])
    assert.equal(grunt.logs.length, 1)
    if (success) assert.match(grunt.logs[0], /No Problems/)
    else {
      assert.doesNotMatch(grunt.logs[0], /No Problems|✓/)
      assert.ok(grunt.logs[0].includes(`✖ ${errorCount + warningCount} `))
      assert.ok(grunt.logs[0].includes(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'} - ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`))
    }
  }
})

test('reporter handles missing positions and normalizes and sanitizes all displayed text', () => {
  const grunt = logger(true)
  const dangerous = 'directory/bad\n\u001b[2J\u202efile.js'
  reporter(grunt, {
    errorCount: 1,
    warningCount: 0,
    results: [file(dangerous, [{ message: 'message\r\u0007\u009b31m', ruleId: 'rule\u2066\u2069' }])]
  })
  assert.equal(grunt.validations[0], '- Validating directory/bad\\u000a\\u001b[2J\\u202efile.js')
  const output = stripVTControlCharacters(grunt.logs[0])
  assert.match(output, /line 0\s+col 0/)
  assert.ok(output.includes('message\\u000d\\u0007\\u009b31m'))
  assert.ok(output.includes('rule\\u2066\\u2069'))
  assert.doesNotMatch(output, /\u202e|\u2066|\u2069/)
})

test('reporter colors are presentation only and preserve diagnostics under ANSI stripping', t => {
  const previousLevel = chalk.level
  t.after(() => { chalk.level = previousLevel })
  const outputs = []
  for (const level of [0, 1]) {
    chalk.level = level
    const grunt = logger(true)
    reporter(grunt, {
      errorCount: 1,
      warningCount: 0,
      results: [file('colored.js', [
        diagnostic('short', { line: 2, column: 3, ruleId: 'short-rule' }),
        diagnostic('long diagnostic', { line: 12, column: 30, ruleId: 'long-rule' })
      ])]
    })
    outputs.push(grunt.logs[0])
  }
  assert.notEqual(outputs[0], outputs[1])
  assert.equal(outputs[0], stripVTControlCharacters(outputs[1]))
  const rows = outputs[0].split('\n').filter(line => line.includes('line '))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].indexOf('2'), rows[1].indexOf('12') + 1, 'line positions align on their final digit')
  assert.equal(rows[0].indexOf('col '), rows[1].indexOf('col '), 'columns start at the same visible position')
  assert.equal(rows[0].indexOf('short-rule'), rows[1].indexOf('long-rule'), 'rules align after different message widths')
})

test('aggregate-only summaries color errors red, warnings yellow, and clean results green', t => {
  const previousLevel = chalk.level
  t.after(() => { chalk.level = previousLevel })
  chalk.level = 1
  for (const [errorCount, warningCount, expected] of [
    [1, 0, chalk.red.bold('✖ 1 problem\n1 error - 0 warnings')],
    [0, 2, chalk.yellow.bold('✖ 2 problems\n0 errors - 2 warnings')],
    [0, 0, chalk.green.bold('✓ No Problems - 0 warnings')]
  ]) {
    const grunt = logger()
    reporter(grunt, { errorCount, warningCount, results: [] })
    assert.equal(grunt.logs[0], '\n' + expected)
  }
})

test('reporter preserves frozen result data and the supplied diagnostic ordering', () => {
  const diagnostics = Object.freeze([
    Object.freeze(diagnostic('first diagnostic', { line: 12, column: 30 })),
    Object.freeze(diagnostic('second diagnostic', { line: 2, column: 3 }))
  ])
  const data = Object.freeze({
    errorCount: 2,
    warningCount: 0,
    results: Object.freeze([Object.freeze(file('immutable.js', diagnostics))])
  })
  const before = JSON.stringify(data)
  const grunt = logger(true)
  assert.equal(reporter(grunt, data), false)
  assert.equal(JSON.stringify(data), before)
  const rows = stripVTControlCharacters(grunt.logs[0]).split('\n').filter(row => row.includes('diagnostic'))
  assert.equal(rows.length, 2)
  assert.match(rows[0], /line 12\s+col 30\s+first diagnostic/)
  assert.match(rows[1], /line 2\s+col 3\s+second diagnostic/)
})
