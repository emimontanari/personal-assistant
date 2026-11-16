import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inboundText } from './update.js'

describe('inboundText', () => {
  it('returns the message text', () => {
    assert.equal(
      inboundText({ update_id: 1, message: { message_id: 1, chat: { id: 5 }, text: 'hola' } }),
      'hola',
    )
  })

  it('returns empty for an edited message (no message field)', () => {
    assert.equal(
      inboundText({
        update_id: 2,
        edited_message: { message_id: 1, chat: { id: 5 }, text: 'hola' },
      }),
      '',
    )
  })

  it('returns empty for a message without text (photo, sticker)', () => {
    assert.equal(inboundText({ update_id: 3, message: { message_id: 1, chat: { id: 5 } } }), '')
  })

  it('returns empty when text is not a string or the update is malformed', () => {
    assert.equal(
      inboundText({ update_id: 4, message: { message_id: 1, chat: { id: 5 }, text: 7 } } as never),
      '',
    )
    assert.equal(inboundText(undefined as never), '')
    assert.equal(inboundText(null as never), '')
  })
})
