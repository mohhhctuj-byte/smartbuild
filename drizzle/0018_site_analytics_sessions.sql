CREATE TABLE `siteAnalyticsSessions` (
	`sessionKey` varchar(64) NOT NULL,
	`visitorKey` varchar(64) NOT NULL,
	`accountId` int,
	`startedAt` timestamp NOT NULL,
	`lastSeenAt` timestamp NOT NULL,
	`endedAt` timestamp,
	`durationSeconds` int NOT NULL DEFAULT 0,
	CONSTRAINT `siteAnalyticsSessions_sessionKey` PRIMARY KEY(`sessionKey`)
);
--> statement-breakpoint
ALTER TABLE `siteAnalyticsSessions` ADD CONSTRAINT `siteAnalyticsSessions_accountId_authAccounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `authAccounts`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `site_analytics_visitor_activity_idx` ON `siteAnalyticsSessions` (`visitorKey`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `site_analytics_account_activity_idx` ON `siteAnalyticsSessions` (`accountId`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `site_analytics_recent_activity_idx` ON `siteAnalyticsSessions` (`lastSeenAt`);
