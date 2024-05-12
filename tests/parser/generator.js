const Jison = require('../setup').Jison
const Lexer = require('../setup').Lexer
const assert = require('assert')

const fs = require('fs')
const path = require('path')

exports['test amd module generator'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const input = 'xyxxxy'
  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateAMDModule()
  let parser = null
  const define = function (callback) {
    // temporary AMD-style define function, for testing.
    parser = callback()
  }
  eval(parserSource)

  assert.ok(parser.parse(input))
}

exports['test commonjs module generator'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const input = 'xyxxxy'
  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateCommonJSModule()
  const exports = {}
  eval(parserSource)

  assert.ok(exports.parse(input))
}

exports['test module generator'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const input = 'xyxxxy'
  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateModule()
  eval(parserSource)

  assert.ok(parser.parse(input))
}

exports['test module generator with module name'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const input = 'xyxxxy'
  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generate({ moduleType: 'js', moduleName: 'parsey' })
  eval(parserSource)

  assert.ok(parsey.parse(input))
}

exports['test module generator with namespaced module name'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"],
      ['y', "return 'y';"]
    ]
  }
  const grammar = {
    tokens: 'x y',
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        'A y',
        '']
    }
  }

  const compiler = {}

  const input = 'xyxxxy'
  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateModule({ moduleName: 'compiler.parser' })
  eval(parserSource)

  assert.ok(compiler.parser.parse(input))
}

exports['test module include'] = function () {
  const grammar = {
    comment: 'ECMA-262 5th Edition, 15.12.1 The JSON Grammar. (Incomplete implementation)',
    author: 'Zach Carter',

    lex: {
      macros: {
        digit: '[0-9]',
        exp: '([eE][-+]?{digit}+)'
      },
      rules: [
        ['\\s+', '/* skip whitespace */'],
        ['-?{digit}+(\\.{digit}+)?{exp}?', "return 'NUMBER';"],
        ['"[^"]*', function () {
          if (yytext.charAt(yyleng - 1) == '\\') {
            // remove escape
            yytext = yytext.substr(0, yyleng - 2)
            this.more()
          } else {
            yytext = yytext.substr(1) // swallow start quote
            this.input() // swallow end quote
            return 'STRING'
          }
        }],
        ['\\{', "return '{'"],
        ['\\}', "return '}'"],
        ['\\[', "return '['"],
        ['\\]', "return ']'"],
        [',', "return ','"],
        [':', "return ':'"],
        ['true\\b', "return 'TRUE'"],
        ['false\\b', "return 'FALSE'"],
        ['null\\b', "return 'NULL'"]
      ]
    },

    tokens: 'STRING NUMBER { } [ ] , : TRUE FALSE NULL',
    start: 'JSONText',

    bnf: {
      JSONString: ['STRING'],

      JSONNumber: ['NUMBER'],

      JSONBooleanLiteral: ['TRUE', 'FALSE'],

      JSONText: ['JSONValue'],

      JSONValue: ['JSONNullLiteral',
        'JSONBooleanLiteral',
        'JSONString',
        'JSONNumber',
        'JSONObject',
        'JSONArray'],

      JSONObject: ['{ }',
        '{ JSONMemberList }'],

      JSONMember: ['JSONString : JSONValue'],

      JSONMemberList: ['JSONMember',
        'JSONMemberList , JSONMember'],

      JSONArray: ['[ ]',
        '[ JSONElementList ]'],

      JSONElementList: ['JSONValue',
        'JSONElementList , JSONValue']
    }
  }

  const gen = new Jison.Generator(grammar)

  const parserSource = gen.generateModule()
  eval(parserSource)

  assert.ok(parser.parse(JSON.stringify(grammar.bnf)))
}

exports['test module include code'] = function () {
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
    moduleInclude: 'function test(val) { return 1; }'
  }

  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateCommonJSModule()
  const exports = {}
  eval(parserSource)

  assert.equal(parser.parse('y'), 1, 'semantic action')
}

exports['test lexer module include code'] = function () {
  const lexData = {
    rules: [
      ['y', 'return test();']
    ],
    moduleInclude: 'function test() { return 1; }'
  }
  const grammar = {
    bnf: {
      E: [['E y', 'return $2;'],
        '']
    }
  }

  const gen = new Jison.Generator(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateCommonJSModule()
  const exports = {}
  eval(parserSource)

  assert.equal(parser.parse('y'), 1, 'semantic action')
}

exports['test generated parser instance creation'] = function () {
  const grammar = {
    lex: {
      rules: [
        ['y', "return 'y'"]
      ]
    },
    bnf: {
      E: [['E y', 'return $2;'],
        '']
    }
  }

  const gen = new Jison.Generator(grammar)

  const parserSource = gen.generateModule()
  eval(parserSource)

  const p = new parser.Parser()

  assert.equal(p.parse('y'), 'y', 'semantic action')

  parser.blah = true

  assert.notEqual(parser.blah, p.blah, "shouldn't inherit props")
}

exports['test module include code using generator from parser'] = function () {
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
    moduleInclude: 'function test(val) { return 1; }'
  }

  const gen = new Jison.Parser(grammar)
  gen.lexer = new Lexer(lexData)

  const parserSource = gen.generateCommonJSModule()
  const exports = {}
  eval(parserSource)

  assert.equal(parser.parse('y'), 1, 'semantic action')
}

exports['test module include with each generator type'] = function () {
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
    moduleInclude: 'var TEST_VAR;'
  }

  const gen = new Jison.Parser(grammar)
  gen.lexer = new Lexer(lexData);
  ['generateModule', 'generateAMDModule', 'generateCommonJSModule']
    .map(function (type) {
      const source = gen[type]()
      assert.ok(/TEST_VAR/.test(source), type + ' supports module include')
    })
}

// test for issue #246
exports['test compiling a parser/lexer'] = function () {
  const grammar =
      '// Simple "happy happy joy joy" parser, written by Nolan Lawson\n' +
      '// Based on the song of the same name.\n\n' +
      '%lex\n%%\n\n\\s+                   /* skip whitespace */\n' +
      '("happy")             return \'happy\'\n' +
      '("joy")               return \'joy\'\n' +
      '<<EOF>>               return \'EOF\'\n\n' +
      '/lex\n\n%start expressions\n\n' +
      '%ebnf\n\n%%\n\n' +
      'expressions\n    : e EOF\n        {return $1;}\n    ;\n\n' +
      'e\n    : phrase+ \'joy\'? -> $1 + \' \' + yytext \n    ;\n\n' +
      'phrase\n    : \'happy\' \'happy\' \'joy\' \'joy\' ' +
      ' -> [$1, $2, $3, $4].join(\' \'); \n    ;'

  const parser = new Jison.Parser(grammar)
  const generated = parser.generate()

  const tmpFile = path.resolve(__dirname, 'tmp-parser.js')
  fs.writeFileSync(tmpFile, generated)
  const parser2 = require('./tmp-parser')

  assert.ok(parser.parse('happy happy joy joy joy') === 'happy happy joy joy joy',
    'original parser works')
  assert.ok(parser2.parse('happy happy joy joy joy') === 'happy happy joy joy joy',
    'generated parser works')
  fs.unlinkSync(tmpFile)
}
