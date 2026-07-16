// Approval-chain helpers: dedup + sort for rendering.
//
// Background: older `/resubmit` and `/submit` codepaths could insert
// duplicate ApprovalInstance rows for the same template step on a single
// FormVersion (the bug fixed in commit 0668c75). Existing affected forms
// still have those duplicates in the DB, so any new render needs to
// dedupe at the UI layer to avoid a chain that looks like it has 8 rows
// for a 4-step template.
//
// We dedupe by step_order, keeping the row that "matters most": the
// active step beats waiting, recent signed actions beat older ones, etc.

const STATUS_PRIORITY = {
  Active:     0,
  active:     0,
  Sent_Back:  1,
  'Sent Back': 1,
  sent_back:  1,
  SendBack:   1,
  Approved:   2,
  approved:   2,
  Rejected:   3,
  rejected:   3,
  Waiting:    4,
  waiting:    4,
  Skipped:    5,
  skipped:    5,
}

function priority(status) {
  return STATUS_PRIORITY[status] ?? 9
}

function signedTime(step) {
  return step?.signed_at ? new Date(step.signed_at).getTime() : 0
}

/**
 * Dedupe an approval-step list by step_order, keeping the most
 * "interesting" row for each position. Preference order:
 *   1. Status priority (Active > Sent Back > Approved > Rejected > …)
 *   2. Most-recent signed_at among ties
 *   3. Last one in input order
 *
 * Always returns the list sorted by step_order ascending.
 */
export function dedupeChain(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return []
  const bestByOrder = new Map()
  for (const s of steps) {
    if (s == null) continue
    const order = s.step_order ?? 0
    const existing = bestByOrder.get(order)
    if (!existing) { bestByOrder.set(order, s); continue }
    const ePri = priority(existing.status)
    const sPri = priority(s.status)
    if (sPri < ePri) { bestByOrder.set(order, s); continue }
    if (sPri === ePri && signedTime(s) >= signedTime(existing)) {
      bestByOrder.set(order, s)
    }
  }
  return [...bestByOrder.values()].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
}
