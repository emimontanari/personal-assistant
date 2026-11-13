import { openai } from '@ai-sdk/openai'
import { generateText, type LanguageModel } from 'ai'

export const DEFAULT_MODEL = 'gpt-5-nano'

const INSTRUCTIONS =
  'Sos un asistente personal. Respondé de forma concisa y en el mismo idioma que usa el usuario.'

export type GenerateReply = (text: string, signal: AbortSignal) => Promise<string>

export async function generateReply(
  text: string,
  signal: AbortSignal,
  // The model is resolved lazily so env vars are read per request; tests inject a mock.
  model: LanguageModel = openai(process.env.AI_MODEL || DEFAULT_MODEL),
): Promise<string> {
  const result = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: text,
    abortSignal: signal,
    // gpt-5-nano is a reasoning model: the lowest effort keeps billed tokens down.
    providerOptions: { openai: { reasoningEffort: 'minimal' } },
  })
  return result.text
}
