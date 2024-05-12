const Jison = require('../setup').Jison
const RegExpLexer = require('../setup').RegExpLexer
const assert = require('assert')

exports['test Semantic action basic return'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      E: [['E x', 'return 0'],
        ['E y', 'return 1'],
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 0, 'semantic action')
  assert.equal(parser.parse('y'), 1, 'semantic action')
}

exports['test return null'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      E: [['E x', 'return null;'],
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), null, 'semantic action')
}

exports['test terminal semantic values are not null'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      E: [['E x', "return [$2 === 'x']"],
        ['E y', 'return [$2]'],
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.deepEqual(parser.parse('x'), [true], 'semantic action')
  assert.deepEqual(parser.parse('y'), ['y'], 'semantic action')
}

exports['test Semantic action stack lookup'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['E', 'return $1']],
      E: [['B E', 'return $1+$2'],
        ['x', "$$ = 'EX'"]],
      B: [['y', "$$ = 'BY'"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 'EX', 'return first token')
  assert.equal(parser.parse('yx'), 'BYEX', 'return first after reduction')
}

exports['test Semantic actions on nullable grammar'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['A', 'return $1']],
      A: [['x A', "$$ = $2+'x'"],
        ['', "$$ = '->'"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xx'), '->xx', 'return first after reduction')
}

exports['test named semantic value'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['A', 'return $A']],
      A: [['x A', "$$ = $A+'x'"],
        ['', "$$ = '->'"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xx'), '->xx', 'return first after reduction')
}

exports['test ambiguous named semantic value'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    operators: [['left', 'y']],
    bnf: {
      S: [['A', 'return $A']],
      A: [['A y A', "$$ = $A2+'y'+$A1"],
        ['x', "$$ = 'x'"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xyx'), 'xyx', 'return first after reduction')
}

exports["test vars that look like named semantic values shouldn't be replaced"] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['A', 'return $A']],
      A: [['x A', "var $blah = 'x', blah = 8; $$ = $A + $blah"],
        ['', "$$ = '->'"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xx'), '->xx', 'return first after reduction')
}

exports['test previous semantic value lookup ($0)'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['A B', 'return $A + $B']],
      A: [['A x', "$$ = $A+'x'"], ['x', '$$ = $1']],
      B: [['y', '$$ = $0']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xxy'), 'xxxx', 'return first after reduction')
}

exports['test negative semantic value lookup ($-1)'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['z', "return 'z';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['G A B', 'return $G + $A + $B']],
      G: [['z', '$$ = $1']],
      A: [['A x', "$$ = $A+'x'"], ['x', '$$ = $1']],
      B: [['y', '$$ = $-1']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('zxy'), 'zxz', 'return first after reduction')
}

exports['test Build AST'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['A', 'return $1;']],
      A: [['x A', "$2.push(['ID',{value:'x'}]); $$ = $2;"],
        ['', "$$ = ['A',{}];"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  const expectedAST = ['A', {},
    ['ID', { value: 'x' }],
    ['ID', { value: 'x' }],
    ['ID', { value: 'x' }]]

  const r = parser.parse('xxx')
  assert.deepEqual(r, expectedAST)
}

exports['test 0+0 grammar'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"],
      ['$', "return 'EOF';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['E EOF', 'return $1']],
      E: [['E PLUS T', "$$ = ['+',$1,$3]"],
        ['T', '$$ = $1']],
      T: [['ZERO', '$$ = [0]']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData2)

  const expectedAST = ['+', ['+', [0], [0]], [0]]

  assert.deepEqual(parser.parse('0+0+0'), expectedAST)
}

exports['test implicit $$ = $1 action'] = function () {
  const lexData2 = {
    rules: [
      ['0', "return 'ZERO';"],
      ['\\+', "return 'PLUS';"],
      ['$', "return 'EOF';"]
    ]
  }
  const grammar = {
    bnf: {
      S: [['E EOF', 'return $1']],
      E: [['E PLUS T', "$$ = ['+',$1,$3]"],
        'T'],
      T: [['ZERO', '$$ = [0]']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData2)

  const expectedAST = ['+', ['+', [0], [0]], [0]]

  assert.deepEqual(parser.parse('0+0+0'), expectedAST)
}

exports['test yytext'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['Xexpr', 'return $1;']],
      Xexpr: [['x', '$$ = yytext;']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 'x', 'return first token')
}

exports['test yyleng'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['Xexpr', 'return $1;']],
      Xexpr: [['x', '$$ = yyleng;']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 1, 'return first token')
}

exports['test yytext more'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['expr expr', 'return $1+$2;']],
      expr: [['x', '$$ = yytext;'],
        ['y', '$$ = yytext;']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('xy'), 'xy', 'return first token')
}

exports['test action include'] = function () {
  const lexData = {
    rules: [
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      E: [['E y', 'return test();'],
        '']
    },
    actionInclude: function () {
      function test (val) {
        return 1
      }
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('y'), 1, 'semantic action')
}

exports['test next token not shifted if only one action'] = function () {
  const lexData = {
    rules: [
      ['\\(', "return '(';"],
      ['\\)', "return ')';"],
      ['y', "return yy.xed ? 'yfoo' : 'ybar';"]
    ]
  }
  const grammar = {
    bnf: {
      prog: ['e ybar'],
      esub: [['(', 'yy.xed = true;']],
      e: [['esub yfoo )', 'yy.xed = false;']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)
  assert.ok(parser.parse('(y)y'), 'should parse correctly')
}
//
// exports['test token array LIFO'] = function () {
//   const lexData = {
//     rules: [
//       ['a', "return ['b','a'];"],
//       ['c', "return 'c';"]
//     ]
//   }
//   const grammar = {
//     ebnf: {
//       pgm: [['expr expr expr', 'return $1+$2+$3;']],
//       expr: [['a', "$$ = 'a';"],
//         ['b', "$$ = 'b';"],
//         ['c', "$$ = 'c';"]]
//     },
//     options: { 'token-stack': true }
//   }
//
//   const parser = new Jison.Parser(grammar)
//   parser.lexer = new RegExpLexer(lexData)
//   assert.equal(parser.parse('ac'), 'abc', 'should return second token')
// }

exports['test YYACCEPT'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['E', 'return $1']],
      E: [['B E', 'return $1+$2'],
        ['x', "$$ = 'EX'"]],
      B: [['y', 'YYACCEPT']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 'EX', 'return first token')
  assert.equal(parser.parse('yx'), true, 'return first after reduction')
}

exports['test YYABORT'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['E', 'return $1']],
      E: [['B E', 'return $1+$2'],
        ['x', "$$ = 'EX'"]],
      B: [['y', 'YYABORT']]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('x'), 'EX', 'return first token')
  assert.equal(parser.parse('yx'), false, 'return first after reduction')
}

exports['test parse params'] = function () {
  const lexData = {
    rules: [
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    bnf: {
      E: [['E y', 'return first + second;'],
        '']
    },
    parseParams: ['first', 'second']
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)

  assert.equal(parser.parse('y', 'foo', 'bar'), 'foobar', 'semantic action')
}

exports['test symbol aliases'] = function () {
  const lexData = {
    rules: [
      ['a', "return 'a';"],
      ['b', "return 'b';"],
      ['c', "return 'c';"]
    ]
  }
  const grammar = {
    bnf: {
      pgm: [['expr[alice] expr[bob] expr[carol]', 'return $alice+$bob+$carol;']],
      expr: [['a', "$$ = 'a';"],
        ['b', "$$ = 'b';"],
        ['c', "$$ = 'c';"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)
  assert.equal(parser.parse('abc'), 'abc', 'should return original string')
}

exports['test symbol aliases in ebnf'] = function () {
  const lexData = {
    rules: [
      ['a', "return 'a';"],
      ['b', "return 'b';"],
      ['c', "return 'c';"]
    ]
  }
  const grammar = {
    ebnf: {
      pgm: [['expr[alice] (expr[bob] expr[carol])+', 'return $alice+$2;']],
      expr: [['a', "$$ = 'a';"],
        ['b', "$$ = 'b';"],
        ['c', "$$ = 'c';"]]
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new RegExpLexer(lexData)
  assert.equal(parser.parse('abc'), 'ab', 'should tolerate aliases in subexpression')
}
