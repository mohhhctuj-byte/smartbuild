CREATE TABLE `buildRunAgentTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buildRunId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`conversationId` int NOT NULL,
	`taskId` varchar(160) NOT NULL,
	`agentId` varchar(32) NOT NULL,
	`executionMode` enum('dry-run','production') NOT NULL,
	`status` enum('planned','running','succeeded','blocked','failed','cancelled') NOT NULL DEFAULT 'planned',
	`attempt` int NOT NULL DEFAULT 0,
	`selectedReason` varchar(1000) NOT NULL,
	`blockedReason` varchar(512),
	`outputArtifactRefs` longtext,
	`evidenceRefs` longtext,
	`logs` longtext,
	`implementationHash` varchar(128),
	`leaseToken` varchar(64),
	`leaseExpiresAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buildRunAgentTasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `buildRunAgentTasks_run_task_unique` UNIQUE(`buildRunId`,`taskId`)
);
--> statement-breakpoint
ALTER TABLE `buildRunAgentTasks` ADD CONSTRAINT `buildRunAgentTasks_buildRunId_buildRuns_id_fk` FOREIGN KEY (`buildRunId`) REFERENCES `buildRuns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunAgentTasks` ADD CONSTRAINT `buildRunAgentTasks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunAgentTasks` ADD CONSTRAINT `buildRunAgentTasks_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `buildRunAgentTasks` ADD CONSTRAINT `buildRunAgentTasks_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `buildRunAgentTasks_owner_run_status_idx` ON `buildRunAgentTasks` (`userId`,`buildRunId`,`status`);--> statement-breakpoint
CREATE INDEX `buildRunAgentTasks_run_lease_expiry_idx` ON `buildRunAgentTasks` (`buildRunId`,`leaseExpiresAt`);