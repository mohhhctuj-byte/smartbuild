CREATE TABLE `buildRunReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buildRunId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`conversationId` int NOT NULL,
	`status` enum('unreviewed','approved','changes_requested') NOT NULL DEFAULT 'unreviewed',
	`note` varchar(1000),
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buildRunReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `buildRunReviews_run_unique` UNIQUE(`buildRunId`)
);
--> statement-breakpoint
ALTER TABLE `buildRunReviews` ADD CONSTRAINT `buildRunReviews_buildRunId_buildRuns_id_fk` FOREIGN KEY (`buildRunId`) REFERENCES `buildRuns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunReviews` ADD CONSTRAINT `buildRunReviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunReviews` ADD CONSTRAINT `buildRunReviews_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunReviews` ADD CONSTRAINT `buildRunReviews_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `buildRunReviews_owner_run_idx` ON `buildRunReviews` (`userId`,`buildRunId`);--> statement-breakpoint
CREATE INDEX `buildRunReviews_owner_tuple_idx` ON `buildRunReviews` (`userId`,`projectId`,`conversationId`);