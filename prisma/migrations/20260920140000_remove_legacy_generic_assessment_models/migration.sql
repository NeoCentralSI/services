-- Preserve legacy Metopen configuration before dropping the generic tables.
-- In the former CpmkType enum, index 1 is research_method.
INSERT IGNORE INTO metopen_cpmks (id, academic_year_id, code, description, created_at, updated_at)
SELECT id, academic_year_id, code, description, created_at, updated_at
FROM cpmks
WHERE type = 1 AND academic_year_id IS NOT NULL;

INSERT IGNORE INTO metopen_assessment_criterias (id, metopen_cpmk_id, name, role, max_score, display_order, created_at, updated_at)
SELECT criteria.id, criteria.cpmk_id, criteria.name, criteria.role, criteria.max_score, criteria.display_order, criteria.created_at, criteria.updated_at
FROM assessment_criterias AS criteria
INNER JOIN metopen_cpmks AS cpmk ON cpmk.id = criteria.cpmk_id;

INSERT IGNORE INTO metopen_assessment_rubrics (id, metopen_assessment_criteria_id, min_score, max_score, description, display_order, created_at, updated_at)
SELECT rubric.id, rubric.assessment_criteria_id, rubric.min_score, rubric.max_score, rubric.description, rubric.display_order, rubric.created_at, rubric.updated_at
FROM assessment_rubrics AS rubric
INNER JOIN metopen_assessment_criterias AS criteria ON criteria.id = rubric.assessment_criteria_id;

-- DropForeignKey
ALTER TABLE `cpmks` DROP FOREIGN KEY `cpmks_academic_year_id_fkey`;

-- DropForeignKey
ALTER TABLE `cpmks` DROP FOREIGN KEY `cpmks_cpl_id_fkey`;

-- DropForeignKey
ALTER TABLE `assessment_criterias` DROP FOREIGN KEY `assessment_criterias_cpmk_id_fkey`;

-- DropForeignKey
ALTER TABLE `assessment_rubrics` DROP FOREIGN KEY `assessment_rubrics_assessment_criteria_id_fkey`;

-- DropForeignKey
ALTER TABLE `milestone_template_criterias` DROP FOREIGN KEY `milestone_template_criterias_assessment_criteria_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_milestone_assessment_details` DROP FOREIGN KEY `thesis_milestone_assessment_details_rubric_id_fkey`;

-- DropTable
DROP TABLE `cpmks`;

-- DropTable
DROP TABLE `assessment_criterias`;

-- DropTable
DROP TABLE `assessment_rubrics`;

-- Remove legacy milestone links that have no canonical Metopen target.
DELETE mtc FROM milestone_template_criterias AS mtc
LEFT JOIN metopen_assessment_criterias AS mac ON mac.id = mtc.assessment_criteria_id
WHERE mac.id IS NULL;
-- Preserve assessment history while clearing rubric links without a canonical target.
UPDATE thesis_milestone_assessment_details AS detail
LEFT JOIN metopen_assessment_rubrics AS rubric ON rubric.id = detail.rubric_id
SET detail.rubric_id = NULL
WHERE detail.rubric_id IS NOT NULL AND rubric.id IS NULL;

-- AddForeignKey
ALTER TABLE `milestone_template_criterias` ADD CONSTRAINT `milestone_template_criterias_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `metopen_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_assessment_details` ADD CONSTRAINT `thesis_milestone_assessment_details_rubric_id_fkey` FOREIGN KEY (`rubric_id`) REFERENCES `metopen_assessment_rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

