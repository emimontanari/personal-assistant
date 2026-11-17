import { defineConfig } from 'drizzle-kit';

// Drizzle Kit evaluates this config at command execution. Never load .env here.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/expenses/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
