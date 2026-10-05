'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { lintFiles } = require('../lib/linter')

async function project (t, files = {}, standard = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'grunt-standard-linter-'))
  t.after(() => fs.rm(cwd, { recursive: true, force: true }))
  await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'linter-fixture', standard }))
  for (const [name, source] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(cwd, name)), { recursive: true })
    await fs.writeFile(path.join(cwd, name), source)
  }
  return cwd
}

function messages (data) {
  return data.results.flatMap(file => file.messages)
}

test('multi-file counts distinguish errors, warnings and clean files', async t => {
  const cwd = await project(t, {
    'error.js': 'missingName()\n',
    'warning.js': 'var counter = 1\nconsole.log(counter)\n',
    'clean.js': "console.log('hello')\n"
  })
  const data = await lintFiles(['error.js', 'warning.js', 'clean.js'], { cwd })
  assert.equal(data.results.length, 3)
  assert.equal(data.errorCount, 1)
  assert.equal(data.warningCount, 1)
  assert.deepEqual(messages(data).map(message => [message.ruleId, message.severity]).sort(), [
    ['no-undef', 2], ['no-var', 1]
  ])
})

test('globals from options and package configuration combine', async t => {
  const cwd = await project(t, { 'source.js': 'packageGlobal()\noptionGlobal()\n' }, { globals: ['packageGlobal'] })
  const withoutOption = await lintFiles(['source.js'], { cwd })
  assert.equal(withoutOption.errorCount, 1)
  assert.match(messages(withoutOption)[0].message, /optionGlobal/)
  const options = Object.freeze({ cwd, globals: Object.freeze(['optionGlobal']) })
  assert.equal((await lintFiles(['source.js'], options)).errorCount, 0)
  assert.deepEqual(options.globals, ['optionGlobal'])
  const noPackage = await lintFiles(['source.js'], { ...options, usePackageJson: false })
  assert.equal(noPackage.errorCount, 1)
  assert.match(messages(noPackage)[0].message, /packageGlobal/)
})

test('custom globals do not leak into subsequent projects', async t => {
  const cwd = await project(t, { 'source.js': 'customName()\n' })
  assert.equal((await lintFiles(['source.js'], { cwd, globals: ['customName'] })).errorCount, 0)
  assert.equal((await lintFiles(['source.js'], { cwd })).errorCount, 1)
})

test('browser and test environments combine with package environments', async t => {
  const cwd = await project(t, { 'source.js': "window.alert('hello')\ndescribe('suite', function () {})\n" }, { envs: ['mocha'] })
  const data = await lintFiles(['source.js'], { cwd, envs: ['browser'] })
  assert.equal(data.errorCount, 0)
  const withoutPackage = await lintFiles(['source.js'], { cwd, envs: ['browser'], usePackageJson: false })
  assert.equal(withoutPackage.errorCount, 1)
  assert.match(messages(withoutPackage)[0].message, /describe/)
})

test('package parser takes precedence over task parser and can be disabled', async t => {
  const cwd = await project(t, { 'source.js': "console.log('hello')\n" }, { parser: '' })
  assert.equal((await lintFiles(['source.js'], { cwd, parser: 'missing-test-parser' })).errorCount, 0)
  await assert.rejects(lintFiles(['source.js'], { cwd, parser: 'missing-test-parser', usePackageJson: false }), /missing-test-parser/)
})

test('default ignores exclude minified, coverage, vendor, dependencies and hidden files', async t => {
  const ignored = ['source.min.js', 'coverage/source.js', 'vendor/source.js', 'node_modules/dependency.js', '.hidden.js']
  const cwd = await project(t, Object.fromEntries([
    ['clean.js', "console.log('hello')\n"],
    ...ignored.map(name => [name, 'const =\n'])
  ]))
  const data = await lintFiles(['clean.js', ...ignored], { cwd })
  assert.deepEqual(data.results.map(file => path.basename(file.filePath)), ['clean.js'])
  assert.equal(data.errorCount, 0)
  assert.equal(data.warningCount, 0)
})

test('noDefaultIgnore enables linting minified, coverage and vendor files', async t => {
  const files = ['source.min.js', 'coverage/source.js', 'vendor/source.js']
  const cwd = await project(t, Object.fromEntries(files.map(name => [name, 'missingName()\n'])))
  const data = await lintFiles(files, { cwd, noDefaultIgnore: true })
  assert.equal(data.results.length, 3)
  assert.equal(data.errorCount, 3)
  assert.ok(messages(data).every(message => message.ruleId === 'no-undef'))
})

test('package noDefaultIgnore enables otherwise excluded files', async t => {
  const cwd = await project(t, { 'source.min.js': 'missingName()\n' }, { noDefaultIgnore: true })
  assert.equal((await lintFiles(['source.min.js'], { cwd })).errorCount, 1)
})

test('ignore negation retains the specifically re-included file', async t => {
  const cwd = await project(t, {
    'keep.js': 'missingName()\n',
    'skip.js': 'const =\n'
  })
  const data = await lintFiles(['keep.js', 'skip.js'], { cwd, ignore: ['*.js', '!keep.js'] })
  assert.deepEqual(data.results.map(file => path.basename(file.filePath)), ['keep.js'])
  assert.equal(data.errorCount, 1)
  assert.equal(messages(data)[0].ruleId, 'no-undef')
})

test('glob targets expand before ignore negations are applied', async t => {
  const cwd = await project(t, {
    'keep.js': 'missingName()\n',
    'skip.js': 'const =\n'
  })
  const data = await lintFiles(['*.js'], { cwd, ignore: ['*.js', '!keep.js'] })
  assert.deepEqual(data.results.map(file => path.basename(file.filePath)), ['keep.js'])
  assert.equal(data.errorCount, 1)
  assert.equal(messages(data)[0].ruleId, 'no-undef')
})

test('directory and nested glob targets respect re-included descendants', async t => {
  const cwd = await project(t, {
    'src/keep.js': 'missingName()\n',
    'src/skip.js': 'const =\n'
  })
  for (const targets of [['src'], ['src/**/*.js']]) {
    const data = await lintFiles(targets, { cwd, ignore: ['src/*.js', '!src/keep.js'] })
    assert.deepEqual(data.results.map(file => path.basename(file.filePath)), ['keep.js'])
    assert.equal(data.errorCount, 1)
    assert.equal(messages(data)[0].ruleId, 'no-undef')
  }
})

test('literal existing filenames with glob characters retain explicit ignore semantics', async t => {
  const source = 'console.log("hello");\n'
  const cwd = await project(t, { 'file[1].js': source })
  const data = await lintFiles(['file[1].js'], { cwd, ignore: ['file*.js'], fix: true })
  assert.deepEqual(data.results, [])
  assert.equal(data.errorCount, 0)
  assert.equal(await fs.readFile(path.join(cwd, 'file[1].js'), 'utf8'), source)
})

test('explicit missing ignored paths remain skipped while missing non-ignored globs reject', async t => {
  const cwd = await project(t)
  assert.deepEqual((await lintFiles(['missing.js'], { cwd, ignore: ['missing.js'] })).results, [])
  await assert.rejects(lintFiles(['missing/*.js'], { cwd }), /No files matching/)
})

test('disabling Git ignore retains package ignores', async t => {
  const cwd = await project(t, {
    '.gitignore': 'git.js\n',
    'git.js': 'missingName()\n',
    'package.js': 'const =\n'
  }, { ignore: ['package.js'] })
  assert.deepEqual((await lintFiles(['git.js', 'package.js'], { cwd })).results, [])
  const data = await lintFiles(['git.js', 'package.js'], { cwd, useGitIgnore: false })
  assert.equal(data.results.length, 1)
  assert.equal(data.errorCount, 1)
  assert.equal(messages(data)[0].ruleId, 'no-undef')
})

test('fix formats selected files but preserves unfixable errors and other files', async t => {
  const selected = 'missingName("hello");\n'
  const untouched = 'console.log("untouched");\n'
  const cwd = await project(t, { 'source.js': selected, 'untouched.js': untouched })
  const data = await lintFiles(['source.js'], { cwd, fix: true })
  assert.equal(data.errorCount, 1)
  assert.equal(data.warningCount, 0)
  assert.equal(messages(data)[0].ruleId, 'no-undef')
  assert.equal(await fs.readFile(path.join(cwd, 'source.js'), 'utf8'), "missingName('hello')\n")
  assert.equal(await fs.readFile(path.join(cwd, 'untouched.js'), 'utf8'), untouched)
})

test('lint without fix leaves invalid formatting unchanged', async t => {
  const source = 'console.log("hello");\n'
  const cwd = await project(t, { 'source.js': source })
  const data = await lintFiles(['source.js'], { cwd })
  assert.ok(data.errorCount > 0)
  assert.equal(await fs.readFile(path.join(cwd, 'source.js'), 'utf8'), source)
})

test('absolute and relative cwd use the same files and preserve frozen options', async t => {
  const cwd = await project(t, { 'source.js': "console.log('hello')\n" })
  for (const value of [cwd, path.relative(process.cwd(), cwd)]) {
    const options = Object.freeze({ cwd: value, ignore: Object.freeze([]), globals: Object.freeze([]) })
    const data = await lintFiles(['source.js'], options)
    assert.equal(data.errorCount, 0)
    assert.equal(data.results[0].filePath, path.join(cwd, 'source.js'))
    assert.equal(options.cwd, value)
  }
})

test('omitted and falsy cwd use current cwd without changing options', async t => {
  const cwd = await project(t, { 'source.js': "console.log('hello')\n" })
  const source = path.join(cwd, 'source.js')
  for (const value of [undefined, '', null, false]) {
    const options = Object.freeze({ cwd: value, usePackageJson: false, useGitIgnore: false })
    const data = await lintFiles([source], options)
    assert.equal(data.errorCount, 0)
    assert.equal(data.results[0].filePath, source)
    assert.equal(options.cwd, value)
  }
  assert.equal((await lintFiles([source])).errorCount, 0)
})

test('syntax failures report fatal positions while missing paths and parsers reject', async t => {
  const cwd = await project(t, { 'source.js': 'const =\n' })
  const data = await lintFiles(['source.js'], { cwd })
  assert.equal(data.errorCount, 1)
  assert.equal(messages(data)[0].fatal, true)
  assert.equal(messages(data)[0].line, 1)
  assert.ok(messages(data)[0].column > 0)
  await assert.rejects(lintFiles(['missing.js'], { cwd }), /No files matching/)
  await assert.rejects(lintFiles(['source.js'], { cwd, parser: 'missing-linter-test-parser' }), /missing-linter-test-parser/)
})

test('directory, glob and string targets lint only matching source files', async t => {
  const cwd = await project(t, {
    'src/a.js': "console.log('a')\n",
    'src/nested/b.js': "console.log('b')\n",
    'outside.js': 'missingName()\n'
  })
  for (const target of [['src'], ['src/**/*.js'], 'src/**/*.js']) {
    const data = await lintFiles(target, { cwd })
    assert.equal(data.results.length, 2)
    assert.equal(data.errorCount, 0)
    assert.ok(data.results.every(file => file.filePath.startsWith(path.join(cwd, 'src') + path.sep)))
  }
})

test('package source extensions include otherwise unmatched files in directories', async t => {
  const cwd = await project(t, { 'src/source.custom': "console.log('hello')\n" }, { extensions: ['.custom'] })
  const data = await lintFiles(['src'], { cwd })
  assert.equal(data.results.length, 1)
  assert.equal(data.errorCount, 0)
  assert.equal(path.basename(data.results[0].filePath), 'source.custom')
})

test('cache never hides a file edited between successful runs', async t => {
  const cwd = await project(t, { 'source.js': "console.log('hello')\n" })
  assert.equal((await lintFiles(['source.js'], { cwd })).errorCount, 0)
  assert.equal((await lintFiles(['source.js'], { cwd })).errorCount, 0)
  await fs.writeFile(path.join(cwd, 'source.js'), 'missingName()\n')
  const timestamp = new Date(Date.now() + 2000)
  await fs.utimes(path.join(cwd, 'source.js'), timestamp, timestamp)
  const changed = await lintFiles(['source.js'], { cwd })
  assert.equal(changed.errorCount, 1)
  assert.equal(messages(changed)[0].ruleId, 'no-undef')
})

test('supported modern JavaScript and module extensions parse cleanly', async t => {
  const cwd = await project(t, {
    'modern.js': 'const config = { nested: { value: 1 } }\nconsole.log(config.nested?.value ?? 0)\n',
    'module.mjs': 'export const number = 1\n',
    'common.cjs': 'module.exports = { number: 1 }\n',
    'view.jsx': 'const element = <div>Hello</div>\nconsole.log(element)\n'
  })
  const data = await lintFiles(['modern.js', 'module.mjs', 'common.cjs', 'view.jsx'], { cwd })
  assert.equal(data.results.length, 4)
  assert.equal(data.errorCount, 0)
  assert.equal(data.warningCount, 0)
})
