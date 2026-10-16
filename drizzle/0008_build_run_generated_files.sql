ALTER TABLE `generatedFiles` ADD COLUMN `buildRunId` varchar(64) NULL;
CREATE INDEX `generated_files_build_run_idx` ON `generatedFiles` (`userId`, `buildRunId`);
