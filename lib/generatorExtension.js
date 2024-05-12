const ebnfParser = require('ebnf-parser')
const { processOperators } = require('./utils')

module.exports = function processGrammer (grammar) {
  let bnf = grammar.bnf
  let tokens = grammar.tokens
  const nonterminals = this.nonterminals = {}
  const productions = this.productions
  const self = this

  if (!grammar.bnf && grammar.ebnf) {
    bnf = grammar.bnf = ebnfParser.transform(grammar.ebnf)
  }

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
  this.buildProductions(bnf, productions, nonterminals, symbols, operators)

  if (tokens && this.terminals.length !== tokens.length) {
    self.trace('Warning: declared tokens differ from tokens found in rules.')
    self.trace(this.terminals)
    self.trace(tokens)
  }

  // augment the grammar
  // this.augmentGrammar(grammar)
}
