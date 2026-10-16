CREATE TABLE `localFolderBindings` (
	`userId` int NOT NULL,
	`root` varchar(1024) NOT NULL,
	`folderName` varchar(255) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localFolderBindings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `localFolderBindings` ADD CONSTRAINT `localFolderBindings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;