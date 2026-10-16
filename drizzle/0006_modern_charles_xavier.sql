CREATE TABLE `buildRuns` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`conversationId` int NOT NULL,
	`status` enum('planned','writing','previewing','testing','verifying','succeeded','failed','blocked','timed_out','cancelled') NOT NULL,
	`workspaceRoot` varchar(1024) NOT NULL,
	`payload` longtext NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buildRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaceSelections` (
	`userId` int NOT NULL,
	`projectId` int,
	`conversationId` int,
	`buildRunId` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaceSelections_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `buildRuns` ADD CONSTRAINT `buildRuns_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRuns` ADD CONSTRAINT `buildRuns_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRuns` ADD CONSTRAINT `buildRuns_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceSelections` ADD CONSTRAINT `workspaceSelections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceSelections` ADD CONSTRAINT `workspaceSelections_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceSelections` ADD CONSTRAINT `workspaceSelections_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `buildRuns_owner_project_updated_idx` ON `buildRuns` (`userId`,`projectId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `buildRuns_owner_conversation_updated_idx` ON `buildRuns` (`userId`,`conversationId`,`updatedAt`);