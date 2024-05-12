const lookaheadMixin = {
  computeLookaheads: function () {
    if (this.DEBUG) this.mix(lookaheadDebug) // mixin debug methods
    this.nullableSets()
    this.firstSets()
    this.followSets()
  },

  firstSets: function () {
    const productions = this.productions
    const nonterminals = this.nonterminals
    let cont = true

    while (cont) {
      cont = false
      productions.forEach(production => {
        const firsts = this.first(production.handle)
        if (firsts.length !== production.first.length) {
          production.first = firsts
          cont = true
        }
      })

      for (const symbol in nonterminals) {
        let firsts = []
        nonterminals[symbol].productions.forEach(production => {
          firsts = firsts.concat(production.first)
        })
        if (firsts.length !== nonterminals[symbol].first.length) {
          nonterminals[symbol].first = firsts
          cont = true
        }
      }
    }
  },

  followSets: function () {
    const productions = this.productions
    const nonterminals = this.nonterminals
    let cont = true

    while (cont) {
      cont = false
      productions.forEach(production => {
        for (let i = 0; i < production.handle.length; ++i) {
          const t = production.handle[i]
          if (nonterminals[t]) {
            let set = []
            if (i + 1 < production.handle.length) {
              set = this.first(production.handle.slice(i + 1))
              if (this.nullable(production.handle.slice(i + 1))) {
                set = set.concat(nonterminals[production.symbol].follows)
              }
            } else {
              set = nonterminals[production.symbol].follows
            }
            const oldcount = nonterminals[t].follows.length
            nonterminals[t].follows = Array.from(new Set([...nonterminals[t].follows, ...set]))
            if (oldcount !== nonterminals[t].follows.length) {
              cont = true
            }
          }
        }
      })
    }
  },

  first: function (symbol) {
    if (typeof symbol === 'string') {
      const nonterminals = this.nonterminals
      if (nonterminals[symbol]) {
        return nonterminals[symbol].first
      } else {
        return [symbol]
      }
    } else if (symbol instanceof Array) {
      let first = []
      for (let i = 0; i < symbol.length; i++) {
        const symFirsts = this.first(symbol[i])
        first = first.concat(symFirsts)
        if (symFirsts.indexOf('') === -1) break // stop if symbol is not nullable
      }
      return Array.from(new Set(first))
    }
    return []
  },

  nullableSets: function () {
    const productions = this.productions
    let cont = true

    while (cont) {
      cont = false
      productions.forEach(production => {
        if (!production.nullable) {
          production.nullable = production.handle.every(symbol => this.nullable(symbol))
          if (production.nullable) cont = true
        }
      })
    }
  },

  nullable: function (symbol) {
    if (typeof symbol === 'string') {
      return this.nonterminals[symbol] && this.nonterminals[symbol].nullable
    } else if (symbol instanceof Array) {
      return symbol.every(sym => this.nullable(sym))
    }
    return false
  }
}

module.exports = lookaheadMixin
