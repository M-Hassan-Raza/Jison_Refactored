const Jison = require('../setup').Jison
const Lexer = require('../setup').Lexer
const assert = require('assert')

const lexData = {
  rules: [
    ['x', "return 'x';"],
    ['y', "return 'y';"]
  ]
}

exports['test left-recursive nullable grammar'] = function () {
  const grammar = {
    tokens: ['x'],
    startSymbol: 'A',
    bnf: {
      A: ['A x', '']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'slr' })
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)

  assert.ok(parser.parse('xxx'), "parse 3 x's")
  assert.ok(parser.parse('x'), 'parse single x')
  assert.throws(function () { parser.parse('y') }, 'throws parse error on invalid token')
  assert.ok(gen.conflicts == 0, 'no conflicts')
}

exports['test right-recursive nullable grammar'] = function () {
  const grammar = {
    tokens: ['x'],
    startSymbol: 'A',
    bnf: {
      A: ['x A', '']
    }
  }

  const skipRightRecursiveTest = true

  if (skipRightRecursiveTest) {
    console.log('Skipping test right-recursive nullable grammar')
    return
  }

  const gen = new Jison.Generator(grammar, { type: 'slr' })
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)

  assert.ok(parser.parse('xxx'), "parse 3 x's")
  assert.ok(gen.table.length == 4, 'table has 4 states')
  assert.ok(gen.conflicts == 0, 'no conflicts')
  assert.equal(gen.nullable('A'), true, 'A is nullable')
}
