const Jison = require('../setup').Jison
const Lexer = require('../setup').Lexer
const assert = require('assert')

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

  const parser = new Jison.Parser(grammar, { type: 'lalr' })
  parser.lexer = new Lexer(lexData2)

  assert.ok(parser.parse('0+0+0'), 'parse')
  assert.ok(parser.parse('0'), 'parse single 0')

  assert.throws(function () { parser.parse('+') }, 'throws parse error on invalid')
}

exports['test xx nullable grammar'] = function () {
  const lexData = {
    rules: [
      ['x', "return 'x';"]
    ]
  }
  const grammar = {
    tokens: ['x'],
    startSymbol: 'A',
    bnf: {
      A: ['A x',
        '']
    }
  }

  const parser = new Jison.Parser(grammar, { type: 'lalr' })
  parser.lexer = new Lexer(lexData)

  assert.ok(parser.parse('xxx'), 'parse')
  assert.ok(parser.parse('x'), 'parse single x')
  assert.throws(function () { parser.parse('+') }, 'throws parse error on invalid')
}

exports['test LALR algorithm from Bermudez, Logothetis'] = function () {
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
  assert.ok(parser.parse('agd'))
  assert.ok(parser.parse('agc'))
  assert.ok(parser.parse('bgd'))
  assert.ok(parser.parse('bgc'))
}

exports['test basic JSON grammar'] = function () {
  const grammar = {
    lex: {
      macros: {
        digit: '[0-9]',
        esc: '\\\\',
        int: '-?(?:[0-9]|[1-9][0-9]+)',
        exp: '(?:[eE][-+]?[0-9]+)',
        frac: '(?:\\.[0-9]+)'
      },
      rules: [
        ['\\s+', '/* skip whitespace */'],
        ['{int}{frac}?{exp}?\\b', "return 'NUMBER';"],
        ['"(?:{esc}["bfnrt/{esc}]|{esc}u[a-fA-F0-9]{4}|[^"{esc}])*"', "yytext = yytext.substr(1,yyleng-2); return 'STRING';"],
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
    bnf: {
      JsonThing: ['JsonObject',
        'JsonArray'],

      JsonObject: ['{ JsonPropertyList }'],

      JsonPropertyList: ['JsonProperty',
        'JsonPropertyList , JsonProperty'],

      JsonProperty: ['StringLiteral : JsonValue'],

      JsonArray: ['[ JsonValueList ]'],

      JsonValueList: ['JsonValue',
        'JsonValueList , JsonValue'],

      JsonValue: ['StringLiteral',
        'NumericalLiteral',
        'JsonObject',
        'JsonArray',
        'TRUE',
        'FALSE',
        'NULL'],

      StringLiteral: ['STRING'],

      NumericalLiteral: ['NUMBER']
    }
  }

  const source = '{"foo": "Bar", "hi": 42, "array": [1,2,3.004, -4.04e-4], "false": false, "true":true, "null": null, "obj": {"ha":"ho"}, "string": "str\\ting\\"sgfg" }'

  const gen = new Jison.Generator(grammar, { type: 'lalr' })
  const parser = gen.createParser()
  const gen2 = new Jison.Generator(grammar, { type: 'slr' })
  const parser2 = gen2.createParser()
  assert.deepEqual(gen.table, gen2.table, 'SLR(1) and LALR(1) tables should be equal')
  assert.ok(parser.parse(source))
}

exports['test LR(1) grammar'] = function () {
  const grammar = {
    comment: 'Produces a reduce-reduce conflict unless using LR(1).',
    tokens: 'z d b c a',
    start: 'S',
    bnf: {
      S: ['a A c',
        'a B d',
        'b A d',
        'b B c'],
      A: ['z'],
      B: ['z']
    }
  }

  const gen = new Jison.Generator(grammar, { type: 'lalr' })
  assert.equal(gen.conflicts, 2)
}

exports['test BNF grammar bootstrap'] = function () {
  const grammar = "%%\n\nspec\n    : declaration_list '%%' grammar EOF\n        {$$ = $1; $$.bnf = $3; return $$;}\n    | declaration_list '%%' grammar '%%' EOF\n        {$$ = $1; $$.bnf = $3; return $$;}\n    ;\n\ndeclaration_list\n    : declaration_list declaration\n        {$$ = $1; yy.addDeclaration($$, $2);}\n    | \n        %{$$ = {};%}\n    ;\n\ndeclaration\n    : START id\n        %{$$ = {start: $2};%}\n    | operator\n        %{$$ = {operator: $1};%}\n    ;\n\noperator\n    : associativity token_list\n        {$$ = [$1]; $$.push.apply($$, $2);}\n    ;\n\nassociativity\n    : LEFT\n        {$$ = 'left';}\n    | RIGHT\n        {$$ = 'right';}\n    | NONASSOC\n        {$$ = 'nonassoc';}\n    ;\n\ntoken_list\n    : token_list symbol\n        {$$ = $1; $$.push($2);}\n    | symbol\n        {$$ = [$1];}\n    ;\n\ngrammar\n    : production_list\n        {$$ = $1;}\n    ;\n\nproduction_list\n    : production_list production\n        {$$ = $1; $$[$2[0]] = $2[1];}\n    | production\n        %{$$ = {}; $$[$1[0]] = $1[1];%}\n    ;\n\nproduction\n    : id ':' handle_list ';'\n        {$$ = [$1, $3];}\n    ;\n\nhandle_list\n    : handle_list '|' handle_action\n        {$$ = $1; $$.push($3);}\n    | handle_action\n        {$$ = [$1];}\n    ;\n\nhandle_action\n    : handle action prec\n        {$$ = [($1.length ? $1.join(' ') : '')];\n            if($2) $$.push($2);\n            if($3) $$.push($3);\n            if ($$.length === 1) $$ = $$[0];\n        }\n    ;\n\nhandle\n    : handle symbol\n        {$$ = $1; $$.push($2)}\n    | \n        {$$ = [];}\n    ;\n\nprec\n    : PREC symbol\n        %{$$ = {prec: $2};%}\n    | \n        {$$ = null;}\n    ;\n\nsymbol\n    : id\n        {$$ = $1;}\n    | STRING\n        {$$ = yytext;}\n    ;\n\nid\n    : ID\n        {$$ = yytext;}\n    ;\n\naction\n    : ACTION\n        {$$ = yytext;}\n    | \n        {$$ = '';}\n    ;\n\n"

  const lex = "\n%%\n\\s+    \t{/* skip whitespace */}\n\"/*\"[^*]*\"*\"    \t{return yy.lexComment(this);}\n[a-zA-Z][a-zA-Z0-9_-]*    \t{return 'ID';}\n'\"'[^\"]+'\"'    \t{yytext = yytext.substr(1, yyleng-2); return 'STRING';}\n\"'\"[^']+\"'\"    \t{yytext = yytext.substr(1, yyleng-2); return 'STRING';}\n\":\"    \t{return ':';}\n\";\"    \t{return ';';}\n\"|\"    \t{return '|';}\n\"%%\"    \t{return '%%';}\n\"%prec\"    \t{return 'PREC';}\n\"%start\"    \t{return 'START';}\n\"%left\"    \t{return 'LEFT';}\n\"%right\"    \t{return 'RIGHT';}\n\"%nonassoc\"    \t{return 'NONASSOC';}\n\"%\"[a-zA-Z]+[^\\n]*    \t{/* ignore unrecognized decl */}\n\"{{\"[^}]*\"}\"    \t{return yy.lexAction(this);}\n\"{\"[^}]*\"}\"    \t{yytext = yytext.substr(1, yyleng-2); return 'ACTION';}\n\"%{\"(.|\\n)*?\"%}\"    	{yytext = yytext.substr(2, yytext.length-4);return 'ACTION';} \n.    \t{/* ignore bad characters */}\n<<EOF>>    \t{return 'EOF';}\n\n%%\n\n"

  const gen = new Jison.Generator(grammar, { type: 'lalr' })
  gen.lexer = new Lexer(lex)

  const parser = gen.createParser()

  assert.ok(parser.parse(grammar), 'bootstrapped bnf parser should parse correctly.')
}
