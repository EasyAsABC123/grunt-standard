'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')
const isGlob = require('is-glob')

exports.lintFiles = async function lintFiles (files, options) {
  if (typeof files === 'string') files = [files]
  // Standard treats an empty list as the entire project, including when fixing.
  if (files.length === 0) return { results: [], errorCount: 0, warningCount: 0 }

  const standard = (await import('standard')).default
  const opts = Object.assign({}, options)
  opts.cwd = path.resolve(opts.cwd || process.cwd())

  // Grunt expands globs into explicit paths. ESLint reports ignored explicit
  // files as warnings, so exclude them using Standard's complete ignore config.
  const engine = new standard.eslint.ESLint(standard.resolveEslintConfig(opts))
  const ignored = await Promise.all(files.map(async file => {
    const filename = path.resolve(opts.cwd, file)
    if (isGlob(file)) {
      try {
        // Existing paths can contain glob characters after Grunt expands them.
        await fs.stat(filename)
      } catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err
        // ESLint must expand patterns before applying ignore negations.
        return false
      }
    }
    return engine.isPathIgnored(filename)
  }))
  const targets = files.filter((file, index) => !ignored[index])
  if (targets.length === 0) return { results: [], errorCount: 0, warningCount: 0 }

  const results = await standard.lintFiles(targets, opts)

  return {
    results,
    errorCount: results.reduce(function (count, file) { return count + file.errorCount }, 0),
    warningCount: results.reduce(function (count, file) { return count + file.warningCount }, 0)
  }
}
