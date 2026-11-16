import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import app from './app.js'

describe('app', () => {
  it('GET / answers Hello Hono!', async () => {
    const res = await app.request('/')
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'Hello Hono!')
  })

  it('no longer serves POST /telegram/webhook', async () => {
    const res = await app.request('/telegram/webhook', { method: 'POST', body: '{}' })
    assert.equal(res.status, 404)
  })
})
