/**
 * grunt-standard
 * https://github.com/pdehaan/grunt-standard
 *
 * Copyright (c) 2015 Peter deHaan
 * Licensed under the WTFPL license.
 */

'use strict'

var reporter = require('../lib/reporter').reporter
var lintFiles = require('../lib/linter').lintFiles

module.exports = function (grunt) {
  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('standard', 'Grunt plugin for standard linter.', function () {
    var done = this.async()
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      ignore: [],   // file globs to ignore (has sane defaults)
      cwd: '',      // current working directory (default: process.cwd())
      fix: false,   // automatically fix problems
      globals: [],  // global variables to declare
      plugins: [],  // eslint plugins
      envs: [],     // eslint environment
      parser: ''    // js parser (e.g. babel-eslint)
    })

    grunt.log.subhead('Linting files...')
    lintFiles(this.filesSrc, options).then(function (data) {
      var success = reporter(grunt, data)
      done(success)
    }).catch(function (err) {
      grunt.fail.fatal(err.toString())
      done(false)
    })
  })
}
