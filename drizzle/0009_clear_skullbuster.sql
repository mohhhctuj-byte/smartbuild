ALTER TABLE `buildRuns` ADD `advanceLeaseToken` varchar(64);--> statement-breakpoint
ALTER TABLE `buildRuns` ADD `advanceLeaseExpiresAt` timestamp;--> statement-breakpoint
CREATE INDEX `buildRuns_advance_lease_expiry_idx` ON `buildRuns` (`advanceLeaseExpiresAt`);
