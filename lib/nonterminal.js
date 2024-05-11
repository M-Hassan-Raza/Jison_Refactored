// nonterminal.js

function Nonterminal(symbol) {
  this.symbol = symbol;
  this.productions = new Set();
  this.first = [];
  this.follows = [];
  this.nullable = false;
}

Nonterminal.prototype.toString = function() {
  let str = this.symbol + '\n';
  str += (this.nullable ? 'nullable' : 'not nullable');
  str += '\nFirsts: ' + this.first.join(', ');
  str += '\nFollows: ' + this.follows.join(', ');
  str += '\nProductions:\n  ' + Array.from(this.productions).join('\n  ');

  return str;
};

module.exports = Nonterminal;
