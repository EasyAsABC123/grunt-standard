/*
 * grunt-standard
 * https://github.com/pdehaan/grunt-standard
 *
 * Copyright (c) 2015 Peter deHaan
 * Licensed under the WTFPL license.
 */

'use strict'

module.exports = function (grunt) {
  // Project configuration.
  grunt.initConfig({
    // Configuration to be run (and then tested).
    standard: {
      options: {
        format: false
      },
      app: {
        src: [
          '{,lib/,tasks/}*.js'
        ]
      }
    }
  })

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks')

  // By default, lint and run all tests.
  grunt.registerTask('default', ['standard'])
}
