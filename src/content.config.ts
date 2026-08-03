import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
const articleBase = process.env.ARTICLE_FIXTURE_BASE ?? './src/data/articles';
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}, 'Date must be a real calendar date in YYYY-MM-DD format').transform((value) => new Date(`${value}T00:00:00.000Z`));
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: articleBase }),
  schema: z.object({
    title: z.string().trim().min(1), description: z.string().trim().min(1),
    routeSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    publishedAt: calendarDate, updatedAt: calendarDate.optional(),
    tags: z.array(z.string().trim().min(1)).default([]), draft: z.boolean().default(false),
  }).strict().refine((data) => !data.updatedAt || data.updatedAt >= data.publishedAt, {
    message: 'updatedAt must be on or after publishedAt', path: ['updatedAt'],
  }),
});
export const collections = { articles };
