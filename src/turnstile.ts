import { Context, Env } from 'hono';
import jsonwebtoken from '@tsndr/cloudflare-worker-jwt';

export async function validateTurnstile(context: Context<Env>) {
  const turnstileSecret = context.env?.TURNSTILE_SECRET as string | undefined;
  const jwtSecret = (context.env?.JWT_SECRET as string | undefined) ?? '';

  const token = context.req.query('token') || '';

  const ip = context.req.header('CF-Connecting-IP') || '';

  if (token.startsWith('jwt|')) {
    try {
      const isValid = await jsonwebtoken.verify(
        token.slice('jwt|'.length),
        jwtSecret,
        {
          algorithm: 'HS256',
        },
      );

      if (!isValid) {
        return {
          success: false,
          errorCodes: ['jwt-invalid'],
        };
      }

      const { payload } = jsonwebtoken.decode(token.slice('jwt|'.length));

      if (!payload || payload.ip !== ip) {
        return {
          success: false,
          errorCodes: ['jwt-ip-invalid'],
        };
      }

      return {
        success: true,
        errorCodes: [],
      };
    } catch (e: any) {}
  }

  if (!token.startsWith('turnstile|')) {
    return {
      success: false,
      errorCodes: ['invalid-token-type'],
    };
  }

  const formData = new FormData();
  formData.append('secret', turnstileSecret || '');
  formData.append('response', token.slice('turnstile|'.length));
  formData.append('remoteip', ip);

  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  const result = await fetch(url, {
    body: formData,
    method: 'POST',
  });

  const outcome = await result.json<any>();

  let jwt: string | undefined = undefined;
  if (outcome.success) {
    jwt = await jsonwebtoken.sign(
      {
        ip,
        exp: Math.floor(Date.now() / 1000) + 60 * 10, // 10 Minutes
      },
      jwtSecret,
    );
  }

  return {
    success: outcome.success as boolean,
    errorCodes: outcome['error-codes'] as string[],
    jwtToken: jwt,
  };
}
