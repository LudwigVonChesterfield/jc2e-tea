import { defineCollection } from "astro:content";
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { cardSchema, deckSchema } from "./lib/content";
// import { csvLoader } from "@ascorbic/csv-loader";


const decks = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/decks" }),
  schema: deckSchema({
    extend: z.object({
      pages: z.object({
        card: z.boolean().default(false),
        deck: z.object({
          back: z.enum(["horizontal", "horizontal-print", "vertical", "vertical-print"])
        }).default({ back: "vertical-print" })
      }).partial().optional()
    })
  }),
});

const cards = defineCollection({
  loader: glob({ pattern: '**/[^_]*/[^_]*.{md,mdx}', base: "./src/content/cards" }),
  schema: cardSchema({
    extend: z.object({
      acts: z.object({
        title: z.string(),
        regions: z.array(
          z.enum(['CP', 'DP', 'NE', 'SP', 'CA', 'OC', 'MR', 'FL'])
        ).max(4).default([]),
        tags: z.string().array().optional(),
      }).optional(),
      setup: z.object({
        areas: z.array(z.string()),
        extra: z.boolean().default(false),
      }).optional(),
      page: z.boolean().optional(),
    }),
  })
});

// const setupCards = defineCollection({
//   loader: csvLoader({
//     fileName: './src/content/setup.csv',
//     idField: 'title',
//     parserOptions: {
//       header: true,
//       preview: 1,
//     }
//   }),
//   schema: cardSchema({
//     deckName: 'setup',
//     extend: z.object({
//       extra: z.boolean().default(false),
//       areas: z.array(z.string()).optional(),
//     }),
//   }),
// });

const notes = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/notes" }),
  schema: z.object({
    collection: z.string(),
    id: z.string(),
  }),
})

export const collections = {
  docs: defineCollection({ schema: docsSchema(), loader: docsLoader(), }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema({
      extend: z.object({
        'credit.track': z.string(),
        'deck.laws.name': z.string(),
        'deck.laws.singular': z.string(),
        'deck.laws.plural': z.string(),
        'deck.trades.singular': z.string(),
        'deck.trades.plural': z.string(),
        'event.movement': z.string(),
        'game.title': z.string(),
        'game.title.full': z.string(),
        'role.company.tea': z.string(),
        'role.company.tea2': z.string(),
        'role.govt.office': z.string(),
        'role.govt.tariffs': z.string(),
        'role.govt.tariffs.full': z.string(),
        'role.govt.tariffs2': z.string(),
        'role.govt.governor': z.string(),
        'role.govt.governor.full': z.string(),
        'role.govt.army': z.string(),
        'role.govt.military': z.string(),
        'role.govt.military.full': z.string(),
        'role.govt.customs': z.string(),
        'role.govt.customs.full': z.string(),
        'tea.token.singular': z.string(),
        'tea.token.plural': z.string(),
        'tea.track': z.string(),
        'num.alliance': z.number(),
        'num.military': z.number(),
        'num.orders': z.number(),
        'num.speculation': z.number(),
        'num.tea': z.number(),
        'num.region.str': z.string(),
      }),
    }),
  }),
  decks,
  cards,
  notes,
};
