import type { ModelMessage } from 'ai'

export type ExpensePermission = 'read' | 'register' | 'correct'

/** Deliberately narrow text commands, not a general natural-language classifier.
 * Run once BEFORE model execution. Never inspect tool results, assistant replies,
 * clientData or older user turns to authorize a write (including a bare "sí").
 */
export function expensePermission(messages: readonly ModelMessage[]): ExpensePermission {
  const latest = messages.findLast(message => message.role === 'user')
  if (!latest || latest.role !== 'user') return 'read'
  const text = typeof latest.content === 'string' ? latest.content
    : latest.content.every(part => part.type === 'text') ? latest.content.map(part => part.type === 'text' ? part.text : '').join(' ') : ''
  // Quotes, links, questions, multiline context and hypothetical wording require
  // a new explicit directive rather than attempting to interpret their intent.
  if (!text || /["'`«»“”‘’<>\r\n?¿]|https?:\/\/|www\./i.test(text)) return 'read'
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^[¡!]+\s*/, '')
  if (/\b(?:si|ejemplo|hipoteticamente|hipotetico|supongamos|imagina|imaginemos|podria|habria)\b/.test(normalized)) return 'read'
  // The explicit "era X, no Y" correction is the sole supported negative form.
  if (/^(?:ese|este|el) [a-z ]{1,80} era\s*\d+(?:[.,]\d+)?\s*,\s*no\s*\d+(?:[.,]\d+)?[.!]*$/.test(normalized)) return 'correct'
  if (/\b(?:no|nunca|tampoco)\b/.test(normalized)) return 'read'
  if (/^(?:corregi|corrige)\s+(?:(?:el|ese|este|un)\s+)?gasto\b/.test(normalized)) return 'correct'
  if (/^(?:gaste|pague)\s*(?:(?:ars|usd)\s*|\$\s*)?\d/.test(normalized)
    || /^(?:registra|anota)\s+(?:(?:un|el|este)\s+)?gasto\b/.test(normalized)) return 'register'
  return 'read'
}
