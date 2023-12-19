import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import {
  ScrapeMedia,
  makeProviders,
  makeStandardFetcher,
  targets,
} from '@movie-web/providers';
import { ZodError, z } from 'zod';
import { embedSchema, scrapeAllSchema, sourceSchema } from '@/schema';
import { validateTurnstile } from '@/turnstile';

// hono doesn't export this type, so we retrieve it from a function
type SSEStreamingApi = Parameters<Parameters<typeof streamSSE>['1']>['0'];

const fetcher = makeStandardFetcher(fetch);

const providers = makeProviders({
  fetcher,
  target: targets.BROWSER,
});

const app = new Hono();

app.use('*', (context, next) => {
  const allowedCorsHosts = ((context.env?.CORS_ALLOWED as string) ?? '').split(
    ',',
  );

  return cors({
    origin: (origin) => {
      try {
        const hostname = new URL(origin).hostname;
        if (allowedCorsHosts.includes(hostname)) {
          return origin;
        }
        return '';
      } catch (_) {
        // If the Origin URL is not valid, return empty allowed origin
        return '';
      }
    },
  })(context, next);
});

let eventId = 0;
async function writeSSEEvent(
  stream: SSEStreamingApi,
  event: string,
  data: any | undefined,
) {
  return await stream.writeSSE({
    event,
    data: data ? JSON.stringify(data) : '',
    id: String(eventId++),
  });
}

app.get('/scrape', async (context) => {
  const queryParams = context.req.query();

  const turnstileEnabled = Boolean(context.env?.TURNSTILE_ENABLED);

  if (turnstileEnabled) {
    const turnstileResponse = await validateTurnstile(context);

    if (!turnstileResponse.success) {
      context.status(401);
      return context.text(
        `Turnstile invalid, error codes: ${turnstileResponse.errorCodes.join(
          ', ',
        )}`,
      );
    }
  }

  let media: ScrapeMedia;
  try {
    media = scrapeAllSchema.parse(queryParams);
  } catch (e) {
    if (e instanceof ZodError) {
      context.status(400);
      return context.json(e.format());
    }
    context.status(500);
    return context.text('An error has occurred!');
  }

  return streamSSE(context, async (stream) => {
    try {
      const output = await providers.runAll({
        media,
        events: {
          discoverEmbeds(evt) {
            writeSSEEvent(stream, 'discoverEmbeds', evt);
          },
          init(evt) {
            writeSSEEvent(stream, 'init', evt);
          },
          start(evt) {
            writeSSEEvent(stream, 'start', evt);
          },
          update(evt) {
            writeSSEEvent(stream, 'update', evt);
          },
        },
      });

      if (output) {
        await writeSSEEvent(stream, 'completed', output);
        return await stream.close();
      }

      await writeSSEEvent(stream, 'noOutput', '');
      return await stream.close();
    } catch (e: any) {
      await writeSSEEvent(stream, 'error', {
        name: e.name,
        message: e.message,
        stack: e.stack,
      });
      return await stream.close();
    }
  });
});

app.get('/scrape/embed', async (context) => {
  const queryParams = context.req.query();

  const turnstileEnabled = Boolean(context.env?.TURNSTILE_ENABLED);

  if (turnstileEnabled) {
    const turnstileResponse = await validateTurnstile(context);

    if (!turnstileResponse.success) {
      context.status(401);
      return context.text(
        `Turnstile invalid, error codes: ${turnstileResponse.errorCodes.join(
          ', ',
        )}`,
      );
    }
  }

  let embedInput: z.infer<typeof embedSchema>;
  try {
    embedInput = embedSchema.parse(queryParams);
  } catch (e) {
    if (e instanceof ZodError) {
      context.status(400);
      return context.json(e.format());
    }
    context.status(500);
    return context.text('An error has occurred!');
  }

  return streamSSE(context, async (stream) => {
    try {
      const output = await providers.runEmbedScraper({
        id: embedInput.id,
        url: embedInput.url,
        events: {
          update(evt) {
            writeSSEEvent(stream, 'update', evt);
          },
        },
      });

      if (output) {
        await writeSSEEvent(stream, 'completed', output);
        return await stream.close();
      }

      await writeSSEEvent(stream, 'noOutput', '');
      return await stream.close();
    } catch (e: any) {
      await writeSSEEvent(stream, 'error', {
        name: e.name,
        message: e.message,
        stack: e.stack,
      });
      return await stream.close();
    }
  });
});

app.get('/scrape/source', async (context) => {
  const queryParams = context.req.query();

  const turnstileEnabled = Boolean(context.env?.TURNSTILE_ENABLED);

  if (turnstileEnabled) {
    const turnstileResponse = await validateTurnstile(context);

    if (!turnstileResponse.success) {
      context.status(401);
      return context.text(
        `Turnstile invalid, error codes: ${turnstileResponse.errorCodes.join(
          ', ',
        )}`,
      );
    }
  }

  let sourceInput: z.infer<typeof sourceSchema>;
  try {
    sourceInput = sourceSchema.parse(queryParams);
  } catch (e) {
    if (e instanceof ZodError) {
      context.status(400);
      return context.json(e.format());
    }
    context.status(500);
    return context.text('An error has occurred!');
  }

  return streamSSE(context, async (stream) => {
    try {
      const output = await providers.runSourceScraper({
        id: sourceInput.id,
        media: sourceInput,
        events: {
          update(evt) {
            writeSSEEvent(stream, 'update', evt);
          },
        },
      });

      if (output) {
        await writeSSEEvent(stream, 'completed', output);
        return await stream.close();
      }

      await writeSSEEvent(stream, 'noOutput', '');
      return await stream.close();
    } catch (e: any) {
      await writeSSEEvent(stream, 'error', {
        name: e.name,
        message: e.message,
        stack: e.stack,
      });
      return await stream.close();
    }
  });
});

app.get('/metadata', async (context) => {
  return context.json([providers.listEmbeds(), providers.listSources()]);
});

export default app;
