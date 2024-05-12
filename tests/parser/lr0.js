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
      A: ['A x',
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)

  assert.ok(parser.parse('xxx'), "parse 3 x's")
  assert.ok(parser.parse('x'), 'parse single x')
  assert.throws(function () { parser.parse('y') }, 'throws parse error on invalid token')
}

exports['test right-recursive nullable grammar'] = function () {
  const grammar = {
    tokens: ['x'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        '']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'lr0' })

  assert.ok(gen.table.length === 4, 'table has 4 states')
  assert.ok(gen.conflicts === 2, 'encountered 2 conflicts')
}

exports['test 0+0 grammar'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"]
    ]
  }
  const grammar = {
    tokens: ['ZERO', 'PLUS'],
    startSymbol: 'E',
    bnf: {
      E: ['E PLUS T',
        'T'],
      T: ['ZERO']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData2)

  assert.ok(parser.parse('0+0+0'), 'parse')
  assert.ok(parser.parse('0'), 'parse single 0')

  assert.throws(function () { parser.parse('+') }, 'throws parse error on invalid')
}
