/**
 * Formula Engine
 * Evaluates expressions referencing form field values by field_name.
 *
 * Supported syntax:
 *   - Arithmetic:  qty * unit_price,  (a + b) / 2
 *   - SUM of table column:  SUM(items.amount)
 *   - Numeric literals
 */

/**
 * Evaluate a formula for a calculated field.
 * @param {string} formula - e.g. "qty * unit_price" or "SUM(items.amount)"
 * @param {Object} values  - { [fieldId]: stringValue }
 * @param {Object} fieldsByName - { [fieldName]: fieldObject }  (fieldObject has .id)
 * @returns {string} formatted result, or '' on error
 */
export function evaluateFormula(formula, values, fieldsByName) {
  if (!formula) return ''
  try {
    let expr = formula

    // 1. Replace SUM(fieldName.colKey)
    expr = expr.replace(/SUM\s*\(\s*(\w+)\s*\.\s*(\w+)\s*\)/gi, (_, fieldName, colKey) => {
      const field = fieldsByName[fieldName]
      if (!field) return '0'
      const raw = values[field.id]
      if (!raw) return '0'
      try {
        const rows = JSON.parse(raw)
        const total = rows.reduce((acc, row) => {
          const v = parseFloat(row[colKey])
          return acc + (isNaN(v) ? 0 : v)
        }, 0)
        return String(total)
      } catch {
        return '0'
      }
    })

    // 2. Replace field_name tokens with their numeric values
    //    Sort longest-first to avoid partial substitutions
    const names = Object.keys(fieldsByName).sort((a, b) => b.length - a.length)
    for (const name of names) {
      const field = fieldsByName[name]
      const val = parseFloat(values[field.id]) || 0
      expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(val))
    }

    // 3. Safety check — only numbers and operators allowed after substitution
    if (/[^0-9+\-*/.()%\s]/.test(expr)) return ''

    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')()
    if (!isFinite(result)) return ''

    return Number.isInteger(result) ? String(result) : parseFloat(result.toFixed(4)).toString()
  } catch {
    return ''
  }
}

/**
 * Resolve ALL calculated fields in a form, handling chains of dependencies.
 *
 * Problem: `values` only contains user-typed values. Calculated fields (cal1, cal2…)
 * are never stored there, so a formula like `cal1 + cal2 + cal3` always resolves to 0.
 *
 * Solution: iterate over all calculated fields up to N passes. Each pass evaluates
 * every calc field using the values accumulated so far. Fields whose dependencies are
 * already resolved get their result stored; fields that depend on those get resolved
 * in the next pass. Converges in at most N passes for any acyclic dependency graph.
 *
 * @param {Array}  fields       - all form field objects (from formDef.fields)
 * @param {Object} rawValues    - { [fieldId]: userTypedValue }
 * @param {Object} fieldsByName - { [fieldName]: fieldObject }
 * @returns {Object} enriched values map including computed values for all calc fields
 */
export function resolveCalculatedFields(fields, rawValues, fieldsByName) {
  const calcFields = (fields || []).filter(
    f => f.field_type === 'calculated' && f.calculation_formula
  )
  if (!calcFields.length) return rawValues

  const resolved = { ...rawValues }

  // Iterate up to calcFields.length + 1 passes to handle chains of any depth.
  // Stop early once a pass produces no new results (fully converged).
  for (let pass = 0; pass <= calcFields.length; pass++) {
    let changed = false
    for (const field of calcFields) {
      const next = evaluateFormula(field.calculation_formula, resolved, fieldsByName)
      if (next !== '' && next !== resolved[field.id]) {
        resolved[field.id] = next
        changed = true
      }
    }
    if (!changed) break
  }

  return resolved
}

/**
 * Evaluate a per-row formula inside a table field.
 * Tokens reference column keys within the same row.
 * @param {string} formula   - e.g. "qty * unit_price"
 * @param {Object} rowValues - { [colKey]: value }
 * @returns {string}
 */
export function evaluateRowFormula(formula, rowValues) {
  if (!formula) return ''
  try {
    let expr = formula
    const keys = Object.keys(rowValues).sort((a, b) => b.length - a.length)
    for (const key of keys) {
      const val = parseFloat(rowValues[key]) || 0
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val))
    }
    if (/[^0-9+\-*/.()%\s]/.test(expr)) return ''
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')()
    if (!isFinite(result)) return ''
    return Number.isInteger(result) ? String(result) : parseFloat(result.toFixed(4)).toString()
  } catch {
    return ''
  }
}
