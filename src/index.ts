import { Context, Env, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  ScrapeMedia,
  makeProviders,
  makeStandardFetcher,
  targets,
} from '@movie-web/providers';
import { ZodError, z } from 'zod';

const app = new Hono();
let id = 0;

const fetcher = makeStandardFetcher(fetch);

const providers = makeProviders({
  fetcher,
  target: targets.NATIVE,
});

async function outputEvent(
  stream: Parameters<Parameters<typeof streamSSE>['1']>['0'],
  event: string,
  data: any,
) {
  return await stream.writeSSE({
    event,
    data: JSON.stringify(data),
    id: String(id++),
  });
}

const tmdbIdSchema = z.string().regex(/^\d+$/)

const mediaSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('movie'),
      title: z.string().min(1),
      releaseYear: z.coerce.number().int().gt(0),
      tmdbId: tmdbIdSchema,
    }),
    z.object({
      type: z.literal('show'),
      title: z.string().min(1),
      releaseYear: z.coerce.number().int().gt(0),
      tmdbId: tmdbIdSchema,
      episodeNumber: z.coerce.number().int(),
      episodeTmdbId: tmdbIdSchema,
      seasonNumber: z.coerce.number().int(),
      seasonTmdbId: tmdbIdSchema,
    }),
  ])
  .transform((query) => {
    if (query.type == 'movie') return query;

    return {
      type: query.type,
      title: query.title,
      releaseYear: query.releaseYear,
      tmdbId: query.tmdbId,
      episode: {
        number: query.episodeNumber,
        tmdbId: query.episodeTmdbId,
      },
      season: {
        number: query.seasonNumber,
        tmdbId: query.seasonTmdbId,
      },
    };
  });

async function validateTurnstile(context: Context<Env>) {
  const turnstileSecret = context.env?.TURNSTILE_SECRET as string | undefined

  const token = context.req.header("cf-turnstile-token") || ""

  // TODO: Make this cross platform
	const ip = context.req.header('CF-Connecting-IP') || "";

  const formData = new FormData();
	formData.append('secret', turnstileSecret || "");
	formData.append('response', token);
	formData.append('remoteip', ip);

  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
	const result = await fetch(url, {
		body: formData,
		method: 'POST',
	});

	const outcome = await result.json<any>();
	return outcome.success
} 

app.get('/scrape', async (context) => {
  const queryParams = context.req.query();

  const turnstileEnabled = Boolean(context.env?.TURNSTILE_ENABLED)

  if (turnstileEnabled) {
    const success = await validateTurnstile(context)

    if (!success) {
      context.status(401)
      return context.text("Turnstile invalid")
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

  return streamSSE(context, async (stream) => {
    const output = await providers.runAll({
      media,
      events: {
        discoverEmbeds(evt) {
          outputEvent(stream, 'discoverEmbeds', evt);
        },
        init(evt) {
          outputEvent(stream, 'init', evt);
        },
        start(evt) {
          outputEvent(stream, 'start', evt);
        },
        update(evt) {
          outputEvent(stream, 'update', evt);
        },
      },
    });

    if (output) {
      return await outputEvent(stream, 'completed', output);
    }

    stream.writeSSE({ event: 'noOutput', data: '', id: String(id++) });
  });
});

export default app;
