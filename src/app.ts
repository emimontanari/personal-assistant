import { Hono } from 'hono'
import telegram from './telegram/webhook.js'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/telegram/webhook', telegram)

export default app
