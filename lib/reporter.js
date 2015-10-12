'use strict'

var path = require('path')
var util = require('util')

var chalk = require('chalk')
var table = require('text-table')

exports.reporter = function reporter (grunt, data) {
  var total = 0
  var output = '\n'
  var isVerbose = grunt.option('verbose')

  data.results.filter(function (file) {
    // Ignore files with no errors or warnings.
    return (file.messages.length > 0)
  }).forEach(function (file) {
    var filePath = normalize(file.filePath)
    grunt.verbose.writeln('- Validating %s', filePath)
    total += file.messages.length
    output += chalk.underline.bold(filePath) + '\n'
    output += table(file.messages.map(function (message) {
      return [
        '',
        chalk.gray('line ' + message.line || 0),
        chalk.gray('col ' + message.column || 0),
        chalk.blue(message.message),
        isVerbose ? chalk.gray(message.ruleId) : ''
      ]
    }, {
      align: ['', 'r', 'l'],
      stringLength: function (str) {
        return chalk.stripColor(str).length
      }
    })) + '\n\n'
  })

  var str = null
  if(total > 0) {
    str = util.format('✖ %d %s\n', total, grunt.util.pluralize(total, 'problem/problems'))
    output += chalk.red.bold(str)
  } else {
    str = util.format('✓ No Problems')
    output += chalk.green.bold(str)
  }

  grunt.log.writeln(output)

  return (total === 0)
}

function normalize (filePath) {
  return path.relative(process.cwd(), filePath)
}
