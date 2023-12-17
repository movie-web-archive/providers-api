import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  ScrapeMedia,
  makeProviders,
  makeStandardFetcher,
  targets,
} from '@movie-web/providers';
import { ZodError } from 'zod';
import { mediaSchema } from '@/schema';
import { validateTurnstile } from '@/turnstile';

const app = new Hono();

let eventId = 0;
async function writeSSEEvent(
  stream: Parameters<Parameters<typeof streamSSE>['1']>['0'],
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
    media = mediaSchema.parse(queryParams);
  } catch (e) {
    if (e instanceof ZodError) {
      context.status(400);
      return context.json(e.format());
    }
    context.status(500);
    return context.text('An error has occurred!');
  }

  const fetcher = makeStandardFetcher(fetch);

  const providers = makeProviders({
    fetcher,
    target: targets.NATIVE,
  });

  return streamSSE(context, async (stream) => {
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
      return await writeSSEEvent(stream, 'completed', output);
    }

    return await writeSSEEvent(stream, 'noOutput', '');
  });
});

export default app;
