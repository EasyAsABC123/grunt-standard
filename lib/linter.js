'use strict'

var P = require('promise')
var standard = require('standard')

exports.lintFiles = P.denodeify(standard.lintFiles)
