'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { lintFiles } = require('../lib/linter')
const { reporter } = require('../lib/reporter')

async function fixture (t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'grunt-standard-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.writeFile(path.join(directory, 'package.json'), '{"name":"lint-fixture"}')
  return directory
}

function logger (verbose = false) {
  const output = []
  return {
    output,
    option: () => verbose,
    verbose: { writeln: message => output.push(message) },
    log: { writeln: message => output.push(message) },
    util: {
      pluralize: (count, forms) => forms.split('/')[count === 1 ? 0 : 1]
    }
  }
}

test('empty file targets never lint or fix unrelated project files', async t => {
  const cwd = await fixture(t)
  const filename = path.join(cwd, 'unrelated.js')
  const source = 'var unrelated = 1;\n'
  await fs.writeFile(filename, source)
  assert.deepEqual(await lintFiles([], { cwd, fix: true }), {
    results: [], errorCount: 0, warningCount: 0
  })
  assert.equal(await fs.readFile(filename, 'utf8'), source)
})

test('modern Standard results are aggregated and fix writes only requested files', async t => {
  const cwd = await fixture(t)
  const filename = path.join(cwd, 'source.js')
  const untouched = path.join(cwd, 'untouched.js')
  await fs.writeFile(filename, 'console.log("hello");\n')
  await fs.writeFile(untouched, 'console.log("untouched");\n')
  const dirty = await lintFiles(['source.js'], { cwd })
  assert.equal(dirty.results.length, 1)
  assert.ok(dirty.errorCount > 0)
  const clean = await lintFiles(['source.js'], { cwd, fix: true })
  assert.equal(clean.errorCount, 0)
  assert.equal(clean.warningCount, 0)
  assert.equal(await fs.readFile(filename, 'utf8'), "console.log('hello')\n")
  assert.equal(await fs.readFile(untouched, 'utf8'), 'console.log("untouched");\n')
})

test('legacy empty cwd falls back to the current working directory', async () => {
  const data = await lintFiles([path.resolve(__dirname, '../lib/output.js')], { cwd: '' })
  assert.equal(data.errorCount, 0)
})

test('syntax errors and missing files fail rather than silently succeeding', async t => {
  const cwd = await fixture(t)
  await fs.writeFile(path.join(cwd, 'broken.js'), 'const =\n')
  const broken = await lintFiles(['broken.js'], { cwd })
  assert.ok(broken.errorCount > 0)
  assert.equal(broken.results[0].messages[0].fatal, true)
  await assert.rejects(lintFiles(['missing.js'], { cwd }))
})

test('reporter escapes diagnostic and filename controls, including verbose output', () => {
  const grunt = logger(true)
  const success = reporter(grunt, {
    errorCount: 1,
    warningCount: 0,
    results: [{
      filePath: path.join(process.cwd(), 'bad\u001b[2J\nname.js'),
      messages: [{ message: 'bad\u001b]52;c;payload\u0007\rmessage', ruleId: '\u001b[31m' }]
    }]
  })
  assert.equal(success, false)
  const output = grunt.output.join('\n')
  assert.match(output, /line 0/)
  assert.match(output, /col 0/)
  assert.match(output, /bad\\u001b\[2J\\u000aname.js/)
  assert.match(output, /\\u0007\\u000dmessage/)
  // eslint-disable-next-line no-control-regex -- Assert that raw terminal controls are absent.
  assert.doesNotMatch(require('node:util').stripVTControlCharacters(output), /\u001b|\u0007|\r/)
})

test('reporter fails warning-only runs and succeeds clean runs', () => {
  const grunt = logger()
  assert.equal(reporter(grunt, {
    errorCount: 0,
    warningCount: 1,
    results: [{ filePath: __filename, messages: [{ line: 1, column: 1, message: 'warning' }] }]
  }), false)
  assert.equal(reporter(grunt, { errorCount: 0, warningCount: 0, results: [] }), true)
})

test('Grunt completes with a failed exit for asynchronous configuration errors', async t => {
  const cwd = await fixture(t)
  const source = path.join(cwd, 'source.js')
  const gruntfile = path.join(cwd, 'Gruntfile.js')
  await fs.symlink(path.resolve(__dirname, '../node_modules'), path.join(cwd, 'node_modules'), 'dir')
  await fs.writeFile(source, "console.log('hello')\n")
  await fs.writeFile(gruntfile, `module.exports = function (grunt) {
    grunt.initConfig({ standard: { app: {
      options: { cwd: ${JSON.stringify(cwd)}, parser: 'missing-grunt-standard-test-parser' },
      src: [${JSON.stringify(source)}]
    } } })
    grunt.loadTasks(${JSON.stringify(path.resolve(__dirname, '../tasks'))})
  }\n`)
  const run = spawnSync(process.execPath, [
    require.resolve('grunt-cli/bin/grunt'), '--gruntfile', gruntfile, 'standard'
  ], { cwd, encoding: 'utf8', timeout: 15000 })
  assert.ifError(run.error)
  assert.notEqual(run.status, 0)
  assert.match(run.stdout + run.stderr, /missing-grunt-standard-test-parser/)
})
