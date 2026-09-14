CREATE TABLE `cloud_backups` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`checksum` text NOT NULL,
	`schema_version` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`client_updated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
