const typal = require('./typal').typal
const Set = require('./set').Set

const Nonterminal = typal.construct({
  constructor: function Nonterminal (symbol) {
    this.symbol = symbol
    this.productions = new Set()
    this.first = []
    this.follows = []
    this.nullable = false
  },
  toString: function nonterminalToString () {
    let str = this.symbol + '\n'
    str += (this.nullable ? 'nullable' : 'not nullable')
    str += '\nFirsts: ' + this.first.join(', ')
    str += '\nFollows: ' + this.follows.join(', ')
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
  toString: function productionToString () {
    return this.symbol + ' -> ' + this.handle.join(' ')
  }
})

const Item = typal.construct({
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
    const handle = this.production.handle.slice(0)
    handle[this.dotPosition] = '.' + (handle[this.dotPosition] || '')
    return this.production.symbol + ' -> ' + handle.join(' ') +
      (this.follows.length === 0 ? '' : ' #lookaheads= ' + this.follows.join(' '))
  }
})

const ItemSet = Set.prototype.construct({
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
  concat: function (set) {
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
  valueOf: function () {
    const v = this._items.map(function (a) { return a.id }).sort().join('|')
    this.valueOf = function () { return v }
    return v
  }
})

module.exports = {
  Nonterminal,
  Production,
  Item,
  ItemSet
}
