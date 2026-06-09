import { z } from 'zod';

export const NonEmptyStringSchema = z.string().min(1);
export const IdSchema = NonEmptyStringSchema;
export const IsoDatetimeSchema = z.string().datetime({ offset: true });

export const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

export const JsonObjectSchema = z.record(JsonValueSchema);

export type JsonObject = z.infer<typeof JsonObjectSchema>;
