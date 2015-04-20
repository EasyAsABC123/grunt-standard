'use strict'

var path = require('path')

var chalk = require('chalk')
var table = require('text-table')

exports.reporter = function reporter (grunt, data) {
  var total = 0
  var output = '\n'

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
          chalk.gray(message.ruleId)
        ]
      }, {
        align: ['', 'r', 'l'],
        stringLength: function (str) {
          return chalk.stripColor(str).length
        }
      })) + '\n\n'
  })

  output += chalk.red.bold('✖ ' + total + ' problem' + (total === 1 ? '' : 's') + '\n')

  grunt.log.writeln(output)

  return total === 0
}

function normalize (filePath) {
  return path.relative(process.cwd(), filePath)
}
