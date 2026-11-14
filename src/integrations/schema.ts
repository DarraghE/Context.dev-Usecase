/**
 * Builds JSON Schemas for structured outputs (`output_config.format`). Structured outputs
 * need every object closed (`additionalProperties: false`) with all properties required;
 * optional facts are expressed as nullable types instead.
 */
export type JsonSchema = Record<string, unknown>;

export const str = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) });
export const num = (description?: string): JsonSchema => ({ type: "number", ...(description ? { description } : {}) });
export const bool = (description?: string): JsonSchema => ({ type: "boolean", ...(description ? { description } : {}) });
export const enumOf = (values: readonly string[], description?: string): JsonSchema => ({ type: "string", enum: [...values], ...(description ? { description } : {}) });
export const arr = (items: JsonSchema, description?: string): JsonSchema => ({ type: "array", items, ...(description ? { description } : {}) });
export const nullable = (s: JsonSchema): JsonSchema => ({ anyOf: [s, { type: "null" }] });

export function obj(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  };
}

export const FOOD_CATEGORIES = ["starter", "main", "dessert", "drink", "snack", "bread", "cake", "other"] as const;
export const SCENES = ["restaurant", "home", "outdoor", "event", "other"] as const;
export const EVENT_TYPES = [
  "proposal",
  "engagement_celebration",
  "first_date",
  "anniversary",
  "birthday",
  "trip",
  "holiday_celebration",
  "family_gathering",
  "everyday",
  "other",
] as const;
export const SETTING_FLAGS = ["hospital_or_medical", "funeral_or_grief", "alcohol_heavy"] as const;
export const TEXT_SENSITIVE = ["hospital_or_medical", "funeral_or_grief", "alcohol_heavy", "other_people_private"] as const;
