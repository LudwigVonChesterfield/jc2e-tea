import { reference, type SchemaContext as BaseSchemaContext } from 'astro:content';
import { z } from 'astro/zod';
import { CARD_SIZES } from "src/lib/card-sizing";


/**
 * Based on the the return type of Zod’s `merge()` method. Merges the type of two `z.object()` schemas.
 * Also sets them as “passthrough” schemas as that’s how we use them. In practice whether or not the types
 * are passthrough or not doesn’t matter too much.
 *
 * @see https://github.com/colinhacks/zod/blob/3032e240a0c227692bb96eedf240ed493c53f54c/src/types.ts#L2656-L2660
 */
// Note: Research this for Zod 4.
type MergeSchemas<A extends z.AnyZodObject, B extends z.AnyZodObject> = z.ZodObject<
  z.objectUtil.extendShape<A['shape'], B['shape']>,
  'passthrough',
  B['_def']['catchall']
>;
type ExtendedSchema<A extends z.AnyZodObject, C extends z.AnyZodObject> =
  C extends z.AnyZodObject ? MergeSchemas<A, C>: A;
type SchemaConfigOrFunction<T extends z.AnyZodObject = z.SomeZodObject> =
  T | ((context: SchemaContext) => T);

const getSchema = (s: SchemaConfigOrFunction, context: SchemaContext) => typeof s === "function" ? s(context) : s


////////////
// TODO: Generate card and deck default types and support functions
////////////

interface SchemaContext extends BaseSchemaContext {
  name?: string;
  type?: string;
}

function background(context: SchemaContext) {
  const adjective = context.type === "deck" ? "default " : "";

  return z.object({
    bleed: z.string().describe(
      "The CSS width representing the bleed for this background"
    ).default("0px"),
    image: context.image().describe(
      `The ${adjective}image that the ${context.type} uses as a background.`
    ),
    imageSize: z.string().describe(
      "The CSS `background-size` that the background image should use."
    ),
    color: z.string().describe(
      `The ${adjective}CSS \`background-color\` that the ${context.type} uses.`
    ),
    gradient: z.string().describe(
      `The ${adjective}CSS \`background-gradient\` that the ${context.type} uses.`
    ),
  }).describe(
    `The ${adjective}background of the ${context.type} that all of the content will be rendered on top of.`
  );
}

function dimensions(context: SchemaContext) {
  return z.object({
    size: z.enum(CARD_SIZES).describe(
      context.type === "deck"
      ? `The default size of the cards in this deck.`
      : `The size of this card.`
    ),
    landscape: z.boolean().default(false).describe(
      context.type === "deck"
      ? `The default orientation of the cards in this deck.`
      : `The orientation of this card.`
    ),
  });
}

function cardBack(context: SchemaContext) {
  const currentContext = {...context, type: "card back"};
  return z.object({
    reference: reference("cards").optional(),
    background: background(currentContext).partial().optional(),
    dimensions: dimensions(currentContext).partial().optional(),
  });
}


////////
// Cards
////////
function defaultCardSchema(context: SchemaContext, deckName?: string) {
  const currentContext: SchemaContext = {...context, type: 'card'};

  return z.object({
    title: z.string().describe(
      "The title of the card. Note: this does need to be displayed when rendered."
    ).default(""),
    description: z.string().describe(
      "Some high-level information about the card. Can be HTML and will be rendered on the card overview page."
    ).default(""),

    deck: z.object({
      reference: reference('decks').describe(
        "The id of the deck which this card is in."
      ).optional(),
      quantity: z.number().default(1).describe(
        "The amount of copies of this card in its deck."
      ),
      order: z.number().optional().describe(
        "Forces this card to a fixed position (ascending) at the front of its deck, " +
        "before any cards without an explicit order. Cards without one keep the default " +
        "alphabetical-by-title ordering, sorted after all ordered cards."
      ),
    }).optional(),

    background: background(currentContext).partial().optional(),
    "card-back": cardBack(currentContext).optional(),
    dimensions: dimensions(currentContext).partial().optional(),
  });
}

type BaseCardSchema = ReturnType<typeof defaultCardSchema>;
export type BaseCard = z.infer<BaseCardSchema>

type ExtendedCardSchema<T extends z.AnyZodObject> = ExtendedSchema<BaseCardSchema, T>
type CardSchemaFunction<T extends z.AnyZodObject = z.SomeZodObject> =
    (context: SchemaContext) => ExtendedCardSchema<T>;

interface CardSchemaOpts<T extends z.AnyZodObject = z.SomeZodObject> {
  /**
   * Extend Deckyard's card schema with additional fields.
   *
   * @example
   * // Add two optional fields to the default schema.
   * cardSchema({
   * 	extend: z
   * 		.object({
   * 			'attack': z.number(),
   * 			'health': z.number(),
   * 		})
   * 		.partial(),
   * })
   */
  deckName?: string;
  extend?: SchemaConfigOrFunction<T>;
}

export function cardSchema<T extends z.AnyZodObject = z.SomeZodObject>({
  deckName = undefined,
  extend = z.object({}) as T,
}: CardSchemaOpts<T> = {}): CardSchemaFunction<T> {
  return (context: SchemaContext) =>
    defaultCardSchema(context, deckName)
    .merge(getSchema(extend, context))
    .passthrough() as ExtendedCardSchema<T>;
}


////////
// Decks
////////
function defaultDeckSchema({ image }: SchemaContext) {
  const currentContext: SchemaContext = {image, type: 'deck'};

  return z.object({
    name: z.string().describe(
      "The name of the deck. This is used for titles and other descriptions."
    ),
    description: z.string().describe(
      "Some high-level information about this deck. Can be HTML and will be rendered on the deck overview page."
    ).default(""),

    background: background(currentContext).partial().optional(),
    "card-back": cardBack(currentContext).optional(),
    dimensions: dimensions(currentContext),
  });
}

type BaseDeckSchema = ReturnType<typeof defaultDeckSchema>;
export type BaseDeck = z.infer<BaseDeckSchema>

type ExtendedDeckSchema<T extends z.AnyZodObject> = ExtendedSchema<BaseDeckSchema, T>
type DeckSchemaFunction<T extends z.AnyZodObject = z.SomeZodObject> =
    (context: SchemaContext) => ExtendedDeckSchema<T>;

interface DeckSchemaOpts<T extends z.AnyZodObject = z.SomeZodObject> {
  /**
   * Extend Deckyard's deck schema with additional fields.
   *
   * @example
   * // Add two optional fields to the default schema.
   * deckSchema({
   * 	extend: z
   * 		.object({
   * 			'shuffled': z.boolean(),
   * 		})
   * 		.partial(),
   * })
   */
  extend?: SchemaConfigOrFunction<T>;
}

export function deckSchema<T extends z.AnyZodObject = z.SomeZodObject>({
  extend = z.object({}) as T,
}: DeckSchemaOpts<T> = {}): DeckSchemaFunction<T> {
    return (context: SchemaContext) =>
      getSchema(defaultDeckSchema, context)
      .merge(getSchema(extend, context))
      .passthrough() as ExtendedDeckSchema<T>;
}
