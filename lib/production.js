// production.js

function Production(symbol, handle, id) {
  this.symbol = symbol;
  this.handle = handle;
  this.nullable = false;
  this.id = id;
  this.first = [];
  this.precedence = 0;
}

Production.prototype.toString = function() {
  return this.symbol + ' -> ' + this.handle.join(' ');
};

module.exports = Production;
