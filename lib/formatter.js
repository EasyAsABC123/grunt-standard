'use strict'

var standardFormat = require('standard-format')

exports.formatFile = function formatFile (grunt, file) {
  var text = grunt.file.read(file)
  text = standardFormat.transform(text)
  grunt.file.write(file, text)
  return file
}
