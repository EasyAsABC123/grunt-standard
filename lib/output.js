'use strict'

// Escape untrusted terminal controls before adding our own output formatting.
exports.escapeControls = function escapeControls (value) {
  // eslint-disable-next-line no-control-regex -- Terminal controls are intentionally matched.
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, function (character) {
    return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')
  })
}
