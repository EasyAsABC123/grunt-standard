/**
 * grunt-standard
 * https://github.com/EasyAsABC123/grunt-standard
 *
 * Copyright (c) 2015 Peter deHaan
 * Copyright (c) 2017 Justin Schuhmann
 * Licensed under the MIT license.
 */

'use strict'

const reporter = require('../lib/reporter').reporter
const lintFiles = require('../lib/linter').lintFiles
const escapeControls = require('../lib/output').escapeControls

module.exports = function (grunt) {
  // Please see the Grunt documentation for more information regarding task
  // creation: https://gruntjs.com/creating-tasks

  grunt.registerMultiTask('standard', 'Grunt plugin for standard linter.', function () {
    const done = this.async()
    // Merge task-specific and/or target-specific options with these defaults.
    const options = this.options({
      ignore: [], // file globs to ignore (has sane defaults)
      cwd: process.cwd(), // current working directory
      fix: false, // automatically fix problems
      globals: [], // global variables to declare
      plugins: [], // eslint plugins
      envs: [], // eslint environment
      parser: '' // js parser (e.g. @babel/eslint-parser)
    })

    grunt.log.subhead('Linting files...')
    lintFiles(this.filesSrc, options).then(function (data) {
      return reporter(grunt, data)
    }).then(done, function (err) {
      grunt.log.error(escapeControls(err))
      done(false)
    })
  })
}
