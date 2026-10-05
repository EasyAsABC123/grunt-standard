'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

// Load one isolated task closure, then restore every cache entry immediately.
function taskWithDependencies (lintFiles, reporter) {
  const replacements = [
    [require.resolve('../lib/linter'), { lintFiles }],
    [require.resolve('../lib/reporter'), { reporter }],
    [require.resolve('../tasks/standard'), null]
  ]
  const saved = replacements.map(([filename]) => require.cache[filename])
  try {
    for (const [filename, exports] of replacements) {
      if (exports) require.cache[filename] = { id: filename, filename, loaded: true, exports }
      else delete require.cache[filename]
    }
    return require('../tasks/standard')
  } finally {
    replacements.forEach(([filename], index) => {
      if (saved[index]) require.cache[filename] = saved[index]
      else delete require.cache[filename]
    })
  }
}

function startTask ({ lintFiles, reporter, options = {}, files = ['selected.js'] }) {
  const events = []
  const errors = []
  const completions = []
  let callback
  let defaults
  let resolveCompletion
  const completion = new Promise(resolve => { resolveCompletion = resolve })
  const grunt = {
    registerMultiTask: (name, description, fn) => {
      assert.equal(name, 'standard')
      assert.match(description, /standard linter/)
      callback = fn
    },
    log: {
      subhead: message => events.push(message),
      error: message => errors.push(message)
    }
  }
  taskWithDependencies(lintFiles, reporter)(grunt)
  callback.call({
    filesSrc: files,
    async: () => {
      events.push('async')
      return result => {
        completions.push(result)
        resolveCompletion()
      }
    },
    options: value => {
      defaults = value
      return { ...value, ...options }
    }
  })
  return { defaults, events, errors, completions, completion }
}

async function runTask (settings) {
  const run = startTask(settings)
  // Wait for the actual callback instead of assuming one event-loop turn suffices.
  await run.completion
  await new Promise(resolve => setImmediate(resolve))
  return run
}

test('task registers, merges defaults and forwards selected files and reporter result', { timeout: 2000 }, async () => {
  const files = ['one.js', 'two.js']
  const data = { results: [], errorCount: 0, warningCount: 0 }
  let receivedOptions
  const run = await runTask({
    files,
    options: { cwd: '/custom', fix: true, globals: ['external'] },
    lintFiles: async (receivedFiles, options) => {
      assert.equal(receivedFiles, files)
      receivedOptions = options
      return data
    },
    reporter: (grunt, receivedData) => {
      assert.equal(receivedData, data)
      assert.equal(typeof grunt.log.error, 'function')
      return true
    }
  })
  assert.deepEqual(run.defaults, {
    ignore: [], cwd: process.cwd(), fix: false, globals: [], plugins: [], envs: [], parser: ''
  })
  assert.deepEqual(receivedOptions, { ...run.defaults, cwd: '/custom', fix: true, globals: ['external'] })
  assert.deepEqual(run.events, ['async', 'Linting files...'])
  assert.deepEqual(run.completions, [true])
  assert.deepEqual(run.errors, [])
})

test('task completes exactly once with failed reporter status', { timeout: 2000 }, async () => {
  const run = await runTask({ lintFiles: async () => ({}), reporter: () => false })
  assert.deepEqual(run.completions, [false])
  assert.deepEqual(run.errors, [])
})

test('task handles async lint rejections and safely logs errors without invoking reporter', { timeout: 2000 }, async () => {
  for (const rejection of [new Error('bad\u001b[2J\nconfig'), 'failure\u0007\rtext']) {
    const run = await runTask({
      lintFiles: async () => { throw rejection },
      reporter: () => assert.fail('reporter called after lint rejection')
    })
    assert.deepEqual(run.completions, [false])
    assert.equal(run.errors.length, 1)
    assert.ok(run.errors[0].includes('\\u'))
    // eslint-disable-next-line no-control-regex -- Verify errors cannot inject terminal controls.
    assert.doesNotMatch(run.errors[0], /[\u0000-\u001f\u007f-\u009f]/)
  }
})

test('task catches reporter exceptions and rejected reporter promises exactly once', { timeout: 2000 }, async () => {
  for (const reporter of [
    () => { throw new Error('reporter\u202efailure') },
    async () => { throw new Error('async reporter\nfailed') }
  ]) {
    const run = await runTask({ lintFiles: async () => ({}), reporter })
    assert.deepEqual(run.completions, [false])
    assert.equal(run.errors.length, 1)
    assert.match(run.errors[0], /reporter/)
    assert.doesNotMatch(run.errors[0], /\n|\u202e/)
  }
})

test('empty task file lists and custom option arrays pass through without mutation', { timeout: 2000 }, async () => {
  const options = { ignore: ['vendor/**'], envs: ['browser'], plugins: ['test'], parser: 'parser' }
  const original = structuredClone(options)
  const run = await runTask({
    files: [],
    options,
    lintFiles: async (files, received) => {
      assert.deepEqual(files, [])
      for (const key of Object.keys(options)) assert.equal(received[key], options[key])
      return {}
    },
    reporter: () => true
  })
  assert.deepEqual(options, original)
  assert.deepEqual(run.completions, [true])
})

test('task waits for both lint and reporter to finish before completing exactly once', { timeout: 2000 }, async () => {
  let resolveLint
  let resolveReport
  let reporterCalls = 0
  const lint = new Promise(resolve => { resolveLint = resolve })
  const report = new Promise(resolve => { resolveReport = resolve })
  const data = { results: [], errorCount: 0, warningCount: 0 }
  const run = startTask({
    lintFiles: () => lint,
    reporter: (grunt, received) => {
      assert.equal(received, data)
      reporterCalls++
      return report
    }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(run.completions, [], 'pending lint must not complete the task')
  assert.equal(reporterCalls, 0, 'reporter must not run before lint settles')
  resolveLint(data)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reporterCalls, 1)
  assert.deepEqual(run.completions, [], 'pending reporter must not complete the task')
  resolveReport(false)
  await run.completion
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(run.completions, [false])
  assert.deepEqual(run.errors, [])
})

test('task dependency stubs restore exact original module cache entries', () => {
  const names = ['../lib/linter', '../lib/reporter', '../tasks/standard'].map(require.resolve)
  const exports = names.map(name => require(name))
  const originals = names.map(name => require.cache[name])
  const task = taskWithDependencies(async () => ({}), () => true)
  assert.equal(typeof task, 'function')
  names.forEach((name, index) => assert.equal(require.cache[name], originals[index]))
  names.forEach((name, index) => assert.equal(require(name), exports[index]))
})
