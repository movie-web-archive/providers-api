import { Context, Env } from 'hono';

export async function validateTurnstile(context: Context<Env>) {
  const turnstileSecret = context.env?.TURNSTILE_SECRET as string | undefined;

  const token = context.req.header('cf-turnstile-token') || '';

  // TODO: Make this cross platform
  const ip = context.req.header('CF-Connecting-IP') || '';

  const formData = new FormData();
  formData.append('secret', turnstileSecret || '');
  formData.append('response', token);
  formData.append('remoteip', ip);

  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  const result = await fetch(url, {
    body: formData,
    method: 'POST',
  });

  const outcome = await result.json<any>();
  return {
    success: outcome.success as boolean,
    errorCodes: outcome['error-codes'] as string[],
  };
}
