import { z } from 'zod';

export const tmdbIdSchema = z.string().regex(/^\d+$/);

export const scrapeAllSchema = z
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

export const embedSchema = z.object({
  id: z.string(),
  url: z.string(),
});

export const sourceSchema = scrapeAllSchema.and(
  z.object({
    id: z.string(),
  }),
);
