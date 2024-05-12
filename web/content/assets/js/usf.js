let parser,
  parser2

if (typeof console === 'undefined') {
  console = {}
  console.log = function (str) { document.getElementById('out').value = uneval(str) }
}
const printOut = function (str) { document.getElementById('out').value = JSON.stringify(str) }

$(function () {
  $('#process_btn').click(processGrammar)
  $('#parse_btn').click(runParser)

  $('#examples').change(function (ev) {
    const file = this.options[this.selectedIndex].value
    $(document.body).addClass('loading')
    $.get('/jison/examples/' + file, function (data) {
      $('#grammar').val(data)
      $(document.body).removeClass('loading')
    })
  })
})

function processGrammar () {
  const type = $('#type')[0].options[$('#type')[0].selectedIndex].value || 'slr'

  const grammar = $('#grammar').val()
  try {
    var cfg = JSON.parse(grammar)
  } catch (e) {
    try {
      var cfg = bnf.parse(grammar)
    } catch (e) {
      return alert('Oops. Make sure your grammar is in the correct format.\n' + e)
    }
  }

  if (cfg.lex) $('#parsing').show()
  else $('#parsing').hide()

  Jison.print = function () {}
  parser = Jison.Generator(cfg, { type, noDefaultResolve: true })
  if (parser.computeLookaheads) { parser.computeLookaheads() }

  $('#out').val('')

  nonterminalInfo(parser)
  productions(parser)

  if (type === 'll') { llTable(parser) } else { lrTable(parser) }

  let do_click = false

  // now that the table has been generated, add the click handlers:
  function click_handler (ev) {
    do_click = true
    // delay 'click' action so dblclick gets a chance too.
    // (make sure 'this' remains accessible via closure)
    const self = $(this)
    setTimeout(function () {
      if (do_click) {
        console.log('click_handler', ev)
        if (!$(ev.target).is('a')) { self.toggleClass('open') }
        do_click = false
      }
    }, 200)
  }
  $('.action').on('click', click_handler)
  $('.state').on('click', click_handler)

  function dblclick_handler (ev) {
    console.log('dblclick_handler', ev)
    do_click = false // disable 'click' action
    const row = this.className.match(/(row_[0-9]+)/)[1]
    $(this).hasClass('open')
      ? $('.' + row).removeClass('open')
      : $('.' + row).addClass('open')
    return false
  }
  $('.action').on('dblclick', dblclick_handler)
  $('.state').on('dblclick', dblclick_handler)
}

function runParser () {
  if (!parser) processGrammar()
  if (!parser2) parser2 = parser.createParser()
  printOut('Parsing...')
  const source = $('#source').val()
  try {
    printOut(parser2.parse(source))
  } catch (e) {
    printOut(e.message || e)
  }
}

function nonterminalInfo (p) {
  const out = ['<h3>Nonterminals</h3><dl>']
  for (const nt in p.nonterminals) {
    out.push('<dt>', nt, '</dt>')
    out.push('<dd>', 'nullable: ' + (p.nonterminals[nt].nullable ? 'Yes' : 'No') + '<br/>firsts: ' + p.nonterminals[nt].first + '<br/>follows: ' + p.nonterminals[nt].follows)
    out.push('<p>Productions: ')
    p.nonterminals[nt].productions.forEach(function (prod) {
      out.push('<a href="#prod_' + prod.id + '">' + prod.id + '</a>')
    })
    out.push('</p></dd>')
  }
  out.push('</dl>')
  $('#nonterminals').html(out.join('\n'))
}

function productions (p) {
  const out = ['<ol start="0">']
  p.productions.forEach(function (prod) {
    out.push("<li id='prod_" + prod.id + "'>", prod, '</li>')
  })
  out.push('</ol>')
  $('#productions').html('<h3>Productions</h3>' + out.join(''))
}

function printCell (cell) {
  let out = cell.join(',')

  out += "<div class='details'>"
  for (let i = 0; i < cell.length; i++) { out += parser.productions[cell[i]] + '<br />' }
  out += '</div>'

  return out
}

function llTable (p) {
  const out = ['<table border="1">', '<thead>', '<tr>']
  out.push('<th>', '</th>')
  p.terminals.forEach(function (t) {
    out.push('<th>', t, '</th>')
  })
  out.push('</tr>', '</thead>')

  for (var nt in p.table) {
    out.push('<tr><td>', nt, '</td>')
    p.terminals.forEach(function (t) {
      const cell = p.table[nt][t]
      if (cell) { out.push('<td id="cell_' + nt + '_' + t + '" class="cell_' + nt + ' ' + (cell.length > 1 ? 'conflict' : '') + ' action">', printCell(cell), '</td>') } else { out.push('<td>&nbsp;</td>') }
    })
    out.push('</tr>')
  }

  out.push('</table>')
  $('#table').html('<h3>LL(1) Parse Table</h3>' + out.join(''))
}

function printActionDetails (a, token) {
  let out = "<div class='details'>"
  if (!a || !a[0]) return ''

  if (a[0] instanceof Array) {
    a.forEach(function (ar) { out += printActionDetails_(ar, token) })
  } else {
    out += printActionDetails_(a, token)
  }

  return out + '</div>'
}

function printActionDetails_ (a, token) {
  let out = ''
  if (a[0] == 1) {
    const link = "<a href='#state_" + a[1] + "'>Go to state " + a[1] + '</a>'
    out += '- Shift ' + parser.symbols[token] + ' then ' + link + '<br />'
  } else if (a[0] == 2) {
    const text = '- Reduce by ' + a[1] + ') ' + parser.productions[a[1]]
    out += text + '<br />'
  }
  return out
}

function printAction (a) {
  const actions = { 1: 's', 2: 'r', 3: 'a' }
  if (!a[0]) return ''
  let out = ''
  const ary = []

  if (a[0] instanceof Array) {
    for (let i = 0; i < a.length; i++) { ary.push('<span class="action_' + (actions[a[i][0]]) + '">' + (actions[a[i][0]]) + (a[i][1] || '') + '</span>') }
  } else {
    ary.push('<span class="action_' + (actions[a[0]]) + '">' + (actions[a[0]]) + (a[1] || '') + '</span>')
  }

  out += ary.join(',')

  return out
}

function sym2int (sym) { return parser.symbols_[sym] }

function lrTable (p) {
  const actions = { 1: 's', 2: 'r', 3: 'a' }
  const gs = p.symbols.slice(0).sort()
  const out = ['<table border="1">', '<thead>', '<tr>']
  out.push('<th>&#8595;states', '</th>')
  let ntout = []
  gs.shift()
  gs.forEach(function (t) {
    if (p.nonterminals[t]) { ntout.push('<th class="nonterm nt-' + t + '"">', t, '</th>') } else if (t != 'error' || p.hasErrorRecovery) { out.push('<th>', t, '</th>') }
  })
  out.push.apply(out, ntout)
  out.push('</tr>', '</thead>')

  for (var i = 0, state; i < p.table.length; i++) {
    state = p.table[i]
    if (!state) continue
    ntout = []
    out.push('<tr><td class="row_' + i + ' state" id="state_' + i + '">', i, '<div class="details">')
    parser.states.item(i).forEach(function (item, k) {
      out.push(item, '<br />')
    })
    out.push('</div></td>')
    gs.forEach(function (ts) {
      if (ts == 'error' && !p.hasErrorRecovery) { return }
      const t = sym2int(ts)

      if (p.nonterminals[ts]) {
        if (typeof state[t] === 'number') { ntout.push('<td class="nonterm nt-' + t + '"><a href="#state_' + state[t] + '">', state[t], '</a></td>') } else { ntout.push('<td class="nonterm">&nbsp;</td>') }
      } else if (state[t]) {
        out.push('<td id="act-' + i + '-' + t + '" class="row_' + i + ' ' + (state[t] == 3 ? 'accept' : '') + ' action">', printAction(state[t]), printActionDetails(state[t], t))
      } else { out.push('<td>&nbsp;</td>') }
    })
    out.push.apply(out, ntout)
    out.push('</tr>')
  }

  out.push('</table>')

  $('#table').html('<h3>' + parser.type + ' Parse Table</h3><p>Click cells to show details (double-click to show details for the entire row of cells)</p>' + out.join(''))

  p.resolutions.forEach(function (res) {
    const r = res[2]
    const el = document.getElementById('act-' + res[0] + '-' + p.symbols_[res[1]])
    if (r.bydefault) {
      el.className += ' conflict'
    }
    if (el) { el.title += r.msg + '\n' + '(' + r.s + ', ' + r.r + ') -> ' + r.action }
  })
}
