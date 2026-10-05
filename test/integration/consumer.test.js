'use strict'

const assert = require('node:assert/strict')
const { before, after, describe, test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repository = path.resolve(__dirname, '../..')
const fixture = path.join(repository, 'test/fixtures/consumer')
const npmCli = process.env.npm_execpath || fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'))
let temporary
let packed
const projects = {}

function node (script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 180000,
    env: { ...process.env, NODE_PATH: '', NO_COLOR: '1', FORCE_COLOR: '0' }
  })
  if (result.error) throw result.error
  assert.equal(result.signal, null, `Child terminated by ${result.signal}: ${result.stdout}${result.stderr}`)
  assert.ok(Number.isInteger(result.status) && result.status >= 0, 'Child did not return a normal exit status')
  return { status: result.status, output: result.stdout + result.stderr, stdout: result.stdout }
}

function npm (args, cwd) {
  const result = node(npmCli, args, cwd)
  assert.equal(result.status, 0, result.output)
  return result
}

before(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'grunt-standard-consumers-'))
  const pack = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], repository).stdout)[0]
  packed = pack
  for (const release of ['3.2.0', '4.0.0']) {
    const project = path.join(temporary, release)
    fs.mkdirSync(project)
    fs.copyFileSync(path.join(fixture, 'package.fixture.json'), path.join(project, 'package.json'))
    fs.copyFileSync(path.join(fixture, 'package-lock.fixture.json'), path.join(project, 'package-lock.json'))
    npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], project)
    const frozen = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json')))
    for (const [location, entry] of Object.entries(frozen.packages)) {
      if (!location) continue
      assert.equal(JSON.parse(fs.readFileSync(path.join(project, location, 'package.json'))).version, entry.version, location)
    }
    if (release === '4.0.0') {
      npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', path.join(temporary, pack.filename)], project)
    }
    const installed = path.join(project, 'node_modules/grunt-standard')
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'))).version, release)
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'node_modules/grunt/package.json'))).version, '1.6.3')
    assert.equal(fs.lstatSync(installed).isSymbolicLink(), false)
    const standard = require.resolve('standard/package.json', { paths: [installed] })
    assert.equal(JSON.parse(fs.readFileSync(standard)).version, release === '3.2.0' ? '12.0.1' : '17.1.2')
    projects[release] = { project, installed }
  }
}, { timeout: 360000 })

after(() => {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true })
})

function consumer (release, files = {}, standard = { app: { src: ['source.js'] } }, packageOptions = {}) {
  const root = fs.mkdtempSync(path.join(projects[release].project, 'case with spaces-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer-case', private: true, ...packageOptions }))
  fs.writeFileSync(path.join(root, 'Gruntfile.js'), 'module.exports = function (grunt) {\n  grunt.initConfig(' + JSON.stringify({ standard }) + ")\n  grunt.loadNpmTasks('grunt-standard')\n}\n")
  for (const [filename, contents] of Object.entries(files)) {
    const target = path.join(root, filename)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
  return {
    root,
    read: filename => fs.readFileSync(path.join(root, filename), 'utf8'),
    run: (...args) => node(path.join(projects[release].project, 'node_modules/grunt/bin/grunt'), args.length ? args : ['standard'], root)
  }
}

for (const release of ['3.2.0', '4.0.0']) {
  describe('installed npm consumer ' + release, () => {
    test('discovers task through loadNpmTasks, help and clean source', () => {
      const app = consumer(release, { 'source.js': "console.log('clean')\n" })
      const clean = app.run()
      assert.equal(clean.status, 0, clean.output)
      assert.match(clean.output, /No Problems/)
      const help = app.run('--help')
      assert.equal(help.status, 0)
      assert.match(help.output, /standard\s+Grunt plugin/)
      assert.equal(typeof require(projects[release].installed), 'function')
    })

    test('dirty and syntax-error files fail with actionable diagnostics', () => {
      for (const source of ['console.log("dirty");\n', 'const =\n']) {
        const result = consumer(release, { 'source.js': source }).run()
        assert.equal(result.status, 3, result.output)
        assert.match(result.output, /source.js/)
        assert.match(result.output, /line|Parsing error/)
      }
    })

    test('fix changes only selected files and verbose prints rule identifiers', () => {
      const app = consumer(release, { 'source.js': 'console.log("dirty");\n', 'unrelated.js': 'console.log("untouched");\n' }, {
        options: { fix: true }, app: { src: ['source.js'] }
      })
      assert.equal(app.run().status, 0)
      assert.equal(app.read('source.js'), "console.log('dirty')\n")
      assert.equal(app.read('unrelated.js'), 'console.log("untouched");\n')
      const verbose = consumer(release, { 'source.js': 'console.log("dirty");\n' }).run('standard', '--verbose')
      assert.notEqual(verbose.status, 0)
      assert.match(verbose.output, /quotes|semi/)
    })

    test('globals and environments are honored', () => {
      const cases = [
        [{ globals: ['customGlobal'] }, {}, 'customGlobal()\n'],
        [{ envs: ['browser'] }, {}, "window.alert('hello')\n"]
      ]
      for (const [options, pkg, source] of cases) {
        const app = consumer(release, { 'source.js': source }, { options, app: { src: ['source.js'] } }, pkg)
        const result = app.run()
        assert.equal(result.status, 0, result.output)
      }
    })

    test('multiple targets merge task options and target overrides', () => {
      const app = consumer(release, { 'first.js': 'firstGlobal()\n', 'second.js': 'secondGlobal()\n' }, {
        options: { globals: ['firstGlobal'] },
        first: { src: ['first.js'] },
        second: { options: { globals: ['secondGlobal'] }, src: ['second.js'] }
      })
      const result = app.run()
      assert.equal(result.status, 0, result.output)
      assert.match(result.output, /standard:first/)
      assert.match(result.output, /standard:second/)
    })

    for (const relative of [false, true]) {
      test((relative ? 'relative' : 'absolute') + ' cwd selects the intended file and verifies release-specific package configuration', () => {
        const app = consumer(release, {
          'nested dir/source.js': 'nestedGlobal("cwd");\n',
          'nested dir/package.json': JSON.stringify({ standard: { globals: ['nestedGlobal'] } }),
          'unrelated.js': 'console.log("untouched");\n'
        })
        function configure (fix) {
          const cwd = relative ? "'nested dir'" : "require('path').join(__dirname, 'nested dir')"
          fs.writeFileSync(path.join(app.root, 'Gruntfile.js'), 'module.exports = function (grunt) { grunt.initConfig({ standard: { options: { cwd: ' + cwd + ', fix: ' + fix + " }, app: { src: [require('path').join(__dirname, 'nested dir/source.js')] } } }); grunt.loadNpmTasks('grunt-standard') }\n")
        }
        configure(false)
        const dirty = app.run('standard', '--verbose')
        assert.equal(dirty.status, 3, dirty.output)
        assert.match(dirty.output, /quotes|semi/)
        if (release === '4.0.0') assert.doesNotMatch(dirty.output, /nestedGlobal.*not defined/)
        else assert.match(dirty.output, /nestedGlobal.*not defined/)
        assert.equal(app.read('nested dir/source.js'), 'nestedGlobal("cwd");\n')
        configure(true)
        const fixed = app.run()
        assert.equal(fixed.status, release === '4.0.0' ? 0 : 3, fixed.output)
        if (release === '3.2.0') assert.match(fixed.output, /nestedGlobal.*not defined/)
        assert.equal(app.read('nested dir/source.js'), "nestedGlobal('cwd')\n")
        assert.equal(app.read('unrelated.js'), 'console.log("untouched");\n')
      })
    }

    test('parser resolution errors fail and do not mutate selected files', () => {
      const source = "console.log('safe')\n"
      const app = consumer(release, { 'source.js': source }, { options: { parser: 'definitely-nonexistent-parser-fixture' }, app: { src: ['source.js'] } })
      const result = app.run()
      assert.equal(result.status, 3, result.output)
      assert.match(result.output, /definitely-nonexistent-parser-fixture/)
      assert.equal(app.read('source.js'), source)
    })

    test('direct installed linter preserves result shape and reporter contracts', async () => {
      const app = consumer(release, { 'source.js': 'console.log("dirty");\n', 'clean.js': "console.log('clean')\n", 'syntax.js': 'const =\n', 'unrelated.js': 'console.log("untouched");\n' })
      const linter = require(path.join(projects[release].installed, 'lib/linter'))
      const { reporter } = require(path.join(projects[release].installed, 'lib/reporter'))
      const dirty = await linter.lintFiles(['source.js', 'clean.js', 'syntax.js'].map(file => path.join(app.root, file)), { cwd: app.root })
      assert.ok(Array.isArray(dirty.results))
      assert.equal(dirty.results.length, 3)
      assert.equal(dirty.results.find(file => file.filePath.endsWith('clean.js')).errorCount, 0)
      assert.match(dirty.results.find(file => file.filePath.endsWith('syntax.js')).messages[0].message, /Parsing error/)
      assert.ok(dirty.errorCount > 0)
      assert.equal(dirty.errorCount, dirty.results.reduce((count, file) => count + file.errorCount, 0))
      assert.equal(dirty.warningCount, dirty.results.reduce((count, file) => count + file.warningCount, 0))
      assert.equal(typeof dirty.warningCount, 'number')
      const output = []
      const grunt = { option: () => true, verbose: { writeln: text => output.push(text) }, log: { writeln: text => output.push(text) }, util: { pluralize: (count, forms) => forms.split('/')[count === 1 ? 0 : 1] } }
      assert.equal(reporter(grunt, dirty), false)
      assert.match(output.join('\n'), /source.js/)
      assert.match(output.join('\n'), /quotes|semi/)
      const clean = await linter.lintFiles([path.join(app.root, 'source.js')], { cwd: app.root, fix: true })
      assert.equal(clean.errorCount, 0)
      assert.equal(reporter(grunt, clean), true)
      assert.match(output.join('\n'), /No Problems/)
      assert.equal(reporter(grunt, { results: [{ filePath: path.join(app.root, 'warning.js'), messages: [{ message: 'warning-only-fixture', line: 1, column: 1, ruleId: 'fixture-rule' }] }], errorCount: 0, warningCount: 1 }), false)
      assert.match(output.join('\n'), /warning-only-fixture/)
      assert.equal(app.read('unrelated.js'), 'console.log("untouched");\n')
      for (const [options, source] of [[{ globals: ['customGlobal'] }, 'customGlobal()\n'], [{ envs: ['browser'] }, "window.alert('hello')\n"]]) {
        const configured = consumer(release, { 'source.js': source })
        const result = await linter.lintFiles([path.join(configured.root, 'source.js')], { cwd: configured.root, ...options })
        assert.equal(result.errorCount, 0)
        assert.equal(result.warningCount, 0)
      }
    })
  })
}

describe('intentional release differences', () => {
  test('empty target no longer broadens lint/fix to unrelated files', () => {
    for (const release of ['3.2.0', '4.0.0']) {
      const dirty = 'console.log("untouched");\n'
      const app = consumer(release, { 'unrelated.js': dirty }, { options: { fix: true }, app: { src: ['missing-*.js'] } })
      const result = app.run()
      assert.equal(result.status, 0, result.output)
      assert.equal(app.read('unrelated.js'), release === '4.0.0' ? dirty : "console.log('untouched')\n")
    }
  })

  test('explicit ignore and all-ignored targets leave sources unchanged in both releases', () => {
    for (const release of ['3.2.0', '4.0.0']) {
      const source = 'console.log("ignored");\n'
      const app = consumer(release, { 'source.js': source }, { options: { ignore: ['source.js'], fix: true }, app: { src: ['source.js'] } })
      const result = app.run()
      assert.equal(result.status, 0, result.output)
      assert.equal(app.read('source.js'), source)
    }
  })

  test('default cwd now honors package Standard globals configuration', () => {
    for (const release of ['3.2.0', '4.0.0']) {
      const app = consumer(release, { 'source.js': 'fromPackage()\n' }, { app: { src: ['source.js'] } }, { standard: { globals: ['fromPackage'] } })
      const result = app.run()
      assert.equal(result.status, release === '4.0.0' ? 0 : 3, result.output)
      if (release === '3.2.0') assert.match(result.output, /fromPackage.*not defined/)
    }
  })

  test('Standard 17 introduces prefer-const warnings absent in Standard 12', () => {
    const source = "var value = 'hello'\nconsole.log(value)\n"
    const legacy = consumer('3.2.0', { 'source.js': source }).run()
    const current = consumer('4.0.0', { 'source.js': source }).run('standard', '--verbose')
    assert.equal(legacy.status, 0, legacy.output)
    assert.notEqual(current.status, 0)
    assert.match(current.output, /const|no-var/)
  })

  test('candidate consumer diagnostics escape bidi controls in filenames', () => {
    const filename = 'source\u202e.js'
    const app = consumer('4.0.0', { [filename]: 'console.log("dirty");\n' }, { app: { src: [filename] } })
    const result = app.run()
    assert.notEqual(result.status, 0)
    assert.ok(result.output.includes('source\\u202e.js'))
    assert.ok(!result.output.includes('\u202e'))
  })

  test('candidate npm tarball contains runtime files and excludes repository tooling', () => {
    const files = packed.files.map(file => file.path)
    for (const required of ['tasks/standard.js', 'lib/linter.js', 'lib/reporter.js', 'lib/output.js', 'package.json', 'README.md', 'CONTRIBUTE.md', 'SECURITY.md', 'LICENSE']) assert.ok(files.includes(required), required)
    assert.ok(files.every(file => !/^(test\/|\.github\/|node_modules\/|Gruntfile\.js|package-lock\.json|yarn\.lock|\.travis\.yml)/.test(file)))
  })
})
