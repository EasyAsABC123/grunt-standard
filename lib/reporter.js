'use strict'

const path = require('path')
const util = require('util')

const chalk = require('chalk').default
const table = require('text-table')
const escapeControls = require('./output').escapeControls

exports.reporter = function reporter (grunt, data) {
  let total = 0
  const errorCount = data.errorCount
  const warningCount = data.warningCount
  let output = '\n'
  const isVerbose = grunt.option('verbose')

  data.results.filter(function (file) {
    // Ignore files with no errors or warnings.
    return (file.messages.length > 0)
  }).forEach(function (file) {
    const filePath = escapeControls(normalize(file.filePath))
    grunt.verbose.writeln('- Validating ' + filePath)
    total += file.messages.length
    output += chalk.underline.bold(filePath) + '\n'
    output += table(file.messages.map(function (message) {
      return [
        '',
        chalk.gray('line ' + (message.line || 0)),
        chalk.gray('col ' + (message.column || 0)),
        chalk.blue(escapeControls(message.message)),
        isVerbose ? chalk.gray(escapeControls(message.ruleId || '')) : ''
      ]
    }), {
      align: ['', 'r', 'l'],
      stringLength: function (str) {
        return util.stripVTControlCharacters(str).length
      }
    }) + '\n\n'
  })

  let str = null
  if (total > 0 || errorCount > 0 || warningCount > 0) {
    const problemCount = total || errorCount + warningCount
    str = util.format('✖ %d %s\n%d %s - %d %s',
      problemCount, grunt.util.pluralize(problemCount, 'problem/problems'),
      errorCount, grunt.util.pluralize(errorCount, 'error/errors'),
      warningCount, grunt.util.pluralize(warningCount, 'warning/warnings')
    )
    output += errorCount > 0 ? chalk.red.bold(str) : chalk.yellow.bold(str)
  } else {
    str = util.format('✓ No Problems - %d %s',
      warningCount, grunt.util.pluralize(warningCount, 'warning/warnings')
    )

    output += chalk.green.bold(str)
  }

  grunt.log.writeln(output)

  return (total === 0 && errorCount === 0 && warningCount === 0)
}

function normalize (filePath) {
  return path.relative(process.cwd(), filePath)
}
