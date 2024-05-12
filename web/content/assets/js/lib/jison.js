// Jison, an LR(0), SLR(1), LARL(1), LR(1) Parser Generator
// Zachary Carter <zach@carter.name>
// MIT X Licensed

if (typeof exports === 'undefined') {
  exports = {}
} else if (typeof require !== 'undefined') {
  // assume we're in commonjs land
  // var system = require("system");
  var typal = require('./jison/util/typal').typal
  var Set = require('./jison/util/set').Set
  var RegExpLexer = require('./jison/lexer').RegExpLexer
}

const Jison = exports.Jison = exports

// detect print
if (typeof puts !== 'undefined') {
  Jison.print = function print () { puts([].join.call(arguments, ' ')) }
} else if (typeof print !== 'undefined') {
  Jison.print = print
} else {
  Jison.print = function print () {}
}

Jison.Parser = (function () {
// iterator utility
  function each (obj, func) {
    if (obj.forEach) {
      obj.forEach(func)
    } else {
      let p
      for (p in obj) {
        if (obj.hasOwnProperty(p)) {
          func.call(obj, obj[p], p, obj)
        }
      }
    }
  }

  const Nonterminal = typal.construct({
    constructor: function Nonterminal (symbol) {
      this.symbol = symbol
      this.productions = new Set()
      this.first = []
      this.follows = []
      this.nullable = false
    },
    toString: function Nonterminal_toString () {
      let str = this.symbol + '\n'
      str += (this.nullable ? 'nullable' : 'not nullable')
      str += '\nFirsts: ' + this.first.join(', ')
      str += '\nFollows: ' + this.first.join(', ')
      str += '\nProductions:\n  ' + this.productions.join('\n  ')

      return str
    }
  })

  const Production = typal.construct({
    constructor: function Production (symbol, handle, id) {
      this.symbol = symbol
      this.handle = handle
      this.nullable = false
      this.id = id
      this.first = []
      this.precedence = 0
    },
    toString: function Production_toString () {
      return this.symbol + ' -> ' + this.handle.join(' ')
    }
  })

  const generator = typal.beget()

  generator.constructor = function Jison_Generator (grammar, opt) {
    if (typeof grammar === 'string') {
      grammar = require('jison/bnf').parse(grammar)
    }

    const options = typal.mix.call({}, grammar.options, opt)
    this.terms = {}
    this.operators = {}
    this.productions = []
    this.conflicts = 0
    this.resolutions = []
    this.options = options
    this.yy = {} // accessed as yy free variable in the parser/lexer actions

    // source included in semantic action execution scope
    if (grammar.actionInclude) {
      if (typeof grammar.actionInclude === 'function') {
        grammar.actionInclude = String(grammar.actionInclude).replace(/^\s*function \(\) \{/, '').replace(/\}\s*$/, '')
      }
      this.actionInclude = grammar.actionInclude
    }

    this.DEBUG = options.debug || false
    if (this.DEBUG) this.mix(generatorDebug) // mixin debug methods

    this.processGrammar(grammar)

    if (grammar.lex) {
      this.lexer = new RegExpLexer(grammar.lex, null, this.terminals_)
    }
  }

  generator.processGrammar = function processGrammarDef (grammar) {
    const bnf = grammar.bnf
    let tokens = grammar.tokens
    const nonterminals = this.nonterminals = {}
    const productions = this.productions
    const self = this

    if (tokens) {
      if (typeof tokens === 'string') {
        tokens = tokens.trim().split(' ')
      } else {
        tokens = tokens.slice(0)
      }
    }

    const symbols = this.symbols = []

    // calculate precedence of operators
    const operators = this.operators = processOperators(grammar.operators)

    // build productions from cfg
    this.buildProductions(grammar.bnf, productions, nonterminals, symbols, operators)

    if (tokens && this.terminals.length !== tokens.length) {
      self.trace('Warning: declared tokens differ from tokens found in rules.')
      self.trace(this.terminals)
      self.trace(tokens)
    }

    // augment the grammar
    this.augmentGrammar(grammar)
  }

  generator.augmentGrammar = function augmentGrammar (grammar) {
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

    this.nonterminals.$accept = new Nonterminal('$accept')
    this.nonterminals.$accept.productions.push(acceptProduction)

    // add follow $ to start symbol
    this.nonterminals[this.startSymbol].follows.push(this.EOF)
  }

  // set precedence and associativity of operators
  function processOperators (ops) {
    if (!ops) return {}
    const operators = {}
    for (var i = 0, k, prec; prec = ops[i]; i++) {
      for (k = 1; k < prec.length; k++) {
        operators[prec[k]] = { precedence: i + 1, assoc: prec[0] }
      }
    }
    return operators
  }

  generator.buildProductions = function buildProductions (bnf, productions, nonterminals, symbols, operators) {
    const actions = [this.actionInclude || '', 'var $$ = arguments[5],$0=arguments[5].length;', 'switch(arguments[4]) {']
    let prods; let symbol
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
      if (!bnf.hasOwnProperty(symbol)) continue

      addSymbol(symbol)
      nonterminals[symbol] = new Nonterminal(symbol)

      if (typeof bnf[symbol] === 'string') {
        prods = bnf[symbol].split(/\s*\|\s*/g)
      } else {
        prods = bnf[symbol].slice(0)
      }

      prods.forEach(function buildProds_forEach (handle) {
        let r, rhs, i
        if (handle.constructor === Array) {
          if (typeof handle[0] === 'string') { rhs = handle[0].trim().split(' ') } else { rhs = handle[0].slice(0) }

          for (i = 0; her = her || rhs[i] === 'error', i < rhs.length; i++) {
            if (!symbols_[rhs[i]]) {
              addSymbol(rhs[i])
            }
          }

          if (typeof handle[1] === 'string' || handle.length == 3) {
            // semantic action specified
            let action = 'case ' + (productions.length + 1) + ':' + handle[1] + '\nbreak;'

            // replace named semantic values ($nonterminal)
            if (action.match(/\$[a-zA-Z][a-zA-Z0-9_]*/)) {
              const count = {}
              const names = {}
              for (i = 0; i < rhs.length; i++) {
                if (names[rhs[i]]) {
                  names[rhs[i] + (++count[rhs[i]])] = i + 1
                } else {
                  names[rhs[i]] = i + 1
                  names[rhs[i] + '1'] = i + 1
                  count[rhs[i]] = 1
                }
              }
              action = action.replace(/\$([a-zA-Z][a-zA-Z0-9_]*)/g, function (str, pl) {
                return names[pl] ? '$' + names[pl] : pl
              })
            }
            action = action.replace(/\$(?:0|\$)/g, 'this.$')
              .replace(/\$(\d+)/g, '$$$[\$0-' + rhs.length + '+$1-1]')
            actions.push(action)

            r = new Production(symbol, rhs, productions.length + 1)
            // precedence specified also
            if (handle[2] && operators[handle[2].prec]) {
              r.precedence = operators[handle[2].prec].precedence
            }
          } else {
            // only precedence specified
            r = new Production(symbol, rhs, productions.length + 1)
            if (operators[handle[1].prec]) {
              r.precedence = operators[handle[1].prec].precedence
            }
          }
        } else {
          rhs = handle.trim().split(' ')
          for (i = 0; her = her || rhs[i] === 'error', i < rhs.length; i++) {
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
      })
    }

    let sym; const terms = []; const terms_ = {}
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
    this.performAction = Function('yytext', 'yyleng', 'yylineno', 'yy', actions.join('\n'))
  }

  generator.createParser = function createParser () {
    throw 'Calling abstract method.'
  }

  // noop. implemented in debug mixin
  generator.trace = function trace () { }

  generator.warn = function warn () {
    Jison.print.apply(null, arguments)
  }

  generator.error = function error (msg) {
    throw msg
  }

  // Generator debug mixin

  var generatorDebug = {
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

  /*
 * Mixin for common behaviors of lookahead parsers
 * */
  const lookaheadMixin = {}

  lookaheadMixin.computeLookaheads = function computeLookaheads () {
    if (this.DEBUG) this.mix(lookaheadDebug) // mixin debug methods

    this.computeLookaheads = function () {}
    this.nullableSets()
    this.firstSets()
    this.followSets()
  }

  // calculate follow sets typald on first and nullable
  lookaheadMixin.followSets = function followSets () {
    const productions = this.productions
    const nonterminals = this.nonterminals
    const self = this
    let cont = true

    // loop until no further changes have been made
    while (cont) {
      cont = false

      productions.forEach(function Follow_prod_forEach (production, k) {
        // self.trace(production.symbol,nonterminals[production.symbol].follows);
        // q is used in Simple LALR algorithm determine follows in context
        let q
        const ctx = !!self.go_

        let set = []; let oldcount
        for (var i = 0, t; t = production.handle[i]; ++i) {
          if (!nonterminals[t]) continue

          // for Simple LALR algorithm, self.go_ checks if
          if (ctx) { q = self.go_(production.symbol, production.handle.slice(0, i)) }
          const bool = !ctx || q === parseInt(self.nterms_[t])

          if (i === production.handle.length + 1 && bool) {
            set = nonterminals[production.symbol].follows
          } else {
            const part = production.handle.slice(i + 1)

            set = self.first(part)
            if (self.nullable(part) && bool) {
              set.push.apply(set, nonterminals[production.symbol].follows)
            }
          }
          oldcount = nonterminals[t].follows.length
          Set.union(nonterminals[t].follows, set)
          if (oldcount !== nonterminals[t].follows.length) {
            cont = true
          }
        }
      })
    }
  }

  // return the FIRST set of a symbol or series of symbols
  lookaheadMixin.first = function first (symbol) {
    // epsilon
    if (symbol === '') {
      return []
    // RHS
    } else if (symbol instanceof Array) {
      const firsts = []
      for (var i = 0, t; t = symbol[i]; ++i) {
        if (!this.nonterminals[t]) {
          if (firsts.indexOf(t) === -1) { firsts.push(t) }
        } else {
          Set.union(firsts, this.nonterminals[t].first)
        }
        if (!this.nullable(t)) { break }
      }
      return firsts
    // terminal
    } else if (!this.nonterminals[symbol]) {
      return [symbol]
    // nonterminal
    } else {
      return this.nonterminals[symbol].first
    }
  }

  // fixed-point calculation of FIRST sets
  lookaheadMixin.firstSets = function firstSets () {
    const productions = this.productions
    const nonterminals = this.nonterminals
    const self = this
    let cont = true
    let symbol; let firsts

    // loop until no further changes have been made
    while (cont) {
      cont = false

      productions.forEach(function FirstSets_forEach (production, k) {
        const firsts = self.first(production.handle)
        if (firsts.length !== production.first.length) {
          production.first = firsts
          cont = true
        }
      })

      for (symbol in nonterminals) {
        firsts = []
        nonterminals[symbol].productions.forEach(function (production) {
          Set.union(firsts, production.first)
        })
        if (firsts.length !== nonterminals[symbol].first.length) {
          nonterminals[symbol].first = firsts
          cont = true
        }
      }
    }
  }

  // fixed-point calculation of NULLABLE
  lookaheadMixin.nullableSets = function nullableSets () {
    const firsts = this.firsts = {}
    const nonterminals = this.nonterminals
    const self = this
    let cont = true

    // loop until no further changes have been made
    while (cont) {
      cont = false

      // check if each production is nullable
      this.productions.forEach(function (production, k) {
        if (!production.nullable) {
          for (var i = 0, n = 0, t; t = production.handle[i]; ++i) {
            if (self.nullable(t)) n++
          }
          if (n === i) { // production is nullable if all tokens are nullable
            production.nullable = cont = true
          }
        }
      })

      // check if each symbol is nullable
      for (const symbol in nonterminals) {
        if (!this.nullable(symbol)) {
          for (var i = 0, production; production = nonterminals[symbol].productions.item(i); i++) {
            if (production.nullable) { nonterminals[symbol].nullable = cont = true }
          }
        }
      }
    }
  }

  // check if a token or series of tokens is nullable
  lookaheadMixin.nullable = function nullable (symbol) {
    // epsilon
    if (symbol === '') {
      return true
    // RHS
    } else if (symbol instanceof Array) {
      for (var i = 0, t; t = symbol[i]; ++i) {
        if (!this.nullable(t)) { return false }
      }
      return true
    // terminal
    } else if (!this.nonterminals[symbol]) {
      return false
    // nonterminal
    } else {
      return this.nonterminals[symbol].nullable
    }
  }

  // lookahead debug mixin
  var lookaheadDebug = {
    beforenullableSets: function () {
      this.trace('Computing Nullable sets.')
    },
    beforefirstSets: function () {
      this.trace('Computing First sets.')
    },
    beforefollowSets: function () {
      this.trace('Computing Follow sets.')
    },
    afterfollowSets: function () {
      const trace = this.trace
      each(this.nonterminals, function (nt, t) {
        trace(nt, '\n')
      })
    }
  }

  /*
 * Mixin for common LR parser behavior
 * */
  const lrGeneratorMixin = {}

  lrGeneratorMixin.buildTable = function buildTable () {
    if (this.DEBUG) this.mix(lrGeneratorDebug) // mixin debug methods

    this.states = this.canonicalCollection()
    this.table = this.parseTable(this.states)
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
    toString: function () {
      const temp = this.production.handle.slice(0)
      temp[this.dotPosition] = '.' + (temp[this.dotPosition] || '')
      return '[' + this.production.symbol + ' -> ' + temp.join(' ') +
            (this.follows.length === 0 ? '' : ', ' + this.follows.join('/')) +
            ']'
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
    concat: function concat (set) {
      const a = set._items || set
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
      return (this.valueOf = function toValue_inner () { return v })()
    }
  })

  lrGeneratorMixin.closureOperation = function closureOperation (itemSet /*, closureSet */) {
    const closureSet = new this.ItemSet()
    const self = this

    let set = itemSet
    let itemQueue; const syms = {}

    do {
      itemQueue = new Set()
      closureSet.concat(set)
      set.forEach(function CO_set_forEach (item) {
        const symbol = item.markedSymbol

        // if token is a non-terminal, recursively add closures
        if (symbol && self.nonterminals[symbol]) {
          if (!syms[symbol]) {
            self.nonterminals[symbol].productions.forEach(function CO_nt_forEach (production) {
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

    itemSet.forEach(function goto_forEach (item, n) {
      if (item.markedSymbol === symbol) {
        gotoSet.push(new self.Item(item.production, item.dotPosition + 1, item.follows, n))
      }
    })

    return gotoSet.isEmpty() ? gotoSet : this.closureOperation(gotoSet)
  }

  /* Create unique set of item sets
 * */
  lrGeneratorMixin.canonicalCollection = function canonicalCollection () {
    const item1 = new this.Item(this.productions[0], 0, new Set(this.EOF))
    const firstState = this.closureOperation(new this.ItemSet(item1))
    const states = new Set(firstState)
    let marked = 0
    const self = this
    let itemSet

    states.has = {}
    states.has[firstState] = 0

    while (marked !== states.size()) {
      itemSet = states.item(marked); marked++
      itemSet.forEach(function CC_itemSet_forEach (item) {
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
          if (item.markedSymbol == stackSymbol) {
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
        if (item.markedSymbol == self.EOF) {
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
          if (action || action && action.length) {
            const sol = resolveConflict(item.production, op, [r, item.production.id], action[0] instanceof Array ? action[0] : action)
            self.resolutions.push([k, stackSymbol, sol])
            if (sol.bydefault) {
              self.conflicts++
              if (!self.DEBUG) {
                self.warn('Conflict in grammar (state:', k, ', token:', stackSymbol, ')\n  ', printAction(sol.r, self), '\n  ', printAction(sol.s, self))
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

    return states
  }

  // resolves shift-reduce and reduce-reduce conflicts
  function resolveConflict (production, op, reduce, shift) {
    const sln = { production, operator: op, r: reduce, s: shift }
    const s = 1 // shift
    const r = 2 // reduce
    const a = 3 // accept

    if (shift[0] === r) {
      sln.msg = 'Resolve R/R conflict (use first production declared in grammar.)'
      sln.action = shift[1] < reduce[1] ? shift : reduce
      sln.bydefault = true
      return sln
    }

    if (production.precedence === 0 || !op) {
      sln.msg = 'Resolve S/R conflict (shift by default.)'
      sln.bydefault = true
      sln.action = shift
    } else if (production.precedence < op.precedence) {
      sln.msg = 'Resolve S/R conflict (shift for higher precedent operator.)'
      sln.action = shift
    } else if (production.precedence === op.precedence) {
      if (op.assoc === 'right') {
        sln.msg = 'Resolve S/R conflict (shift for right associative operator.)'
        sln.action = shift
      } else if (op.assoc === 'left') {
        sln.msg = 'Resolve S/R conflict (reduce for left associative operator.)'
        sln.action = reduce
      } else if (op.assoc === 'nonassoc') {
        sln.msg = 'Resolve S/R conflict (no action for non-associative operator.)'
        sln.action = NONASSOC
      }
    } else {
      sln.msg = 'Resolve conflict (reduce for higher precedent production.)'
      sln.action = reduce
    }

    return sln
  }

  lrGeneratorMixin.generate = function parser_generate (opt) {
    opt = typal.mix.call({}, this.options, opt)
    let code = ''
    switch (opt.moduleType) {
      case 'js':
        code = this.generateModule(opt)
        break
      case 'commonjs':
      default:
        code = this.generateCommonJSModule(opt)
    }

    return code
  }

  lrGeneratorMixin.generateCommonJSModule = function generateCommonJSModule (opt) {
    opt = typal.mix.call({}, this.options, opt)
    const moduleName = opt.moduleName || 'parser'
    let out = this.generateModule(opt)
    out += "\nif (typeof require !== 'undefined') {"
    out += '\nexports.parser = ' + moduleName + ';'
    out += '\nexports.parse = function () { return ' + moduleName + '.parse.apply(' + moduleName + ', arguments); }'
    out += '\nexports.main = ' + String(opt.moduleMain || commonjsMain)
    out += '\nif (require.main === module) {\n\texports.main(require("system").args);\n}'
    out += '\n}'

    return out
  }

  lrGeneratorMixin.generateModule = function generateModule (opt) {
    opt = typal.mix.call({}, this.options, opt)
    const moduleName = opt.moduleName || 'parser'
    let out = '/* Jison generated parser */\n'
    out += (moduleName.match(/\./) ? moduleName : 'var ' + moduleName) + ' = (function(){'
    out += '\nvar parser = ' + this.generateModule_()
    if (this.lexer && this.lexer.generateModule) {
      out += this.lexer.generateModule()
      out += '\nparser.lexer = lexer;'
    }
    out += '\nreturn parser;\n})();'

    return out
  }

  lrGeneratorMixin.generateModule_ = function generateModule_ () {
    let out = '{'
    out += [
      'trace: ' + String(this.trace || parser.trace),
      'yy: {}',
      'symbols_: ' + JSON.stringify(this.symbols_),
      'terminals_: ' + JSON.stringify(this.terminals_),
      'productions_: ' + JSON.stringify(this.productions_),
      'performAction: ' + String(this.performAction),
      'table: ' + JSON.stringify(this.table),
      'parseError: ' + String(this.parseError || (this.hasErrorRecovery ? traceParseError : parser.parseError)),
      'parse: ' + String(parser.parse)
    ].join(',\n')
    out += '};'

    return out
  }

  // default main method for generated commonjs modules
  function commonjsMain (args) {
    const cwd = require('file').path(require('file').cwd())
    if (!args[1]) { throw new Error('Usage: ' + args[0] + ' FILE') }
    const source = cwd.join(args[1]).read({ charset: 'utf-8' })
    exports.parser.parse(source)
  }

  // debug mixin for LR parser generators

  function printAction (a, gen) {
    const s = a[0] == 1
      ? 'shift ' + gen.symbols[a[1]]
      : a[0] == 2
        ? 'reduce by ' + gen.productions[a[1]]
        : 'accept'

    return s
  }

  var lrGeneratorDebug = {
    beforeparseTable: function () {
      this.trace('Building parse table.')
    },
    afterparseTable: function () {
      const self = this
      if (this.conflicts > 0) {
        this.resolutions.forEach(function (r, i) {
          if (r[2].bydefault) {
            self.warn('Conflict at state:', r[0], ', Token:', r[1], '\n  ', printAction(r[2].r, self), '\n  ', printAction(r[2].s, self))
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

  lrGeneratorMixin.createParser = function createParser () {
    const p = parser.beget()
    p.yy = {}

    p.init({
      table: this.table,
      productions_: this.productions_,
      symbols_: this.symbols_,
      terminals_: this.terminals_,
      performAction: this.performAction
    })

    // don't throw if grammar recovers from errors
    if (this.hasErrorRecovery) {
      p.parseError = traceParseError
    }

    // for debugging
    p.productions = this.productions

    // backwards compatability
    p.generate = this.generate
    p.lexer = this.lexer
    p.generateModule = this.generateModule
    p.generateCommonJSModule = this.generateCommonJSModule
    p.generateModule_ = this.generateModule_

    return p
  }

  parser.trace = generator.trace
  parser.warn = generator.warn
  parser.error = generator.error

  function traceParseError (err, hash) {
    this.trace(err)
  }

  parser.parseError = lrGeneratorMixin.parseError = function parseError (str, hash) {
    throw new Error(str)
  }

  parser.parse = function parse (input) {
    const self = this
    let stack = [0]
    let vstack = [null] // semantic value stack
    const table = this.table
    let yytext = ''
    let yylineno = 0
    let yyleng = 0
    let shifts = 0
    let reductions = 0
    let recovering = 0
    const TERROR = 2
    const EOF = 1

    this.lexer.setInput(input)
    this.lexer.yy = this.yy
    this.yy.lexer = this.lexer

    const parseError = this.yy.parseError = typeof this.yy.parseError === 'function' ? this.yy.parseError : this.parseError

    function popStack (n) {
      stack.length = stack.length - 2 * n
      vstack.length = vstack.length - n
    }

    function checkRecover (st) {
      for (const p in table[st]) {
        if (p == TERROR) {
        // print('RECOVER!!');
          return true
        }
      }
      return false
    }

    function lex () {
      let token
      token = self.lexer.lex() || 1 // $end = 1
      // if token isn't its numeric value, convert
      if (typeof token !== 'number') {
        token = self.symbols_[token]
      }
      return token
    };

    let symbol; let preErrorSymbol; let state; let action; let a; let r; const yyval = {}; let p; let len; let newState; let expected; const recovered = false
    symbol = lex()
    while (true) {
      // set first input
      state = stack[stack.length - 1]
      // read action for current state and first input
      action = table[state] && table[state][symbol]

      // handle parse error
      if (typeof action === 'undefined' || !action.length || !action[0]) {
        if (!recovering) {
          // Report error
          expected = []
          for (p in table[state]) {
            if (this.terminals_[p] && p > 2) {
              expected.push("'" + this.terminals_[p] + "'")
            }
          }
          if (this.lexer.showPosition) {
            parseError.call(this, 'Parse error on line ' + (yylineno + 1) + ':\n' + this.lexer.showPosition() + '\nExpecting ' + expected.join(', '),
              { text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, expected })
          } else {
            parseError.call(this, 'Parse error on line ' + (yylineno + 1) + ": Unexpected '" + this.terminals_[symbol] + "'",
              { text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, expected })
          }
        }

        // just recovered from another error
        if (recovering == 3) {
          if (symbol == EOF) {
            throw 'Parsing halted.'
          }

          // discard current lookahead and grab another
          yyleng = this.lexer.yyleng
          yytext = this.lexer.yytext
          yylineno = this.lexer.yylineno
          symbol = lex()
        }

        // try to recover from error
        while (1) {
          // check for error recovery rule in this state
          if (checkRecover(state)) {
            break
          }
          if (state == 0) {
            throw 'Parsing halted.'
          }
          popStack(1)
          state = stack[stack.length - 1]
        }

        preErrorSymbol = symbol // save the lookahead token
        symbol = TERROR // insert generic error symbol as new lookahead
        state = stack[stack.length - 1]
        action = table[state] && table[state][TERROR]
        recovering = 3 // allow 3 real symbols to be shifted before reporting a new error
      }

      // this shouldn't happen, unless resolve defaults are off
      if (action[0] instanceof Array && action.length > 1) {
        throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol)
      }

      a = action

      switch (a[0]) {
        case 1: // shift
          shifts++

          stack.push(symbol)
          vstack.push(this.lexer.yytext) // semantic values or junk only, no terminals
          stack.push(a[1]) // push state
          if (!preErrorSymbol) { // normal execution/no error
            yyleng = this.lexer.yyleng
            yytext = this.lexer.yytext
            yylineno = this.lexer.yylineno
            symbol = lex()
            if (recovering > 0) { recovering-- }
          } else { // error just occurred, resume old lookahead f/ before error
            symbol = preErrorSymbol
            preErrorSymbol = null
          }
          break

        case 2: // reduce
          reductions++

          len = this.productions_[a[1]][1]

          // perform semantic action
          yyval.$ = vstack[vstack.length - len] // default to $$ = $1
          r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, a[1], vstack)

          if (typeof r !== 'undefined') {
            return r
          }

          // pop off stack
          if (len) {
            stack = stack.slice(0, -1 * len * 2)
            vstack = vstack.slice(0, -1 * len)
          }

          stack.push(this.productions_[a[1]][0]) // push nonterminal (reduce)
          vstack.push(yyval.$)
          // goto new state = table[STATE][NONTERMINAL]
          newState = table[stack[stack.length - 2]][stack[stack.length - 1]]
          stack.push(newState)
          break

        case 3: // accept

          this.reductionCount = reductions
          this.shiftCount = shifts
          return true
      }
    }

    return true
  }

  parser.init = function parser_init (dict) {
    this.table = dict.table
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
    afterconstructor: function lr0_afterconstructor () {
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
    },

    lookAheads: function LALR_lookaheads (state, item) {
      return (!!this.onDemandLookahead && !state.inadequate) ? this.terminals : item.follows
    },
    go: function LALR_go (p, w) {
      let q = parseInt(p)
      for (let i = 0; i < w.length; i++) {
        q = this.states.item(q).edges[w[i]] || q
      }
      return q
    },
    goPath: function LALR_goPath (p, w) {
      let q = parseInt(p); let t
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
    buildNewGrammar: function LALR_buildNewGrammar () {
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

            // self.trace('new production:',p);
          }
        })
        if (state.inadequate) { self.inadequateStates.push(i) }
      })
    },
    unionLookaheads: function LALR_unionLookaheads () {
      const self = this
      const newg = this.newg
      const states = this.onDemandLookahead ? this.inadequateStates : this.states

      states.forEach(function union_states_forEach (i) {
        const state = typeof i === 'number' ? self.states.item(i) : i
        const follows = []
        if (state.reductions.length) {
          state.reductions.forEach(function union_reduction_forEach (item) {
            const follows = {}
            for (let k = 0; k < item.follows.length; k++) {
              follows[item.follows[k]] = true
            }
            state.goes[item.production.handle.join(' ')].forEach(function reduction_goes_forEach (symbol) {
              newg.nonterminals[symbol].follows.forEach(function goes_follows_forEach (symbol) {
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

  var lalrGeneratorDebug = {
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
    afterconstructor: function lr_aftercontructor () {
      this.computeLookaheads()
      this.buildTable()
    }
  })

  /*
 * SLR Parser
 * */
  const SLRGenerator = exports.SLRGenerator = lrLookaheadGenerator.construct({
    type: 'SLR(1)',

    lookAheads: function SLR_lookAhead (state, item) {
      return this.nonterminals[item.production.symbol].follows
    }
  })

  /*
 * LR(1) Parser
 * */
  const lr1 = lrLookaheadGenerator.beget({
    type: 'Canonical LR(1)',

    lookAheads: function LR_lookAheads (state, item) {
      return item.follows
    },
    Item: lrGeneratorMixin.Item.prototype.construct({
      afterconstructor: function () {
        this.id = this.production.id + 'a' + this.dotPosition + 'a' + this.follows.sort().join(',')
      },
      eq: function (e) {
        return e.id === this.id
      }
    }),

    closureOperation: function LR_ClosureOperation (itemSet /*, closureSet */) {
      const closureSet = new this.ItemSet()
      const self = this

      let set = itemSet
      let itemQueue; const syms = {}

      do {
        itemQueue = new Set()
        closureSet.concat(set)
        set.forEach(function (item) {
          const symbol = item.markedSymbol
          let b

          // if token is a nonterminal, recursively add closures
          if (symbol && self.nonterminals[symbol]) {
            b = self.first(item.remainingHandle())
            if (b.length === 0) b = item.follows
            self.nonterminals[symbol].productions.forEach(function (production) {
              const newItem = new self.Item(production, 0, b)
              if (!closureSet.contains(newItem) && !itemQueue.contains(newItem)) {
                itemQueue.push(newItem)
              }
            })
          } else if (!symbol) {
            // reduction
            closureSet.reductions.push(item)
          }
        })

        set = itemQueue
      } while (!itemQueue.isEmpty())

      return closureSet
    }
  })

  const LR1Generator = exports.LR1Generator = lr1.construct()

  /*
 * LL Parser
 * */
  const ll = generator.beget(lookaheadMixin, {
    type: 'LL(1)',

    afterconstructor: function ll_aftercontructor () {
      this.computeLookaheads()
      this.table = this.parseTable(this.productions)
    },
    parseTable: function llParseTable (productions) {
      const table = {}
      const self = this
      productions.forEach(function (production, i) {
        const row = table[production.symbol] || {}
        const tokens = production.first
        if (self.nullable(production.handle)) {
          Set.union(tokens, self.nonterminals[production.symbol].follows)
        }
        tokens.forEach(function (token) {
          if (row[token]) {
            row[token].push(i)
            self.conflicts++
          } else {
            row[token] = [i]
          }
        })
        table[production.symbol] = row
      })

      return table
    }
  })

  const LLGenerator = exports.LLGenerator = ll.construct()

  Jison.Generator = function Jison_Generator (g, options) {
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
      case 'lalr':
      default:
        return new LALRGenerator(g, opt)
    }
  }

  return function Parser (g, options) {
    const opt = typal.mix.call({}, g.options, options)
    let gen
    switch (opt.type) {
      case 'lr0':
        gen = new LR0Generator(g, opt)
      case 'slr':
        gen = new SLRGenerator(g, opt)
      case 'lr':
        gen = new LR1Generator(g, opt)
      case 'll':
        gen = new LLGenerator(g, opt)
      case 'lalr':
      default:
        gen = new LALRGenerator(g, opt)
    }
    return gen.createParser()
  }
})()

exports.main = function main (args) {
  // var parser = new require("args").Parser();
  const fs = require('file')
  gfile = fs.path(fs.cwd()).join(args[1])

  // try to parse as JSON, else use BNF parser
  if (gfile.extension() === '.json') {
    var grammar = JSON.parse(gfile.read({ charset: 'utf-8' }))
  } else if (gfile.extension() === '.jison') {
    var grammar = require('jison/bnf').parse(gfile.read({ charset: 'utf-8' }))
  }

  const opt = grammar.options || {}

  // lexer file
  if (args[2]) {
    const lfile = fs.path(fs.cwd()).join(args[2])

    // try to parse as JSON, else use BNF parser
    if (lfile.extension() === '.json') {
      grammar.lex = JSON.parse(lfile.read({ charset: 'utf-8' }))
    } else if (lfile.extension() === '.jisonlex') {
      grammar.lex = require('jison/jisonlex').parse(lfile.read({ charset: 'utf-8' }))
    }
  }

  if (!opt.moduleName) { opt.moduleName = gfile.basename().replace(new RegExp(gfile.extension() + '$'), '') }
  if (!opt.moduleType) { opt.moduleType = 'commonjs' }

  const generator = new Jison.Generator(grammar, opt)
  fname = fs.path(fs.cwd()).join(opt.moduleName + '.js'),
  source = generator.generate(opt),
  stream = fname.open('w')

  stream.print(source)
  stream.close()
}
