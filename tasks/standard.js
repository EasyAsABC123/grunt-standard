/**
 * grunt-standard
 * https://github.com/pdehaan/grunt-standard
 *
 * Copyright (c) 2015 Peter deHaan
 * Licensed under the WTFPL license.
 */

'use strict'

var chalk = require('chalk')

var formatter = require('../lib/formatter').formatFile
var reporter = require('../lib/reporter').reporter
var lintFiles = require('../lib/linter').lintFiles

module.exports = function (grunt) {
  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('standard', 'Grunt plugin for standard linter.', function () {
    var done = this.async()
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      format: false,
      lint: true
    })
    if (options.format) {
      grunt.log.writeln(chalk.bold('Formatting files...'))
      this.filesSrc.forEach(function (file) {
        formatter(grunt, file)
      })
    }

    if (options.lint) {
      grunt.log.writeln(chalk.bold('Linting files...'))
      lintFiles(this.filesSrc).then(function (data) {
        var results = reporter(data)
        var hasErrors = results.total === 0
        grunt.log.writeln(results.output)
        done(hasErrors)
      }).catch(function (err) {
        grunt.fail.fatal(err.toString())
        done(false)
      })
    }
  })
}
