CREATE TABLE `authAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `authAccounts_email_unique` UNIQUE(`email`),
	CONSTRAINT `auth_accounts_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `authOneTimeCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`purpose` enum('verify_email','password_reset') NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `authOneTimeCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_codes_hash_unique` UNIQUE(`codeHash`)
);
--> statement-breakpoint
CREATE TABLE `authRateLimits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` enum('signup','verify_email','resend_verification','login','forgot_password','reset_password') NOT NULL,
	`subjectHash` varchar(128) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`blockedUntil` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authRateLimits_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_rate_limits_action_subject_unique` UNIQUE(`action`,`subjectHash`)
);
--> statement-breakpoint
CREATE TABLE `authSessions` (
	`id` varchar(64) NOT NULL,
	`accountId` int NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `authSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `authSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `authAccounts` ADD CONSTRAINT `authAccounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `authOneTimeCodes` ADD CONSTRAINT `authOneTimeCodes_accountId_authAccounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `authAccounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `authSessions` ADD CONSTRAINT `authSessions_accountId_authAccounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `authAccounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `authSessions` ADD CONSTRAINT `authSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_codes_account_purpose_created_idx` ON `authOneTimeCodes` (`accountId`,`purpose`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_expiry_idx` ON `authSessions` (`userId`,`expiresAt`);