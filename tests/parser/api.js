const Jison = require('../setup').Jison
const Lexer = require('../setup').Lexer
const assert = require('assert')

const lexData = {
  rules: [
    ['x', "return 'x';"],
    ['y', "return 'y';"]
  ]
}

exports['test tokens as a string'] = function () {
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xyx'), 'parse xyx')
}

exports['test generator'] = function () {
  const grammar = {
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xyx'), 'parse xyx')
}

exports['test extra spaces in productions'] = function () {
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x ',
        'A y',
        '']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xyx'), 'parse xyx')
}

exports['test | seperated rules'] = function () {
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: 'A x | A y | '
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xyx'), 'parse xyx')
}

exports['test start symbol optional'] = function () {
  const grammar = {
    tokens: 'x y',
    bnf: {
      A: 'A x | A y | '
    }
  }

  const parser = new Jison.Parser(grammar)
  const ok = true
  assert.ok(ok, 'no error')
}

exports['test start symbol should be nonterminal'] = function () {
  const grammar = {
    tokens: 'x y',
    startSymbol: 'x',
    bnf: {
      A: 'A x | A y | '
    }
  }

  assert.throws(function () { new Jison.Generator(grammar) }, 'throws error')
}

exports['test token list as string'] = function () {
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: 'A x | A y | '
    }
  }

  const gen = new Jison.Generator(grammar)
  assert.ok(gen.terminals.indexOf('x') >= 0)
}

exports['test grammar options'] = function () {
  const grammar = {
    options: { type: 'slr' },
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const gen = new Jison.Generator(grammar)
  assert.ok(gen)
}

exports['test overwrite grammar options'] = function () {
  const grammar = {
    options: { type: 'slr' },
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'lr0' })
  assert.equal(gen.constructor, Jison.LR0Generator)
}

exports['test yy shared scope'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return yy.xed ? 'yfoo' : 'ybar';"]
    ]
  }
  const grammar = {
    tokens: 'x yfoo ybar',
    startSymbol: 'A',
    bnf: {
      A: [['A x', 'yy.xed = true;'],
        ['A yfoo', " return 'foo';"],
        ['A ybar', " return 'bar';"],
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lr0' })
  parser.lexer = new Lexer(lexData)
  assert.equal(parser.parse('y'), 'bar', 'should return bar')
  assert.equal(parser.parse('xxy'), 'foo', 'should return foo')
}

exports['test optional token declaration'] = function () {
  const grammar = {
    options: { type: 'slr' },
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'lr0' })
  assert.equal(gen.constructor, Jison.LR0Generator)
}

exports['test custom parse error method'] = function () {
  const lexData = {
    rules: [
      ['a', "return 'a';"],
      ['b', "return 'b';"],
      ['c', "return 'c';"],
      ['d', "return 'd';"],
      ['g', "return 'g';"]
    ]
  }
  const grammar = {
    tokens: 'a b c d g',
    startSymbol: 'S',
    bnf: {
      S: ['a g d',
        'a A c',
        'b A d',
        'b g c'],
      A: ['B'],
      B: ['g']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lalr' })
  parser.lexer = new Lexer(lexData)
  let result = {}
  parser.yy.parseError = function (str, hash) {
    result = hash
    throw str
  }

  assert.throws(function () { parser.parse('aga') })
  assert.strictEqual(result.text, 'a', 'parse error text should equal b')
  assert.strictEqual(typeof result.token, 'string', 'parse error token should be a string')
  assert.strictEqual(result.line, 0, 'hash should include line number')
}

exports['test jison grammar as string'] = function () {
  const grammar = '%% A : A x | A y | ;'

  const parser = new Jison.Generator(grammar).createParser()
  parser.lexer = new Lexer(lexData)
  assert.ok(parser.parse('xyx'), 'parse xyx')
}

exports['test no default resolve'] = function () {
  const grammar = {
    tokens: ['x'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        '']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'lr0', noDefaultResolve: true })
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)

  assert.ok(gen.table.length == 4, 'table has 4 states')
  assert.ok(gen.conflicts == 2, 'encountered 2 conflicts')
  assert.throws(function () { parser.parse('xx') }, 'throws parse error for multiple actions')
}

exports["test EOF in 'Unexpected token' error message"] = function () {
  const grammar = {
    bnf: {
      A: ['x x y']
    }
  }

  const parser = new Jison.Parser(grammar)
  parser.lexer = new Lexer(lexData)
  parser.lexer.showPosition = null // needed for "Unexpected" message
  parser.yy.parseError = function (str, hash) {
    assert.ok(str.match('end of input'))
  }

  assert.throws(function () { parser.parse('xx') })
}

exports['test locations'] = function () {
  const grammar = {
    tokens: ['x', 'y'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        ['y', 'return @1'],
        '']
    }
  }

  const lexData = {
    rules: [
      ['\\s', '/*ignore*/'],
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)
  const loc = parser.parse('xx\nxy')

  assert.equal(loc.first_line, 2, 'first line correct')
  assert.equal(loc.last_line, 2, 'last line correct')
  assert.equal(loc.first_column, 1, 'first column correct')
  assert.equal(loc.last_column, 2, 'last column correct')
}

exports['test default location action'] = function () {
  const grammar = {
    tokens: ['x', 'y'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        ['y', 'return @$'],
        '']
    }
  }

  const lexData = {
    rules: [
      ['\\s', '/*ignore*/'],
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)
  const loc = parser.parse('xx\nxy')

  assert.equal(loc.first_line, 2, 'first line correct')
  assert.equal(loc.last_line, 2, 'last line correct')
  assert.equal(loc.first_column, 1, 'first column correct')
  assert.equal(loc.last_column, 2, 'last column correct')
}

exports['test locations by term name in action'] = function () {
  const grammar = {
    tokens: ['x', 'y'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        ['B', 'return @B'],
        ''],
      B: ['y']
    }
  }

  const lexData = {
    rules: [
      ['\\s', '/*ignore*/'],
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)
  const loc = parser.parse('xx\nxy')

  assert.equal(loc.first_line, 2, 'first line correct')
  assert.equal(loc.last_line, 2, 'last line correct')
  assert.equal(loc.first_column, 1, 'first column correct')
  assert.equal(loc.last_column, 2, 'last column correct')
}

exports['test lexer with no location support'] = function () {
  const grammar = {
    tokens: ['x', 'y'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        ['B', 'return @B'],
        ''],
      B: ['y']
    }
  }

  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = {
    toks: ['x', 'x', 'x', 'y'],
    lex: function () {
      return this.toks.shift()
    },
    setInput: function () {}
  }
  const loc = parser.parse('xx\nxy')
}

exports['test intance creation'] = function () {
  const grammar = {
    tokens: ['x', 'y'],
    startSymbol: 'A',
    bnf: {
      A: ['x A',
        ['B', 'return @B'],
        ''],
      B: ['y']
    }
  }

  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = {
    toks: ['x', 'x', 'x', 'y'],
    lex: function () {
      return this.toks.shift()
    },
    setInput: function () {}
  }
  const parser2 = new parser.Parser()
  parser2.lexer = parser.lexer
  parser2.parse('xx\nxy')

  parser.blah = true

  assert.notEqual(parser.blah, parser2.blah, 'should not inherit')
}

exports['test reentrant parsing'] = function () {
  const grammar = {
    bnf: {
      S: ['A EOF'],
      A: ['x A',
        'B',
        'C'
      ],
      B: [['y', 'return "foo";']],
      C: [['w', 'return yy.parser.parse("xxxy") + "bar";']]
    }
  }

  const lexData = {
    rules: [
      ['\\s', '/*ignore*/'],
      ['w', "return 'w';"],
      ['x', "return 'x';"],
      ['y', "return 'y';"],
      ['$', "return 'EOF';"]
    ]
  }
  const gen = new Jison.Generator(grammar)
  const parser = gen.createParser()
  parser.lexer = new Lexer(lexData)
  const result = parser.parse('xxw')
  assert.equal(result, 'foobar')
}
