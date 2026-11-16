export const DEFAULT_MODEL = 'gpt-5-nano'

export const INSTRUCTIONS =
  'Sos un asistente personal. Respondé de forma concisa y en el mismo idioma que usa el usuario.'

/** Read per call so the env var is resolved at run time, not at import time. */
export function modelId(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL
}
