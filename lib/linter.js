'use strict'

exports.lintFiles = async function lintFiles (files, options) {
  // Standard treats an empty list as the entire project, including when fixing.
  if (files.length === 0) return { results: [], errorCount: 0, warningCount: 0 }

  const standard = (await import('standard')).default
  const opts = Object.assign({}, options)
  opts.cwd = opts.cwd || process.cwd()
  const results = await standard.lintFiles(files, opts)

  return {
    results,
    errorCount: results.reduce(function (count, file) { return count + file.errorCount }, 0),
    warningCount: results.reduce(function (count, file) { return count + file.warningCount }, 0)
  }
}
