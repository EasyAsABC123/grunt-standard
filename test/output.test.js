'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { escapeControls } = require('../lib/output')

test('every C0, DEL, C1, separator and bidi control is escaped exactly once', () => {
  const ranges = [[0, 31], [127, 159], [0x2028, 0x202e], [0x2066, 0x2069]]
  for (const [start, end] of ranges) {
    for (let code = start; code <= end; code++) {
      const input = `left${String.fromCharCode(code)}right`
      const expected = `left\\u${code.toString(16).padStart(4, '0')}right`
      assert.equal(escapeControls(input), expected, `U+${code.toString(16)}`)
      assert.equal(escapeControls(expected), expected)
    }
  }
})

test('printable range boundaries and ordinary Unicode remain readable', () => {
  const codes = [32, 126, 160, 0x2027, 0x202f, 0x2065, 0x206a, 0xffff]
  for (const code of codes) {
    const character = String.fromCharCode(code)
    assert.equal(escapeControls(character), character)
  }
  const text = 'ASCII café Ελληνικά 日本語 مرحبا 🙂 e\u0301 \\u001b'
  assert.equal(escapeControls(text), text)
  assert.equal(escapeControls(''), '')
})

test('values use JavaScript string conversion before sanitizing', () => {
  for (const value of [null, undefined, 0, -1, NaN, Infinity, false, true, 123n, Symbol('safe')]) {
    assert.equal(escapeControls(value), String(value))
  }
  assert.equal(escapeControls(['a', 'b']), 'a,b')
  assert.equal(escapeControls({ toString: () => 'custom\nvalue' }), 'custom\\u000avalue')
  assert.throws(() => escapeControls({ toString: () => { throw new Error('conversion failure') } }), /conversion failure/)
})

test('mixed escape sequences cannot execute terminal or directional instructions', () => {
  const source = '\u001b[2J\u001b]52;c;clipboard\u0007\r\n\t\u009b31m\u202e.hidden\u2066text\u2069'
  const escaped = escapeControls(source)
  assert.equal(escaped, '\\u001b[2J\\u001b]52;c;clipboard\\u0007\\u000d\\u000a\\u0009\\u009b31m\\u202e.hidden\\u2066text\\u2069')
  assert.equal(escapeControls(escaped), escaped)
})
