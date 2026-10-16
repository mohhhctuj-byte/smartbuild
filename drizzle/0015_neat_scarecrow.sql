ALTER TABLE `projects` ADD `archivedAt` timestamp;--> statement-breakpoint
CREATE INDEX `projects_owner_archive_updated_idx` ON `projects` (`userId`,`archivedAt`,`updatedAt`);