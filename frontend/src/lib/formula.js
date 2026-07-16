/**
 * Tiny safe expression evaluator for FlowDesk formulas.
 *
 * Supports:
 *   - Number / string literals
 *   - Operators: + - * / % ( )
 *   - Comparison: > < >= <= == !=
 *   - Logical: && || !
 *   - Identifiers resolving from a context map
 *   - Member access via dot: `items.total` → array of `total` values across rows
 *   - Function calls: SUM, AVG, COUNT, MIN, MAX, ROUND, ABS, IF
 *
 * Designed so admins author formulas like:
 *   qty * unit_cost
 *   SUM(items.total)
 *   IF(amount > 1000, amount * 0.18, 0)
 *   ROUND(subtotal * 1.18, 2)
 *
 * Not a full JS evaluator: no assignment, no closures, no member writes.
 * Caller supplies the variable context, which is the only data the formula
 * can read.
 */

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const TOK_NUM  = 'NUM'
const TOK_STR  = 'STR'
const TOK_IDENT = 'IDENT'
const TOK_OP   = 'OP'
const TOK_LP   = '('
const TOK_RP   = ')'
const TOK_COMMA = ','
const TOK_DOT  = '.'

function tokenize(src) {
  const tokens = []
  let i = 0
  const len = src.length

  while (i < len) {
    const c = src[i]

    // Whitespace
    if (/\s/.test(c)) { i++; continue }

    // Numbers (123, 1.5, .5)
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      let j = i
      while (j < len && /[0-9.]/.test(src[j])) j++
      tokens.push({ type: TOK_NUM, value: parseFloat(src.slice(i, j)) })
      i = j
      continue
    }

    // Strings 'single' or "double"
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let s = ''
      while (j < len && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < len) { s += src[j + 1]; j += 2 }
        else                                { s += src[j]; j++ }
      }
      if (src[j] !== quote) throw new Error(`Unterminated string at ${i}`)
      tokens.push({ type: TOK_STR, value: s })
      i = j + 1
      continue
    }

    // Identifiers (a-z, A-Z, _, $; subsequent chars can include digits)
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < len && /[A-Za-z0-9_$]/.test(src[j])) j++
      tokens.push({ type: TOK_IDENT, value: src.slice(i, j) })
      i = j
      continue
    }

    // Multi-char operators
    const two = src.slice(i, i + 2)
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ type: TOK_OP, value: two })
      i += 2
      continue
    }

    // Single-char tokens
    if (c === '(') { tokens.push({ type: TOK_LP }); i++; continue }
    if (c === ')') { tokens.push({ type: TOK_RP }); i++; continue }
    if (c === ',') { tokens.push({ type: TOK_COMMA }); i++; continue }
    if (c === '.') { tokens.push({ type: TOK_DOT }); i++; continue }
    if (c === ':') { tokens.push({ type: TOK_OP, value: ':' }); i++; continue }
    if ('+-*/%<>!'.includes(c)) { tokens.push({ type: TOK_OP, value: c }); i++; continue }

    throw new Error(`Unexpected character '${c}' at ${i}`)
  }

  return tokens
}

// ── Parser (recursive descent) ────────────────────────────────────────────────

function makeParser(tokens) {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const eatOp = (op) => {
    const t = peek()
    if (t && t.type === TOK_OP && t.value === op) { pos++; return true }
    return false
  }

  // expression = logicalOr
  function expression() { return logicalOr() }

  function logicalOr() {
    let left = logicalAnd()
    while (peek() && peek().type === TOK_OP && peek().value === '||') {
      pos++
      left = { type: 'binop', op: '||', left, right: logicalAnd() }
    }
    return left
  }

  function logicalAnd() {
    let left = comparison()
    while (peek() && peek().type === TOK_OP && peek().value === '&&') {
      pos++
      left = { type: 'binop', op: '&&', left, right: comparison() }
    }
    return left
  }

  function comparison() {
    const left = additive()
    const t = peek()
    if (t && t.type === TOK_OP && ['==', '!=', '<', '<=', '>', '>='].includes(t.value)) {
      pos++
      return { type: 'binop', op: t.value, left, right: additive() }
    }
    return left
  }

  function additive() {
    let left = multiplicative()
    while (peek() && peek().type === TOK_OP && (peek().value === '+' || peek().value === '-')) {
      const op = next().value
      left = { type: 'binop', op, left, right: multiplicative() }
    }
    return left
  }

  function multiplicative() {
    let left = unary()
    while (peek() && peek().type === TOK_OP && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = next().value
      left = { type: 'binop', op, left, right: unary() }
    }
    return left
  }

  function unary() {
    const t = peek()
    if (t && t.type === TOK_OP && (t.value === '-' || t.value === '!' || t.value === '+')) {
      const op = next().value
      return { type: 'unary', op, arg: unary() }
    }
    return primary()
  }

  function primary() {
    const t = next()
    if (!t) throw new Error('Unexpected end of formula')

    if (t.type === TOK_NUM) return { type: 'num', value: t.value }
    if (t.type === TOK_STR) return { type: 'str', value: t.value }

    if (t.type === TOK_LP) {
      const e = expression()
      const close = next()
      if (!close || close.type !== TOK_RP) throw new Error("Missing ')'")
      return e
    }

    if (t.type === TOK_IDENT) {
      // Could be a function call: IDENT '(' args ')'
      if (peek() && peek().type === TOK_LP) {
        pos++ // consume '('
        const args = []
        if (peek() && peek().type !== TOK_RP) {
          args.push(expression())
          while (peek() && peek().type === TOK_COMMA) { pos++; args.push(expression()) }
        }
        const close = next()
        if (!close || close.type !== TOK_RP) throw new Error("Missing ')' in function call")
        return { type: 'call', name: t.value, args }
      }
      // Range: IDENT ':' IDENT  (e.g. B2:B5, D:D). Treat before member access
      // because Excel ranges only use bare cell refs, not dotted paths.
      if (peek() && peek().type === TOK_OP && peek().value === ':') {
        pos++ // consume ':'
        const right = next()
        if (!right || right.type !== TOK_IDENT) throw new Error("Expected cell reference after ':'")
        return { type: 'range', from: t.value, to: right.value }
      }
      // Member access via dot
      const path = [t.value]
      while (peek() && peek().type === TOK_DOT) {
        pos++
        const seg = next()
        if (!seg || seg.type !== TOK_IDENT) throw new Error("Expected identifier after '.'")
        path.push(seg.value)
      }
      return path.length === 1
        ? { type: 'ident', name: t.value }
        : { type: 'member', path }
    }

    throw new Error(`Unexpected token: ${JSON.stringify(t)}`)
  }

  const ast = expression()
  if (pos < tokens.length) throw new Error(`Unexpected trailing token at position ${pos}`)
  return ast
}

// ── Built-in functions ────────────────────────────────────────────────────────

const num = (v) => {
  if (v == null || v === '') return 0
  if (Array.isArray(v)) return v.reduce((s, x) => s + num(x), 0)
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

const numArray = (arg) => {
  if (Array.isArray(arg)) return arg.map(num)
  return [num(arg)]
}

const FUNCTIONS = {
  SUM:   (...args) => args.flatMap(numArray).reduce((s, x) => s + x, 0),
  AVG:   (...args) => {
    const arr = args.flatMap(numArray)
    return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
  },
  COUNT: (...args) => args.flatMap(a => Array.isArray(a) ? a : [a]).length,
  MIN:   (...args) => Math.min(...args.flatMap(numArray)),
  MAX:   (...args) => Math.max(...args.flatMap(numArray)),
  ROUND: (n, decimals = 0) => {
    const m = Math.pow(10, num(decimals))
    return Math.round(num(n) * m) / m
  },
  ABS:   (n) => Math.abs(num(n)),
  IF:    (cond, ifTrue, ifFalse) => cond ? ifTrue : ifFalse,
  NOT:   (v) => !v,
  AND:   (...args) => args.every(Boolean),
  OR:    (...args) => args.some(Boolean),
}

// ── Evaluator ────────────────────────────────────────────────────────────────

// Letter A → 0, B → 1, ..., AA → 26
function letterToIdx(letters) {
  let idx = 0
  for (const ch of letters) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64) // A=1
  }
  return idx - 1  // make 0-based
}

// Idx 0 → A, 1 → B, ..., 26 → AA. Mirrors columnLetter() in FormDesignerCanvas.
export function idxToLetter(idx) {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// Parse "B2", "D", "AB10" into { letter, rowNum|null }
function parseCellRef(s) {
  const m = s && s.match(/^([A-Za-z]+)(\d*)$/)
  if (!m) return null
  return { letter: m[1].toUpperCase(), rowNum: m[2] ? parseInt(m[2], 10) : null }
}

function evalRange(fromRef, toRef, context) {
  const from = parseCellRef(fromRef)
  const to   = parseCellRef(toRef)
  if (!from || !to) return []

  const rows = context.__rows__
  const columns = context.__columns__

  // If __rows__/__columns__ are present, expand the range from the actual
  // table data. Otherwise fall back to a lookup of each individual cell key
  // (so partial ranges still work if the caller has prepared all the keys).
  if (rows && columns) {
    const fromCol = letterToIdx(from.letter)
    const toCol   = letterToIdx(to.letter)
    // Excel row 1 = header; row 2 = first data row → array index 0.
    // No row number ⇒ whole column (all rows).
    const fromRow = from.rowNum != null ? Math.max(0, from.rowNum - 2) : 0
    const toRow   = to.rowNum   != null ? Math.max(0, to.rowNum   - 1) : rows.length

    const result = []
    for (let r = fromRow; r < toRow && r < rows.length; r++) {
      const row = rows[r]
      for (let c = Math.min(fromCol, toCol); c <= Math.max(fromCol, toCol); c++) {
        const col = columns[c]
        if (col) result.push(row[col.key])
      }
    }
    return result
  }

  // Fallback: enumerate explicit cell keys (e.g. B2, B3, ..., B5)
  if (from.rowNum != null && to.rowNum != null && from.letter === to.letter) {
    const out = []
    const start = Math.min(from.rowNum, to.rowNum)
    const end   = Math.max(from.rowNum, to.rowNum)
    for (let r = start; r <= end; r++) {
      const key = `${from.letter}${r}`
      if (key in context) out.push(context[key])
    }
    return out
  }
  return []
}

function evalNode(node, context) {
  switch (node.type) {
    case 'num': return node.value
    case 'str': return node.value
    case 'range': return evalRange(node.from, node.to, context)
    case 'ident': {
      if (!(node.name in context)) return 0    // unknown identifier → 0 (Excel-like)
      return context[node.name]
    }
    case 'member': {
      // For `items.total`, look up items (expected to be an array of rows)
      // and project the `total` field across all rows. Returns an array.
      const [root, ...rest] = node.path
      let v = context[root]
      for (const key of rest) {
        if (Array.isArray(v)) v = v.map(row => row?.[key])
        else if (v && typeof v === 'object') v = v[key]
        else v = undefined
      }
      return v
    }
    case 'call': {
      const fn = FUNCTIONS[node.name.toUpperCase()]
      if (!fn) throw new Error(`Unknown function: ${node.name}`)
      const args = node.args.map(a => evalNode(a, context))
      return fn(...args)
    }
    case 'unary': {
      const v = evalNode(node.arg, context)
      if (node.op === '-') return -num(v)
      if (node.op === '+') return  num(v)
      if (node.op === '!') return !v
      throw new Error(`Unknown unary op: ${node.op}`)
    }
    case 'binop': {
      const a = evalNode(node.left, context)
      const b = evalNode(node.right, context)
      switch (node.op) {
        case '+':  return num(a) + num(b)
        case '-':  return num(a) - num(b)
        case '*':  return num(a) * num(b)
        case '/':  return num(b) === 0 ? 0 : num(a) / num(b)
        case '%':  return num(a) % num(b)
        case '==': return a == b      // eslint-disable-line eqeqeq
        case '!=': return a != b      // eslint-disable-line eqeqeq
        case '<':  return num(a) < num(b)
        case '<=': return num(a) <= num(b)
        case '>':  return num(a) > num(b)
        case '>=': return num(a) >= num(b)
        case '&&': return a && b
        case '||': return a || b
        default:   throw new Error(`Unknown op: ${node.op}`)
      }
    }
    default: throw new Error(`Unknown AST node: ${node.type}`)
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a formula string against a context map.
 * Returns the computed value, or a `#ERROR: <msg>` string on parse/eval failure.
 *
 * @param {string} formula
 * @param {Record<string, any>} context  e.g. { qty: 10, unit_cost: 5, items: [{qty:1,total:5}, {qty:2,total:10}] }
 */
export function evaluate(formula, context = {}) {
  if (!formula || !String(formula).trim()) return null
  // Accept Excel-style leading "=" (and tolerate whitespace around it).
  // qty * unit_cost works; =qty * unit_cost works; =B2*C2 works.
  let src = String(formula).trim()
  if (src.startsWith('=')) src = src.slice(1)
  if (!src.trim()) return null
  try {
    const tokens = tokenize(src)
    const ast = makeParser(tokens)
    return evalNode(ast, context)
  } catch (e) {
    return `#ERROR: ${e.message}`
  }
}

/** List of identifiers referenced by a formula (top-level idents and member roots). */
export function extractReferences(formula) {
  if (!formula) return []
  let src = String(formula).trim()
  if (src.startsWith('=')) src = src.slice(1)
  try {
    const tokens = tokenize(src)
    const refs = new Set()
    let prevDot = false
    for (const t of tokens) {
      if (t.type === TOK_IDENT && !prevDot) {
        // Skip function names: they're followed by '('
        const next = tokens[tokens.indexOf(t) + 1]
        if (!next || next.type !== TOK_LP) refs.add(t.value)
      }
      prevDot = t.type === TOK_DOT
    }
    return Array.from(refs)
  } catch {
    return []
  }
}

export const SUPPORTED_FUNCTIONS = Object.keys(FUNCTIONS)

/**
 * Build an evaluation context for a TABLE-LEVEL formula (e.g. a totals-row
 * formula or an off-table calculated field that references the table).
 *
 * The returned context supports:
 *   - column-name lookups:        items: [...]            → array via member access
 *   - column letter aliases:      B, C, D, ...            → array of all values in the column
 *   - explicit cell-ref lookups:  B2, B3, ...             → that specific row's value
 *   - range expansion:            B2:B5, D:D              → array of values across rows
 *
 * Pass the same shape as your real table rows to make formulas evaluate
 * realistically at design time.
 */
export function tableFormulaContext(rows = [], cols = []) {
  const ctx = { __rows__: rows, __columns__: cols }

  // Column-name → array of all values
  cols.forEach(c => {
    if (c?.key) ctx[c.key] = rows.map(r => r?.[c.key])
  })

  // Column letter → array of values; cell ref Xn → that specific value
  cols.forEach((c, i) => {
    const letter = idxToLetter(i)
    ctx[letter] = rows.map(r => r?.[c.key])
    rows.forEach((r, ri) => {
      const rowNum = ri + 2 // data row 0 = Excel row 2
      ctx[`${letter}${rowNum}`] = r?.[c.key]
    })
  })

  return ctx
}
