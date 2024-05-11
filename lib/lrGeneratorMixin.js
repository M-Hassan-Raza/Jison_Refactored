const { findDefaults } = require('./utils')
const { typal } = require('./util/typal')
const { Set } = require('./util/set')
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
    this.valueOf = function toValueInner () { return v }
    return v
  }
})

lrGeneratorMixin.closureOperation = function closureOperation (itemSet) {
  const closureSet = new this.ItemSet()
  const self = this

  let set = itemSet
  let itemQueue; const syms = {}

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
