import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/**
 * Data model (§6). IDs are UUIDv7 strings; timestamps are UTC ISO 8601 strings.
 * JSON columns are stored as text and typed with $type<>(). `[next]` fields are unused in the MVP.
 * Additions beyond §6 are marked "added:" and logged in docs/decisions.md.
 */

export type DietaryConstraints = {
  allergies: string[];
  diets: Record<string, number>;
  notes: string;
};

export type FoodItemResult = {
  dish_name: string;
  dish_generic: string;
  category: "starter" | "main" | "dessert" | "drink" | "snack" | "bread" | "cake" | "other";
  cuisine: string;
  is_homemade_guess: boolean;
  confidence: number;
  bbox: [number, number, number, number];
};

export type FoodDetection = {
  image_id: string;
  has_food_or_drink: boolean;
  items: FoodItemResult[];
  scene: "restaurant" | "home" | "outdoor" | "event" | "other";
  people_visible: boolean;
  /** added: rough face boxes (x0,y0,x1,y1 fractions of the full image), used only to blur. */
  face_boxes: [number, number, number, number][];
  /** added: sensitive settings visible in the image (hospital, funeral, heavy drinking). */
  setting_flags: string[];
  /** added: face boxes mapped into the stored crop's coordinate space (fractions of the crop). */
  faces_in_crop?: [number, number, number, number][];
  /** added: provenance of the detection (live, batch or replay). */
  source?: string;
};

export type TextExtraction = {
  text_id: string;
  food_mentions: { text: string; normalised: string; category: string }[];
  event_cues: { type: string; quote: string; confidence: number }[];
  sentiment: number;
  mentions_other_people: boolean;
  /** added: sensitive cues found in the text. */
  sensitive_cues: string[];
};

export type MenuItem = { name: string; description?: string; price?: string | null; dietary_tags?: string[] };
export type ScrapedMenu = {
  restaurant_name?: string;
  menu_sections: { section: string; items: MenuItem[] }[];
  /** added: page metadata kept for the chef card */
  logo_url?: string | null;
  dish_photos?: string[];
  candidate_pages?: { url: string; items: number; status: string; request_id?: string }[];
  website_note?: string;
};

export type MenuItemMatch = {
  enrichment_id: string;
  item_name: string;
  item_description: string | null;
  price: string | null;
  match_confidence: number;
  source_url: string;
};

export type Course = {
  position: number;
  course: string;
  title: string;
  description: string;
  story_for_menu_card: string;
  memory_ids: string[];
  allergens: string[];
  dietary_variants: { for: string; change: string }[];
  seasonality_note: string;
  /** added: set by code validation when a course still violates an allergy after one regeneration. */
  flagged_for_chef?: string | null;
  structural?: boolean;
  suggested_ingredients?: string[];
};

export const caterers = sqliteTable("caterers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  catererId: text("caterer_id").notNull(),
  weddingDate: text("wedding_date").notNull(),
  coupleDisplayName: text("couple_display_name").notNull(),
  dietaryConstraints: text("dietary_constraints", { mode: "json" }).$type<DietaryConstraints>().notNull(),
  status: text("status", { enum: ["invited", "collecting", "reviewing", "chef_ready", "deleted"] }).notNull(),
  deleteAfter: text("delete_after").notNull(),
  /** added: IANA zone used when an item has no coordinates */
  defaultTz: text("default_tz").notNull().default("Europe/Helsinki"),
  addonPriceEur: real("addon_price_eur"), // [next]
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    /** null for caterer_admin, who belongs to a caterer rather than a booking */
    bookingId: text("booking_id"),
    /** added: the caterer a caterer_admin works for */
    catererId: text("caterer_id"),
    role: text("role", { enum: ["partner_a", "partner_b", "chef", "caterer_admin"] }).notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("people_booking_idx").on(t.bookingId)],
);

/** added: single-use magic-link invites (§3). */
export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(), // also the JWT `jti`
  personId: text("person_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const consents = sqliteTable(
  "consents",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    consentTextVersion: text("consent_text_version").notNull(),
    grantedAt: text("granted_at").notNull(),
    withdrawnAt: text("withdrawn_at"),
    ip: text("ip").notNull(),
    /** added: optional relationship start date asked on the consent screen (§7.8) */
    relationshipStartDate: text("relationship_start_date"),
  },
  (t) => [index("consents_person_idx").on(t.personId)],
);

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull(),
  bookingId: text("booking_id").notNull(),
  platform: text("platform", { enum: ["instagram", "facebook", "google_photos", "unknown"] }).notNull(),
  storageKey: text("storage_key"),
  originalName: text("original_name"),
  bytes: integer("bytes").notNull(),
  status: text("status", { enum: ["uploaded", "parsing", "parsed", "failed", "raw_deleted"] }).notNull(),
  stats: text("stats", { mode: "json" }).$type<Record<string, number>>().notNull(),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    uploadId: text("upload_id").notNull(),
    personId: text("person_id").notNull(),
    bookingId: text("booking_id").notNull(),
    kind: text("kind", { enum: ["photo", "post_text", "comment", "checkin"] }).notNull(),
    takenAt: text("taken_at"),
    tz: text("tz"),
    /** added: local calendar date in `tz`, used for moment grouping */
    localDate: text("local_date"),
    lat: real("lat"),
    lng: real("lng"),
    placeNameRaw: text("place_name_raw"),
    /** added: address/city from the export, when present */
    placeAddressRaw: text("place_address_raw"),
    caption: text("caption"),
    /** added: groups items from the same post (same post → same moment) */
    postRef: text("post_ref"),
    /** added: true when the text was written by someone other than the uploader (P8) */
    authoredByOther: integer("authored_by_other", { mode: "boolean" }).notNull().default(false),
    sourcePath: text("source_path").notNull(),
    mediaKey: text("media_key"),
    contentHash: text("content_hash"),
    isFood: integer("is_food", { mode: "boolean" }),
    food: text("food", { mode: "json" }).$type<FoodDetection>(),
    textFoodMentions: text("text_food_mentions", { mode: "json" }).$type<TextExtraction>(),
    /** added: per-stage progress so stages are resumable */
    detectStatus: text("detect_status", { enum: ["pending", "done", "skipped", "error"] }).notNull().default("pending"),
    textStatus: text("text_status", { enum: ["pending", "done", "none", "error"] }).notNull().default("pending"),
    skipReason: text("skip_reason"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("items_upload_source_uq").on(t.uploadId, t.sourcePath, t.kind),
    index("items_person_idx").on(t.personId),
  ],
);

export const moments = sqliteTable(
  "moments",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    personId: text("person_id").notNull(),
    /** added: deterministic key for idempotent re-runs */
    momentKey: text("moment_key").notNull(),
    localDate: text("local_date").notNull(),
    centroidLat: real("centroid_lat"),
    centroidLng: real("centroid_lng"),
    placeId: text("place_id"),
    eventType: text("event_type", {
      enum: [
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
      ],
    }),
    eventConfidence: real("event_confidence"),
    eventEvidence: text("event_evidence", { mode: "json" }).$type<{
      quotes: string[];
      item_ids: string[];
      date: string;
      place: string | null;
      reason: string;
    }>(),
    itemIds: text("item_ids", { mode: "json" }).$type<string[]>().notNull(),
    /** added: place-resolution outcome for this moment */
    placeStatus: text("place_status"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("moments_key_uq").on(t.momentKey), index("moments_person_idx").on(t.personId)],
);

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    /** added: cache key (rounded coordinates + name), shared across bookings (§7.6.3) */
    cacheKey: text("cache_key").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    lat: real("lat"),
    lng: real("lng"),
    websiteUrl: text("website_url"),
    resolutionMethod: text("resolution_method", { enum: ["export_place", "web_search", "manual"] }),
    resolutionConfidence: real("resolution_confidence"),
    /** added: how the website was found (context.dev answers, claude web search, sources fallback) */
    websiteSource: text("website_source"),
    /** added: alternatives kept for enrichment fallbacks (second website, venue pages, city names) */
    hints: text("hints", { mode: "json" }).$type<{ alt_website?: string | null; source_pages?: string[]; city_aliases?: string[] }>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("places_cache_uq").on(t.cacheKey)],
);

export const enrichments = sqliteTable(
  "enrichments",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    scrapedAt: text("scraped_at").notNull(),
    provider: text("provider").notNull().default("context.dev"),
    requestId: text("request_id"),
    menu: text("menu", { mode: "json" }).$type<ScrapedMenu>(),
    status: text("status", { enum: ["ok", "no_website", "no_menu", "menu_is_image", "error"] }).notNull(),
    error: text("error"),
  },
  (t) => [uniqueIndex("enrichments_place_uq").on(t.placeId)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    personId: text("person_id").notNull(),
    momentId: text("moment_id").notNull(),
    /** added: normalised dish key, unique within a moment (idempotent upsert) */
    dishKey: text("dish_key").notNull(),
    /** added: normalised dish family used for recurrence (e.g. "neapolitan pizza") */
    dishFamily: text("dish_family").notNull(),
    dishName: text("dish_name").notNull(),
    dishDescription: text("dish_description"),
    dishCategory: text("dish_category"),
    /** added: item that supplied the photo crop */
    sourceItemId: text("source_item_id"),
    menuItemMatch: text("menu_item_match", { mode: "json" }).$type<MenuItemMatch | null>(),
    significance: real("significance").notNull().default(0),
    significanceParts: text("significance_parts", { mode: "json" }).$type<Record<string, number>>(),
    sensitiveFlags: text("sensitive_flags", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status", { enum: ["pending", "approved", "hidden"] }).notNull(),
    /** added: memory was hidden automatically by sensitive flagging */
    hiddenByDefault: integer("hidden_by_default", { mode: "boolean" }).notNull().default(false),
    /** added: set when the partner acts, so re-runs never override their choice */
    reviewedAt: text("reviewed_at"),
    coupleNote: text("couple_note"),
    chefImageKey: text("chef_image_key"),
    source: text("source", { enum: ["export", "friend_story"] }).notNull().default("export"),
    surprise: integer("surprise", { mode: "boolean" }).notNull().default(false), // [next]
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("memories_moment_dish_uq").on(t.momentId, t.dishKey), index("memories_booking_idx").on(t.bookingId)],
);

export const menus = sqliteTable("menus", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  version: integer("version").notNull(),
  courses: text("courses", { mode: "json" }).$type<{ courses: Course[]; unused_memories_worth_considering: string[] }>().notNull(),
  createdBy: text("created_by", { enum: ["chef", "system"] }).notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  /** added: validation notes (e.g. regenerated courses) */
  validation: text("validation", { mode: "json" }).$type<{ regenerated: number[]; flagged: number[] }>(),
  createdAt: text("created_at").notNull(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    stage: text("stage").notNull(),
    inputRef: text("input_ref").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("jobs_status_idx").on(t.status), index("jobs_booking_idx").on(t.bookingId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: text("at").notNull(),
    /** a person id, or "system" */
    actor: text("actor").notNull(),
    bookingId: text("booking_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_booking_idx").on(t.bookingId), index("audit_action_idx").on(t.action)],
);
