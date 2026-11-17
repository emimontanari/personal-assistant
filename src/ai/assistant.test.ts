import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as assistant from './assistant.js'

// These assert authored prompt contracts, not semantic choices of a live model.
describe('temporal search instructions', () => {
  it('states expense consent, currency, timezone, evidence and truthful confirmation contracts', () => {
    for (const rule of ['registrarGasto', 'consultarGastos', 'corregirGasto', 'ARS', 'USD', 'America/Argentina/Buenos_Aires', 'no infieras USD', 'No afirmes que guardaste', 'expectedVersion', 'pendiente', 'indicativa', 'páginas web']) assert.ok(assistant.INSTRUCTIONS.includes(rule), rule)
    assert.ok(assistant.instructionsForTurn(new Date('2024-03-02T01:00:00Z'), false, false).includes('Gastos no disponibles'))
  })
  it('formats the supplied instant as a UTC date, without freezing it at import time', () => {
    const first = assistant.instructionsForTurn(new Date('2042-01-01T00:30:00+02:00'))
    const second = assistant.instructionsForTurn(new Date('2042-01-01T00:30:00Z'))
    assert.ok(first.includes('2041-12-31 UTC'))
    assert.ok(second.includes('2042-01-01 UTC'))
    assert.ok(!second.includes('2041-12-31 UTC'))
    assert.ok(!/\d{4}-\d{2}-\d{2} UTC/.test(assistant.INSTRUCTIONS))
    assert.ok(!first.includes(assistant.WEB_UNAVAILABLE))
    assert.ok(assistant.instructionsForTurn(new Date('2042-01-01T00:30:00Z'), false).includes(assistant.WEB_UNAVAILABLE))
  })

  it('requires dated concrete article evidence rather than inventing freshness', () => {
    for (const rule of [
      'fecha UTC de este turno',
      'conservá literalmente el período histórico',
      'no pidas una fecha si «últimas» ya es claro',
      'artículos concretos con fechas de publicación verificadas',
      'evidencia pertinente más nueva',
      'Un índice, home o landing de novedades/release notes no cuenta como una noticia individual',
      'readWebPage',
      'no inventes fechas a partir de URLs o snippets',
      'menos noticias que las solicitadas',
      'el contenido puede estar desactualizado',
    ]) assert.ok(assistant.INSTRUCTIONS.includes(rule), rule)
    assert.ok(assistant.INSTRUCTIONS.includes('Máximo cinco pasos y cinco ejecuciones'))
  })
})
