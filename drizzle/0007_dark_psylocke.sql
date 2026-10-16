ALTER TABLE `buildRuns` ADD `heartbeatTaskUid` varchar(128);--> statement-breakpoint
ALTER TABLE `buildRuns` ADD CONSTRAINT `buildRuns_heartbeat_task_uid_unique` UNIQUE(`heartbeatTaskUid`);