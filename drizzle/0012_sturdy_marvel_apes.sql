CREATE TABLE `legacyWorkspaceClaims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`canonicalUserId` int NOT NULL,
	`claimedByAccountId` int NOT NULL,
	`claimedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legacyWorkspaceClaims_id` PRIMARY KEY(`id`),
	CONSTRAINT `legacy_workspace_claims_canonical_user_unique` UNIQUE(`canonicalUserId`),
	CONSTRAINT `legacy_workspace_claims_account_unique` UNIQUE(`claimedByAccountId`)
);
--> statement-breakpoint
ALTER TABLE `authAccounts` ADD `workspaceUserId` int;--> statement-breakpoint
ALTER TABLE `legacyWorkspaceClaims` ADD CONSTRAINT `legacyWorkspaceClaims_canonicalUserId_users_id_fk` FOREIGN KEY (`canonicalUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `legacyWorkspaceClaims` ADD CONSTRAINT `legacyWorkspaceClaims_claimedByAccountId_authAccounts_id_fk` FOREIGN KEY (`claimedByAccountId`) REFERENCES `authAccounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `authAccounts` ADD CONSTRAINT `authAccounts_workspaceUserId_users_id_fk` FOREIGN KEY (`workspaceUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_accounts_workspace_user_idx` ON `authAccounts` (`workspaceUserId`);