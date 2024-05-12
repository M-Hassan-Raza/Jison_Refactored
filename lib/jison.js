/* eslint-disable no-var */
// Jison, an LR(0), SLR(1), LARL(1), LR(1) Parser Generator
// Zachary Carter <zach@carter.name>
// MIT X Licensed

const typal = require('./util/typal').typal
const Set = require('./util/set').Set
const Lexer = require('jison-lex')
const ebnfParser = require('ebnf-parser')
const JSONSelect = require('JSONSelect')
const esprima = require('esprima')
const escodegen = require('escodegen')
const { removeErrorRecovery } = require('./utils')
const { createVariable } = require('./utils')
const { parseError } = require('./utils')
const { findDefaults } = require('./utils')
const processGrammar = require('./generatorExtension')
const lookaheadMixin = require('./mixins/lookaheadMixin')
const { Nonterminal, Production } = require('./util/dataStructures')
const { aliasRegex } = require('./constants.js')
const lrGeneratorMixin = require('./mixins/lrGeneratorMixin')
const { printAction } = require('./utils')

const version = require('../package.json').version

const Jison = exports.Jison = exports
Jison.version = version

// detect print
if (typeof console !== 'undefined' && console.log) {
  Jison.print = console.log
} else if (typeof puts !== 'undefined') {
  Jison.print = function print () { puts([].join.call(arguments, ' ')) }
} else if (typeof print !== 'undefined') {
  Jison.print = print
} else {
  Jison.print = function print () { }
}

Jison.Parser = (function () {
  // iterator utility
  function each (obj, func) {
    if (obj.forEach) {
      obj.forEach(func)
    } else {
      for (const p in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, p)) {
          func.call(obj, obj[p], p, obj)
        }
      }
    }
  }

  const generator = typal.beget()

  generator.constructor = function jisonGenerator (grammar, opt) {
    if (typeof grammar === 'string') {
      grammar = ebnfParser.parse(grammar)
    }

    const options = typal.mix.call({}, grammar.options, opt)
    this.terms = {}
    this.operators = {}
    this.productions = []
    this.conflicts = 0
    this.resolutions = []
    this.options = options
    this.parseParams = grammar.parseParams
    this.yy = {} // accessed as yy free variable in the parser/lexer actions

    // source included in semantic action execution scope
    if (grammar.actionInclude) {
      if (typeof grammar.actionInclude === 'function') {
        grammar.actionInclude = String(grammar.actionInclude).replace(/^\s*function \(\) \{/, '').replace(/}\s*$/, '')
      }
      this.actionInclude = grammar.actionInclude
    }
    this.moduleInclude = grammar.moduleInclude || ''

    this.DEBUG = options.debug || false
    if (this.DEBUG) this.mix(generatorDebug) // mixin debug methods

    processGrammar.call(this, grammar)
    this.augmentGrammar(grammar)

    if (grammar.lex) {
      this.lexer = new Lexer(grammar.lex, null, this.terminals_)
    }
  }

  generator.augmentGrammar = function augmentGrammar (grammar) {
    if (this.productions.length === 0) {
      throw new Error('Grammar error: must have at least one rule.')
    }

    // use specified start symbol, or default to first user defined production
    this.startSymbol = grammar.start || grammar.startSymbol || this.productions[0].symbol

    if (!this.nonterminals[this.startSymbol]) {
      throw new Error('Grammar error: startSymbol must be a non-terminal found in your grammar.')
    }

    this.EOF = '$end'

    // augment the grammar
    const acceptProduction = new Production('$accept', [this.startSymbol, '$end'], 0)
    this.productions.unshift(acceptProduction)

    // prepend parser tokens
    this.symbols.unshift('$accept', this.EOF)
    this.symbols_.$accept = 0
    this.symbols_[this.EOF] = 1
    this.terminals.unshift(this.EOF)

    this.nonterminals.$accept = new Nonterminal('$accept') // <-- Added parentheses
    this.nonterminals.$accept.productions.push(acceptProduction)

    // add follow $ to start symbol
    this.nonterminals[this.startSymbol].follows.push(this.EOF)
  }

  generator.buildProductions = function buildProductions (bnf, productions, nonterminals, symbols, operators) {
    let actions = [
      '/* this == yyval */',
      this.actionInclude || '',
      'var $0 = $$.length - 1;',
      'switch (yystate) {'
    ]
    const actionGroups = {}
    let prods, symbol
    const productions_ = [0]
    let symbolId = 1
    const symbols_ = {}

    let her = false // has error recovery

    function addSymbol (s) {
      if (s && !symbols_[s]) {
        symbols_[s] = ++symbolId
        symbols.push(s)
      }
    }

    // add error symbol; will be third symbol, or "2" ($accept, $end, error)
    addSymbol('error')

    for (symbol in bnf) {
      if (!Object.prototype.hasOwnProperty.call(bnf, symbol)) continue

      addSymbol(symbol)
      nonterminals[symbol] = new Nonterminal(symbol)

      if (typeof bnf[symbol] === 'string') {
        prods = bnf[symbol].split(/\s*\|\s*/g)
      } else {
        prods = bnf[symbol].slice(0)
      }

      prods.forEach(buildProduction)
    }
    for (const action in actionGroups) { actions.push(actionGroups[action].join(' '), action, 'break;') }

    const terms = []; const terms_ = {}
    each(symbols_, function (id, sym) {
      if (!nonterminals[sym]) {
        terms.push(sym)
        terms_[id] = sym
      }
    })

    this.hasErrorRecovery = her

    this.terminals = terms
    this.terminals_ = terms_
    this.symbols_ = symbols_

    this.productions_ = productions_
    actions.push('}')

    actions = actions.join('\n')
      .replace(/YYABORT/g, 'return false')
      .replace(/YYACCEPT/g, 'return true')

    let parameters = 'yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */'
    if (this.parseParams) parameters += ', ' + this.parseParams.join(', ')

    this.performAction = 'function anonymous(' + parameters + ') {\n' + actions + '\n}'

    function buildProduction (handle) {
      let r, rhs, i
      if (handle.constructor === Array) {
        rhs = (typeof handle[0] === 'string')
          ? handle[0].trim().split(' ')
          : handle[0].slice(0)

        for (i = 0; i < rhs.length; i++) {
          if (rhs[i] === 'error') her = true
          if (!symbols_[rhs[i]]) {
            addSymbol(rhs[i])
          }
        }

        if (typeof handle[1] === 'string' || handle.length === 3) {
          // semantic action specified
          const label = 'case ' + (productions.length + 1) + ':'; let action = handle[1]

          // replace named semantic values ($nonterminal)
          if (action.match(/[$@][a-zA-Z][a-zA-Z0-9_]*/)) {
            const count = {}
            const names = {}
            for (i = 0; i < rhs.length; i++) {
              // check for aliased names, e.g., id[alias]
              let rhsI = rhs[i].match(/\[[a-zA-Z][a-zA-Z0-9_-]*]/)
              if (rhsI) {
                rhsI = rhsI[0].substr(1, rhsI[0].length - 2)
                rhs[i] = rhs[i].substr(0, rhs[i].indexOf('['))
              } else {
                rhsI = rhs[i]
              }

              if (names[rhsI]) {
                names[rhsI + (++count[rhsI])] = i + 1
              } else {
                names[rhsI] = i + 1
                names[rhsI + '1'] = i + 1
                count[rhsI] = 1
              }
            }
            action = action.replace(/\$([a-zA-Z][a-zA-Z0-9_]*)/g, function (str, pl) {
              return names[pl] ? '$' + names[pl] : str
            }).replace(/@([a-zA-Z][a-zA-Z0-9_]*)/g, function (str, pl) {
              return names[pl] ? '@' + names[pl] : str
            })
          }
          action = action
            // replace references to $$ with this.$, and @$ with this._$
            .replace(/([^'"])\$\$|^\$\$/g, '$1this.$').replace(/@[0$]/g, 'this._$')

            // replace semantic value references ($n) with stack value (stack[n])
            .replace(/\$(-?\d+)/g, function (_, n) {
              return '$$[$0' + (parseInt(n, 10) - rhs.length || '') + ']'
            })
            // same as above for location references (@n)
            .replace(/@(-?\d+)/g, function (_, n) {
              return '_$[$0' + (n - rhs.length || '') + ']'
            })
          if (action in actionGroups) actionGroups[action].push(label)
          else actionGroups[action] = [label]

          // done with aliases; strip them.
          rhs = rhs.map(function (e, i) { return e.replace(aliasRegex, '') })
          r = new Production(symbol, rhs, productions.length + 1)
          // precedence specified also
          if (handle[2] && operators[handle[2].prec]) {
            r.precedence = operators[handle[2].prec].precedence
          }
        } else {
          // no action -> don't care about aliases; strip them.
          rhs = rhs.map(function (e, i) { return e.replace(aliasRegex, '') })
          // only precedence specified
          r = new Production(symbol, rhs, productions.length + 1)
          if (operators[handle[1].prec]) {
            r.precedence = operators[handle[1].prec].precedence
          }
        }
      } else {
        // no action -> don't care about aliases; strip them.
        handle = handle.replace(aliasRegex, '')
        rhs = handle.trim().split(' ')
        for (i = 0; i < rhs.length; i++) {
          if (rhs[i] === 'error') her = true
          if (!symbols_[rhs[i]]) {
            addSymbol(rhs[i])
          }
        }
        r = new Production(symbol, rhs, productions.length + 1)
      }
      if (r.precedence === 0) {
        // set precedence
        for (i = r.handle.length - 1; i >= 0; i--) {
          if (!(r.handle[i] in nonterminals) && r.handle[i] in operators) {
            r.precedence = operators[r.handle[i]].precedence
          }
        }
      }

      productions.push(r)
      productions_.push([symbols_[r.symbol], r.handle[0] === '' ? 0 : r.handle.length])
      nonterminals[symbol].productions.push(r)
    }
  }

  generator.createParser = function createParser () {
    throw new Error('Calling abstract method.')
  }

  // noop. implemented in debug mixin
  generator.trace = function trace () { }

  generator.warn = function warn () {
    const args = Array.prototype.slice.call(arguments, 0)
    Jison.print.call(null, args.join(''))
  }

  generator.error = function error (msg) {
    throw new Error(msg)
  }

  // Generator debug mixin

  const generatorDebug = {
    trace: function trace () {
      Jison.print.apply(null, arguments)
    },
    beforeprocessGrammar: function () {
      this.trace('Processing grammar.')
    },
    afteraugmentGrammar: function () {
      const trace = this.trace
      each(this.symbols, function (sym, i) {
        trace(sym + '(' + i + ')')
      })
    }
  }

  function addTokenStack (fn) {
    const parseFn = fn
    try {
      const ast = esprima.parse(parseFn)
      const stackAst = esprima.parse(String(tokenStackLex)).body[0]
      stackAst.id.name = 'lex'

      const labeled = JSONSelect.match(':has(:root > .label > .name:val("_token_stack"))', ast)

      labeled[0].body = stackAst

      return escodegen.generate(ast).replace(/_token_stack:\s?/, '').replace(/\\\\n/g, '\\n')
    } catch (e) {
      return parseFn
    }
  }

  // lex function that supports token stacks
  function tokenStackLex () {
    let token = tokenStack.pop() || lexer.lex() || EOF
    // if token isn't its numeric value, convert
    if (typeof token !== 'number') {
      if (token instanceof Array) {
        tokenStack = token
        token = tokenStack.pop()
      }
      token = self.symbols_[token] || token
    }
    return token
  }

  // Generates the code of the parser module, which consists of two parts:
  // - module.commonCode: initialization code that should be placed before the module
  // - module.moduleCode: code that creates the module object
  lrGeneratorMixin.generateModule_ = function generateModule_ () {
    let parseFn = String(parser.parse)
    if (!this.hasErrorRecovery) {
      parseFn = removeErrorRecovery(parseFn)
    }

    if (this.options['token-stack']) {
      parseFn = addTokenStack(parseFn)
    }

    // Generate code with fresh variable names
    nextVariableId = 0
    const tableCode = this.generateTableCode(this.table)

    // Generate the initialization code
    const commonCode = tableCode.commonCode

    // Generate the module creation code
    let moduleCode = '{'
    moduleCode += [
      'trace: ' + String(this.trace || parser.trace),
      'yy: {}',
      'symbols_: ' + JSON.stringify(this.symbols_),
      'terminals_: ' + JSON.stringify(this.terminals_).replace(/"([0-9]+)":/g, '$1:'),
      'productions_: ' + JSON.stringify(this.productions_),
      'performAction: ' + String(this.performAction),
      'table: ' + tableCode.moduleCode,
      'defaultActions: ' + JSON.stringify(this.defaultActions).replace(/"([0-9]+)":/g, '$1:'),
      'parseError: ' + String(this.parseError || (this.hasErrorRecovery ? traceParseError : parser.parseError)),
      'parse: ' + parseFn
    ].join(',\n')
    moduleCode += '};'

    return { commonCode, moduleCode }
  }

  // Generate code that represents the specified parser table
  lrGeneratorMixin.generateTableCode = function (table) {
    let moduleCode = JSON.stringify(table)
    const variables = [createObjectCode]

    // Don't surround numerical property name numbers in quotes
    moduleCode = moduleCode.replace(/"([0-9]+)"(?=:)/g, '$1')

    // Replace objects with several identical values by function calls
    // e.g., { 1: [6, 7]; 3: [6, 7], 4: [6, 7], 5: 8 } = o([1, 3, 4], [6, 7], { 5: 8 })
    moduleCode = moduleCode.replace(/\{\d+:[^}]+,\d+:[^}]+\}/g, function (object) {
      // Find the value that occurs with the highest number of keys
      let value; let frequentValue; let key; const keys = {}; let keyCount; let maxKeyCount = 0
      let keyValue; let keyValues = []; const keyValueMatcher = /(\d+):([^:]+)(?=,\d+:|\})/g

      while ((keyValue = keyValueMatcher.exec(object))) {
        // For each value, store the keys where that value occurs
        key = keyValue[1]
        value = keyValue[2]
        keyCount = 1

        if (!(value in keys)) {
          keys[value] = [key]
        } else {
          keyCount = keys[value].push(key)
        }
        // Remember this value if it is the most frequent one
        if (keyCount > maxKeyCount) {
          maxKeyCount = keyCount
          frequentValue = value
        }
      }
      // Construct the object with a function call if the most frequent value occurs multiple times
      if (maxKeyCount > 1) {
        // Collect all non-frequent values into a remainder object
        for (value in keys) {
          if (value !== frequentValue) {
            for (let k = keys[value], i = 0, l = k.length; i < l; i++) {
              keyValues.push(k[i] + ':' + value)
            }
          }
        }
        keyValues = keyValues.length ? ',{' + keyValues.join(',') + '}' : ''
        // Create the function call `o(keys, value, remainder)`
        object = 'o([' + keys[frequentValue].join(',') + '],' + frequentValue + keyValues + ')'
      }
      return object
    })

    // Count occurrences of number lists
    let list
    const lists = {}
    const listMatcher = /\[[0-9,]+\]/g

    while (list = listMatcher.exec(moduleCode)) {
      lists[list] = (lists[list] || 0) + 1
    }

    // Replace frequently occurring number lists with variables
    moduleCode = moduleCode.replace(listMatcher, function (list) {
      let listId = lists[list]
      // If listId is a number, it represents the list's occurrence frequency
      if (typeof listId === 'number') {
        // If the list does not occur frequently, represent it by the list
        if (listId === 1) {
          lists[list] = listId = list
          // If the list occurs frequently, represent it by a newly assigned variable
        } else {
          lists[list] = listId = createVariable(nextVariableId, variableTokens, variableTokensLength)
          nextVariableId++
          variables.push(listId + '=' + list)
        }
      }
      return listId
    })

    // Return the variable initialization code and the table code
    return {
      commonCode: 'var ' + variables.join(',') + ';',
      moduleCode
    }
  }
  // Function that extends an object with the given value for all given keys
  // e.g., o([1, 3, 4], [6, 7], { x: 1, y: 2 }) = { 1: [6, 7]; 3: [6, 7], 4: [6, 7], x: 1, y: 2 }
  var createObjectCode = 'o=function(k,v,o,l){' +
    'for(o=o||{},l=k.length;l--;o[k[l]]=v);' +
    'return o}'

  var nextVariableId = 0
  var variableTokens = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'
  var variableTokensLength = variableTokens.length

  var lrGeneratorDebug = {
    beforeparseTable: function () {
      this.trace('Building parse table.')
    },
    afterparseTable: function () {
      const self = this
      if (this.conflicts > 0) {
        this.resolutions.forEach(function (r, i) {
          if (r[2].bydefault) {
            self.warn('Conflict at state: ', r[0], ', token: ', r[1], '\n  ', printAction(r[2].r, self), '\n  ', printAction(r[2].s, self))
          }
        })
        this.trace('\n' + this.conflicts + ' Conflict(s) found in grammar.')
      }
      this.trace('Done.')
    },
    aftercanonicalCollection: function (states) {
      const trace = this.trace
      trace('\nItem sets\n------')

      states.forEach(function (state, i) {
        trace('\nitem set', i, '\n' + state.join('\n'), '\ntransitions -> ', JSON.stringify(state.edges))
      })
    }
  }

  var parser = typal.beget()
  parser.trace = generator.trace
  parser.warn = generator.warn
  parser.error = generator.error

  function traceParseError (err, hash) {
    this.trace(err)
  }

  parser.parseError = lrGeneratorMixin.parseError = parseError

  parser.parse = function parse (input) {
    const self = this
    let stack = [0]
    let vstack = [null] // semantic value stack
    let lstack = [] // location stack
    const table = this.table
    let yytext = ''
    let yylineno = 0
    let yyleng = 0
    let recovering = 0
    const TERROR = 2
    const EOF = 1

    const args = lstack.slice.call(arguments, 1)

    // this.reductionCount = this.shiftCount = 0;

    const lexer = Object.create(this.lexer)
    const sharedState = { yy: {} }
    // copy state
    for (const k in this.yy) {
      if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
        sharedState.yy[k] = this.yy[k]
      }
    }

    lexer.setInput(input, sharedState.yy)
    sharedState.yy.lexer = lexer
    sharedState.yy.parser = this
    if (typeof lexer.yylloc === 'undefined') {
      lexer.yylloc = {}
    }
    let yyloc = lexer.yylloc
    lstack.push(yyloc)

    const ranges = lexer.options && lexer.options.ranges

    if (typeof sharedState.yy.parseError === 'function') {
      this.parseError = sharedState.yy.parseError
    } else {
      this.parseError = Object.getPrototypeOf(this).parseError
    }

    function popStack (n) {
      stack.length = stack.length - 2 * n
      vstack.length = vstack.length - n
      lstack.length = lstack.length - n
    }

    const lex = function () {
      let token
      token = lexer.lex() || EOF
      // if token isn't its numeric value, convert
      if (typeof token !== 'number') {
        token = self.symbols_[token] || token
      }
      return token
    }

    let symbol; let preErrorSymbol; let state; let action
    let r; const yyval = {}; let p; let len; let newState; let expected
    while (true) {
      // retreive state number from top of stack
      state = stack[stack.length - 1]

      // use default actions if available
      if (this.defaultActions[state]) {
        action = this.defaultActions[state]
      } else {
        if (symbol === null || typeof symbol === 'undefined') {
          symbol = lex()
        }
        // read action for current state and first input
        action = table[state] && table[state][symbol]
      }

      if (typeof action === 'undefined' || !action.length || !action[0]) {
        var errorRuleDepth
        let errStr = ''

        // Return the rule stack depth where the nearest error rule can be found.
        // Return FALSE when no error recovery rule was found.
        function locateNearestErrorRecoveryRule (state) {
          let stackProbe = stack.length - 1
          let depth = 0

          // try to recover from error
          for (; ;) {
            // check for error recovery rule in this state
            if ((TERROR.toString()) in table[state]) {
              return depth
            }
            if (state === 0 || stackProbe < 2) {
              return false // No suitable error recovery rule available.
            }
            stackProbe -= 2 // popStack(1): [symbol, action]
            state = stack[stackProbe]
            ++depth
          }
        }

        if (!recovering) {
          // first see if there's any chance at hitting an error recovery rule:
          errorRuleDepth = locateNearestErrorRecoveryRule(state)

          // Report error
          expected = []
          for (p in table[state]) {
            if (this.terminals_[p] && p > TERROR) {
              expected.push("'" + this.terminals_[p] + "'")
            }
          }
          if (lexer.showPosition) {
            errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ", got '" + (this.terminals_[symbol] || symbol) + "'"
          } else {
            errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' +
              (symbol === EOF
                ? 'end of input'
                : ("'" + (this.terminals_[symbol] || symbol) + "'"))
          }
          this.parseError(errStr, {
            text: lexer.match,
            token: this.terminals_[symbol] || symbol,
            line: lexer.yylineno,
            loc: yyloc,
            expected,
            recoverable: (errorRuleDepth !== false)
          })
        } else if (preErrorSymbol !== EOF) {
          errorRuleDepth = locateNearestErrorRecoveryRule(state)
        }

        // just recovered from another error
        if (recovering === 3) {
          if (symbol === EOF || preErrorSymbol === EOF) {
            throw new Error(errStr || 'Parsing halted while starting to recover from another error.')
          }

          // discard current lookahead and grab another
          yyleng = lexer.yyleng
          yytext = lexer.yytext
          yylineno = lexer.yylineno
          yyloc = lexer.yylloc
          symbol = lex()
        }

        // try to recover from error
        if (errorRuleDepth === false) {
          throw new Error(errStr || 'Parsing halted. No suitable error recovery rule available.')
        }
        popStack(errorRuleDepth)

        preErrorSymbol = (symbol === TERROR ? null : symbol) // save the lookahead token
        symbol = TERROR // insert generic error symbol as new lookahead
        state = stack[stack.length - 1]
        action = table[state] && table[state][TERROR]
        recovering = 3 // allow 3 real symbols to be shifted before reporting a new error
      }

      // this shouldn't happen, unless resolve defaults are off
      if (action[0] instanceof Array && action.length > 1) {
        throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol)
      }

      switch (action[0]) {
        case 1: // shift
          // this.shiftCount++;

          stack.push(symbol)
          vstack.push(lexer.yytext)
          lstack.push(lexer.yylloc)
          stack.push(action[1]) // push state
          symbol = null
          if (!preErrorSymbol) { // normal execution/no error
            yyleng = lexer.yyleng
            yytext = lexer.yytext
            yylineno = lexer.yylineno
            yyloc = lexer.yylloc
            if (recovering > 0) {
              recovering--
            }
          } else {
            // error just occurred, resume old lookahead f/ before error
            symbol = preErrorSymbol
            preErrorSymbol = null
          }
          break

        case 2:

          len = this.productions_[action[1]][1]

          // perform semantic action
          yyval.$ = vstack[vstack.length - len] // default to $$ = $1
          // default location, uses first token for firsts, last for lasts
          yyval._$ = {
            first_line: lstack[lstack.length - (len || 1)].first_line,
            last_line: lstack[lstack.length - 1].last_line,
            first_column: lstack[lstack.length - (len || 1)].first_column,
            last_column: lstack[lstack.length - 1].last_column
          }
          if (ranges) {
            yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]]
          }
          r = this.performAction.apply(yyval, [yytext, yyleng, yylineno, sharedState.yy, action[1], vstack, lstack].concat(args))

          if (typeof r !== 'undefined') {
            return r
          }

          // pop off stack
          if (len) {
            stack = stack.slice(0, -1 * len * 2)
            vstack = vstack.slice(0, -1 * len)
            lstack = lstack.slice(0, -1 * len)
          }

          stack.push(this.productions_[action[1]][0]) // push nonterminal (reduce)
          vstack.push(yyval.$)
          lstack.push(yyval._$)
          // goto new state = table[STATE][NONTERMINAL]
          newState = table[stack[stack.length - 2]][stack[stack.length - 1]]
          stack.push(newState)
          break

        case 3:
          // accept
          return true
      }
    }
  }

  parser.init = function parserInitialization (dict) {
    this.table = dict.table
    this.defaultActions = dict.defaultActions
    this.performAction = dict.performAction
    this.productions_ = dict.productions_
    this.symbols_ = dict.symbols_
    this.terminals_ = dict.terminals_
  }

  /*
 * LR(0) Parser
 * */

  const lr0 = generator.beget(lookaheadMixin, lrGeneratorMixin, {
    type: 'LR(0)',
    afterconstructor: function lr0AfterConstructor () {
      this.buildTable()
    }
  })

  const LR0Generator = exports.LR0Generator = lr0.construct()

  /*
 * Simple LALR(1)
 * */

  const lalr = generator.beget(lookaheadMixin, lrGeneratorMixin, {
    type: 'LALR(1)',

    afterconstructor: function (grammar, options) {
      if (this.DEBUG) this.mix(lrGeneratorDebug, lalrGeneratorDebug) // mixin debug methods

      options = options || {}
      this.states = this.canonicalCollection()
      this.terms_ = {}

      const newg = this.newg = typal.beget(lookaheadMixin, {
        oldg: this,
        trace: this.trace,
        nterms_: {},
        DEBUG: false,
        go_: function (r, B) {
          r = r.split(':')[0] // grab state #
          B = B.map(function (b) { return b.slice(b.indexOf(':') + 1) })
          return this.oldg.go(r, B)
        }
      })
      newg.nonterminals = {}
      newg.productions = []

      this.inadequateStates = []

      // if true, only lookaheads in inadequate states are computed (faster, larger table)
      // if false, lookaheads for all reductions will be computed (slower, smaller table)
      this.onDemandLookahead = options.onDemandLookahead || false

      this.buildNewGrammar()
      newg.computeLookaheads()
      this.unionLookaheads()

      this.table = this.parseTable(this.states)
      this.defaultActions = findDefaults(this.table)
    },

    lookAheads: function LALRLookAheads (state, item) {
      return (!!this.onDemandLookahead && !state.inadequate) ? this.terminals : item.follows
    },
    go: function LALRGo (p, w) {
      let q = parseInt(p, 10)
      for (let i = 0; i < w.length; i++) {
        q = this.states.item(q).edges[w[i]] || q
      }
      return q
    },
    goPath: function LALRGoPath (p, w) {
      let q = parseInt(p, 10); let t
      const path = []
      for (let i = 0; i < w.length; i++) {
        t = w[i] ? q + ':' + w[i] : ''
        if (t) this.newg.nterms_[t] = q
        path.push(t)
        q = this.states.item(q).edges[w[i]] || q
        this.terms_[t] = w[i]
      }
      return { path, endState: q }
    },
    // every disjoint reduction of a nonterminal becomes a produciton in G'
    buildNewGrammar: function LALRBuildNewGrammar () {
      const self = this
      const newg = this.newg

      this.states.forEach(function (state, i) {
        state.forEach(function (item) {
          if (item.dotPosition === 0) {
            // new symbols are a combination of state and transition symbol
            const symbol = i + ':' + item.production.symbol
            self.terms_[symbol] = item.production.symbol
            newg.nterms_[symbol] = i
            if (!newg.nonterminals[symbol]) { newg.nonterminals[symbol] = new Nonterminal(symbol) }
            const pathInfo = self.goPath(i, item.production.handle)
            const p = new Production(symbol, pathInfo.path, newg.productions.length)
            newg.productions.push(p)
            newg.nonterminals[symbol].productions.push(p)

            // store the transition that get's 'backed up to' after reduction on path
            const handle = item.production.handle.join(' ')
            const goes = self.states.item(pathInfo.endState).goes
            if (!goes[handle]) { goes[handle] = [] }
            goes[handle].push(symbol)
          }
        })
        if (state.inadequate) { self.inadequateStates.push(i) }
      })
    },
    unionLookaheads: function LALRUnionLookaheads () {
      const self = this
      const newg = this.newg
      const states = this.onDemandLookahead ? this.inadequateStates : this.states

      states.forEach(function unionStatesForEach (i) {
        const state = typeof i === 'number' ? self.states.item(i) : i
        const follows = []
        if (state.reductions.length) {
          state.reductions.forEach(function unionReductionForEach (item) {
            const follows = {}
            for (let k = 0; k < item.follows.length; k++) {
              follows[item.follows[k]] = true
            }
            state.goes[item.production.handle.join(' ')].forEach(function reductionGoesForEach (symbol) {
              newg.nonterminals[symbol].follows.forEach(function goesFollowsForEach (symbol) {
                const terminal = self.terms_[symbol]
                if (!follows[terminal]) {
                  follows[terminal] = true
                  item.follows.push(terminal)
                }
              })
            })
            // self.trace('unioned item', item);
          })
        }
      })
    }
  })

  const LALRGenerator = exports.LALRGenerator = lalr.construct()

  // LALR generator debug mixin

  const lalrGeneratorDebug = {
    trace: function trace () {
      Jison.print.apply(null, arguments)
    },
    beforebuildNewGrammar: function () {
      this.trace(this.states.size() + ' states.')
      this.trace('Building lookahead grammar.')
    },
    beforeunionLookaheads: function () {
      this.trace('Computing lookaheads.')
    }
  }

  /*
 * Lookahead parser definitions
 *
 * Define base type
 * */
  const lrLookaheadGenerator = generator.beget(lookaheadMixin, lrGeneratorMixin, {
    afterconstructor: function lsAftercontructor () {
      this.computeLookaheads()
      this.buildTable()
    }
  })

  /*
 * SLR Parser
 * */
  const SLRGenerator = exports.SLRGenerator = lrLookaheadGenerator.construct({
    type: 'SLR(1)',

    lookAheads: function slrLookAhead (state, item) {
      return this.nonterminals[item.production.symbol].follows
    }
  })

  /*
 * LR(1) Parser
 * */
  const lr1Options = {
    type: 'Canonical LR(1)',
    lookAheads: function calculateLookAheads (state, item) {
      return item.follows
    },
    Item: lrGeneratorMixin.Item.prototype.construct({
      afterconstructor: function setIdAndFollows () {
        this.id = `${this.production.id}a${this.dotPosition}a${this.follows.sort().join(',')}`
      },
      eq: function isEqual (e) {
        return e.id === this.id
      }
    }),
    closureOperation: function performClosureOperation (itemSet) {
      const closureSet = new this.ItemSet()
      let set = itemSet
      let itemQueue

      do {
        itemQueue = new Set()
        closureSet.concat(set)
        set.forEach(item => {
          const symbol = item.markedSymbol
          let b, r

          if (symbol && this.nonterminals[symbol]) {
            r = item.remainingHandle()
            b = this.first(item.remainingHandle())
            if (b.length === 0 || item.production.nullable || this.nullable(r)) {
              b = b.concat(item.follows)
            }
            this.nonterminals[symbol].productions.forEach(production => {
              const newItem = new this.Item(production, 0, b)
              if (!closureSet.contains(newItem) && !itemQueue.contains(newItem)) {
                itemQueue.push(newItem)
              }
            })
          } else if (!symbol) {
            closureSet.reductions.push(item)
          }
        })
        set = itemQueue
      } while (!itemQueue.isEmpty())

      return closureSet
    }
  }

  const lr1 = lrLookaheadGenerator.beget(lr1Options)

  const LR1Generator = exports.LR1Generator = lr1.construct()

  /*
 * LL Parser
 * */
  const lookaheadMixinOptions = {
    type: 'LL(1)',
    afterconstructor: function setupLL () {
      this.computeLookaheads()
      this.table = this.parseTable(this.productions)
    },
    parseTable: function createParseTable (productions) {
      const table = {}

      productions.forEach((production, i) => {
        const row = table[production.symbol] || {}
        const tokens = production.first

        if (this.nullable(production.handle)) {
          Set.union(tokens, this.nonterminals[production.symbol].follows)
        }

        tokens.forEach(token => {
          if (row[token]) {
            row[token].push(i)
            this.conflicts++
          } else {
            row[token] = [i]
          }
        })

        table[production.symbol] = row
      })

      return table
    }
  }

  const ll = generator.beget(lookaheadMixin, lookaheadMixinOptions)

  const LLGenerator = exports.LLGenerator = ll.construct()

  Jison.Generator = function jisonGenerator (g, options) {
    const opt = typal.mix.call({}, g.options, options)
    switch (opt.type) {
      case 'lr0':
        return new LR0Generator(g, opt)
      case 'slr':
        return new SLRGenerator(g, opt)
      case 'lr':
        return new LR1Generator(g, opt)
      case 'll':
        return new LLGenerator(g, opt)
      default:
        return new LALRGenerator(g, opt)
    }
  }

  return function Parser (g, options) {
    const gen = Jison.Generator(g, options)
    return gen.createParser()
  }
})()
