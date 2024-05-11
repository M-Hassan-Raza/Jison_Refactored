const Jison = require('../setup').Jison
const Lexer = require('../setup').Lexer
const assert = require('assert')

exports['test error caught'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['.', "return 'ERR';"]
    ]
  }
  const grammar = {
    bnf: {
      A: ['A x',
        'A y',
        ['A error', "return 'caught';"],
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xxy'), 'should parse')
  assert.equal(parser.parse('xyg'), 'caught', "should return 'caught'")
}

exports['test error recovery'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['.', "return 'ERR';"]
    ]
  }
  const grammar = {
    bnf: {
      A: ['A x',
        ['A y', "return 'recovery'"],
        'A error',
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.equal(parser.parse('xxgy'), 'recovery', 'should return foo')
}

exports['test deep error recovery'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['g', "return 'g';"],
      [';', "return ';';"],
      ['.', "return 'ERR';"]
    ]
  }
  const grammar = {
    bnf: {
      S: ['g A ;',
        ['g error ;', 'return "nested"']
      ],
      A: ['A x',
        'x']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('gxxx;'), 'should parse')
  assert.equal(parser.parse('gxxg;'), 'nested', 'should return nested')
}

exports['test no recovery'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['.', "return 'ERR';"]
    ]
  }
  const grammar = {
    bnf: {
      A: ['A x',
        ['A y', "return 'recovery'"],
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.throws(function () { parser.parse('xxgy') }, 'should throw')
}

exports['test error after error recovery'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['g', "return 'g';"],
      ['.', "return 'ERR';"]
    ]
  }
  const grammar = {
    bnf: {
      S: ['g A y',
        ['g error y', 'return "nested"']
      ],
      A: ['A x',
        'x']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.throws(function () { parser.parse('gxxx;') }, 'should return bar')
}

exports['test throws error despite recovery rule'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"],
      [';', "return ';';"],
      ['.', "return 'INVALID'"],
      ['$', "return 'EOF';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['Exp EOF', 'return $1']],
      Exp: [['E ;', '$$ = $1;'],
        ['E error', '$$ = $1;']],
      E: [['E PLUS T', "$$ = ['+',$1,$3]"],
        ['T', '$$ = $1']],
      T: [['ZERO', '$$ = [0]']]
    }
  }

  const parser = new Jison.Parser(grammar, { debug: true })
  parser.lexer = new Lexer(lexData2)

  const expectedAST = ['+', ['+', [0], [0]], [0]]

  assert.throws(function () { (parser.parse('0+0+0>'), expectedAST) })
}

exports['test correct AST after error recovery abrupt end'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"],
      [';', "return ';';"],
      ['$', "return 'EOF';"],
      ['.', "return 'INVALID';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['Exp EOF', 'return $1']],
      Exp: [['E ;', '$$ = $1;'],
        ['E error', '$$ = $1;']],
      E: [['E PLUS T', "$$ = ['+',$1,$3]"],
        ['T', '$$ = $1']],
      T: [['ZERO', '$$ = [0]']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData2)

  const expectedAST = ['+', ['+', [0], [0]], [0]]

  assert.deepEqual(parser.parse('0+0+0'), expectedAST)
}

exports['test bison error recovery example'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"],
      [';', "return ';';"],
      ['$', "return 'EOF';"],
      ['.', "return 'INVALID';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['stmt stmt EOF', 'return $1']],
      stmt: [['E ;', '$$ = $1;'],
        ['error ;', '$$ = $1;']],
      E: [['E PLUS T', "$$ = ['+',$1,$3]"],
        ['T', '$$ = $1']],
      T: [['ZERO', '$$ = [0]']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData2)

  assert.ok(parser.parse('0+0++++>;0;'), 'should recover')
}
