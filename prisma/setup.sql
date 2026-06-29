-- Learning Platform tables
-- Run once to initialize schema on shared Aiven MySQL database

CREATE TABLE IF NOT EXISTS `Course` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `title`       VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `thumbnail`   VARCHAR(191) NULL,
  `gdriveId`    VARCHAR(191) NOT NULL,
  `status`      ENUM('NOT_READY','UPLOADING','READY') NOT NULL DEFAULT 'NOT_READY',
  `activatedAt` DATETIME(3)  NULL,
  `totalSizeMb` DOUBLE       NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Course_gdriveId_key` (`gdriveId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Video` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `courseId`     INT          NOT NULL,
  `title`        VARCHAR(191) NOT NULL,
  `orderIndex`   INT          NOT NULL,
  `gdriveFileId` VARCHAR(191) NOT NULL,
  `r2Url`        VARCHAR(191) NULL,
  `durationSecs` INT          NULL,
  `watched`      TINYINT(1)   NOT NULL DEFAULT 0,
  `watchedAt`    DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `Video_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CourseNote` (
  `id`        INT         NOT NULL AUTO_INCREMENT,
  `courseId`  INT         NOT NULL,
  `content`   LONGTEXT    NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `CourseNote_courseId_key` (`courseId`),
  CONSTRAINT `CourseNote_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CourseMeta` (
  `id`        INT         NOT NULL AUTO_INCREMENT,
  `courseId`  INT         NOT NULL,
  `status`    ENUM('UNWATCHED','WATCHING','WATCHED') NOT NULL DEFAULT 'UNWATCHED',
  `isWishlist` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `CourseMeta_courseId_key` (`courseId`),
  CONSTRAINT `CourseMeta_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
