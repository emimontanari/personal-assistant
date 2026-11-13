import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MockLanguageModelV4 } from 'ai/test'
import { generateReply } from './reply.js'

function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

describe('generateReply', () => {
  it('returns the generated text and sends the user text with a system prompt', async () => {
    const model = mockModel('hola!')
    const out = await generateReply('hola', new AbortController().signal, model)
    assert.equal(out, 'hola!')
    assert.equal(model.doGenerateCalls.length, 1)
    const prompt = model.doGenerateCalls[0].prompt
    assert.equal(prompt[0].role, 'system')
    assert.ok(prompt.some((m) => m.role === 'user' && JSON.stringify(m.content).includes('hola')))
  })

  it('forwards the abort signal to the model', async () => {
    const model = mockModel('x')
    const ac = new AbortController()
    await generateReply('hola', ac.signal, model)
    assert.ok(model.doGenerateCalls[0].abortSignal instanceof AbortSignal)
  })
})
