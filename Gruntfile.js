/*
 * grunt-standard
 * https://github.com/EasyAsABC123/grunt-standard
 *
 * Copyright (c) 2015 Peter deHaan
 * Copyright (c) 2017 Justin Schuhmann
 * Licensed under the MIT license.
 */

'use strict'

module.exports = function (grunt) {
  // Project configuration.
  grunt.initConfig({
    // Configuration to be run (and then tested).
    standard: {
      app: {
        src: [
          'Gruntfile.js',
          'lib/**/*.js',
          'tasks/**/*.js',
          'scripts/**/*.js',
          'test/**/*.js'
        ]
      }
    }
  })

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks')

  // By default, lint and run all tests.
  grunt.registerTask('default', ['standard'])
}
