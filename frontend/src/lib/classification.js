// Shared classification-label utilities.
//
// The Form Definitions admin page lets an admin tag a form with a
// classification label. If the org hasn't customised labels yet, the admin
// picked from this fallback set — so submit / view callers need the same
// fallback when they look up a label by name. Without it, the form renders
// "Unclassified" even when a label was set.

export const FALLBACK_CLASSIFICATION_LABELS = [
  { name: 'Public',       color: '#22C55E' },
  { name: 'Internal',     color: '#EAB308' },
  { name: 'Confidential', color: '#EF4444' },
  { name: 'Restricted',   color: '#64748B' },
]

export function resolveClassification(name, orgLabels) {
  if (!name) return null
  const list = (orgLabels && orgLabels.length) ? orgLabels : FALLBACK_CLASSIFICATION_LABELS
  return list.find(l => l.name === name) || { name, color: '#64748B' }
}
