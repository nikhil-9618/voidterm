import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/voidterm?schema=public'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).default('VOIDTERM <noreply@example.com>')),
  OPENAI_API_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  OLLAMA_URL: optionalUrl,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z
    .preprocess(emptyToUndefined, z.string().min(1).default('attachments')),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // A malformed value is a deployment configuration bug. Surface it loudly in
    // development, and refuse to boot in production rather than run half-broken.
    console.error('[env] invalid environment configuration', parsed.error.flatten().fieldErrors);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration. Check .env.example.');
    }
    // Fall back to defaults so local `next build` / `next dev` still boot.
    return envSchema.parse({});
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';

let secretWarningLogged = false;

/**
 * JWT signing key. In production a real secret is mandatory; in development we
 * fall back to a clearly-labelled placeholder so the app is runnable out of the
 * box. The secret is never logged.
 */
export function getJwtSecret(): Uint8Array {
  if (env.JWT_SECRET) {
    return new TextEncoder().encode(env.JWT_SECRET);
  }

  if (isProduction) {
    throw new Error('JWT_SECRET is not set. Refusing to sign sessions in production.');
  }

  if (!secretWarningLogged) {
    console.warn(
      '[env] JWT_SECRET is not set — using an insecure development-only secret. Set JWT_SECRET before deploying.',
    );
    secretWarningLogged = true;
  }

  return new TextEncoder().encode('voidterm-insecure-development-secret-do-not-deploy-0001');
}
