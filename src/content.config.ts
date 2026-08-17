import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ---------------------------------------------------------------------------
// THE JOURNAL — one markdown file per post.
// Adding a file here creates a new post page automatically.
// ---------------------------------------------------------------------------
const journal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string().default(''),          // e.g. "Arcadia · Phoenix"
    category: z.string().default('Journal'), // e.g. "Neighborhood guide"
    excerpt: z.string().default(''),
    image: z.string().default(''),
    image_alt: z.string().default(''),
    image_caption: z.string().default(''),
    lede: z.string().default(''),            // large italic opening line
    author: z.string().default('Jennifer Schumacher'),
    read_time: z.string().default('5 min read'),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
    published: z.boolean().default(true),
  }),
});

// ---------------------------------------------------------------------------
// LISTINGS — one markdown file per property.
// ---------------------------------------------------------------------------
const listings = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/listings' }),
  schema: z.object({
    address: z.string(),
    city: z.string(),
    price: z.string(),
    status: z.string().default('For sale'),
    beds: z.string().default(''),
    baths: z.string().default(''),
    sqft: z.string().default(''),
    lot: z.string().default(''),
    year_built: z.string().default(''),
    excerpt: z.string().default(''),
    image: z.string().default(''),
    gallery: z.array(z.object({
      image: z.string(),
      caption: z.string().default(''),
    })).default([]),
    featured: z.boolean().default(false),
    published: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

export const collections = { journal, listings };
