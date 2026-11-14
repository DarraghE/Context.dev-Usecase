CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`booking_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_booking_idx` ON `audit_log` (`booking_id`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`caterer_id` text NOT NULL,
	`wedding_date` text NOT NULL,
	`couple_display_name` text NOT NULL,
	`dietary_constraints` text NOT NULL,
	`status` text NOT NULL,
	`delete_after` text NOT NULL,
	`default_tz` text DEFAULT 'Europe/Helsinki' NOT NULL,
	`addon_price_eur` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `caterers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`consent_text_version` text NOT NULL,
	`granted_at` text NOT NULL,
	`withdrawn_at` text,
	`ip` text NOT NULL,
	`relationship_start_date` text
);
--> statement-breakpoint
CREATE INDEX `consents_person_idx` ON `consents` (`person_id`);--> statement-breakpoint
CREATE TABLE `enrichments` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`source_url` text NOT NULL,
	`scraped_at` text NOT NULL,
	`provider` text DEFAULT 'context.dev' NOT NULL,
	`request_id` text,
	`menu` text,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrichments_place_uq` ON `enrichments` (`place_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`person_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`kind` text NOT NULL,
	`taken_at` text,
	`tz` text,
	`local_date` text,
	`lat` real,
	`lng` real,
	`place_name_raw` text,
	`place_address_raw` text,
	`caption` text,
	`post_ref` text,
	`authored_by_other` integer DEFAULT false NOT NULL,
	`source_path` text NOT NULL,
	`media_key` text,
	`content_hash` text,
	`is_food` integer,
	`food` text,
	`text_food_mentions` text,
	`detect_status` text DEFAULT 'pending' NOT NULL,
	`text_status` text DEFAULT 'pending' NOT NULL,
	`skip_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_upload_source_uq` ON `items` (`upload_id`,`source_path`,`kind`);--> statement-breakpoint
CREATE INDEX `items_person_idx` ON `items` (`person_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`stage` text NOT NULL,
	`input_ref` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_booking_idx` ON `jobs` (`booking_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`person_id` text NOT NULL,
	`moment_id` text NOT NULL,
	`dish_key` text NOT NULL,
	`dish_family` text NOT NULL,
	`dish_name` text NOT NULL,
	`dish_description` text,
	`dish_category` text,
	`source_item_id` text,
	`menu_item_match` text,
	`significance` real DEFAULT 0 NOT NULL,
	`significance_parts` text,
	`sensitive_flags` text NOT NULL,
	`status` text NOT NULL,
	`hidden_by_default` integer DEFAULT false NOT NULL,
	`reviewed_at` text,
	`couple_note` text,
	`chef_image_key` text,
	`source` text DEFAULT 'export' NOT NULL,
	`surprise` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memories_moment_dish_uq` ON `memories` (`moment_id`,`dish_key`);--> statement-breakpoint
CREATE INDEX `memories_booking_idx` ON `memories` (`booking_id`);--> statement-breakpoint
CREATE TABLE `menus` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`version` integer NOT NULL,
	`courses` text NOT NULL,
	`created_by` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`validation` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`person_id` text NOT NULL,
	`moment_key` text NOT NULL,
	`local_date` text NOT NULL,
	`centroid_lat` real,
	`centroid_lng` real,
	`place_id` text,
	`event_type` text,
	`event_confidence` real,
	`event_evidence` text,
	`item_ids` text NOT NULL,
	`place_status` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moments_key_uq` ON `moments` (`moment_key`);--> statement-breakpoint
CREATE INDEX `moments_person_idx` ON `moments` (`person_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text,
	`caterer_id` text,
	`role` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_booking_idx` ON `people` (`booking_id`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`lat` real,
	`lng` real,
	`website_url` text,
	`resolution_method` text,
	`resolution_confidence` real,
	`website_source` text,
	`hints` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_cache_uq` ON `places` (`cache_key`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`platform` text NOT NULL,
	`storage_key` text,
	`original_name` text,
	`bytes` integer NOT NULL,
	`status` text NOT NULL,
	`stats` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
