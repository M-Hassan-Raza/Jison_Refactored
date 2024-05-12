// lrGeneratorMixin.js
// Mixin for common LR parser behavior=
const typal = require('../util/typal').typal
const Set = require('../util/set').Set
const version = require('../../package.json').version
const { resolveConflict } = require('../utils')
const { findDefaults } = require('../utils')
const { commonjsMain } = require('../utils')
const { printAction } = require('../utils')
const { each } = require('../utils')

const lrGeneratorMixin = {}

lrGeneratorMixin.buildTable = function buildTable () {
  if (this.DEBUG) this.mix(lrGeneratorDebug) // mixin debug methods

  this.states = this.canonicalCollection()
  this.table = this.parseTable(this.states)
  this.defaultActions = findDefaults(this.table)
}

lrGeneratorMixin.Item = typal.construct({
  constructor: function Item (production, dot, f, predecessor) {
    this.production = production
    this.dotPosition = dot || 0
    this.follows = f || []
    this.predecessor = predecessor
    this.id = parseInt(production.id + 'a' + this.dotPosition, 36)
    this.markedSymbol = this.production.handle[this.dotPosition]
  },
  remainingHandle: function () {
    return this.production.handle.slice(this.dotPosition + 1)
  },
  eq: function (e) {
    return e.id === this.id
  },
  handleToString: function () {
    const handle = this.production.handle.slice(0)
    handle[this.dotPosition] = '.' + (handle[this.dotPosition] || '')
    return handle.join(' ')
  },
  toString: function () {
    const temp = this.production.handle.slice(0)
    temp[this.dotPosition] = '.' + (temp[this.dotPosition] || '')
    return this.production.symbol + ' -> ' + temp.join(' ') +
      (this.follows.length === 0 ? '' : ' #lookaheads= ' + this.follows.join(' '))
  }
})

lrGeneratorMixin.ItemSet = Set.prototype.construct({
  afterconstructor: function () {
    this.reductions = []
    this.goes = {}
    this.edges = {}
    this.shifts = false
    this.inadequate = false
    this.hash_ = {}
    for (let i = this._items.length - 1; i >= 0; i--) {
      this.hash_[this._items[i].id] = true // i;
    }
  },
  concat: function (concat) {
    const a = concat._items || concat
    for (let i = a.length - 1; i >= 0; i--) {
      this.hash_[a[i].id] = true // i;
    }
    this._items.push.apply(this._items, a)
    return this
  },
  push: function (item) {
    this.hash_[item.id] = true
    return this._items.push(item)
  },
  contains: function (item) {
    return this.hash_[item.id]
  },
  valueOf: function toValue () {
    const v = this._items.map(function (a) { return a.id }).sort().join('|')
    this.valueOf = function toValueInner () { return v }
    return v
  }
})

lrGeneratorMixin.closureOperation = function closureOperation (itemSet) {
  const closureSet = new this.ItemSet()
  const self = this

  let set = itemSet
  let itemQueue
  const syms = {}

  do {
    itemQueue = new Set()
    closureSet.concat(set)
    set.forEach(function closureOperationSetForEach (item) {
      const symbol = item.markedSymbol

      // if token is a non-terminal, recursively add closures
      if (symbol && self.nonterminals[symbol]) {
        if (!syms[symbol]) {
          self.nonterminals[symbol].productions.forEach(function closureOperationNonTerminalForEach (production) {
            const newItem = new self.Item(production, 0)
            if (!closureSet.contains(newItem)) { itemQueue.push(newItem) }
          })
          syms[symbol] = true
        }
      } else if (!symbol) {
        // reduction
        closureSet.reductions.push(item)
        closureSet.inadequate = closureSet.reductions.length > 1 || closureSet.shifts
      } else {
        // shift
        closureSet.shifts = true
        closureSet.inadequate = closureSet.reductions.length > 0
      }
    })

    set = itemQueue
  } while (!itemQueue.isEmpty())

  return closureSet
}

lrGeneratorMixin.gotoOperation = function gotoOperation (itemSet, symbol) {
  const gotoSet = new this.ItemSet()
  const self = this

  itemSet.forEach(function gotoForEach (item, n) {
    if (item.markedSymbol === symbol) {
      gotoSet.push(new self.Item(item.production, item.dotPosition + 1, item.follows, n))
    }
  })

  return gotoSet.isEmpty() ? gotoSet : this.closureOperation(gotoSet)
}

/* Create unique set of item sets
* */
lrGeneratorMixin.canonicalCollection = function canonicalCollection () {
  const item1 = new this.Item(this.productions[0], 0, [this.EOF])
  const firstState = this.closureOperation(new this.ItemSet(item1))
  const states = new Set(firstState)
  let marked = 0
  const self = this
  let itemSet

  states.has = {}
  states.has[firstState] = 0

  while (marked !== states.size()) {
    itemSet = states.item(marked); marked++
    itemSet.forEach(function canonicalCollectionItemSetForEach (item) {
      if (item.markedSymbol && item.markedSymbol !== self.EOF) { self.canonicalCollectionInsert(item.markedSymbol, itemSet, states, marked - 1) }
    })
  }

  return states
}

// Pushes a unique state into the que. Some parsing algorithms may perform additional operations
lrGeneratorMixin.canonicalCollectionInsert = function canonicalCollectionInsert (symbol, itemSet, states, stateNum) {
  const g = this.gotoOperation(itemSet, symbol)
  if (!g.predecessors) { g.predecessors = {} }
  // add g to que if not empty or duplicate
  if (!g.isEmpty()) {
    const gv = g.valueOf()
    const i = states.has[gv]
    if (i === -1 || typeof i === 'undefined') {
      states.has[gv] = states.size()
      itemSet.edges[symbol] = states.size() // store goto transition for table
      states.push(g)
      g.predecessors[symbol] = [stateNum]
    } else {
      itemSet.edges[symbol] = i // store goto transition for table
      states.item(i).predecessors[symbol].push(stateNum)
    }
  }
}

const NONASSOC = 0
lrGeneratorMixin.parseTable = function parseTable (itemSets) {
  const states = []
  const nonterminals = this.nonterminals
  const operators = this.operators
  const conflictedStates = {} // array of [state, token] tuples
  const self = this
  const s = 1 // shift
  const r = 2 // reduce
  const a = 3 // accept

  // for each item set
  itemSets.forEach(function (itemSet, k) {
    const state = states[k] = {}
    let action, stackSymbol

    // set shift and goto actions
    for (stackSymbol in itemSet.edges) {
      itemSet.forEach(function (item, j) {
        // find shift and goto actions
        if (item.markedSymbol === stackSymbol) {
          const gotoState = itemSet.edges[stackSymbol]
          if (nonterminals[stackSymbol]) {
            // store state to go to after a reduce
            // self.trace(k, stackSymbol, 'g'+gotoState);
            state[self.symbols_[stackSymbol]] = gotoState
          } else {
            // self.trace(k, stackSymbol, 's'+gotoState);
            state[self.symbols_[stackSymbol]] = [s, gotoState]
          }
        }
      })
    }

    // set accept action
    itemSet.forEach(function (item, j) {
      if (item.markedSymbol === self.EOF) {
        // accept
        state[self.symbols_[self.EOF]] = [a]
        // self.trace(k, self.EOF, state[self.EOF]);
      }
    })

    const allterms = self.lookAheads ? false : self.terminals

    // set reductions and resolve potential conflicts
    itemSet.reductions.forEach(function (item, j) {
      // if parser uses lookahead, only enumerate those terminals
      const terminals = allterms || self.lookAheads(itemSet, item)

      terminals.forEach(function (stackSymbol) {
        action = state[self.symbols_[stackSymbol]]
        const op = operators[stackSymbol]

        // Reading a terminal and current position is at the end of a production, try to reduce
        if (action || (action && action.length)) {
          const sol = resolveConflict(item.production, op, [r, item.production.id], action[0] instanceof Array ? action[0] : action)
          self.resolutions.push([k, stackSymbol, sol])
          if (sol.bydefault) {
            self.conflicts++
            if (!self.DEBUG) {
              self.warn('Conflict in grammar: multiple actions possible when lookahead token is ', stackSymbol, ' in state ', k, '\n- ', printAction(sol.r, self), '\n- ', printAction(sol.s, self))
              conflictedStates[k] = true
            }
            if (self.options.noDefaultResolve) {
              if (!(action[0] instanceof Array)) { action = [action] }
              action.push(sol.r)
            }
          } else {
            action = sol.action
          }
        } else {
          action = [r, item.production.id]
        }
        if (action && action.length) {
          state[self.symbols_[stackSymbol]] = action
        } else if (action === NONASSOC) {
          state[self.symbols_[stackSymbol]] = undefined
        }
      })
    })
  })

  if (!self.DEBUG && self.conflicts > 0) {
    self.warn('\nStates with conflicts:')
    each(conflictedStates, function (val, state) {
      self.warn('State ' + state)
      self.warn('  ', itemSets.item(state).join('\n  '))
    })
  }

  return states
}

lrGeneratorMixin.generate = function parserGenerate (opt) {
  opt = typal.mix.call({}, this.options, opt)
  let code = ''

  // check for illegal identifier
  if (!opt.moduleName || !opt.moduleName.match(/^[A-Za-z_$][A-Za-z0-9_$]*$/)) {
    opt.moduleName = 'parser'
  }
  switch (opt.moduleType) {
    case 'js':
      code = this.generateModule(opt)
      break
    case 'amd':
      code = this.generateAMDModule(opt)
      break
    default:
      code = this.generateCommonJSModule(opt)
      break
  }

  return code
}

lrGeneratorMixin.generateAMDModule = function generateAMDModule (opt) {
  opt = typal.mix.call({}, this.options, opt)
  const module = this.generateModule_()
  const out = '\n\ndefine(function(require){\n' +
    module.commonCode +
    '\nvar parser = ' + module.moduleCode +
    '\n' + this.moduleInclude +
    (this.lexer && this.lexer.generateModule
      ? '\n' + this.lexer.generateModule() +
      '\nparser.lexer = lexer;'
      : '') +
    '\nreturn parser;' +
    '\n});'
  return out
}

lrGeneratorMixin.generateCommonJSModule = function generateCommonJSModule (opt) {
  opt = typal.mix.call({}, this.options, opt)
  const moduleName = opt.moduleName || 'parser'
  const out = this.generateModule(opt) +
    "\n\n\nif (typeof require !== 'undefined' && typeof exports !== 'undefined') {" +
    '\nexports.parser = ' + moduleName + ';' +
    '\nexports.Parser = ' + moduleName + '.Parser;' +
    '\nexports.parse = function () { return ' + moduleName + '.parse.apply(' + moduleName + ', arguments); };' +
    '\nexports.main = ' + String(opt.moduleMain || commonjsMain) + ';' +
    "\nif (typeof module !== 'undefined' && require.main === module) {\n" +
    '  exports.main(process.argv.slice(1));\n}' +
    '\n}'

  return out
}

lrGeneratorMixin.generateModule = function generateModule (opt) {
  opt = typal.mix.call({}, this.options, opt)
  const moduleName = opt.moduleName || 'parser'
  let out = '/* parser generated by jison ' + version + ' */\n' +
    '/*\n' +
    '  Returns a Parser object of the following structure:\n' +
    '\n' +
    '  Parser: {\n' +
    '    yy: {}\n' +
    '  }\n' +
    '\n' +
    '  Parser.prototype: {\n' +
    '    yy: {},\n' +
    '    trace: function(),\n' +
    '    symbols_: {associative list: name ==> number},\n' +
    '    terminals_: {associative list: number ==> name},\n' +
    '    productions_: [...],\n' +
    '    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),\n' +
    '    table: [...],\n' +
    '    defaultActions: {...},\n' +
    '    parseError: function(str, hash),\n' +
    '    parse: function(input),\n' +
    '\n' +
    '    lexer: {\n' +
    '        EOF: 1,\n' +
    '        parseError: function(str, hash),\n' +
    '        setInput: function(input),\n' +
    '        input: function(),\n' +
    '        unput: function(str),\n' +
    '        more: function(),\n' +
    '        less: function(n),\n' +
    '        pastInput: function(),\n' +
    '        upcomingInput: function(),\n' +
    '        showPosition: function(),\n' +
    '        test_match: function(regex_match_array, rule_index),\n' +
    '        next: function(),\n' +
    '        lex: function(),\n' +
    '        begin: function(condition),\n' +
    '        popState: function(),\n' +
    '        _currentRules: function(),\n' +
    '        topState: function(),\n' +
    '        pushState: function(condition),\n' +
    '\n' +
    '        options: {\n' +
    '            ranges: boolean           (optional: true ==> token location info will include a .range[] member)\n' +
    '            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)\n' +
    '            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)\n' +
    '        },\n' +
    '\n' +
    '        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),\n' +
    '        rules: [...],\n' +
    '        conditions: {associative list: name ==> set},\n' +
    '    }\n' +
    '  }\n' +
    '\n' +
    '\n' +
    '  token location info (@$, _$, etc.): {\n' +
    '    first_line: n,\n' +
    '    last_line: n,\n' +
    '    first_column: n,\n' +
    '    last_column: n,\n' +
    '    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)\n' +
    '  }\n' +
    '\n' +
    '\n' +
    "  the parseError function receives a 'hash' object with these members for lexer and parser errors: {\n" +
    '    text:        (matched text)\n' +
    '    token:       (the produced terminal token, if any)\n' +
    '    line:        (yylineno)\n' +
    '  }\n' +
    '  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {\n' +
    '    loc:         (yylloc)\n' +
    '    expected:    (string describing the set of expected tokens)\n' +
    '    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)\n' +
    '  }\n' +
    '*/\n'
  out += (moduleName.match(/\./) ? moduleName : 'var ' + moduleName) +
    ' = ' + this.generateModuleExpr()

  return out
}

lrGeneratorMixin.generateModuleExpr = function generateModuleExpr () {
  let out = ''
  const module = this.generateModule_()

  out += '(function(){\n'
  out += module.commonCode
  out += '\nvar parser = ' + module.moduleCode
  out += '\n' + this.moduleInclude
  if (this.lexer && this.lexer.generateModule) {
    out += this.lexer.generateModule()
    out += '\nparser.lexer = lexer;'
  }
  out += '\nfunction Parser () {\n  this.yy = {};\n}\n' +
    'Parser.prototype = parser;' +
    'parser.Parser = Parser;' +
    '\nreturn new Parser;\n})();'

  return out
}

lrGeneratorMixin.createParser = function createParser () {
  const p = eval(this.generateModuleExpr())

  // for debugging
  p.productions = this.productions

  const self = this
  function bind (method) {
    return function () {
      self.lexer = p.lexer
      return self[method].apply(self, arguments)
    }
  }

  // backwards compatability
  p.lexer = this.lexer
  p.generate = bind('generate')
  p.generateAMDModule = bind('generateAMDModule')
  p.generateModule = bind('generateModule')
  p.generateCommonJSModule = bind('generateCommonJSModule')

  return p
}
module.exports = lrGeneratorMixin
