CREATE TABLE IF NOT EXISTS `projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `conversations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `userId` int NOT NULL,
  `title` varchar(180) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversationId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('user','assistant','system') NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `generatedFiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `conversationId` int,
  `userId` int NOT NULL,
  `path` varchar(255) NOT NULL,
  `language` varchar(40),
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `generatedFiles_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `uploads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `projectId` int,
  `conversationId` int,
  `fileKey` varchar(512) NOT NULL,
  `url` varchar(1024) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `sizeBytes` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `uploads_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `researchSources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `projectId` int,
  `conversationId` int,
  `query` varchar(240) NOT NULL,
  `title` varchar(500) NOT NULL,
  `url` varchar(1024) NOT NULL,
  `snippet` text,
  `source` varchar(128) NOT NULL DEFAULT 'Web',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `researchSources_id` PRIMARY KEY(`id`),
  CONSTRAINT `researchSources_conversation_url_unique` UNIQUE(`conversationId`,`url`)
);
