-- Add the new Research Method assessment master independently.
-- Existing Metopen tables and operational TA-03 data remain untouched.

CREATE TABLE `research_method_cpmks` (
  `id` VARCHAR(191) NOT NULL,
  `academic_year_id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(255) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `research_method_cpmks_period_code_key`(`academic_year_id`, `code`),
  INDEX `research_method_cpmks_academic_year_id_fkey`(`academic_year_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `research_method_cpmks_academic_year_id_fkey`
    FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_method_supervisor_assessment_criterias` (
  `id` VARCHAR(191) NOT NULL,
  `research_method_cpmk_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `max_score` INTEGER NOT NULL,
  `display_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `rm_supervisor_criterias_cpmk_id_fkey`(`research_method_cpmk_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `rm_supervisor_criterias_cpmk_fkey`
    FOREIGN KEY (`research_method_cpmk_id`) REFERENCES `research_method_cpmks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_method_supervisor_assessment_rubrics` (
  `id` VARCHAR(191) NOT NULL,
  `assessment_criteria_id` VARCHAR(191) NOT NULL,
  `min_score` INTEGER NOT NULL DEFAULT 0,
  `max_score` INTEGER NOT NULL DEFAULT 0,
  `description` TEXT NOT NULL,
  `display_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `rm_supervisor_rubrics_criteria_id_fkey`(`assessment_criteria_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `rm_supervisor_rubrics_criteria_fkey`
    FOREIGN KEY (`assessment_criteria_id`) REFERENCES `research_method_supervisor_assessment_criterias`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_method_coordinator_assessment_criterias` (
  `id` VARCHAR(191) NOT NULL,
  `research_method_cpmk_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `max_score` INTEGER NOT NULL,
  `display_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `rm_coordinator_criterias_cpmk_id_fkey`(`research_method_cpmk_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `rm_coordinator_criterias_cpmk_fkey`
    FOREIGN KEY (`research_method_cpmk_id`) REFERENCES `research_method_cpmks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_method_coordinator_assessment_rubrics` (
  `id` VARCHAR(191) NOT NULL,
  `assessment_criteria_id` VARCHAR(191) NOT NULL,
  `min_score` INTEGER NOT NULL DEFAULT 0,
  `max_score` INTEGER NOT NULL DEFAULT 0,
  `description` TEXT NOT NULL,
  `display_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `rm_coordinator_rubrics_criteria_id_fkey`(`assessment_criteria_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `rm_coordinator_rubrics_criteria_fkey`
    FOREIGN KEY (`assessment_criteria_id`) REFERENCES `research_method_coordinator_assessment_criterias`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
