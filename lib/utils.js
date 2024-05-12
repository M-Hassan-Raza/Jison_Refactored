const esprima = require('esprima')
const JSONSelect = require('JSONSelect')
const escodegen = require('escodegen')

function processOperators (ops = []) {
  return ops.reduce((operators, [assoc, ...tokens], index) => {
    tokens.forEach(token => {
      operators[token] = { precedence: index + 1, assoc }
    })
    return operators
  }, {})
}

function resolveConflict (production, op, reduce, shift) {
  const sln = { production, operator: op, r: reduce, s: shift }
  const _shift = 1 // shift
  const _reduce = 2 // reduce
  const _accept = 3 // accept
  const NONASSOC = 0
  if (shift[0] === _reduce) {
    sln.msg = 'Resolve R/R conflict (use first production declared in grammar.)'
    sln.action = shift[1] < reduce[1] ? shift : reduce
    if (shift[1] !== reduce[1]) sln.bydefault = true
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

function removeErrorRecovery (fn) {
  const parseFn = fn
  try {
    const ast = esprima.parse(parseFn)

    const labeled = JSONSelect.match(':has(:root > .label > .name:val("_handle_error"))', ast)
    const reducedCode = labeled[0].body.consequent.body[3].consequent.body
    reducedCode[0] = labeled[0].body.consequent.body[1] // remove the line: errorRuleDepth = locateNearestErrorRecoveryRule(state);
    reducedCode[4].expression.arguments[1].properties.pop() // remove the line: 'recoverable: errorRuleDepth !== false'
    labeled[0].body.consequent.body = reducedCode

    return escodegen.generate(ast).replace(/_handle_error:\s?/, '').replace(/\\\\n/g, '\\n')
  } catch (e) {
    return parseFn
  }
}

function parseError (str, hash) {
  if (hash.recoverable) {
    this.trace(str)
  } else {
    const error = new Error(str)
    error.hash = hash
    throw error
  }
}

function createVariable (nextVariableId, variableTokens, variableTokensLength) {
  let id = nextVariableId++
  let name = '$V'

  do {
    name += variableTokens[id % variableTokensLength]
    id = ~~(id / variableTokensLength)
  } while (id !== 0)

  return name
}

// find states with only one action, a reduction
function findDefaults (states) {
  const defaults = {}
  states.forEach(function (state, k) {
    let i = 0
    for (var act in state) {
      if ({}.hasOwnProperty.call(state, act)) i++
    }

    if (i === 1 && state[act][0] === 2) {
      // only one action in state and it's a reduction
      defaults[k] = state[act]
    }
  })

  return defaults
}

function commonjsMain (args) {
  if (!args[1]) {
    console.log('Usage: ' + args[0] + ' FILE')
    process.exit(1)
  }
  const source = require('fs').readFileSync(require('path').normalize(args[1]), 'utf8')
  return exports.parser.parse(source)
}

function printAction (a, gen) {
  const s = a[0] === 1
    ? 'shift token (then go to state ' + a[1] + ')'
    : a[0] === 2
      ? 'reduce by rule: ' + gen.productions[a[1]]
      : 'accept'

  return s
}

function each (collection, callback) {
  if (Array.isArray(collection)) {
    collection.forEach(callback)
  } else {
    Object.keys(collection).forEach(key => {
      callback(collection[key], key)
    })
  }
}

module.exports = { processOperators, resolveConflict, removeErrorRecovery, parseError, createVariable, findDefaults, commonjsMain, printAction, each }
