-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: simptaneo
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `academic_years`
--

DROP TABLE IF EXISTS `academic_years`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `academic_years` (
  `id` varchar(191) NOT NULL,
  `semester` enum('ganjil','genap') NOT NULL DEFAULT 'ganjil',
  `year` int(11) DEFAULT NULL,
  `start_date` datetime(3) DEFAULT NULL,
  `end_date` datetime(3) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_years`
--

LOCK TABLES `academic_years` WRITE;
/*!40000 ALTER TABLE `academic_years` DISABLE KEYS */;
INSERT INTO `academic_years` VALUES ('30045b60-b3e9-40ec-a6c4-df7fe5c5b541','ganjil',2025,NULL,NULL,0,'2026-03-03 21:09:17.242','2026-03-05 13:16:32.186'),('3dead637-4163-41f1-82de-eea9c36024b1','ganjil',2024,'2024-08-01 00:00:00.000','2025-01-31 00:00:00.000',0,'2026-03-01 19:20:45.451','2026-03-05 13:16:32.186'),('4d1468cb-29ec-4234-a976-7dbc8b9e5275','ganjil',2025,'2025-08-01 00:00:00.000','2026-01-31 00:00:00.000',0,'2026-03-01 19:20:45.470','2026-03-05 13:16:32.186'),('609089c4-74f3-4fd5-9c95-99969abc556b','genap',2024,'2025-02-01 00:00:00.000','2025-07-31 00:00:00.000',0,'2026-03-01 19:20:45.457','2026-03-05 13:16:32.186');
/*!40000 ALTER TABLE `academic_years` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assessment_criterias`
--

DROP TABLE IF EXISTS `assessment_criterias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assessment_criterias` (
  `id` varchar(255) NOT NULL,
  `cpmk_id` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `applies_to` enum('seminar','defence','proposal','metopen') NOT NULL,
  `role` enum('default','examiner','supervisor') NOT NULL DEFAULT 'default',
  `max_score` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `assessment_criterias_cpmk_id_fkey` (`cpmk_id`),
  CONSTRAINT `assessment_criterias_cpmk_id_fkey` FOREIGN KEY (`cpmk_id`) REFERENCES `cpmks` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assessment_criterias`
--

LOCK TABLES `assessment_criterias` WRITE;
/*!40000 ALTER TABLE `assessment_criterias` DISABLE KEYS */;
/*!40000 ALTER TABLE `assessment_criterias` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assessment_rubrics`
--

DROP TABLE IF EXISTS `assessment_rubrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assessment_rubrics` (
  `id` varchar(255) NOT NULL,
  `assessment_criteria_id` varchar(255) NOT NULL,
  `min_score` int(11) NOT NULL DEFAULT 0,
  `max_score` int(11) NOT NULL DEFAULT 0,
  `description` text NOT NULL,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `assessment_rubrics_assessment_criteria_id_fkey` (`assessment_criteria_id`),
  CONSTRAINT `assessment_rubrics_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assessment_rubrics`
--

LOCK TABLES `assessment_rubrics` WRITE;
/*!40000 ALTER TABLE `assessment_rubrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `assessment_rubrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `companies`
--

DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `companies` (
  `id` varchar(191) NOT NULL,
  `company_name` varchar(191) NOT NULL,
  `company_address` varchar(191) NOT NULL,
  `status` enum('save','blacklist') NOT NULL DEFAULT 'save',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cpls`
--

DROP TABLE IF EXISTS `cpls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cpls` (
  `id` varchar(191) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `minimal_score` int(11) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cpls`
--

LOCK TABLES `cpls` WRITE;
/*!40000 ALTER TABLE `cpls` DISABLE KEYS */;
/*!40000 ALTER TABLE `cpls` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cpmks`
--

DROP TABLE IF EXISTS `cpmks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cpmks` (
  `id` varchar(255) NOT NULL,
  `code` varchar(255) NOT NULL,
  `description` varchar(255) NOT NULL,
  `type` enum('research_method','thesis') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cpmks`
--

LOCK TABLES `cpmks` WRITE;
/*!40000 ALTER TABLE `cpmks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cpmks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `document_templates`
--

DROP TABLE IF EXISTS `document_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `document_templates` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'HTML',
  `content` longtext DEFAULT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_templates_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_templates`
--

LOCK TABLES `document_templates` WRITE;
/*!40000 ALTER TABLE `document_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `document_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `document_types`
--

DROP TABLE IF EXISTS `document_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `document_types` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_types`
--

LOCK TABLES `document_types` WRITE;
/*!40000 ALTER TABLE `document_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `document_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `documents` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) DEFAULT NULL,
  `document_type_id` varchar(191) DEFAULT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `file_name` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `documents_document_type_id_fkey` (`document_type_id`),
  KEY `documents_user_id_fkey` (`user_id`),
  CONSTRAINT `documents_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
INSERT INTO `documents` VALUES ('145c9ecc-ba40-4991-9376-8239bef7a8d5','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/2015a773-bef5-4da8-bb57-cf26fa72e995/mmdr1w34-evitafitri,+10_Production_5776+(pp+151-162).pdf','evitafitri,+10_Production_5776+(pp+151-162).pdf','2026-03-05 17:38:39.675','2026-03-05 17:38:39.675'),('535cc40c-0530-4047-8e16-2755a3f52267','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/e9e16d02-08b0-4ade-9a04-f7b13a45ceee/mmarcu6y-188-Gumi├à┬äski-Dohn-Oloyede.pdf','188-Gumi├à┬äski-Dohn-Oloyede.pdf','2026-03-03 15:23:51.901','2026-03-03 15:23:51.901'),('5dd18e45-c522-427f-bd96-f17a837c0035','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/2015a773-bef5-4da8-bb57-cf26fa72e995/mmarb6yr-OneDrive_1_10-02-2026.zip','OneDrive_1_10-02-2026.zip','2026-03-03 15:22:35.145','2026-03-03 15:22:35.145'),('6ae30661-9480-4773-95c5-3e1c008bf8de','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/2015a773-bef5-4da8-bb57-cf26fa72e995/mmar8jq6-test-document.pdf','test-document.pdf','2026-03-03 15:20:31.722','2026-03-03 15:20:31.722'),('7a4b1d0d-39b5-401d-8165-0be295103d51','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/2015a773-bef5-4da8-bb57-cf26fa72e995/mmarapom-evitafitri,+10_Production_5776+(pp+151-162).pdf','evitafitri,+10_Production_5776+(pp+151-162).pdf','2026-03-03 15:22:12.750','2026-03-03 15:22:12.750'),('b980ebbf-85c6-4d8d-b76b-7746f414ed48','7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,'uploads/metopen/templates/2015a773-bef5-4da8-bb57-cf26fa72e995/mmb3fx33-JMB-37-2-2016-003.pdf','JMB-37-2-2016-003.pdf','2026-03-03 21:02:11.009','2026-03-03 21:02:11.009');
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exit_survey_forms`
--

DROP TABLE IF EXISTS `exit_survey_forms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `exit_survey_forms` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exit_survey_forms`
--

LOCK TABLES `exit_survey_forms` WRITE;
/*!40000 ALTER TABLE `exit_survey_forms` DISABLE KEYS */;
/*!40000 ALTER TABLE `exit_survey_forms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exit_survey_options`
--

DROP TABLE IF EXISTS `exit_survey_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `exit_survey_options` (
  `id` varchar(255) NOT NULL,
  `exit_survey_question_id` varchar(255) NOT NULL,
  `option_text` varchar(255) NOT NULL,
  `order_number` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `exit_survey_options_exit_survey_question_id_fkey` (`exit_survey_question_id`),
  CONSTRAINT `exit_survey_options_exit_survey_question_id_fkey` FOREIGN KEY (`exit_survey_question_id`) REFERENCES `exit_survey_questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exit_survey_options`
--

LOCK TABLES `exit_survey_options` WRITE;
/*!40000 ALTER TABLE `exit_survey_options` DISABLE KEYS */;
/*!40000 ALTER TABLE `exit_survey_options` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exit_survey_questions`
--

DROP TABLE IF EXISTS `exit_survey_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `exit_survey_questions` (
  `id` varchar(255) NOT NULL,
  `exit_survey_form_id` varchar(255) NOT NULL,
  `question` text NOT NULL,
  `question_type` enum('single_choice','multiple_choice','text','textarea') NOT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT 0,
  `order_number` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `exit_survey_questions_exit_survey_form_id_fkey` (`exit_survey_form_id`),
  CONSTRAINT `exit_survey_questions_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exit_survey_questions`
--

LOCK TABLES `exit_survey_questions` WRITE;
/*!40000 ALTER TABLE `exit_survey_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `exit_survey_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_application_letters`
--

DROP TABLE IF EXISTS `internship_application_letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_application_letters` (
  `id` varchar(191) NOT NULL,
  `proposal_id` varchar(191) NOT NULL,
  `document_number` varchar(191) NOT NULL,
  `date_issued` date NOT NULL,
  `start_date_planned` date NOT NULL,
  `end_date_planned` date NOT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `signed_by_id` varchar(191) DEFAULT NULL,
  `signed_as_role_id` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `internship_application_letters_document_number_key` (`document_number`),
  KEY `internship_application_letters_proposal_id_fkey` (`proposal_id`),
  KEY `internship_application_letters_document_id_fkey` (`document_id`),
  KEY `internship_application_letters_signed_by_id_fkey` (`signed_by_id`),
  KEY `internship_application_letters_signed_as_role_id_fkey` (`signed_as_role_id`),
  CONSTRAINT `internship_application_letters_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_application_letters_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_application_letters_signed_as_role_id_fkey` FOREIGN KEY (`signed_as_role_id`) REFERENCES `user_roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_application_letters_signed_by_id_fkey` FOREIGN KEY (`signed_by_id`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_application_letters`
--

LOCK TABLES `internship_application_letters` WRITE;
/*!40000 ALTER TABLE `internship_application_letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_application_letters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_assessment_rubrics`
--

DROP TABLE IF EXISTS `internship_assessment_rubrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_assessment_rubrics` (
  `id` varchar(191) NOT NULL,
  `cpmk_id` varchar(191) NOT NULL,
  `rubric_level_description` text NOT NULL,
  `min_score` double NOT NULL,
  `max_score` double NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_assessment_rubrics_cpmk_id_fkey` (`cpmk_id`),
  CONSTRAINT `internship_assessment_rubrics_cpmk_id_fkey` FOREIGN KEY (`cpmk_id`) REFERENCES `internship_cpmks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_assessment_rubrics`
--

LOCK TABLES `internship_assessment_rubrics` WRITE;
/*!40000 ALTER TABLE `internship_assessment_rubrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_assessment_rubrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_assessments`
--

DROP TABLE IF EXISTS `internship_assessments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_assessments` (
  `id` varchar(191) NOT NULL,
  `internship_id` varchar(191) NOT NULL,
  `assessor_type` enum('LECTURER','FIELD') NOT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `status` enum('PENDING','APPROVED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  `scored_by_lecturer_id` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_assessments_internship_id_fkey` (`internship_id`),
  KEY `internship_assessments_document_id_fkey` (`document_id`),
  KEY `internship_assessments_scored_by_lecturer_id_fkey` (`scored_by_lecturer_id`),
  CONSTRAINT `internship_assessments_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_assessments_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_assessments_scored_by_lecturer_id_fkey` FOREIGN KEY (`scored_by_lecturer_id`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_assessments`
--

LOCK TABLES `internship_assessments` WRITE;
/*!40000 ALTER TABLE `internship_assessments` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_assessments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_assignment_letters`
--

DROP TABLE IF EXISTS `internship_assignment_letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_assignment_letters` (
  `id` varchar(191) NOT NULL,
  `proposal_id` varchar(191) NOT NULL,
  `response_id` varchar(191) NOT NULL,
  `document_number` varchar(191) NOT NULL,
  `date_issued` date NOT NULL,
  `start_date_actual` date NOT NULL,
  `end_date_actual` date NOT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `signed_by_id` varchar(191) DEFAULT NULL,
  `signed_as_role_id` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `internship_assignment_letters_document_number_key` (`document_number`),
  KEY `internship_assignment_letters_proposal_id_fkey` (`proposal_id`),
  KEY `internship_assignment_letters_response_id_fkey` (`response_id`),
  KEY `internship_assignment_letters_document_id_fkey` (`document_id`),
  KEY `internship_assignment_letters_signed_by_id_fkey` (`signed_by_id`),
  KEY `internship_assignment_letters_signed_as_role_id_fkey` (`signed_as_role_id`),
  CONSTRAINT `internship_assignment_letters_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_assignment_letters_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_assignment_letters_response_id_fkey` FOREIGN KEY (`response_id`) REFERENCES `internship_company_responses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_assignment_letters_signed_as_role_id_fkey` FOREIGN KEY (`signed_as_role_id`) REFERENCES `user_roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_assignment_letters_signed_by_id_fkey` FOREIGN KEY (`signed_by_id`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_assignment_letters`
--

LOCK TABLES `internship_assignment_letters` WRITE;
/*!40000 ALTER TABLE `internship_assignment_letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_assignment_letters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_company_responses`
--

DROP TABLE IF EXISTS `internship_company_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_company_responses` (
  `id` varchar(191) NOT NULL,
  `proposal_id` varchar(191) NOT NULL,
  `document_id` varchar(191) NOT NULL,
  `status` enum('PENDING','APPROVED_BY_SEKDEP','REJECTED_BY_SEKDEP') NOT NULL DEFAULT 'PENDING',
  `sekdep_notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_company_responses_proposal_id_fkey` (`proposal_id`),
  KEY `internship_company_responses_document_id_fkey` (`document_id`),
  CONSTRAINT `internship_company_responses_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `internship_company_responses_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_company_responses`
--

LOCK TABLES `internship_company_responses` WRITE;
/*!40000 ALTER TABLE `internship_company_responses` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_company_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_cpmk_scores`
--

DROP TABLE IF EXISTS `internship_cpmk_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_cpmk_scores` (
  `id` varchar(191) NOT NULL,
  `assessment_id` varchar(191) NOT NULL,
  `cpmk_id` varchar(191) NOT NULL,
  `chosen_rubric_id` varchar(191) NOT NULL,
  `score` double NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_cpmk_scores_assessment_id_fkey` (`assessment_id`),
  KEY `internship_cpmk_scores_cpmk_id_fkey` (`cpmk_id`),
  KEY `internship_cpmk_scores_chosen_rubric_id_fkey` (`chosen_rubric_id`),
  CONSTRAINT `internship_cpmk_scores_assessment_id_fkey` FOREIGN KEY (`assessment_id`) REFERENCES `internship_assessments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_cpmk_scores_chosen_rubric_id_fkey` FOREIGN KEY (`chosen_rubric_id`) REFERENCES `internship_assessment_rubrics` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_cpmk_scores_cpmk_id_fkey` FOREIGN KEY (`cpmk_id`) REFERENCES `internship_cpmks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_cpmk_scores`
--

LOCK TABLES `internship_cpmk_scores` WRITE;
/*!40000 ALTER TABLE `internship_cpmk_scores` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_cpmk_scores` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_cpmks`
--

DROP TABLE IF EXISTS `internship_cpmks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_cpmks` (
  `id` varchar(191) NOT NULL,
  `code` varchar(191) NOT NULL,
  `name` text NOT NULL,
  `weight` double NOT NULL,
  `assessor_type` enum('LECTURER','FIELD') NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_cpmks`
--

LOCK TABLES `internship_cpmks` WRITE;
/*!40000 ALTER TABLE `internship_cpmks` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_cpmks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_final_score_summary`
--

DROP TABLE IF EXISTS `internship_final_score_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_final_score_summary` (
  `id` varchar(191) NOT NULL,
  `internship_id` varchar(191) NOT NULL,
  `final_numeric_score` double NOT NULL,
  `final_grade` varchar(10) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `internship_final_score_summary_internship_id_key` (`internship_id`),
  CONSTRAINT `internship_final_score_summary_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_final_score_summary`
--

LOCK TABLES `internship_final_score_summary` WRITE;
/*!40000 ALTER TABLE `internship_final_score_summary` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_final_score_summary` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_guidance_lecturer_answers`
--

DROP TABLE IF EXISTS `internship_guidance_lecturer_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_guidance_lecturer_answers` (
  `id` varchar(191) NOT NULL,
  `guidance_session_id` varchar(191) NOT NULL,
  `criteria_id` varchar(191) NOT NULL,
  `evaluation_value` enum('SANGAT_BAIK','BAIK','CUKUP','PERLU_PERBAIKAN') DEFAULT NULL,
  `answer_text` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_guidance_lecturer_answers_session_id_fkey` (`guidance_session_id`),
  KEY `internship_guidance_lecturer_answers_criteria_id_fkey` (`criteria_id`),
  CONSTRAINT `internship_guidance_lecturer_answers_criteria_id_fkey` FOREIGN KEY (`criteria_id`) REFERENCES `internship_guidance_lecturer_criteria` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_guidance_lecturer_answers_guidance_session_id_fkey` FOREIGN KEY (`guidance_session_id`) REFERENCES `internship_guidance_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_guidance_lecturer_answers`
--

LOCK TABLES `internship_guidance_lecturer_answers` WRITE;
/*!40000 ALTER TABLE `internship_guidance_lecturer_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_guidance_lecturer_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_guidance_lecturer_criteria`
--

DROP TABLE IF EXISTS `internship_guidance_lecturer_criteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_guidance_lecturer_criteria` (
  `id` varchar(191) NOT NULL,
  `criteria_name` varchar(191) NOT NULL,
  `input_type` enum('EVALUATION','TEXT') NOT NULL,
  `order_index` int(11) DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_guidance_lecturer_criteria`
--

LOCK TABLES `internship_guidance_lecturer_criteria` WRITE;
/*!40000 ALTER TABLE `internship_guidance_lecturer_criteria` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_guidance_lecturer_criteria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_guidance_questions`
--

DROP TABLE IF EXISTS `internship_guidance_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_guidance_questions` (
  `id` varchar(191) NOT NULL,
  `week_number` int(11) NOT NULL,
  `question_text` text NOT NULL,
  `order_index` int(11) DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_guidance_questions`
--

LOCK TABLES `internship_guidance_questions` WRITE;
/*!40000 ALTER TABLE `internship_guidance_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_guidance_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_guidance_sessions`
--

DROP TABLE IF EXISTS `internship_guidance_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_guidance_sessions` (
  `id` varchar(191) NOT NULL,
  `internship_id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `week_number` int(11) NOT NULL,
  `status` enum('DRAFT','SUBMITTED','APPROVED') NOT NULL DEFAULT 'DRAFT',
  `submission_date` date DEFAULT NULL,
  `approved_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_guidance_sessions_internship_id_fkey` (`internship_id`),
  KEY `internship_guidance_sessions_lecturer_id_fkey` (`lecturer_id`),
  CONSTRAINT `internship_guidance_sessions_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_guidance_sessions_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_guidance_sessions`
--

LOCK TABLES `internship_guidance_sessions` WRITE;
/*!40000 ALTER TABLE `internship_guidance_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_guidance_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_guidance_student_answers`
--

DROP TABLE IF EXISTS `internship_guidance_student_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_guidance_student_answers` (
  `id` varchar(191) NOT NULL,
  `guidance_session_id` varchar(191) NOT NULL,
  `question_id` varchar(191) NOT NULL,
  `answer_text` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_guidance_student_answers_session_id_fkey` (`guidance_session_id`),
  KEY `internship_guidance_student_answers_question_id_fkey` (`question_id`),
  CONSTRAINT `internship_guidance_student_answers_guidance_session_id_fkey` FOREIGN KEY (`guidance_session_id`) REFERENCES `internship_guidance_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_guidance_student_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `internship_guidance_questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_guidance_student_answers`
--

LOCK TABLES `internship_guidance_student_answers` WRITE;
/*!40000 ALTER TABLE `internship_guidance_student_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_guidance_student_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_logbooks`
--

DROP TABLE IF EXISTS `internship_logbooks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_logbooks` (
  `id` varchar(191) NOT NULL,
  `internship_id` varchar(191) NOT NULL,
  `activity_date` date NOT NULL,
  `activity_description` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_logbooks_internship_id_fkey` (`internship_id`),
  CONSTRAINT `internship_logbooks_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_logbooks`
--

LOCK TABLES `internship_logbooks` WRITE;
/*!40000 ALTER TABLE `internship_logbooks` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_logbooks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_proposal_members`
--

DROP TABLE IF EXISTS `internship_proposal_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_proposal_members` (
  `proposal_id` varchar(191) NOT NULL,
  `student_id` varchar(191) NOT NULL,
  `status` enum('PENDING','ACCEPTED','REJECTED','ACCEPTED_BY_COMPANY','REJECTED_BY_COMPANY') NOT NULL DEFAULT 'PENDING',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`proposal_id`,`student_id`),
  KEY `internship_proposal_members_student_id_fkey` (`student_id`),
  CONSTRAINT `internship_proposal_members_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_proposal_members_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_proposal_members`
--

LOCK TABLES `internship_proposal_members` WRITE;
/*!40000 ALTER TABLE `internship_proposal_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_proposal_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_proposals`
--

DROP TABLE IF EXISTS `internship_proposals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_proposals` (
  `id` varchar(191) NOT NULL,
  `coordinator_id` varchar(191) NOT NULL,
  `proposal_document_id` varchar(191) NOT NULL,
  `academic_year_id` varchar(191) NOT NULL,
  `target_company_id` varchar(191) DEFAULT NULL,
  `status` enum('PENDING','APPROVED_BY_SEKDEP','REJECTED_BY_SEKDEP','ACCEPTED_BY_COMPANY','PARTIALLY_ACCEPTED','REJECTED_BY_COMPANY','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `sekdep_notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_proposals_coordinator_id_fkey` (`coordinator_id`),
  KEY `internship_proposals_proposal_document_id_fkey` (`proposal_document_id`),
  KEY `internship_proposals_academic_year_id_fkey` (`academic_year_id`),
  KEY `internship_proposals_target_company_id_fkey` (`target_company_id`),
  CONSTRAINT `internship_proposals_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_proposals_coordinator_id_fkey` FOREIGN KEY (`coordinator_id`) REFERENCES `students` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_proposals_proposal_document_id_fkey` FOREIGN KEY (`proposal_document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `internship_proposals_target_company_id_fkey` FOREIGN KEY (`target_company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_proposals`
--

LOCK TABLES `internship_proposals` WRITE;
/*!40000 ALTER TABLE `internship_proposals` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_proposals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_seminar_audiences`
--

DROP TABLE IF EXISTS `internship_seminar_audiences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_seminar_audiences` (
  `id` varchar(191) NOT NULL,
  `seminar_id` varchar(191) NOT NULL,
  `student_id` varchar(191) NOT NULL,
  `status` enum('PENDING','VALIDATED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `validated_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_seminar_audiences_seminar_id_fkey` (`seminar_id`),
  KEY `internship_seminar_audiences_student_id_fkey` (`student_id`),
  CONSTRAINT `internship_seminar_audiences_seminar_id_fkey` FOREIGN KEY (`seminar_id`) REFERENCES `internship_seminars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_seminar_audiences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_seminar_audiences`
--

LOCK TABLES `internship_seminar_audiences` WRITE;
/*!40000 ALTER TABLE `internship_seminar_audiences` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_seminar_audiences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_seminars`
--

DROP TABLE IF EXISTS `internship_seminars`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_seminars` (
  `id` varchar(191) NOT NULL,
  `internship_id` varchar(191) NOT NULL,
  `room_id` varchar(191) NOT NULL,
  `seminar_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `moderator_student_id` varchar(191) NOT NULL,
  `status` enum('REQUESTED','APPROVED','REJECTED','COMPLETED') NOT NULL DEFAULT 'REQUESTED',
  `approved_by` varchar(191) DEFAULT NULL,
  `supervisor_notes` text DEFAULT NULL,
  `berita_acara_document_id` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internship_seminars_internship_id_fkey` (`internship_id`),
  KEY `internship_seminars_room_id_fkey` (`room_id`),
  KEY `internship_seminars_moderator_student_id_fkey` (`moderator_student_id`),
  KEY `internship_seminars_approved_by_fkey` (`approved_by`),
  KEY `internship_seminars_berita_acara_document_id_fkey` (`berita_acara_document_id`),
  CONSTRAINT `internship_seminars_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_seminars_berita_acara_document_id_fkey` FOREIGN KEY (`berita_acara_document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internship_seminars_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internship_seminars_moderator_student_id_fkey` FOREIGN KEY (`moderator_student_id`) REFERENCES `students` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `internship_seminars_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_seminars`
--

LOCK TABLES `internship_seminars` WRITE;
/*!40000 ALTER TABLE `internship_seminars` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_seminars` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internship_supervisor_letters`
--

DROP TABLE IF EXISTS `internship_supervisor_letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internship_supervisor_letters` (
  `id` varchar(191) NOT NULL,
  `document_number` varchar(191) NOT NULL,
  `date_issued` date NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `document_id` varchar(191) NOT NULL,
  `signed_by_id` varchar(191) NOT NULL,
  `signed_as_role_id` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `internship_supervisor_letters_document_number_key` (`document_number`),
  KEY `internship_supervisor_letters_document_id_fkey` (`document_id`),
  KEY `internship_supervisor_letters_signed_by_id_fkey` (`signed_by_id`),
  KEY `internship_supervisor_letters_signed_as_role_id_fkey` (`signed_as_role_id`),
  CONSTRAINT `internship_supervisor_letters_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `internship_supervisor_letters_signed_as_role_id_fkey` FOREIGN KEY (`signed_as_role_id`) REFERENCES `user_roles` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `internship_supervisor_letters_signed_by_id_fkey` FOREIGN KEY (`signed_by_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internship_supervisor_letters`
--

LOCK TABLES `internship_supervisor_letters` WRITE;
/*!40000 ALTER TABLE `internship_supervisor_letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `internship_supervisor_letters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `internships`
--

DROP TABLE IF EXISTS `internships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `internships` (
  `id` varchar(191) NOT NULL,
  `student_id` varchar(191) NOT NULL,
  `proposal_id` varchar(191) NOT NULL,
  `assignment_letter_id` varchar(191) NOT NULL,
  `supervisor_id` varchar(191) DEFAULT NULL,
  `supervisor_letter_id` varchar(191) DEFAULT NULL,
  `field_supervisor_name` varchar(191) DEFAULT NULL,
  `unit_section` varchar(191) DEFAULT NULL,
  `actual_start_date` date DEFAULT NULL,
  `actual_end_date` date DEFAULT NULL,
  `report_file_id` varchar(191) DEFAULT NULL,
  `report_title` varchar(191) DEFAULT NULL,
  `report_uploaded_at` datetime(3) DEFAULT NULL,
  `status` enum('ONGOING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ONGOING',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `internships_student_id_fkey` (`student_id`),
  KEY `internships_proposal_id_fkey` (`proposal_id`),
  KEY `internships_assignment_letter_id_fkey` (`assignment_letter_id`),
  KEY `internships_supervisor_id_fkey` (`supervisor_id`),
  KEY `internships_supervisor_letter_id_fkey` (`supervisor_letter_id`),
  KEY `internships_report_file_id_fkey` (`report_file_id`),
  CONSTRAINT `internships_assignment_letter_id_fkey` FOREIGN KEY (`assignment_letter_id`) REFERENCES `internship_assignment_letters` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internships_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internships_report_file_id_fkey` FOREIGN KEY (`report_file_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internships_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `internships_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `internships_supervisor_letter_id_fkey` FOREIGN KEY (`supervisor_letter_id`) REFERENCES `internship_supervisor_letters` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internships`
--

LOCK TABLES `internships` WRITE;
/*!40000 ALTER TABLE `internships` DISABLE KEYS */;
/*!40000 ALTER TABLE `internships` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lecturer_availabilities`
--

DROP TABLE IF EXISTS `lecturer_availabilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lecturer_availabilities` (
  `id` varchar(255) NOT NULL,
  `lecturer_id` varchar(255) NOT NULL,
  `day` enum('monday','tuesday','wednesday','thursday','friday') NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `valid_from` date NOT NULL,
  `valid_until` date NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lecturer_availabilities`
--

LOCK TABLES `lecturer_availabilities` WRITE;
/*!40000 ALTER TABLE `lecturer_availabilities` DISABLE KEYS */;
/*!40000 ALTER TABLE `lecturer_availabilities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lecturer_supervision_quotas`
--

DROP TABLE IF EXISTS `lecturer_supervision_quotas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lecturer_supervision_quotas` (
  `id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `academic_year_id` varchar(191) NOT NULL,
  `quota_max` int(11) NOT NULL DEFAULT 10,
  `quota_soft_limit` int(11) NOT NULL DEFAULT 8,
  `current_count` int(11) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lecturer_supervision_quotas_lecturer_id_academic_year_id_key` (`lecturer_id`,`academic_year_id`),
  KEY `lecturer_supervision_quotas_academic_year_id_idx` (`academic_year_id`),
  CONSTRAINT `lecturer_supervision_quotas_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `lecturer_supervision_quotas_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lecturer_supervision_quotas`
--

LOCK TABLES `lecturer_supervision_quotas` WRITE;
/*!40000 ALTER TABLE `lecturer_supervision_quotas` DISABLE KEYS */;
/*!40000 ALTER TABLE `lecturer_supervision_quotas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lecturers`
--

DROP TABLE IF EXISTS `lecturers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lecturers` (
  `user_id` varchar(191) NOT NULL,
  `science_group_id` varchar(191) DEFAULT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `lecturers_science_group_id_fkey` (`science_group_id`),
  CONSTRAINT `lecturers_science_group_id_fkey` FOREIGN KEY (`science_group_id`) REFERENCES `science_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `lecturers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lecturers`
--

LOCK TABLES `lecturers` WRITE;
/*!40000 ALTER TABLE `lecturers` DISABLE KEYS */;
INSERT INTO `lecturers` VALUES ('01c30b41-263c-41f7-8456-0190b8055930',NULL,NULL,'2026-03-01 19:20:45.708','2026-03-01 19:20:45.708'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef',NULL,NULL,'2026-03-01 19:20:45.590','2026-03-01 19:20:45.590'),('1c9f963e-bda5-4ac1-8854-8d36efdc43ea',NULL,NULL,'2026-03-01 19:20:45.672','2026-03-01 19:20:45.672'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d',NULL,NULL,'2026-03-01 19:20:45.747','2026-03-01 19:20:45.747'),('63bb7894-a53f-4a9f-9f9c-a73d6d360ffd',NULL,NULL,'2026-03-01 19:20:45.820','2026-03-01 19:20:45.820'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3',NULL,NULL,'2026-03-01 19:20:45.640','2026-03-01 19:20:45.640'),('deb95852-dc29-45e3-97cc-b137d5ddc522',NULL,NULL,'2026-03-01 19:20:45.790','2026-03-01 19:20:45.790');
/*!40000 ALTER TABLE `lecturers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metopen_class_students`
--

DROP TABLE IF EXISTS `metopen_class_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `metopen_class_students` (
  `class_id` varchar(191) NOT NULL,
  `student_id` varchar(191) NOT NULL,
  `enrolled_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`class_id`,`student_id`),
  KEY `metopen_class_students_student_id_idx` (`student_id`),
  CONSTRAINT `metopen_class_students_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `metopen_classes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `metopen_class_students_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metopen_class_students`
--

LOCK TABLES `metopen_class_students` WRITE;
/*!40000 ALTER TABLE `metopen_class_students` DISABLE KEYS */;
INSERT INTO `metopen_class_students` VALUES ('cb0ba496-dc53-401f-a47f-7de0e2273517','3783feea-3175-4e14-ba71-ae80e1c44fe3','2026-03-03 21:09:17.429'),('cb0ba496-dc53-401f-a47f-7de0e2273517','81366a41-e085-4a48-9ff3-c1591e554899','2026-03-03 21:09:17.333'),('cb0ba496-dc53-401f-a47f-7de0e2273517','9938fd8e-74e3-4085-b893-c6765752751f','2026-03-03 21:09:17.390'),('cb0ba496-dc53-401f-a47f-7de0e2273517','aa1652f7-958e-47e3-8554-7440d507a061','2026-03-03 21:09:17.353'),('cb0ba496-dc53-401f-a47f-7de0e2273517','cfcee288-cd64-4060-a7bb-1fe205dd9559','2026-03-03 21:09:17.409');
/*!40000 ALTER TABLE `metopen_class_students` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metopen_classes`
--

DROP TABLE IF EXISTS `metopen_classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `metopen_classes` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `academic_year_id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `metopen_classes_academic_year_id_idx` (`academic_year_id`),
  KEY `metopen_classes_lecturer_id_idx` (`lecturer_id`),
  CONSTRAINT `metopen_classes_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `metopen_classes_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metopen_classes`
--

LOCK TABLES `metopen_classes` WRITE;
/*!40000 ALTER TABLE `metopen_classes` DISABLE KEYS */;
INSERT INTO `metopen_classes` VALUES ('1970ba01-f878-487d-895f-f5176f602319','Metopen Kelas A - 2025 Ganjil','30045b60-b3e9-40ec-a6c4-df7fe5c5b541','01c30b41-263c-41f7-8456-0190b8055930','Kelas Metodologi Penelitian Reguler',1,'2026-03-03 21:27:40.767','2026-03-03 21:27:40.767'),('cb0ba496-dc53-401f-a47f-7de0e2273517','Metopen Kelas A - 2025 Ganjil','30045b60-b3e9-40ec-a6c4-df7fe5c5b541','01c30b41-263c-41f7-8456-0190b8055930','Kelas Metodologi Penelitian Reguler',1,'2026-03-03 21:09:17.298','2026-03-03 21:09:17.298');
/*!40000 ALTER TABLE `metopen_classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `milestone_template_attachments`
--

DROP TABLE IF EXISTS `milestone_template_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `milestone_template_attachments` (
  `id` varchar(191) NOT NULL,
  `template_id` varchar(191) NOT NULL,
  `document_id` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `milestone_template_attachments_template_id_idx` (`template_id`),
  KEY `milestone_template_attachments_document_id_idx` (`document_id`),
  CONSTRAINT `milestone_template_attachments_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `milestone_template_attachments_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `thesis_milestone_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `milestone_template_attachments`
--

LOCK TABLES `milestone_template_attachments` WRITE;
/*!40000 ALTER TABLE `milestone_template_attachments` DISABLE KEYS */;
INSERT INTO `milestone_template_attachments` VALUES ('05b015d8-0ce8-439c-acef-89a3d5d54abe','e9e16d02-08b0-4ade-9a04-f7b13a45ceee','535cc40c-0530-4047-8e16-2755a3f52267','2026-03-03 15:23:51.916'),('65071c34-14ea-4ff6-a608-fbd2d8919ae0','2015a773-bef5-4da8-bb57-cf26fa72e995','145c9ecc-ba40-4991-9376-8239bef7a8d5','2026-03-05 17:38:39.700'),('ac41499d-717e-4305-a3fa-d412f4948ce2','2015a773-bef5-4da8-bb57-cf26fa72e995','b980ebbf-85c6-4d8d-b76b-7746f414ed48','2026-03-03 21:02:11.023');
/*!40000 ALTER TABLE `milestone_template_attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `milestone_template_criterias`
--

DROP TABLE IF EXISTS `milestone_template_criterias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `milestone_template_criterias` (
  `milestone_template_id` varchar(191) NOT NULL,
  `assessment_criteria_id` varchar(191) NOT NULL,
  `weight_percentage` int(11) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`milestone_template_id`,`assessment_criteria_id`),
  KEY `milestone_template_criterias_assessment_criteria_id_idx` (`assessment_criteria_id`),
  CONSTRAINT `milestone_template_criterias_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `milestone_template_criterias_milestone_template_id_fkey` FOREIGN KEY (`milestone_template_id`) REFERENCES `thesis_milestone_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `milestone_template_criterias`
--

LOCK TABLES `milestone_template_criterias` WRITE;
/*!40000 ALTER TABLE `milestone_template_criterias` DISABLE KEYS */;
/*!40000 ALTER TABLE `milestone_template_criterias` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `title` varchar(191) DEFAULT NULL,
  `message` varchar(191) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `notifications_user_id_fkey` (`user_id`),
  CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `research_method_score_details`
--

DROP TABLE IF EXISTS `research_method_score_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `research_method_score_details` (
  `research_method_score_id` varchar(255) NOT NULL,
  `assessment_criteria_id` varchar(255) NOT NULL,
  `score` int(11) DEFAULT NULL,
  PRIMARY KEY (`research_method_score_id`),
  KEY `research_method_score_details_criteria_id_fkey` (`assessment_criteria_id`),
  CONSTRAINT `research_method_score_details_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `research_method_score_details_research_method_score_id_fkey` FOREIGN KEY (`research_method_score_id`) REFERENCES `research_method_scores` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `research_method_score_details`
--

LOCK TABLES `research_method_score_details` WRITE;
/*!40000 ALTER TABLE `research_method_score_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `research_method_score_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `research_method_scores`
--

DROP TABLE IF EXISTS `research_method_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `research_method_scores` (
  `id` varchar(255) NOT NULL,
  `supervisor_id` varchar(255) DEFAULT NULL,
  `supervisor_score` int(11) DEFAULT NULL,
  `lecturer_id` varchar(255) DEFAULT NULL,
  `lecturer_score` int(11) DEFAULT NULL,
  `calculated_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `thesis_id` varchar(255) DEFAULT NULL,
  `final_score` int(11) DEFAULT NULL,
  `finalized_at` datetime(3) DEFAULT NULL,
  `finalized_by` varchar(255) DEFAULT NULL,
  `is_finalized` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `research_method_scores_thesis_id_fkey` (`thesis_id`),
  CONSTRAINT `research_method_scores_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `research_method_scores`
--

LOCK TABLES `research_method_scores` WRITE;
/*!40000 ALTER TABLE `research_method_scores` DISABLE KEYS */;
/*!40000 ALTER TABLE `research_method_scores` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rooms`
--

DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rooms` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rooms`
--

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
/*!40000 ALTER TABLE `rooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `science_groups`
--

DROP TABLE IF EXISTS `science_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `science_groups` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `science_groups`
--

LOCK TABLES `science_groups` WRITE;
/*!40000 ALTER TABLE `science_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `science_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_cpl_scores`
--

DROP TABLE IF EXISTS `student_cpl_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `student_cpl_scores` (
  `student_id` varchar(199) NOT NULL,
  `cpl_id` varchar(255) NOT NULL,
  `input_by` varchar(255) DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `input_at` datetime(3) DEFAULT NULL,
  `score` int(11) NOT NULL,
  `source` enum('SIA','manual') NOT NULL DEFAULT 'SIA',
  `status` enum('calculated','verified','finalized') NOT NULL DEFAULT 'calculated',
  `verified_at` datetime(3) DEFAULT NULL,
  `finalized_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`student_id`,`cpl_id`),
  KEY `student_cpl_scores_cpl_id_fkey` (`cpl_id`),
  KEY `student_cpl_scores_input_by_fkey` (`input_by`),
  KEY `student_cpl_scores_verified_by_fkey` (`verified_by`),
  CONSTRAINT `student_cpl_scores_cpl_id_fkey` FOREIGN KEY (`cpl_id`) REFERENCES `cpls` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `student_cpl_scores_input_by_fkey` FOREIGN KEY (`input_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `student_cpl_scores_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_cpl_scores`
--

LOCK TABLES `student_cpl_scores` WRITE;
/*!40000 ALTER TABLE `student_cpl_scores` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_cpl_scores` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_exit_survey_answers`
--

DROP TABLE IF EXISTS `student_exit_survey_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `student_exit_survey_answers` (
  `id` varchar(255) NOT NULL,
  `student_exit_survey_response_id` varchar(255) NOT NULL,
  `exit_survey_question_id` varchar(255) NOT NULL,
  `exit_survey_option_id` varchar(255) DEFAULT NULL,
  `answer_text` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `student_exit_survey_answers_response_id_fkey` (`student_exit_survey_response_id`),
  KEY `student_exit_survey_answers_question_id_fkey` (`exit_survey_question_id`),
  KEY `student_exit_survey_answers_option_id_fkey` (`exit_survey_option_id`),
  CONSTRAINT `student_exit_survey_answers_exit_survey_option_id_fkey` FOREIGN KEY (`exit_survey_option_id`) REFERENCES `exit_survey_options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `student_exit_survey_answers_exit_survey_question_id_fkey` FOREIGN KEY (`exit_survey_question_id`) REFERENCES `exit_survey_questions` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `student_exit_survey_answers_student_exit_survey_response_id_fkey` FOREIGN KEY (`student_exit_survey_response_id`) REFERENCES `student_exit_survey_responses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_exit_survey_answers`
--

LOCK TABLES `student_exit_survey_answers` WRITE;
/*!40000 ALTER TABLE `student_exit_survey_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_exit_survey_answers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_exit_survey_responses`
--

DROP TABLE IF EXISTS `student_exit_survey_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `student_exit_survey_responses` (
  `id` varchar(255) NOT NULL,
  `yudisium_id` varchar(255) NOT NULL,
  `thesis_id` varchar(255) NOT NULL,
  `submitted_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `student_exit_survey_responses_yudisium_id_fkey` (`yudisium_id`),
  KEY `student_exit_survey_responses_thesis_id_fkey` (`thesis_id`),
  CONSTRAINT `student_exit_survey_responses_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `student_exit_survey_responses_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_exit_survey_responses`
--

LOCK TABLES `student_exit_survey_responses` WRITE;
/*!40000 ALTER TABLE `student_exit_survey_responses` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_exit_survey_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `students`
--

DROP TABLE IF EXISTS `students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `students` (
  `user_id` varchar(191) NOT NULL,
  `student_status` enum('dropout','bss','lulus','mengundurkan_diri','active') NOT NULL DEFAULT 'active',
  `enrollment_year` int(11) DEFAULT NULL,
  `skscompleted` int(11) NOT NULL,
  `mandatory_courses_completed` tinyint(1) NOT NULL DEFAULT 0,
  `mkwu_completed` tinyint(1) NOT NULL DEFAULT 0,
  `internship_completed` tinyint(1) NOT NULL DEFAULT 0,
  `kkn_completed` tinyint(1) NOT NULL DEFAULT 0,
  `current_semester` int(11) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `idx_students_skscompleted` (`skscompleted`),
  CONSTRAINT `students_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `students`
--

LOCK TABLES `students` WRITE;
/*!40000 ALTER TABLE `students` DISABLE KEYS */;
INSERT INTO `students` VALUES ('024962c3-d306-4441-8980-d4c9c9eab68e','active',2022,120,0,0,0,0,NULL,'2026-03-02 20:43:40.469','2026-03-02 20:43:40.469'),('065bc1cc-008d-4d49-bd27-cbaf090bb229','active',2022,115,0,0,0,0,NULL,'2026-03-02 20:43:40.565','2026-03-02 20:43:40.565'),('092c95f0-0162-437a-ac0d-a2ff636262bd','active',2022,130,0,0,0,0,NULL,'2026-03-02 20:43:40.592','2026-03-02 20:43:40.592'),('2869c871-fc39-416e-8730-d8010f477828','active',2023,99,0,0,0,0,NULL,'2026-03-01 19:20:46.007','2026-03-01 19:20:46.007'),('34b7659f-d395-4aa0-9883-5dca32f81aa1','active',2022,137,0,0,0,0,NULL,'2026-03-01 19:20:45.908','2026-03-01 19:20:45.908'),('3783feea-3175-4e14-ba71-ae80e1c44fe3','active',NULL,110,1,1,0,0,6,'2026-03-03 21:09:17.419','2026-03-03 21:09:17.419'),('43a5790f-fbf0-4ba8-9ada-ee30b4193066','active',2022,125,0,0,0,0,NULL,'2026-03-01 19:20:45.987','2026-03-01 19:20:45.987'),('69466c98-cfad-401f-899d-cb60407f417b','active',2022,118,0,0,0,0,NULL,'2026-03-02 20:43:40.499','2026-03-02 20:43:40.499'),('6d823178-9b5e-4940-abd6-f5fd041b6787','active',2022,137,0,0,0,0,NULL,'2026-03-01 19:20:45.932','2026-03-01 19:20:45.932'),('6e157dc9-79f5-44ed-9c23-de44bd324201','active',2022,125,0,0,0,0,NULL,'2026-03-02 20:43:40.527','2026-03-02 20:43:40.527'),('81366a41-e085-4a48-9ff3-c1591e554899','active',NULL,110,1,1,0,0,6,'2026-03-03 21:09:17.320','2026-03-03 21:09:17.320'),('9412c5bf-4ad4-4017-9907-c308d3c8230f','active',2022,130,0,0,0,0,NULL,'2026-03-01 19:20:46.044','2026-03-01 19:20:46.044'),('946a4d6e-3a1e-46ca-87d1-f1679d3d20a9','active',2022,130,0,0,0,0,NULL,'2026-03-01 19:20:46.062','2026-03-01 19:20:46.062'),('95d6e523-30a0-48d9-9ea5-3c3264a8b103','active',2022,137,0,0,0,0,NULL,'2026-03-01 19:20:45.968','2026-03-01 19:20:45.968'),('97a7f8b9-a4a4-455e-aab4-b7d094dfbbac','active',2022,141,0,0,0,0,NULL,'2026-03-01 19:20:45.889','2026-03-01 19:20:45.889'),('98576802-374d-4dec-9e0c-0fdb0817a762','active',2022,137,0,0,0,0,NULL,'2026-03-01 19:20:45.950','2026-03-01 19:20:45.950'),('9938fd8e-74e3-4085-b893-c6765752751f','active',NULL,110,1,1,0,0,6,'2026-03-03 21:09:17.367','2026-03-03 21:09:17.367'),('996e0e05-02c7-4550-8314-779b084d109f','active',2022,130,0,0,0,0,NULL,'2026-03-01 19:20:46.080','2026-03-01 19:20:46.080'),('99718a65-cb21-4243-92da-d74620fa01e0','active',2024,60,0,0,0,0,NULL,'2026-03-01 19:20:46.026','2026-03-01 19:20:46.026'),('9a0ab8b3-2f14-4347-9b69-5dfd40f600f1','active',2022,137,0,0,0,0,NULL,'2026-03-01 19:20:45.865','2026-03-01 19:20:45.865'),('aa1652f7-958e-47e3-8554-7440d507a061','active',NULL,110,1,1,0,0,6,'2026-03-03 21:09:17.343','2026-03-03 21:09:17.343'),('cfcee288-cd64-4060-a7bb-1fe205dd9559','active',NULL,110,1,1,0,0,6,'2026-03-03 21:09:17.399','2026-03-03 21:09:17.399'),('d7cfebd6-0dab-4a06-aab4-b1a988c4aa10','active',2022,115,1,1,0,0,6,'2026-03-01 19:20:45.846','2026-03-04 08:43:45.388');
/*!40000 ALTER TABLE `students` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supervision_quota_defaults`
--

DROP TABLE IF EXISTS `supervision_quota_defaults`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supervision_quota_defaults` (
  `id` varchar(191) NOT NULL,
  `academic_year_id` varchar(191) NOT NULL,
  `quota_max` int(11) NOT NULL DEFAULT 10,
  `quota_soft_limit` int(11) NOT NULL DEFAULT 8,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `supervision_quota_defaults_academic_year_id_key` (`academic_year_id`),
  CONSTRAINT `supervision_quota_defaults_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supervision_quota_defaults`
--

LOCK TABLES `supervision_quota_defaults` WRITE;
/*!40000 ALTER TABLE `supervision_quota_defaults` DISABLE KEYS */;
/*!40000 ALTER TABLE `supervision_quota_defaults` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis`
--

DROP TABLE IF EXISTS `thesis`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis` (
  `id` varchar(191) NOT NULL,
  `rating` enum('ONGOING','SLOW','AT_RISK','FAILED','CANCELLED') NOT NULL DEFAULT 'ONGOING',
  `student_id` varchar(191) NOT NULL,
  `thesis_topic_id` varchar(191) DEFAULT NULL,
  `thesis_status_id` varchar(191) DEFAULT NULL,
  `academic_year_id` varchar(191) DEFAULT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `title` varchar(191) DEFAULT NULL,
  `start_date` datetime(3) DEFAULT NULL,
  `deadline_date` datetime(3) DEFAULT NULL,
  `final_thesis_document_id` varchar(191) DEFAULT NULL,
  `defence_requested_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `proposal_document_id` varchar(191) DEFAULT NULL,
  `proposal_status` enum('submitted','accepted','rejected') DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_academic_year_id_fkey` (`academic_year_id`),
  KEY `thesis_document_id_fkey` (`document_id`),
  KEY `thesis_final_thesis_document_id_fkey` (`final_thesis_document_id`),
  KEY `thesis_student_id_fkey` (`student_id`),
  KEY `thesis_thesis_status_id_fkey` (`thesis_status_id`),
  KEY `thesis_thesis_topic_id_fkey` (`thesis_topic_id`),
  KEY `thesis_proposal_document_id_fkey` (`proposal_document_id`),
  KEY `thesis_proposal_doc_id_fkey` (`proposal_document_id`),
  CONSTRAINT `thesis_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_final_thesis_document_id_fkey` FOREIGN KEY (`final_thesis_document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_proposal_document_id_fkey` FOREIGN KEY (`proposal_document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_thesis_status_id_fkey` FOREIGN KEY (`thesis_status_id`) REFERENCES `thesis_status` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_thesis_topic_id_fkey` FOREIGN KEY (`thesis_topic_id`) REFERENCES `thesis_topics` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis`
--

LOCK TABLES `thesis` WRITE;
/*!40000 ALTER TABLE `thesis` DISABLE KEYS */;
INSERT INTO `thesis` VALUES ('027f4707-f067-49bf-bcbd-02f2f220b6d1','ONGOING','092c95f0-0162-437a-ac0d-a2ff636262bd',NULL,'c979affa-3e3c-48a2-b677-c2e21548701a','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,NULL,'2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-02 20:43:40.599','2026-03-02 20:43:40.599',NULL,NULL),('0cf70d6c-3d55-4bf4-ba6a-723129d4f210','ONGOING','9412c5bf-4ad4-4017-9907-c308d3c8230f','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem E-Commerce Toko Online XYZ','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.204','2026-03-01 19:20:46.204',NULL,NULL),('24247892-8590-4d2d-a9b8-2e4765919296','ONGOING','97a7f8b9-a4a4-455e-aab4-b7d094dfbbac',NULL,'b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Informasi Beasiswa Non APBN','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.138','2026-03-01 19:20:46.138',NULL,NULL),('367dc87b-0692-4d0e-a2a4-782ae300bf7d','ONGOING','95d6e523-30a0-48d9-9ea5-3c3264a8b103',NULL,'b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Informasi Pengelolaan Proposal TA di DSI','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.189','2026-03-01 19:20:46.189',NULL,NULL),('49eba724-2f45-492c-b6e8-dfef906814e2','ONGOING','aa1652f7-958e-47e3-8554-7440d507a061','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Rancang Bangun Sistem Informasi Budi Santoso','2026-03-03 21:09:17.346',NULL,NULL,NULL,'2026-03-03 21:09:17.348','2026-03-03 21:09:17.348',NULL,NULL),('54377884-e020-4c2f-b4d5-adbc96dc6cdc','ONGOING','cfcee288-cd64-4060-a7bb-1fe205dd9559','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Rancang Bangun Sistem Informasi Dewi Saputri','2026-03-03 21:09:17.402',NULL,NULL,NULL,'2026-03-03 21:09:17.404','2026-03-03 21:09:17.404',NULL,NULL),('5c642f04-212f-4cbc-af8b-12564991451b','ONGOING','d7cfebd6-0dab-4a06-aab4-b1a988c4aa10','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Sistem Kerja Praktek di DSI','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.121','2026-03-04 08:43:45.467',NULL,'accepted'),('60a92d4c-71b8-415e-8ab2-f510d24354d3','ONGOING','946a4d6e-3a1e-46ca-87d1-f1679d3d20a9','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Reservasi Hotel ABC','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.221','2026-03-01 19:20:46.221',NULL,NULL),('6a6cae9c-2268-43d5-89f0-d78da6c5dc47','ONGOING','98576802-374d-4dec-9e0c-0fdb0817a762',NULL,'b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Informasi Generate Report di Dinas Radio Kota Padang','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.177','2026-03-01 19:20:46.177',NULL,NULL),('6ca84f19-1714-4843-aaeb-7511667a4525','ONGOING','6d823178-9b5e-4940-abd6-f5fd041b6787',NULL,'b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Informasi Management Kelompok Keilmuan di DSI','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.165','2026-03-01 19:20:46.165',NULL,NULL),('7274dd56-0051-4765-bec6-b7b9c6615d7b','ONGOING','065bc1cc-008d-4d49-bd27-cbaf090bb229',NULL,'c979affa-3e3c-48a2-b677-c2e21548701a','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,NULL,'2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-02 20:43:40.572','2026-03-02 20:43:40.572',NULL,NULL),('87a3fc83-eac9-4179-b2b7-0cab59aaea40','ONGOING','81366a41-e085-4a48-9ff3-c1591e554899','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Rancang Bangun Sistem Informasi Aditya Pratama','2026-03-03 21:09:17.323',NULL,NULL,NULL,'2026-03-03 21:09:17.326','2026-03-03 21:09:17.326',NULL,NULL),('93911cc7-1200-401b-be01-cfc2c957e985','ONGOING','3783feea-3175-4e14-ba71-ae80e1c44fe3','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Rancang Bangun Sistem Informasi Eka Wijaya','2026-03-03 21:09:17.421',NULL,NULL,NULL,'2026-03-03 21:09:17.424','2026-03-03 21:09:17.424',NULL,NULL),('aa4275f2-e555-4bf3-97d1-031bf2b06a91','ONGOING','9a0ab8b3-2f14-4347-9b69-5dfd40f600f1','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Monitoring Tugas Akhir di DSI','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.099','2026-03-01 19:20:46.099',NULL,NULL),('af27c9af-30ff-4a29-8beb-8a21aa4dcbec','ONGOING','9938fd8e-74e3-4085-b893-c6765752751f','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','c979affa-3e3c-48a2-b677-c2e21548701a','30045b60-b3e9-40ec-a6c4-df7fe5c5b541',NULL,'Rancang Bangun Sistem Informasi Citra Lestari','2026-03-03 21:09:17.376',NULL,NULL,NULL,'2026-03-03 21:09:17.378','2026-03-03 21:09:17.378',NULL,NULL),('bfa4756b-ff79-4612-9a27-fbb18074da3a','ONGOING','69466c98-cfad-401f-899d-cb60407f417b',NULL,'c979affa-3e3c-48a2-b677-c2e21548701a','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,NULL,'2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-02 20:43:40.507','2026-03-02 20:43:40.507',NULL,NULL),('d36c78bd-8dba-4cdf-8bda-c0a26a3d8743','ONGOING','6e157dc9-79f5-44ed-9c23-de44bd324201',NULL,'c979affa-3e3c-48a2-b677-c2e21548701a','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,NULL,'2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-02 20:43:40.538','2026-03-02 20:43:40.538',NULL,NULL),('dd38f3c7-7498-4dad-bb48-d39cf4e30c79','ONGOING','34b7659f-d395-4aa0-9883-5dca32f81aa1','43a43f50-50b9-41da-84a0-ecb3bbe5bad5','b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,'Sistem Informasi Manajemen Seminar Sidang dan Yudisium di DSI','2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-01 19:20:46.149','2026-03-01 19:20:46.149',NULL,NULL),('ee9ee9c3-2262-46a2-a4de-3721e62401e2','ONGOING','024962c3-d306-4441-8980-d4c9c9eab68e',NULL,'c979affa-3e3c-48a2-b677-c2e21548701a','4d1468cb-29ec-4234-a976-7dbc8b9e5275',NULL,NULL,'2025-08-01 00:00:00.000','2026-08-01 00:00:00.000',NULL,NULL,'2026-03-02 20:43:40.477','2026-03-02 20:43:40.477',NULL,NULL);
/*!40000 ALTER TABLE `thesis` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_advisor_request`
--

DROP TABLE IF EXISTS `thesis_advisor_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_advisor_request` (
  `id` varchar(255) NOT NULL,
  `student_id` varchar(199) NOT NULL,
  `lecturer_id` varchar(255) NOT NULL,
  `academic_year_id` varchar(255) NOT NULL,
  `topic_id` varchar(255) NOT NULL,
  `proposed_title` varchar(255) DEFAULT NULL,
  `background_summary` text DEFAULT NULL,
  `justification_text` text DEFAULT NULL,
  `status` enum('pending','escalated','approved','rejected','override_approved','redirected','withdrawn','assigned') NOT NULL DEFAULT 'pending',
  `rejection_reason` text DEFAULT NULL,
  `reviewed_by` varchar(255) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `kadep_notes` text DEFAULT NULL,
  `lecturer_responded_at` datetime(3) DEFAULT NULL,
  `redirected_to` varchar(255) DEFAULT NULL,
  `route_type` enum('normal','escalated') NOT NULL DEFAULT 'normal',
  `withdrawn_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_advisor_request_student_id_idx` (`student_id`),
  KEY `thesis_advisor_request_lecturer_id_idx` (`lecturer_id`),
  KEY `thesis_advisor_request_status_idx` (`status`),
  KEY `thesis_advisor_request_reviewed_by_idx` (`reviewed_by`),
  KEY `thesis_advisor_request_redirected_to_idx` (`redirected_to`),
  KEY `thesis_advisor_request_topic_id_fkey` (`topic_id`),
  KEY `thesis_advisor_request_academic_year_id_fkey` (`academic_year_id`),
  CONSTRAINT `thesis_advisor_request_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_redirected_to_fkey` FOREIGN KEY (`redirected_to`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_advisor_request`
--

LOCK TABLES `thesis_advisor_request` WRITE;
/*!40000 ALTER TABLE `thesis_advisor_request` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_advisor_request` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_change_request_approvals`
--

DROP TABLE IF EXISTS `thesis_change_request_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_change_request_approvals` (
  `id` varchar(191) NOT NULL,
  `request_id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_change_request_approvals_request_id_lecturer_id_key` (`request_id`,`lecturer_id`),
  KEY `thesis_change_request_approvals_lecturer_id_fkey` (`lecturer_id`),
  CONSTRAINT `thesis_change_request_approvals_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_change_request_approvals_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `thesis_change_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_change_request_approvals`
--

LOCK TABLES `thesis_change_request_approvals` WRITE;
/*!40000 ALTER TABLE `thesis_change_request_approvals` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_change_request_approvals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_change_requests`
--

DROP TABLE IF EXISTS `thesis_change_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_change_requests` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) DEFAULT NULL,
  `request_type` enum('topic','supervisor','both') NOT NULL,
  `reason` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` varchar(191) DEFAULT NULL,
  `review_notes` text DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_change_requests_reviewed_by_fkey` (`reviewed_by`),
  KEY `thesis_change_requests_thesis_id_fkey` (`thesis_id`),
  CONSTRAINT `thesis_change_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_change_requests_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_change_requests`
--

LOCK TABLES `thesis_change_requests` WRITE;
/*!40000 ALTER TABLE `thesis_change_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_change_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defence_documents`
--

DROP TABLE IF EXISTS `thesis_defence_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defence_documents` (
  `thesis_defence_id` varchar(255) NOT NULL,
  `document_type_id` varchar(255) NOT NULL,
  `document_id` varchar(255) NOT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `submitted_at` datetime(3) NOT NULL,
  `status` enum('submitted','approved','declined') NOT NULL DEFAULT 'submitted',
  `notes` text DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_defence_id`,`document_type_id`),
  KEY `thesis_defence_documents_verified_by_fkey` (`verified_by`),
  CONSTRAINT `thesis_defence_documents_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `thesis_defence_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defence_documents`
--

LOCK TABLES `thesis_defence_documents` WRITE;
/*!40000 ALTER TABLE `thesis_defence_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defence_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defence_examiner_assessment_details`
--

DROP TABLE IF EXISTS `thesis_defence_examiner_assessment_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defence_examiner_assessment_details` (
  `thesis_defence_examiner_id` varchar(255) NOT NULL,
  `assessment_criteria_id` varchar(255) NOT NULL,
  `score` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_defence_examiner_id`,`assessment_criteria_id`),
  KEY `thesis_defence_examiner_assessment_details_criteria_id_fkey` (`assessment_criteria_id`),
  CONSTRAINT `thesis_defence_examiner_assessment_details_assessment_crite_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_defence_examiner_assessment_details_thesis_defence_e_fkey` FOREIGN KEY (`thesis_defence_examiner_id`) REFERENCES `thesis_defence_examiners` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defence_examiner_assessment_details`
--

LOCK TABLES `thesis_defence_examiner_assessment_details` WRITE;
/*!40000 ALTER TABLE `thesis_defence_examiner_assessment_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defence_examiner_assessment_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defence_examiners`
--

DROP TABLE IF EXISTS `thesis_defence_examiners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defence_examiners` (
  `id` varchar(255) NOT NULL,
  `thesis_defence_id` varchar(255) NOT NULL,
  `lecturer_id` varchar(255) NOT NULL,
  `assigned_by` varchar(255) NOT NULL,
  `order` int(11) NOT NULL,
  `assigned_at` datetime(3) NOT NULL,
  `availability_status` enum('pending','available','unavailable') NOT NULL DEFAULT 'pending',
  `responded_at` datetime(3) DEFAULT NULL,
  `assessment_score` int(11) DEFAULT NULL,
  `assessment_submitted_at` datetime(3) DEFAULT NULL,
  `revision_notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_defence_examiners_thesis_defence_id_fkey` (`thesis_defence_id`),
  KEY `thesis_defence_examiners_lecturer_id_fkey` (`lecturer_id`),
  KEY `thesis_defence_examiners_assigned_by_fkey` (`assigned_by`),
  CONSTRAINT `thesis_defence_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_defence_examiners_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defence_examiners`
--

LOCK TABLES `thesis_defence_examiners` WRITE;
/*!40000 ALTER TABLE `thesis_defence_examiners` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defence_examiners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defence_revisions`
--

DROP TABLE IF EXISTS `thesis_defence_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defence_revisions` (
  `id` varchar(255) NOT NULL,
  `thesis_defence_examiner_id` varchar(255) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `description` text NOT NULL,
  `revision_action` text DEFAULT NULL,
  `is_finished` tinyint(1) NOT NULL DEFAULT 0,
  `student_submitted_at` datetime(3) DEFAULT NULL,
  `supervisor_approved_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_defence_revisions_defence_examiner_id_fkey` (`thesis_defence_examiner_id`),
  KEY `thesis_defence_revisions_approved_by_fkey` (`approved_by`),
  CONSTRAINT `thesis_defence_revisions_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `thesis_supervisors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_defence_revisions_thesis_defence_examiner_id_fkey` FOREIGN KEY (`thesis_defence_examiner_id`) REFERENCES `thesis_defence_examiners` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defence_revisions`
--

LOCK TABLES `thesis_defence_revisions` WRITE;
/*!40000 ALTER TABLE `thesis_defence_revisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defence_revisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defence_supervisor_assessment_details`
--

DROP TABLE IF EXISTS `thesis_defence_supervisor_assessment_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defence_supervisor_assessment_details` (
  `thesis_defence_id` varchar(255) NOT NULL,
  `assessment_criteria_id` varchar(255) NOT NULL,
  `score` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_defence_id`,`assessment_criteria_id`),
  KEY `thesis_defence_supervisor_assessment_details_criteria_id_fkey` (`assessment_criteria_id`),
  CONSTRAINT `thesis_defence_supervisor_assessment_details_assessment_cri_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_defence_supervisor_assessment_details_thesis_defence_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defence_supervisor_assessment_details`
--

LOCK TABLES `thesis_defence_supervisor_assessment_details` WRITE;
/*!40000 ALTER TABLE `thesis_defence_supervisor_assessment_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defence_supervisor_assessment_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_defences`
--

DROP TABLE IF EXISTS `thesis_defences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_defences` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `room_id` varchar(191) DEFAULT NULL,
  `registered_at` datetime(3) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `meeting_link` varchar(255) DEFAULT NULL,
  `status` enum('registered','verified','examiner_assigned','scheduled','passed','passed_with_revision','failed','cancelled') NOT NULL DEFAULT 'registered',
  `examiner_average_score` double DEFAULT NULL,
  `supervisor_score` double DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `result_finalized_at` datetime(3) DEFAULT NULL,
  `cancelled_reason` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_defences_thesis_id_fkey` (`thesis_id`),
  KEY `thesis_defences_room_id_fkey` (`room_id`),
  CONSTRAINT `thesis_defences_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_defences_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_defences`
--

LOCK TABLES `thesis_defences` WRITE;
/*!40000 ALTER TABLE `thesis_defences` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_defences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_guidance_milestones`
--

DROP TABLE IF EXISTS `thesis_guidance_milestones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_guidance_milestones` (
  `guidance_id` varchar(191) NOT NULL,
  `milestone_id` varchar(191) NOT NULL,
  PRIMARY KEY (`guidance_id`,`milestone_id`),
  KEY `thesis_guidance_milestones_milestone_id_idx` (`milestone_id`),
  CONSTRAINT `thesis_guidance_milestones_guidance_id_fkey` FOREIGN KEY (`guidance_id`) REFERENCES `thesis_guidances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `thesis_guidance_milestones_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_guidance_milestones`
--

LOCK TABLES `thesis_guidance_milestones` WRITE;
/*!40000 ALTER TABLE `thesis_guidance_milestones` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_guidance_milestones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_guidances`
--

DROP TABLE IF EXISTS `thesis_guidances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_guidances` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `supervisor_id` varchar(191) DEFAULT NULL,
  `requested_date` datetime(3) NOT NULL,
  `approved_date` datetime(3) DEFAULT NULL,
  `duration` int(11) NOT NULL DEFAULT 60,
  `document_url` varchar(191) DEFAULT NULL,
  `student_notes` text DEFAULT NULL,
  `supervisor_feedback` text DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `session_summary` text DEFAULT NULL,
  `action_items` text DEFAULT NULL,
  `summary_submitted_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `status` enum('requested','accepted','rejected','summary_pending','completed','cancelled','deleted') NOT NULL DEFAULT 'requested',
  `student_calendar_event_id` varchar(191) DEFAULT NULL,
  `supervisor_calendar_event_id` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_guidances_thesis_id_idx` (`thesis_id`),
  KEY `thesis_guidances_supervisor_id_fkey` (`supervisor_id`),
  CONSTRAINT `thesis_guidances_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_guidances_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_guidances`
--

LOCK TABLES `thesis_guidances` WRITE;
/*!40000 ALTER TABLE `thesis_guidances` DISABLE KEYS */;
INSERT INTO `thesis_guidances` VALUES ('2055c223-e3c0-4477-886c-dd0d936709ff','aa4275f2-e555-4bf3-97d1-031bf2b06a91','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-10-22 03:00:00.000','2025-10-22 03:00:00.000',60,NULL,'Review referensi dan literatur','Bagus, metodologi sudah jelas. Pastikan diagram alir lengkap.',NULL,'Bimbingan membahas review referensi dan literatur. Progress sesuai jadwal.',NULL,NULL,'2025-10-22 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.383','2026-03-01 19:20:46.383'),('3e8afedf-6d69-410f-afa0-86c66ced7571','5c642f04-212f-4cbc-af8b-12564991451b','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-10-29 03:00:00.000','2025-10-29 03:00:00.000',60,NULL,'Review progress BAB II','Bagus, metodologi sudah jelas. Pastikan diagram alir lengkap.',NULL,'Bimbingan membahas review progress bab ii. Progress sesuai jadwal.',NULL,NULL,'2025-10-29 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.438','2026-03-01 19:20:46.438'),('472cd6cd-c629-40a8-b540-0d6839f3df13','aa4275f2-e555-4bf3-97d1-031bf2b06a91','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-09-08 03:00:00.000','2025-09-08 03:00:00.000',60,NULL,'Review BAB I - Pendahuluan','Progress bagus. Tambahkan referensi jurnal internasional minimal 5 paper.',NULL,'Bimbingan membahas review bab i - pendahuluan. Progress sesuai jadwal.',NULL,NULL,'2025-09-08 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.373','2026-03-01 19:20:46.373'),('6d7b7ad7-4d77-4a00-a38e-ae7d4766e91b','aa4275f2-e555-4bf3-97d1-031bf2b06a91','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-11-12 03:00:00.000','2025-11-12 03:00:00.000',60,NULL,'Konsultasi BAB III - Metodologi','Sudah on track. Fokus pada implementasi fitur utama terlebih dahulu.',NULL,'Bimbingan membahas konsultasi bab iii - metodologi. Progress sesuai jadwal.',NULL,NULL,'2025-11-12 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.388','2026-03-01 19:20:46.388'),('7c060ebe-c42a-47bd-95a1-a1c5287dfbf9','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-20 03:00:00.000','2025-08-20 03:00:00.000',60,NULL,'Konsultasi judul sistem seminar sidang yudisium','Sudah baik, lanjutkan ke tahap berikutnya. Perhatikan konsistensi penulisan.',NULL,'Bimbingan membahas konsultasi judul sistem seminar sidang yudisium. Progress sesuai jadwal.',NULL,NULL,'2025-08-20 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.394','2026-03-01 19:20:46.394'),('a832e16f-13b0-4761-8773-e1aa25ce4b43','aa4275f2-e555-4bf3-97d1-031bf2b06a91','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-10-01 03:00:00.000','2025-10-01 03:00:00.000',60,NULL,'Konsultasi BAB II - Tinjauan Pustaka','Sudah sesuai dengan arahan. Perbaiki format penulisan sesuai pedoman.',NULL,'Bimbingan membahas konsultasi bab ii - tinjauan pustaka. Progress sesuai jadwal.',NULL,NULL,'2025-10-01 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.377','2026-03-01 19:20:46.377'),('b0cc8297-84b0-4dcc-80a4-24448769c500','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-10-24 03:00:00.000','2025-10-24 03:00:00.000',60,NULL,'Review diagram sistem','Bagus, metodologi sudah jelas. Pastikan diagram alir lengkap.',NULL,'Bimbingan membahas review diagram sistem. Progress sesuai jadwal.',NULL,NULL,'2025-10-24 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.410','2026-03-01 19:20:46.410'),('b291cc19-04d3-4d04-b840-389a30538892','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-09-10 03:00:00.000','2025-09-10 03:00:00.000',60,NULL,'Review BAB I - Latar belakang masalah','Progress bagus. Tambahkan referensi jurnal internasional minimal 5 paper.',NULL,'Bimbingan membahas review bab i - latar belakang masalah. Progress sesuai jadwal.',NULL,NULL,'2025-09-10 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.400','2026-03-01 19:20:46.400'),('b2d05f1d-5d93-48de-9185-b088f8b89df3','5c642f04-212f-4cbc-af8b-12564991451b','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-25 03:00:00.000','2025-08-25 03:00:00.000',60,NULL,'Konsultasi judul sistem kerja praktek','Sudah baik, lanjutkan ke tahap berikutnya. Perhatikan konsistensi penulisan.',NULL,'Bimbingan membahas konsultasi judul sistem kerja praktek. Progress sesuai jadwal.',NULL,NULL,'2025-08-25 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.422','2026-03-01 19:20:46.422'),('b7b65e50-64b3-48cd-936a-c14c623541a1','aa4275f2-e555-4bf3-97d1-031bf2b06a91','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-18 03:00:00.000','2025-08-18 03:00:00.000',60,NULL,'Konsultasi judul dan outline proposal','Sudah baik, lanjutkan ke tahap berikutnya. Perhatikan konsistensi penulisan.',NULL,'Bimbingan membahas konsultasi judul dan outline proposal. Progress sesuai jadwal.',NULL,NULL,'2025-08-18 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.366','2026-03-01 19:20:46.366'),('d4b21c5e-37d8-4882-87d9-867f8ec7cf3e','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-10-03 03:00:00.000','2025-10-03 03:00:00.000',60,NULL,'Konsultasi BAB II - Dasar teori','Sudah sesuai dengan arahan. Perbaiki format penulisan sesuai pedoman.',NULL,'Bimbingan membahas konsultasi bab ii - dasar teori. Progress sesuai jadwal.',NULL,NULL,'2025-10-03 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.405','2026-03-01 19:20:46.405'),('e259d06a-c279-4228-846f-c74e4ee99972','5c642f04-212f-4cbc-af8b-12564991451b','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-10-08 03:00:00.000','2025-10-08 03:00:00.000',60,NULL,'Konsultasi BAB II - Tinjauan Pustaka','Sudah sesuai dengan arahan. Perbaiki format penulisan sesuai pedoman.',NULL,'Bimbingan membahas konsultasi bab ii - tinjauan pustaka. Progress sesuai jadwal.',NULL,NULL,'2025-10-08 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.433','2026-03-01 19:20:46.433'),('ebdde8c1-2b8d-4d76-99a3-c09d4ed687f5','5c642f04-212f-4cbc-af8b-12564991451b','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','2025-09-15 03:00:00.000','2025-09-15 03:00:00.000',60,NULL,'Review BAB I - Pendahuluan','Progress bagus. Tambahkan referensi jurnal internasional minimal 5 paper.',NULL,'Bimbingan membahas review bab i - pendahuluan. Progress sesuai jadwal.',NULL,NULL,'2025-09-15 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.427','2026-03-01 19:20:46.427'),('fe8c74a4-1fa9-4d8a-bf5b-dda96daf05bd','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-11-14 03:00:00.000','2025-11-14 03:00:00.000',60,NULL,'Konsultasi progress BAB III','Sudah on track. Fokus pada implementasi fitur utama terlebih dahulu.',NULL,'Bimbingan membahas konsultasi progress bab iii. Progress sesuai jadwal.',NULL,NULL,'2025-11-14 04:00:00.000','completed',NULL,NULL,'2026-03-01 19:20:46.415','2026-03-01 19:20:46.415');
/*!40000 ALTER TABLE `thesis_guidances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_milestone_assessment_details`
--

DROP TABLE IF EXISTS `thesis_milestone_assessment_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_milestone_assessment_details` (
  `id` varchar(191) NOT NULL,
  `milestone_id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `rubric_id` varchar(191) DEFAULT NULL,
  `score` int(11) NOT NULL,
  `notes` text DEFAULT NULL,
  `assessed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_milestone_assessment_details_milestone_id_idx` (`milestone_id`),
  KEY `thesis_milestone_assessment_details_lecturer_id_idx` (`lecturer_id`),
  KEY `thesis_milestone_assessment_details_rubric_id_fkey` (`rubric_id`),
  CONSTRAINT `thesis_milestone_assessment_details_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_milestone_assessment_details_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `thesis_milestone_assessment_details_rubric_id_fkey` FOREIGN KEY (`rubric_id`) REFERENCES `assessment_rubrics` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_milestone_assessment_details`
--

LOCK TABLES `thesis_milestone_assessment_details` WRITE;
/*!40000 ALTER TABLE `thesis_milestone_assessment_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_milestone_assessment_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_milestone_documents`
--

DROP TABLE IF EXISTS `thesis_milestone_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_milestone_documents` (
  `id` varchar(191) NOT NULL,
  `milestone_id` varchar(191) NOT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `file_name` varchar(191) DEFAULT NULL,
  `file_size` int(11) DEFAULT NULL,
  `mime_type` varchar(191) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `is_latest` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `thesis_milestone_documents_milestone_id_idx` (`milestone_id`),
  CONSTRAINT `thesis_milestone_documents_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_milestone_documents`
--

LOCK TABLES `thesis_milestone_documents` WRITE;
/*!40000 ALTER TABLE `thesis_milestone_documents` DISABLE KEYS */;
INSERT INTO `thesis_milestone_documents` VALUES ('f7701c34-1691-4a59-b9a7-5cfffa20e51a','47687706-e207-410d-aa51-7ce7a8afe47f',NULL,'uploads/metopen/submissions/47687706-e207-410d-aa51-7ce7a8afe47f/mmbrt7qt-royce1970.pdf','royce1970.pdf',439063,'application/pdf',NULL,1,1,'2026-03-04 08:24:22.147');
/*!40000 ALTER TABLE `thesis_milestone_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_milestone_templates`
--

DROP TABLE IF EXISTS `thesis_milestone_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_milestone_templates` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `topic_id` varchar(191) DEFAULT NULL,
  `order_index` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `default_due_days` int(11) DEFAULT NULL,
  `is_gate_to_advisor_search` tinyint(1) NOT NULL DEFAULT 0,
  `phase` varchar(191) NOT NULL DEFAULT 'metopen',
  `weight_percentage` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_milestone_templates_topic_id_fkey` (`topic_id`),
  KEY `thesis_milestone_templates_phase_idx` (`phase`),
  CONSTRAINT `thesis_milestone_templates_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_milestone_templates`
--

LOCK TABLES `thesis_milestone_templates` WRITE;
/*!40000 ALTER TABLE `thesis_milestone_templates` DISABLE KEYS */;
INSERT INTO `thesis_milestone_templates` VALUES ('2015a773-bef5-4da8-bb57-cf26fa72e995','Bab 1','es',NULL,0,1,'2026-03-02 21:10:00.505','2026-03-05 17:38:41.739',NULL,0,'metopen',12),('e9e16d02-08b0-4ade-9a04-f7b13a45ceee','Latar Belakang','test',NULL,1,1,'2026-03-03 15:23:51.854','2026-03-03 15:23:51.854',NULL,0,'metopen',15);
/*!40000 ALTER TABLE `thesis_milestone_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_milestones`
--

DROP TABLE IF EXISTS `thesis_milestones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_milestones` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `order_index` int(11) NOT NULL DEFAULT 0,
  `target_date` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `status` enum('not_started','in_progress','pending_review','revision_needed','completed','deleted') NOT NULL DEFAULT 'not_started',
  `progress_percentage` int(11) NOT NULL DEFAULT 0,
  `validated_by` varchar(191) DEFAULT NULL,
  `validated_at` datetime(3) DEFAULT NULL,
  `supervisor_notes` text DEFAULT NULL,
  `student_notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `assessed_at` datetime(3) DEFAULT NULL,
  `assessed_by` varchar(191) DEFAULT NULL,
  `feedback` text DEFAULT NULL,
  `milestone_template_id` varchar(191) DEFAULT NULL,
  `submitted_at` datetime(3) DEFAULT NULL,
  `total_score` int(11) DEFAULT NULL,
  `metopen_class_id` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_milestones_thesis_id_order_index_idx` (`thesis_id`,`order_index`),
  KEY `thesis_milestones_thesis_id_status_idx` (`thesis_id`,`status`),
  KEY `thesis_milestones_milestone_template_id_idx` (`milestone_template_id`),
  KEY `thesis_milestones_metopen_class_id_idx` (`metopen_class_id`),
  CONSTRAINT `thesis_milestones_metopen_class_id_fkey` FOREIGN KEY (`metopen_class_id`) REFERENCES `metopen_classes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_milestones_milestone_template_id_fkey` FOREIGN KEY (`milestone_template_id`) REFERENCES `thesis_milestone_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_milestones_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_milestones`
--

LOCK TABLES `thesis_milestones` WRITE;
/*!40000 ALTER TABLE `thesis_milestones` DISABLE KEYS */;
INSERT INTO `thesis_milestones` VALUES ('0785d973-e039-45bd-83a9-095529113a61','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','BAB III - Metodologi','Metodologi penelitian dan perancangan sistem',3,'2026-03-03 23:07:49.012','2025-10-02 00:00:00.000','2025-10-27 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-10-27 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.343','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('0c183e20-6f94-4cca-82e7-0d4d256f9218','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','BAB V - Pengujian & Kesimpulan','Pengujian sistem, analisis hasil, dan kesimpulan',5,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.354','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('174965d1-13bd-4b37-a6f0-1152ab8492c9','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','BAB II - Tinjauan Pustaka','Dasar teori dan penelitian terkait',2,'2026-03-03 23:07:49.012','2025-09-01 00:00:00.000','2025-09-26 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-09-26 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.337','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('1bddf608-a805-48d6-9a4b-983354c3cc74','aa4275f2-e555-4bf3-97d1-031bf2b06a91','BAB II - Tinjauan Pustaka','Dasar teori dan penelitian terkait',2,'2026-03-03 23:07:49.012','2025-09-01 00:00:00.000','2025-09-26 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-09-26 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.249','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('1f91208c-3b93-49e6-8e68-02ab5e051eb1','5c642f04-212f-4cbc-af8b-12564991451b','BAB II - Tinjauan Pustaka','Dasar teori dan penelitian terkait',2,'2026-03-03 23:07:49.012','2025-09-01 00:00:00.000','2025-09-26 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-09-26 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.285','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('2f7110b3-3dc6-4539-9ebe-0921ab4c9fe9','5c642f04-212f-4cbc-af8b-12564991451b','Pengajuan Judul & BAB I','Judul tugas akhir dan pendahuluan (latar belakang, rumusan masalah, tujuan)',1,'2026-03-03 23:07:49.012','2025-08-02 00:00:00.000','2025-08-27 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-27 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.280','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('41fd76af-cf60-4f82-8a60-c3c91eadd049','aa4275f2-e555-4bf3-97d1-031bf2b06a91','BAB V - Pengujian & Kesimpulan','Pengujian sistem, analisis hasil, dan kesimpulan',5,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.273','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('47687706-e207-410d-aa51-7ce7a8afe47f','5c642f04-212f-4cbc-af8b-12564991451b','Bab 1','es',0,'2026-03-05 17:00:00.000',NULL,'2026-03-04 08:25:00.811','completed',100,NULL,NULL,NULL,'Bagus','2026-03-04 08:23:54.749','2026-03-04 08:25:00.812','2026-03-04 08:25:00.811','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','Bagus','2015a773-bef5-4da8-bb57-cf26fa72e995','2026-03-04 08:24:22.130',0,NULL),('4c52efc2-5e01-4a99-9aa6-c7c0b532e417','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','Pengajuan Judul & BAB I','Judul tugas akhir dan pendahuluan (latar belakang, rumusan masalah, tujuan)',1,'2026-03-03 23:07:49.012','2025-08-02 00:00:00.000','2025-08-27 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-27 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.329','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('4e25b1ed-c514-4f6e-bf00-fae0f62a0133','aa4275f2-e555-4bf3-97d1-031bf2b06a91','BAB IV - Implementasi','Implementasi sistem dan coding',4,'2026-03-03 23:07:49.012','2025-11-15 00:00:00.000','2025-12-10 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-12-10 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.268','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('4f3e026e-bdfa-49c8-9353-613b2f96db8c','aa4275f2-e555-4bf3-97d1-031bf2b06a91','BAB III - Metodologi','Metodologi penelitian dan perancangan sistem',3,'2026-03-03 23:07:49.012','2025-10-02 00:00:00.000','2025-10-27 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-10-27 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.263','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('507e4780-3f29-4ade-bee0-7734b697ec7a','5c642f04-212f-4cbc-af8b-12564991451b','BAB III - Metodologi','Metodologi penelitian dan perancangan sistem',3,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.294','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('807ce662-2e13-48a4-b083-bc99053a945a','5c642f04-212f-4cbc-af8b-12564991451b','BAB IV - Implementasi','Implementasi sistem dan coding',4,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.301','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('9324e25d-c60a-49d4-9c79-4094165ca360','5c642f04-212f-4cbc-af8b-12564991451b','BAB V - Pengujian & Kesimpulan','Pengujian sistem, analisis hasil, dan kesimpulan',5,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.319','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('ddd5447d-98c1-423c-8686-d50f8ead7535','aa4275f2-e555-4bf3-97d1-031bf2b06a91','Pengajuan Judul & BAB I','Judul tugas akhir dan pendahuluan (latar belakang, rumusan masalah, tujuan)',1,'2026-03-03 23:07:49.012','2025-08-02 00:00:00.000','2025-08-27 00:00:00.000','completed',100,'1c9f963e-bda5-4ac1-8854-8d36efdc43ea','2025-08-27 00:00:00.000','Milestone sudah selesai dengan baik',NULL,'2026-03-01 19:20:46.243','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('f836cd97-1f71-4bb9-8f62-7b0e5b2f4cd7','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','BAB IV - Implementasi','Implementasi sistem dan coding',4,'2026-03-03 23:07:49.012',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.348','2026-03-03 23:07:49.050',NULL,NULL,NULL,NULL,NULL,NULL,NULL),('fb716207-e313-405a-b7ff-6ce9a3701fa6','5c642f04-212f-4cbc-af8b-12564991451b','Latar Belakang','test',0,'2026-03-06 17:00:00.000',NULL,NULL,'not_started',0,NULL,NULL,NULL,NULL,'2026-03-04 08:45:52.262','2026-03-04 08:45:52.262',NULL,NULL,NULL,'e9e16d02-08b0-4ade-9a04-f7b13a45ceee',NULL,NULL,NULL);
/*!40000 ALTER TABLE `thesis_milestones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminar_audiences`
--

DROP TABLE IF EXISTS `thesis_seminar_audiences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminar_audiences` (
  `thesis_seminar_id` varchar(255) NOT NULL,
  `student_id` varchar(255) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `registered_at` datetime(3) DEFAULT NULL,
  `is_present` tinyint(1) NOT NULL DEFAULT 0,
  `approved_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_seminar_id`,`student_id`),
  KEY `thesis_seminar_audiences_student_id_fkey` (`student_id`),
  KEY `thesis_seminar_audiences_approved_by_fkey` (`approved_by`),
  CONSTRAINT `thesis_seminar_audiences_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `thesis_supervisors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_audiences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_audiences_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminar_audiences`
--

LOCK TABLES `thesis_seminar_audiences` WRITE;
/*!40000 ALTER TABLE `thesis_seminar_audiences` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminar_audiences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminar_documents`
--

DROP TABLE IF EXISTS `thesis_seminar_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminar_documents` (
  `thesis_seminar_id` varchar(255) NOT NULL,
  `document_type_id` varchar(255) NOT NULL,
  `document_id` varchar(255) NOT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `submitted_at` datetime(3) NOT NULL,
  `status` enum('submitted','approved','declined') NOT NULL DEFAULT 'submitted',
  `notes` text DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_seminar_id`,`document_type_id`),
  KEY `thesis_seminar_documents_verified_by_fkey` (`verified_by`),
  CONSTRAINT `thesis_seminar_documents_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminar_documents`
--

LOCK TABLES `thesis_seminar_documents` WRITE;
/*!40000 ALTER TABLE `thesis_seminar_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminar_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminar_examiner_assessment_details`
--

DROP TABLE IF EXISTS `thesis_seminar_examiner_assessment_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminar_examiner_assessment_details` (
  `thesis_seminar_examiner_id` varchar(255) NOT NULL,
  `assessment_criteria_id` varchar(255) NOT NULL,
  `score` int(11) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`thesis_seminar_examiner_id`,`assessment_criteria_id`),
  KEY `thesis_seminar_examiner_assessment_details_criteria_id_fkey` (`assessment_criteria_id`),
  CONSTRAINT `thesis_seminar_examiner_assessment_details_assessment_crite_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_examiner_assessment_details_thesis_seminar_e_fkey` FOREIGN KEY (`thesis_seminar_examiner_id`) REFERENCES `thesis_seminar_examiners` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminar_examiner_assessment_details`
--

LOCK TABLES `thesis_seminar_examiner_assessment_details` WRITE;
/*!40000 ALTER TABLE `thesis_seminar_examiner_assessment_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminar_examiner_assessment_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminar_examiners`
--

DROP TABLE IF EXISTS `thesis_seminar_examiners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminar_examiners` (
  `id` varchar(255) NOT NULL,
  `thesis_seminar_id` varchar(255) NOT NULL,
  `lecturer_id` varchar(255) NOT NULL,
  `assigned_by` varchar(255) NOT NULL,
  `order` int(11) NOT NULL,
  `assigned_at` datetime(3) NOT NULL,
  `availability_status` enum('pending','available','unavailable') NOT NULL DEFAULT 'pending',
  `responded_at` datetime(3) DEFAULT NULL,
  `assessment_score` int(11) DEFAULT NULL,
  `assessment_submitted_at` datetime(3) DEFAULT NULL,
  `revision_notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_seminar_examiners_thesis_seminar_id_fkey` (`thesis_seminar_id`),
  KEY `thesis_seminar_examiners_lecturer_id_fkey` (`lecturer_id`),
  KEY `thesis_seminar_examiners_assigned_by_fkey` (`assigned_by`),
  CONSTRAINT `thesis_seminar_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_examiners_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminar_examiners`
--

LOCK TABLES `thesis_seminar_examiners` WRITE;
/*!40000 ALTER TABLE `thesis_seminar_examiners` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminar_examiners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminar_revisions`
--

DROP TABLE IF EXISTS `thesis_seminar_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminar_revisions` (
  `id` varchar(255) NOT NULL,
  `thesis_seminar_examiner_id` varchar(255) NOT NULL,
  `approved_by` varchar(255) DEFAULT NULL,
  `description` text NOT NULL,
  `revision_action` text DEFAULT NULL,
  `is_finished` tinyint(1) NOT NULL DEFAULT 0,
  `student_submitted_at` datetime(3) DEFAULT NULL,
  `supervisor_approved_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_seminar_revisions_seminar_examiner_id_fkey` (`thesis_seminar_examiner_id`),
  KEY `thesis_seminar_revisions_approved_by_fkey` (`approved_by`),
  CONSTRAINT `thesis_seminar_revisions_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `thesis_supervisors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminar_revisions_thesis_seminar_examiner_id_fkey` FOREIGN KEY (`thesis_seminar_examiner_id`) REFERENCES `thesis_seminar_examiners` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminar_revisions`
--

LOCK TABLES `thesis_seminar_revisions` WRITE;
/*!40000 ALTER TABLE `thesis_seminar_revisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminar_revisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_seminars`
--

DROP TABLE IF EXISTS `thesis_seminars`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_seminars` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `room_id` varchar(191) DEFAULT NULL,
  `registered_at` datetime(3) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `meeting_link` varchar(255) DEFAULT NULL,
  `status` enum('registered','verified','examiner_assigned','scheduled','passed','passed_with_revision','failed','cancelled') NOT NULL DEFAULT 'registered',
  `grade` varchar(10) DEFAULT NULL,
  `result_finalized_at` datetime(3) DEFAULT NULL,
  `cancelled_reason` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_seminars_thesis_id_fkey` (`thesis_id`),
  KEY `thesis_seminars_room_id_fkey` (`room_id`),
  CONSTRAINT `thesis_seminars_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_seminars_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_seminars`
--

LOCK TABLES `thesis_seminars` WRITE;
/*!40000 ALTER TABLE `thesis_seminars` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_seminars` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_status`
--

DROP TABLE IF EXISTS `thesis_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_status` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_status`
--

LOCK TABLES `thesis_status` WRITE;
/*!40000 ALTER TABLE `thesis_status` DISABLE KEYS */;
INSERT INTO `thesis_status` VALUES ('0e413fbc-a44c-4fb5-b7db-591ea0cb92d6','Revisi Seminar'),('32b91684-69f6-418b-ac34-f873069e0362','Gagal'),('34000fb4-b128-4b00-993b-c798754966bd','Sidang'),('398e111c-b73d-4ccd-88ac-44e07b4cd4f0','Seminar Proposal'),('7e701377-ea9c-476f-8788-e5b4b37d6916','Pengajuan Judul'),('929fb094-d762-4a97-850a-d068399700f8','Revisi Sidang'),('b6ae44c6-f27b-4fa7-9290-13f970d5bbaa','Bimbingan'),('c979affa-3e3c-48a2-b677-c2e21548701a','Metopel'),('dd92b1bf-803a-47e4-a01e-b76579823749','Selesai'),('fb693a20-a4e6-4ca6-a170-c5fa3692cc33','Acc Seminar');
/*!40000 ALTER TABLE `thesis_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_supervisors`
--

DROP TABLE IF EXISTS `thesis_supervisors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_supervisors` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `lecturer_id` varchar(191) NOT NULL,
  `role_id` varchar(191) NOT NULL,
  `seminar_ready` tinyint(1) NOT NULL DEFAULT 0,
  `defence_ready` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_participants_lecturer_id_fkey` (`lecturer_id`),
  KEY `thesis_participants_role_id_fkey` (`role_id`),
  KEY `thesis_participants_thesis_id_fkey` (`thesis_id`),
  CONSTRAINT `thesis_supervisors_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_supervisors_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `user_roles` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `thesis_supervisors_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_supervisors`
--

LOCK TABLES `thesis_supervisors` WRITE;
/*!40000 ALTER TABLE `thesis_supervisors` DISABLE KEYS */;
INSERT INTO `thesis_supervisors` VALUES ('0737d568-20e2-424c-8fa1-52acde7eb1af','5c642f04-212f-4cbc-af8b-12564991451b','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.131','2026-03-01 19:20:46.131'),('40bf6c33-bffa-401c-898a-01bbcab41e87','60a92d4c-71b8-415e-8ab2-f510d24354d3','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.230','2026-03-01 19:20:46.230'),('4f2806c1-8ae4-451f-88c3-8ecc48d8c17a','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.155','2026-03-01 19:20:46.155'),('66ee7caa-b79a-4941-94d4-665c5907c848','0cf70d6c-3d55-4bf4-ba6a-723129d4f210','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.209','2026-03-01 19:20:46.209'),('950e71a9-7dd1-4173-8934-14cc8cf7b97e','6a6cae9c-2268-43d5-89f0-d78da6c5dc47','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.182','2026-03-01 19:20:46.182'),('9b98ccd5-9961-42a6-9824-3a539bff2fe5','aa4275f2-e555-4bf3-97d1-031bf2b06a91','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.114','2026-03-01 19:20:46.114'),('a25d4438-fbc0-42e3-aaf6-841aecbaffb4','0cf70d6c-3d55-4bf4-ba6a-723129d4f210','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.214','2026-03-01 19:20:46.214'),('af2fcbbd-e90b-428c-997e-3747ff6b3b07','367dc87b-0692-4d0e-a2a4-782ae300bf7d','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.198','2026-03-01 19:20:46.198'),('c59a9e3d-78cf-47cc-83f7-5370b61e2d40','60a92d4c-71b8-415e-8ab2-f510d24354d3','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.225','2026-03-01 19:20:46.225'),('d4cad396-cc18-47a1-acd0-56d5f22619ef','6ca84f19-1714-4843-aaeb-7511667a4525','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.171','2026-03-01 19:20:46.171'),('d87a2359-9f48-4ee0-ad7c-f3b16cdfe34d','aa4275f2-e555-4bf3-97d1-031bf2b06a91','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.107','2026-03-01 19:20:46.107'),('d910e726-1510-46fc-abaf-f4ae820ca64b','5c642f04-212f-4cbc-af8b-12564991451b','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.126','2026-03-01 19:20:46.126'),('d9c9182d-cacc-4f22-83de-9e0e5943301d','dd38f3c7-7498-4dad-bb48-d39cf4e30c79','7db4fc9d-b084-445c-acd6-bafc95bcf6e3','9d81cc56-6359-44a2-aa68-33340aa16a47',0,0,'2026-03-01 19:20:46.159','2026-03-01 19:20:46.159'),('f085e89b-a56b-489c-b748-957a8a867703','24247892-8590-4d2d-a9b8-2e4765919296','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.143','2026-03-01 19:20:46.143'),('fd55c7cd-e96b-4cc7-a22e-353a0d8e12b8','367dc87b-0692-4d0e-a2a4-782ae300bf7d','1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389',0,0,'2026-03-01 19:20:46.193','2026-03-01 19:20:46.193');
/*!40000 ALTER TABLE `thesis_supervisors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_topics`
--

DROP TABLE IF EXISTS `thesis_topics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thesis_topics` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_topics`
--

LOCK TABLES `thesis_topics` WRITE;
/*!40000 ALTER TABLE `thesis_topics` DISABLE KEYS */;
INSERT INTO `thesis_topics` VALUES ('43a43f50-50b9-41da-84a0-ecb3bbe5bad5','Pengembangan Sistem (Enterprise Application)','2026-03-01 19:20:46.090','2026-03-01 19:20:46.090');
/*!40000 ALTER TABLE `thesis_topics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_has_roles`
--

DROP TABLE IF EXISTS `user_has_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_has_roles` (
  `user_id` varchar(191) NOT NULL,
  `role_id` varchar(191) NOT NULL,
  `status` enum('active','nonActive') NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `user_has_roles_role_id_fkey` (`role_id`),
  CONSTRAINT `user_has_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `user_roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_has_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_has_roles`
--

LOCK TABLES `user_has_roles` WRITE;
/*!40000 ALTER TABLE `user_has_roles` DISABLE KEYS */;
INSERT INTO `user_has_roles` VALUES ('01c30b41-263c-41f7-8456-0190b8055930','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('01c30b41-263c-41f7-8456-0190b8055930','accaabbe-ca8b-4d7d-8d5b-c7f1b9c9b783','active'),('01c30b41-263c-41f7-8456-0190b8055930','b9fbc614-7d71-400d-9929-15490b01076b','active'),('01c30b41-263c-41f7-8456-0190b8055930','c6927dec-6ca6-4c8e-8a34-13b125a96389','active'),('024962c3-d306-4441-8980-d4c9c9eab68e','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('03fab20d-47b4-4553-8b82-3293e36bb80a','a63aa11c-a48d-42e7-b6db-af4faa3046c3','active'),('065bc1cc-008d-4d49-bd27-cbaf090bb229','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('092c95f0-0162-437a-ac0d-a2ff636262bd','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef','b9fbc614-7d71-400d-9929-15490b01076b','active'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef','c6927dec-6ca6-4c8e-8a34-13b125a96389','active'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef','e2441d9f-b55d-423f-8697-2887322b6a04','active'),('1c9f963e-bda5-4ac1-8854-8d36efdc43ea','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('1c9f963e-bda5-4ac1-8854-8d36efdc43ea','b9fbc614-7d71-400d-9929-15490b01076b','active'),('1c9f963e-bda5-4ac1-8854-8d36efdc43ea','c6927dec-6ca6-4c8e-8a34-13b125a96389','active'),('2869c871-fc39-416e-8730-d8010f477828','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('34b7659f-d395-4aa0-9883-5dca32f81aa1','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('43a5790f-fbf0-4ba8-9ada-ee30b4193066','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d','59fa401c-54ce-426e-b035-7691a143634b','active'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d','accaabbe-ca8b-4d7d-8d5b-c7f1b9c9b783','active'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d','b9fbc614-7d71-400d-9929-15490b01076b','active'),('63bb7894-a53f-4a9f-9f9c-a73d6d360ffd','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('63bb7894-a53f-4a9f-9f9c-a73d6d360ffd','accaabbe-ca8b-4d7d-8d5b-c7f1b9c9b783','active'),('63bb7894-a53f-4a9f-9f9c-a73d6d360ffd','b9fbc614-7d71-400d-9929-15490b01076b','active'),('69466c98-cfad-401f-899d-cb60407f417b','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('6d823178-9b5e-4940-abd6-f5fd041b6787','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('6e157dc9-79f5-44ed-9c23-de44bd324201','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3','5c79b53a-6290-48d0-8aad-d55f4904e318','active'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3','633a8fb9-1a3c-4642-a08a-0a417cdd81b2','active'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3','98353167-2005-4b23-8ee2-ad3a30768d34','active'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3','b9fbc614-7d71-400d-9929-15490b01076b','active'),('9412c5bf-4ad4-4017-9907-c308d3c8230f','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('946a4d6e-3a1e-46ca-87d1-f1679d3d20a9','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('95d6e523-30a0-48d9-9ea5-3c3264a8b103','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('97a7f8b9-a4a4-455e-aab4-b7d094dfbbac','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('98576802-374d-4dec-9e0c-0fdb0817a762','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('996e0e05-02c7-4550-8314-779b084d109f','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('99718a65-cb21-4243-92da-d74620fa01e0','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('9a0ab8b3-2f14-4347-9b69-5dfd40f600f1','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('d7cfebd6-0dab-4a06-aab4-b1a988c4aa10','4b4dca84-3bd8-4378-92fb-f43f85621f93','active'),('deb95852-dc29-45e3-97cc-b137d5ddc522','633a8fb9-1a3c-4642-a08a-0a417cdd81b2','active'),('deb95852-dc29-45e3-97cc-b137d5ddc522','9d81cc56-6359-44a2-aa68-33340aa16a47','active'),('deb95852-dc29-45e3-97cc-b137d5ddc522','b9fbc614-7d71-400d-9929-15490b01076b','active');
/*!40000 ALTER TABLE `user_has_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_roles` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES ('4b4dca84-3bd8-4378-92fb-f43f85621f93','Mahasiswa'),('59fa401c-54ce-426e-b035-7691a143634b','GKM'),('5c79b53a-6290-48d0-8aad-d55f4904e318','Sekretaris Departemen'),('633a8fb9-1a3c-4642-a08a-0a417cdd81b2','Koordinator Yudisium'),('98353167-2005-4b23-8ee2-ad3a30768d34','Dosen Pengampu Metopel'),('9d81cc56-6359-44a2-aa68-33340aa16a47','Pembimbing 2'),('a63aa11c-a48d-42e7-b6db-af4faa3046c3','Admin'),('accaabbe-ca8b-4d7d-8d5b-c7f1b9c9b783','Tim Pengelola CPL'),('b9fbc614-7d71-400d-9929-15490b01076b','Penguji'),('c6927dec-6ca6-4c8e-8a34-13b125a96389','Pembimbing 1'),('e2441d9f-b55d-423f-8697-2887322b6a04','Ketua Departemen');
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` varchar(191) NOT NULL,
  `full_name` varchar(191) NOT NULL,
  `identity_number` varchar(191) NOT NULL,
  `identity_type` enum('NIM','NIP','OTHER') NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `password` varchar(191) DEFAULT NULL,
  `phone_number` varchar(191) DEFAULT NULL,
  `isVerified` tinyint(1) NOT NULL DEFAULT 0,
  `token` text DEFAULT NULL,
  `refresh_token` text DEFAULT NULL,
  `oauth_provider` varchar(191) DEFAULT NULL,
  `oauth_id` varchar(191) DEFAULT NULL,
  `oauth_refresh_token` text DEFAULT NULL,
  `avatarUrl` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_identity_number_key` (`identity_number`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('01c30b41-263c-41f7-8456-0190b8055930','Aina Hubby Aziira, M.Eng','199504302022032013','NIP','penguji_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','162411b7-88da-41f2-ae20-33c31dcfecd2','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAACFWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAJdRJydUXxQ23LhW4b9sjtgCmX5kU9knwY4fNxpNH5r-mo5GBKtj467B1zdOK1_WFb_f0c1fKWE3nBYY49OBgSnUmxrgjDcEFmAGCSxXF8iBPhszlrEy5RMY8HBWAS76ju9rWA0ki9NfIwqkSuQLaBHwe0yAZiAlCSxLFus3U57iTIGGS7eOwJlZZ9rOsXv9BuNOZR2IVkGldeMZL_Wd_PysVHFWSCQ4btqENupBil434aU3wR9VaOnp3siekXohGwMOHW3HrUvLHFb6Y25c4WtMuZhrva3cyZU4KQUdZnIEFqpCdE9zzJjIV8lcdns4Bfh7b_1JrmjHlW5f7OvRXESwA45YhjoFDqcr0kFqRRXZ7Qz_0Rh7yiDysAgyqiKCsdk2tA0pfJPjtKolfj46bXchX4JCdUdlnQieCTcvjDTYJ1h8QNUdTzYIVLk4uDIwFHA80b3zaeqPK4-EqPj20xXhyYPwBaxT063qHEkOtwck7FG6jrp4fC_RkSiLT8YSgW5D9qlgfU82X-ywoBzgC71sMd9j9G5lfwuClYN7HbwwVPXyXoLKi_U1Uu7f0UsHbXjWZ-a5cWgWWTKjsZegfjsCb4L502K7-sd_vVQf9YBIG4iZB4zbLy_4w-rRBWfPZrDNXUhWbhG6UJ2RSzwz0qykjHjmD0K6_qfJGgHBeg-F_-9uKXWgRwdW3nhpCv5JczsZLxjuz8Lup_u_2FiZ8EnW5DX5VEWERTwgpt5LzH3TU8bsxz74DGspbDG9lcX9bk4mKQw0vvN0UO_2CL9vRpBS1FiR3hoOMr8tjXObQfJMDI5wZZFDWrpV_UPpwqUCimLl3jhvTs6yIpLK19t7XA7oaCGjmmYT7Xi6YojaEL97JixCF4A15vHOVSNS_5vTOG7-y7fkt_xfUKmYYyYLipVAiJ-S_u8HTT2haz2mIfGiyT8YJSMZ6wtx3QH893M7gp1nu__OAfuGQX0yFT4txbjLzsbCD9JXkTUuGs7p4CAI1W_yZclhLBS2VGNgqE8xY3gXEc35HbegA9FXv7n6KF4QIrfgy1cwayBaBy5ygydd1norGVS5YNTssdIspmkhJc_iNGHNo3FvK8-oF-B920xIUSLvdrFKbWm6AjFL2WzbvBEeC2rnrWdvusd1WiAQX1duNafHLFlV5WlrDu7QzauiFDIx3_82JmqBsVR2Q_OAgJFpOcnXppj95wEmAkn7KSCVBkN865pAcmH9S2fw9F41qe3lg9TvcZhZxB-S8879X0vZQrhGOgC8d57mUi4jvM6UV3fkNW1uaERU9zukQMic_zF77vYFqEhL2lUtLNMY08rQ1fQBq8Fpfa4C9JvMooPLWA',NULL,'2026-03-01 19:20:45.678','2026-03-03 16:48:07.971'),('024962c3-d306-4441-8980-d4c9c9eab68e','Andi Saputra','2211521051','NIM','metopen_andi@fti.unand.ac.id','$2b$10$uFr67SI/nw2eTsfVJ5wp7eBaMjnWbwKJ8DcOGRWypfonsv4bBFQCK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-02 20:43:40.442','2026-03-02 20:43:40.442'),('03fab20d-47b4-4553-8b82-3293e36bb80a','Nindy Malisha, SE','220199206201501201','OTHER','admin_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,'$2b$10$dFdgv8pOXkS.V0UTpZm8/urXmr6RUzRbLKP/YC6/sGiy9R3VxNqvy','microsoft','6c1eb68f-3fd9-442b-9929-84c8aefd1474','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAARWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAK0uhIOGUS63NN5wd0uJ4ep4bVL4al4wtNYWR901uKNcRm1crzDWdL5hWWH2QLuMOwuio8FGR47GXVeE0POH_Ud9yWwUYOhuche55lyoRskfWMh-DY8eUwyjmbGpa9RDjQsgKB2-3-aDvb4Ju1Kp9yQEzRRdPao5ifLAqYRhohnHf7q9GgKAcJkMA_y9ajBUk84riG0V2p0Z74sVRSF4ZF3LDMR6n27Y9Nz40e2f1KrBZSTVs-jtgraOlmzRePJ9xMNK1xrkoY3-p3dOKOdA2l41nimE8XFyWLn8RUl1QqFW28wVf42QzaKvtxYqFR3B8NgSuCJZiWTnGh-Mx-b3aLL657aDzubEIQSrWFruLLBAee8DqObxbE4zLHwxwVM3OOZXjteW_Ms7cO3lJ03ZyUV9cvC7jBWJJI_usSjEqW4YM2gNSHR4qK-LiUrGdMd74awE06Nd-YJkKezxesC6GaQ0BDo780rVzw3ONXEGjQbVdTcXVj8CtbysutCIG-4FsbGYstMobmYM9CFzyvfDgf7yvMtow-UdQrbbYl3KXuVd1yf5v6AzAKdabmxeEPRbvhPqozX6M86Zh36wvFv-HIxcC79ii-zPCuGinGWfYMGTCaANJRTW5WGCxG3aZw8RTp66IjXmwc0UMsWXNNZi_7LfzYj23QNdnvwCW2JnyLcS2VooHie7icGmmbt9w6EYPsw8zjQqe3oPCIHMz9xRvFkOt5ixcP5J4fG0rhGHweF8kXiDyxcE1f1Vf9YYN2oQgYjsKpy6LP-bqbdmWmAcCFX7T0cOs8tJKXV-6dkXSXOSO6N9AknLQ__lkEgIqIHwkOU7jk_D_wSsxdBD4_8BogXfFl-fsuwRBJp6f9gYRE5R8NoaeNM69MwarWLWLKM23Kvrp0o1jsAmN3r-DIK7nlKM52nL_-LmzJXC-G2kzcCU75ahWiP6oKM-g3d9-xZatVnX1C26m34WlyaAJDcX7NztHGJobMQXBnkUNVi2WEVjH-VT7qpnkVWoMi49djrmTTvAStPj6Zul8O7g0DmuoA0phbcLqbOi_hoAeqP9TVYiijqy-C6N_oyTm01ayQ9aCFDRyclHXk5CYL9kR0qLCDBlklBA7q-W9IghFckSBzh1BmGwUHXaLcrLyqiQBYMsjNbvRINyKunSZP2aZMVzEh1jwQVNqScqcgo1V6tICWG56Cawy74FLyDU8honvMClpz1wgm0fWcP6R3eX8hvKmQ-TlEDhZGKx5ie2JYUxChZ2xmPF9MtcTabzMdcX3PSoZnIvrcAjoT81-1kMhFxfKtctJeRvf0FUwlIIup1ESh6at7uN7-QkyRXh6OMRMoXbP5rOIfcEfDbr79pNiz6lrMfCQw',NULL,'2026-03-01 19:20:45.754','2026-03-04 12:21:59.199'),('065bc1cc-008d-4d49-bd27-cbaf090bb229','Dedi Kurniawan','2211521054','NIM','metopen_dedi@fti.unand.ac.id','$2b$10$uFr67SI/nw2eTsfVJ5wp7eBaMjnWbwKJ8DcOGRWypfonsv4bBFQCK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-02 20:43:40.552','2026-03-02 20:43:40.552'),('092c95f0-0162-437a-ac0d-a2ff636262bd','Eka Fitriani','2211522055','NIM','metopen_eka@fti.unand.ac.id','$2b$10$uFr67SI/nw2eTsfVJ5wp7eBaMjnWbwKJ8DcOGRWypfonsv4bBFQCK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-02 20:43:40.580','2026-03-02 20:43:40.580'),('0d92a02a-c9da-4f7b-a171-40bef0e971ef','Ricky Akbar M.Kom','198410062012121001','NIP','kadep_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','8f23fc82-f2b7-4280-bb06-9780b132231a','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAACxWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAHlWfiKlMtEz5fD76nykokIk-zshoe-7f8Blfuc2cxx-BMa7sJyTW3eC0WDx4RBCpLsQUZy1kB72JegxEq3iNkVGyz3e7WjSO5epXSrcDhQdcELi40TQsRWKJxbNhofJco_tsgl6BClwHW8z03UZKZ30so1JxTLELlkdkdtkFoQYQy1o_5bob7HEr287dq80XbNQkLKH8p6qsE5Fboca_bSqd_S6NF2G-H4z2yILKcmu99bra7b6Db9wDxJuminPBlXprsuvDbOuAYSyyJ7f2ihrswU_IgNvO36DjJjltHKrIp_avA-ri65AUjzqth8WxCO_qeXGBRLXHMltFKFTfAjFzyqzvRhB2S6-7BmewRpC5EBtwfJrfJ-DhntOWOteenQ0S7fXkHreuKz_UMmbNAEr2pWUNny8jwv449bbJHAVUG41SoSpciyVk1zmv_OrapJ6f6G-1WyGyaITXk5qvRRdSvPRYtQa0j2XCigvUvEkTSGBs0e2WtU_Gs_3ZQvjmNnpiql3oqhvnYR-LA5Jqjlgg4RVjfGywSd1WCafWQGh9vzGr7dWG9qzGZjr11DPZB7ZFa2rEJ7gRslKx7X4xW6C3hhQZqoqBPq_h4qK8viRv-ikq2qu6okoaOV07_c_MiyNIBzCDitTFBDIxRV7AvAnTg8NuYelaacx4U1m8ByUEvxVDsSQSWs0VTfVkgR1SndcI7Ag6A6PSEFqmlT0gPgcXt-dkeq5okzAzeYbGXwuf1yYv97l8NbI6VGy7OV_JUevxYXNdYdjSBfHXgmfixEC0aXxT2sJdTyDekF9eUY-CFjCcBzbxdrmpR9GDi6e8tJRWAWa3otre-WIl15IwQFtxxPSP6xRtn_alP8WSIj7qgMlxZQpO2jfGegzhj3lzJdK9uJ4CVhLPJI-YLOZ7yVRwCb42BUvMlcJr7chQ-DKbA9KwudV4z1jfZR8IjNIyJVnXHS3dRDmOc7OyCzAUsUMzsKSlu-B6P5MWC6k0Opz-8ZEE18XIho_f_aRwoKfHtWKvMzFaWByP5eURF91sj4oCYhVEVxcVxg9Xn_wCWJrznyn10jFimqYc7owcs5m6qO8KEpwqyLguyA44RvXCDVJkns396xJaAGY-ZV7tZqksGVA5F7g-nydUh7YT4ZYEQAvpdpZ9Pf37mHEcibDYUT6AePYvdcUVAbu3dVqyP5xzK8Zriyru7-yNzA9qLilUSIaEQ5CjgzsMe1PPDlP3OI-8wlEhWtkBgJPMnpi3lFR5TDlrC9LcDh_yiFW2M2T_BAyCSiGOU4e8veC854dqc7-akljcxTmCWyOTV0o59DTDMS3-_TBaL4-mdDF2kWbacBzAQijSEaJNFXw_vBtihTqMFG95ho3D-uREa_inw',NULL,'2026-03-01 19:20:45.553','2026-03-03 16:47:10.361'),('1c9f963e-bda5-4ac1-8854-8d36efdc43ea','Husnil Kamil, MT','198201182008121002','NIP','pembimbing_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','34164548-e015-4891-a4a4-6cc3efc30174','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAGVWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAOaXmq8y6Lbhog8ZTbjXoFW1x2Eh7DV164bm3_uyuYBIMb18nm6JerEuvK_n_05htKF804-6FwsxALvganAh5wX2zE1hcEjndToLtjJewkJapNixlKsS_7MQcy-LQCLtEg8e981tlIOf0qhuVstyCVO_8eg4P2-VuMitT0HkYgulklFLSQSBFEvmgUKBlJxyW_ycABW4iBFqJ19h5IKb29ogVqdgBq3INg2ILLUFEQYD0E2uTD1_fJBrapZX2wUVWQDL2xAPAYBcsUEPa8y_dXlOWuFFFy-0iJA2nKTC1oegOkEWmW2HRxSbcVJRTY6BvvhTwaofQ46u8bCm-355u1usEfyKzMrwDiC0HDe0LfxvmdnWjhFL57Xra9chThzW7IlqO_LRcS2GaEQlR_VEe0micjq_KZl8T69reV166FSxHZnJfvLTO0hSMwKin7cqfUjrH-CL91NOOsIqpMzXBnc5i0fEZK8rBbwjUT7QFn-G9RPnCnB01d36lI_4gW0Sy3DkiTlzKfdvA-T9QhM5ii3mHWn-iauBGwgCTk5wIgOXmY7Ywz_5xfCTo6NLxEzeRJolc-O9PluAcDbtq4ycJAVgjLHl_ikS4vgHcngmS9k9Rd2dEjiPcTg3tD1yATGUX6pP1rzQcFBoQ0cpMXsmovrKBkO4YFpKwBc7c5cU6_ushvHbekIryfMXufgeLtZpHh4WhWbZh7je-jt_PvMZbLbO1LeCuyPeMj2kJNPtrtg1EIVUFMfBV2Nisj3tYfSIn4lXPKAw9h81soz7C0MFz2vvzsH9NWwYbzqitN3Uqu6-YglZFKKhNXV4usSG5lOGdJpboz9t4JG7sU9cgLnBhmbDL8kiSKFjoWkbx4OCYUegWdxg5MpGsZRmtsGO-J18U6vbdurIZfN0Bj8yt8uw7UbycLkXJYoSGmT0BSDsnUnT-4uNr9AI9bO1LozQjZ2bfCeMIj9Bee9c0wej_Xu8oQOyWGwwvra7YIIoM73pDjeJHQ0nRVb2WpVNAyvxPuT26LhDkLiIKfnc0-hHB83KMDcnSA7GuhEex4teN00aSjvxAVmMkGyoTpMNfptKcG5EKIaULgMkhVQczQh4Hay_gvB6Hb4fztGMBsqYLZzP_PT7Peic5XCCtA2FmGdYsJZnjPJjpIp_avbgVmdGedXwrSzElGZmNClwUE4-WdJMEeRv34vlx3GWkHaHX8bnXxZkL2PuG57kwMRliZ5n9R4GFuSMTmREfkiiSuQSUmtChP6ZbmCIKiymQn-FFRtD4yhryZHosHmavn24xGQCtCtZvDQdP1YrvqhFaF0lYc2Utp7XwdPJwOKgfVhrfwerW10IudWv1w9Onr2nCg',NULL,'2026-03-01 19:20:45.650','2026-03-03 16:47:38.193'),('2869c871-fc39-416e-8730-d8010f477828','Dimas','2311523026','NIM','dimas_2311523026@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.994','2026-03-01 19:20:45.994'),('34b7659f-d395-4aa0-9883-5dca32f81aa1','Mustafa Fathur Rahman','2211522036','NIM','mustafa_2211522036@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.896','2026-03-01 19:20:45.896'),('3783feea-3175-4e14-ba71-ae80e1c44fe3','Eka Wijaya','2111521005','NIM','2111521005@student.dummy.ac.id',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-03 21:09:17.414','2026-03-03 21:09:17.414'),('43a5790f-fbf0-4ba8-9ada-ee30b4193066','Syauqi','2211523012','NIM','syauqi_2211523012@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.975','2026-03-01 19:20:45.975'),('6033c3eb-243e-495d-bfaf-37e79b8b8e8d','Ullya Mega Wahyuni, M.Kom','199011032019032008','NIP','gkm_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','45c4c780-5cfd-41fe-9393-075c24558f52','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAE9WAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAADDwkO_CsOO1NOdVCn-YTE3NbZodxF4yA8H_lauZisuELiyP227k-fqkX3N5ND5Wyg5m4QC1u5cmSweMnEay6XAH9imXEX9_upFY3DKeykH-wg754XElTt8PfBG_OpCxtx4VrEDXap3Og75VpYhkQBkZcjJmeJrWgObawzQiowSsgBaejWxLv6pLfXvoM4BKDjWArPqZB7kRFHfSCmRWTavHkc2Ztud_1HAB5npA0MEukSNrJtqrf1VXe0pUGeFpPfuIDEaVgcVvor3YLe0wjlOB5Br5Xemx75ys5eKOZsnSKwgK6z-3h05aMR1dvwO_8Ez5BBBiyEZ2zGUsoaGYrf-Qu8PEPLjKRe70OezOkmH9OO8thYNVDnzCBmiNgdCicFoqDE3VQVxxjH8ZxkO6Z0UzVfI_SGndvbLJeZ8uGWIqO6-pAgG8HMpnSclQgBCIu50LcbtlU0Hc59wF21hmfMdwMk1xSh9sGJ2DaypdBU6XL6GoyWl9EMBbnwV_R_NAFpLLXYwblYT4M9o1zX8NdXEVjtrlovjnv-E4JlZfztTHtoqIZzWtOonkKsOk3sNk4M8zNSyCfFTi56WPoq2mdvisFHtTzDPSSfuF-xiard6fLl4xwAOKvG6obCoPUBv2xdW7xXjXtJ8xnLKai4iRTMBzcQ9OxXeEpuL5RNLwsl7DVmV82wK8qU3dfwSDk99Y4NW39015LsnZbKoUiLVTKx4oseE8jYuwkV0PCIpHN4FiluqK_4bW_UYgh3SxdUPifRhMLQ31JbZWAtOIlzfPMuPiOkYcyx_g8Y2zycrikDAv-tpJR2HAK1PPjqknAh04eABZE5B44rTYHJppJipKmr5Ac-N8NRQnEZhEjsSDOWJPJsSpl5iU76HM0K7uXKTIEPRETJl5w7T5IuBl3rypobG8NHJlIL02oor5gXVy-Y0600YmNlizVzHx1BvPAF7jlXo0zvkgcrWH7Io1oUNF-E9mbxf-ZAPKqsuGGYJuCSXJNOOHGw8TgO4U7zgmB6Gm3b55B6IdLNFXv2qWXryPbEVdrFQmIG618l4NM9iP7gfXVoHJXPVTbG2sgsaYRgElPdx4SH19uWo7KAxCtIE3ldBwCgDn7zIg8gR6N1CkhraPDfSHbq_cExAqZu8uS-jopUakZq_2A7x-3LEJH8kuodwPxVQBOJRvWfpW0p6baedQQzSz_MZKRALbed0tt8id25uRpB-rydczpPRYzx7agiX8x60jBqvNEzXbrY906CK0W7X24U44WjDaMkaanRJy-nfJDb8X6h4jMq4p8CktGA4HSvSMnWqOVZNcgZNgWvocEuU9F3cfK9PSfkqASuUeNBCc8Eq5kAyiU01fozqr9exCnpWsNPx54MV1ujVRxXGmXRJo_WRhq0JCP4AJQ2lwnV1qO7Y',NULL,'2026-03-01 19:20:45.714','2026-03-03 16:51:56.433'),('63bb7894-a53f-4a9f-9f9c-a73d6d360ffd','Tim Pengelola CPL','199107282019031005','NIP','cpl_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.796','2026-03-01 19:20:45.796'),('69466c98-cfad-401f-899d-cb60407f417b','Budi Hartono','2211522052','NIM','metopen_budi@fti.unand.ac.id','$2b$10$uFr67SI/nw2eTsfVJ5wp7eBaMjnWbwKJ8DcOGRWypfonsv4bBFQCK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-02 20:43:40.487','2026-03-02 20:43:40.487'),('6d823178-9b5e-4940-abd6-f5fd041b6787','Muhammad Nouval Habibie','2211521020','NIM','muhammad_2211521020@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.914','2026-03-01 19:20:45.914'),('6e157dc9-79f5-44ed-9c23-de44bd324201','Cindy Permata Sari','2211523053','NIM','metopen_cindy@fti.unand.ac.id','$2b$10$uFr67SI/nw2eTsfVJ5wp7eBaMjnWbwKJ8DcOGRWypfonsv4bBFQCK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-02 20:43:40.514','2026-03-02 20:43:40.514'),('7db4fc9d-b084-445c-acd6-bafc95bcf6e3','Afriyanti Dwi Kartika, M.T','198904212019032024','NIP','sekdep_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','0db07c61-03b9-4ccc-840d-4674749f53ef','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAJFWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAMZrg90GvocYCAtpO7eDmUHosf6cyEbedRk3ciJdhI2TC1KMchr-0M2yvsA2cRXzIhWuWk6ejFMXcvMWpvtZLjCBj6ZurQwuuk9AihvtjGdtlvXJW33w6faSouGPm7U4nMR2G9DkrXqsvg8LCf8Ai3TOJ1O8wJKL-96HsXRsbzYHe-1zGrvsa6RTN7RO8VxvMr8I_SqAdd7W7YSRt40h8SHregldJ3ZBgUXCHdXaL7r8eMSsXIxwZsW5eM07j5hen2uO55ejKa5YsrN8NXZH_Vz_zoAWJsfI6bNDWFsW8Ave_2P3q7NNVjcBWUFavplI-Odda9DqN-zzFPkd8i7XwlAy5i5q6JKm-trDivhc9soXDbb3Mj-eQEpFpHXjNWxMxvOSX1c7VUgfPn0qVIkKHWetFOZNHpj8T8Fe_yD2iZ6auVOA2nXaStP5wp0YizYyWTVe5o2uG-dHA4A8H2SnNT_Vxl4abVB7e5tf6uLm8nRkRCHMSI3QQZ9Wkrz8VYFpMBbSB1FJwkexH77UbupuC4GnhjkpgxTWIEhhogwSCmAjgCVPwkAPT45VW9xYMrWXCTcahmwCxnhgzl3Sotl4ay0wsyStUxTrMOfGl7hNiWNKofcuJPVe14p_5ySRWcyKLKo_4ugybr4yQTglzNER9NQ--ouXg00QRdJSZEZg1q-tO-8q_vBvFvck8e3sYefll0RC7oaRH4l14X6LKdmuZm_w6zCjoEdebQeEXPLU7DkEXOy4EAdrXu1fzwlbwzKSKdBe9e92Nkl_fb_pAcdsB7zQEHgmAq5LhuJdCbrzr7dAgs0wU6NInd9YAzGdcnRVLx6Ga-2D4CtjrWGmafdZfo39QEhOVmqHS4U_TMY5oHJ6aubfpqPABsZSU9qC7ctW8nwAExd18HRvZeC5MhpGhn-WuHXk2pwrcf5LJbc-4GcsHins3t4u8NvVzmasJfC4lipoqt29iRM2xgj6_coyMatEY2zBc9PmwU9DjrT1HgcNOvJeCebJmjmlYUZmSlqzCaaJC-nnUy6WFqpbBPqrGfwJzlxx6yHgZZHcZ78uiLZHAftOKjqsorMA37XsvBx4Rv1_5GMw7LAJclco__AxrMt2d1d31sNhkCwr9Yr_obWbzrnpqQDs7DQ37HS5AfyMBnmP8Jw8aF76n6uSY3vO7f87IPp7xvZMFaSJvFdIqNm1QQl98ibsyIBL8UAR9uYDzyDICnzZkNTKXq0l5UkMIHSfPPAjrqMvO2_NZFZ5E76gm8QC693wkr5qfghkB9JZJEJ-6Ut5OJmGeL5KR3804KQkwqEGprZG8D-Ed0Tg1d_x5j57B4tsDEqyuCgP2olTwEKVlI70VKbB6kFBGMysA2-lF4fHTwPFa4REXBXogx1Nv-lg',NULL,'2026-03-01 19:20:45.598','2026-03-05 14:29:44.870'),('81366a41-e085-4a48-9ff3-c1591e554899','Aditya Pratama','2111521001','NIM','2111521001@student.dummy.ac.id',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-03 21:09:17.306','2026-03-03 21:09:17.306'),('9412c5bf-4ad4-4017-9907-c308d3c8230f','Test Ganti Topik','2211522101','NIM','test_changetopic@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.032','2026-03-01 19:20:46.032'),('946a4d6e-3a1e-46ca-87d1-f1679d3d20a9','Test Ganti Dospem','2211522102','NIM','test_changesupervisor@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.050','2026-03-01 19:20:46.050'),('95d6e523-30a0-48d9-9ea5-3c3264a8b103','Ilham','2211522028','NIM','ilham_2211522028@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,'microsoft','72865edd-90f6-4fc7-869e-33e1fa59b6e3','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAP9WAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAAKBgj55skz8GH98RqX4n2aj9-Sc-wMV7UlnXvFkDFcIBHNGAYuMYQdemRPYKobLYL6xYlsR8zHX7b6wnOAXabovCS63kUEtWyQEIgVEcshOxFWrO1Cq03ZKg4Waq3EBB_UQiMBmthWJH8v_U_oTGdzLHRQpbQVtMhyEtZqBkz2_PsL6EjD6msSnsUwCMgl0eumOTErnZtvQwgr-NHzJ6gTtYlNceeUIZ-9_-FQh7yl1J758Sguy3roLeyYmNPozhLAbSudppNWS9yPvErOvdaEUOxzOTSIgzOjRa5_wWJ87gIj7OrbzKKLymU0_zfmaZWlJSVeQYr8413vTKsH9zDKFroUQDMnXAfWWU2DsQDqsTX86pF6fLuFDSz7NkV3Z4hld_TDy_5dFSEgCzCGY2_JUGcPhYt1Mm2BmiM36LUpja3AqckYT2tDIhCl4MiRH2Cf7BY7S3PAFAsVuiJq1UWn94PoQJ0s9EkGW5ZFpsbWtPMkYujVk8dBe3oVJd9BcbgP1zvHUX_Tbl-a1DKWVkl-IYx9zPGVTY_MlQBKPKGCwlyjrct8IdU35bpQyFPnl-Q-aae9QRy3zA2YyxTujHUpobYulmIhVG-ZQbZcoR_A_OkO7KIuSwGDZdIKH0HtVJVIHESRXFDcf7N9-KeRNQpjZH_6810bQRPV-kR9aOIjdXOL0HLI_2u7SoJmxZNeOf4nljKVPzz981dQ5SSoAWhwtguRkTh8G_tfxLQao8ITFsnMftNcnFvLH_XycI03tx51Ll8Y_9ayfV1zjPbA9Hs7EMdlfiCzQCeL-sGKhafkgboOdlsG0C59pP5rWykYgMuenYs831wAyccrapAv40q5kphX1oZoqP0Z35lFcP12nYvKdjy15Qz3ZVAubWV-SBwZAtUcbBV0VChXLo0yzMyFSXY7rmGOuRiSUAZGwN6TqCs4EyPN0YmsNqCniWdwyXCAbfxxwyEgU0bG9C3MehPXFsGmp5AZl-gH-GOdYeKttvECStuLloF2yETE37Fq82kG0JGb4DObIR_pVMt7_zYvEmoRXGb-_WKkwSt5AZde4k2XeuKxMVKYlV-B-RE4fEn6d0VlqBd0tzkXwU56S4DeTO_aHvvg05TCb8l6N9ywm2_T7ACfJtifCpBMNGoNHZISY-QYq7ypve7p0pMuxKgS-MubLgokRVV_-oERhzhfA7GMBH_UPivybhMYwG7otLo1fBsVwKoS47XWMbPLsn8GZcsmRCU76CHdQmdJWxu2UOJ4OHom598qR9xZyVr_c9O1uvqpYQQhdfB49AFXN2GyLolOMTAZaJ-ho94AwcqPmVYUQMc19s1RuW8kE1',NULL,'2026-03-01 19:20:45.957','2026-03-03 22:18:38.990'),('97a7f8b9-a4a4-455e-aab4-b7d094dfbbac','Khalied Nauly Maturino','2211523030','NIM','khalied_2211523030@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.878','2026-03-01 19:20:45.878'),('98576802-374d-4dec-9e0c-0fdb0817a762','Daffa Agustian Saadi','2211523022','NIM','daffa_2211523022@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.939','2026-03-01 19:20:45.939'),('9938fd8e-74e3-4085-b893-c6765752751f','Citra Lestari','2111521003','NIM','2111521003@student.dummy.ac.id',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-03 21:09:17.358','2026-03-03 21:09:17.358'),('996e0e05-02c7-4550-8314-779b084d109f','Test Tanpa Thesis','2211522103','NIM','test_nothesis@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.068','2026-03-01 19:20:46.068'),('99718a65-cb21-4243-92da-d74620fa01e0','John','2411522001','NIM','john_2411522001@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:46.014','2026-03-01 19:20:46.014'),('9a0ab8b3-2f14-4347-9b69-5dfd40f600f1','Nabil Rizki Navisa','2211522018','NIM','nabil_2211522018@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YTBhYjhiMy0yZjE0LTQzNDctOWI2OS01ZGZkNDBmNjAwZjEiLCJlbWFpbCI6Im5hYmlsXzIyMTE1MjIwMThAZnRpLnVuYW5kLmFjLmlkIiwiaWF0IjoxNzcyMzkyOTAwLCJleHAiOjE3NzQ5ODQ5MDB9.Lx09-MFshS6Jds11pT9Pe6rOli0SMGNFdccwddC4KHc','microsoft','mock-oauth-123','mock-refresh',NULL,'2026-03-01 19:20:45.853','2026-03-01 19:21:40.706'),('aa1652f7-958e-47e3-8554-7440d507a061','Budi Santoso','2111521002','NIM','2111521002@student.dummy.ac.id',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-03 21:09:17.339','2026-03-03 21:09:17.339'),('cfcee288-cd64-4060-a7bb-1fe205dd9559','Dewi Saputri','2111521004','NIM','2111521004@student.dummy.ac.id',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-03 21:09:17.394','2026-03-03 21:09:17.394'),('d7cfebd6-0dab-4a06-aab4-b1a988c4aa10','Muhammad Fariz','2211523034','NIM','fariz_2211523034@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,'$2b$10$opdxzrazn/DqM4ydMttE0uCkDi.oVIB4n4cdBHlSRhntToFk2mJn.','microsoft','3b9487ac-e1ab-4e37-a70f-248729082338','1.AVYAzSYfKAQpaUaTXgGIVwNUEFgNtsfzQ81IkKb3TIfxsyQAAPxWAA.BQABAwEAAAADAOz_BQD0_0V2b1N0c0FydGlmYWN0cwIAAAAAADClLM3_1b7k94C-lbG2uc_DCzn1CR5zgxvROCo05dEgEoRFKl7_3iTUHO7eEY_lR7MDAI9ivw2A78JmruUOue1bkq2bcCB0dYbanZQrOOAmnWfWKqcNIjCAYEowDeKJmRu6U-517fGHJeMc6n-_S-fkjOChuXy7k82oS30jE3dQWFtKi0tVQRjphvDeMRw3_rtHRMcKlBuhkCkGzoDXji5lTfCstVL7SjmhjasBYkCGcHKxxkwWbnU9ARfvdMr4X3eg113rPUPz56-EnWBn7pegTvqpNhhil0dZWLudxhhHSxza8TOx4pBTKuaJjpIR7vil1Wk0l2_j5DPbwC7ZocNRBVbdf-6frlrVlX-_kTDEN6klOD-rPoLfORGFp6_KrXLMEBoDkcWZaJ5oOmkcApYYZ6qCDA6Li6Uy37lJKfJVKYPGziS9l5_vsKzNAiki7JaGhMbGYBrTg4ya9G6j629ocqY0Hjiil8rOZZACRjy_liNM9mxGVArlY-k9CGLDp_OU5VYHELcvNctRczL-HQ99_ICs0_WLYyNLzdAlUk2eMNTVm8tetFT_tvM5-2rClKjQTK_QKK7lLs7OpM-WPG-vEAyvSipx0ybFRoanyUkKQyKWmPawN5Z7QeBVDBXSnJCA8Uz2xX73vDAPY2ctsNJnJdorESDlUA8sQtLYj1YJXd_LeE0ICKmHirUrsr4H_pBWGPfLlEo5_7okfMz3h22sb6HhG-2-uSO74L6OF6VKBIymbJeX8UYWwbeQEW6jfAvIHsDEro353IrS_HIhoiDjcz7fc2aiE2kiOniaxd41pjWSqRt5Givk2E8AHAcZODt8XD4DO6UbFiKDgNuj_JPZ56dytKkGobLrtrSV4dfleKOCoj5pS-ybj-EjL9gPIz3id7hVAbuE2yajDYK18b3td3RLrBa1MT6kQffvb-QdAPxbPKZDG2vPWtUF2NoJ6acUqIaFq6PV04ouWbxnwHXtLBJmaZCsBJv9q-vO3EGxJptc6Mp1DzEikzyq1wl5W3HtrjS5Y0a0fe3xDj5T2WcQCe944lyIfyDTxp86Na8ftPLVjpkzZ8MDgo7sMObO94uiZRwSItra5d0f2fhh4kq5p7-L8Bjw3RdLegNB1_4pr0jk0SgIXIBhTVJKBgtG3X6lU9l6YbsLWiNeajPmo202kZhx-rnkEAk2JjveyrwUc6yFoa_JwzFgh0zU7ARX0tXyM7yrjZITcmrjvmlSqGaF8YM6HQCl_ZLJ3sPGFb1BpL4y96xr97vJYnqf2V3m3KHOMpjN0Vws868hPTMlnHhjMeNkyEo6wtN0DTnWGLFGrLpdvcjBA-VafF9S06ATyQsxZlsEWuaisR2bB233FLUqew',NULL,'2026-03-01 19:20:45.826','2026-03-05 17:36:24.480'),('deb95852-dc29-45e3-97cc-b137d5ddc522','Koordinator Yudisium','199203152020121003','NIP','yudisium_si@fti.unand.ac.id','$2b$10$5CNgkVbNy/8HDhYAbSclVeSbPFzsZyC7vF/8KKYj6x/Pza2c0mJLK',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,'2026-03-01 19:20:45.767','2026-03-01 19:20:45.767');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yudisium_cpl_reccomendations`
--

DROP TABLE IF EXISTS `yudisium_cpl_reccomendations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `yudisium_cpl_reccomendations` (
  `id` varchar(255) NOT NULL,
  `yudisium_participant_id` varchar(255) NOT NULL,
  `cpl_id` varchar(255) NOT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `resolved_by` varchar(255) DEFAULT NULL,
  `reccomendation` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `status` enum('open','in_progress','resolved','dismissed') NOT NULL DEFAULT 'open',
  `resolved_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `yudisium_cpl_reccomendations_participant_id_fkey` (`yudisium_participant_id`),
  KEY `yudisium_cpl_reccomendations_cpl_id_fkey` (`cpl_id`),
  KEY `yudisium_cpl_reccomendations_created_by_fkey` (`created_by`),
  KEY `yudisium_cpl_reccomendations_resolved_by_fkey` (`resolved_by`),
  CONSTRAINT `yudisium_cpl_reccomendations_cpl_id_fkey` FOREIGN KEY (`cpl_id`) REFERENCES `cpls` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `yudisium_cpl_reccomendations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisium_cpl_reccomendations_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisium_cpl_reccomendations_yudisium_participant_id_fkey` FOREIGN KEY (`yudisium_participant_id`) REFERENCES `yudisium_participants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yudisium_cpl_reccomendations`
--

LOCK TABLES `yudisium_cpl_reccomendations` WRITE;
/*!40000 ALTER TABLE `yudisium_cpl_reccomendations` DISABLE KEYS */;
/*!40000 ALTER TABLE `yudisium_cpl_reccomendations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yudisium_participant_requirements`
--

DROP TABLE IF EXISTS `yudisium_participant_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `yudisium_participant_requirements` (
  `yudisium_participant_id` varchar(255) NOT NULL,
  `yudisium_requirement_id` varchar(255) NOT NULL,
  `document_id` varchar(255) NOT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  `submitted_at` datetime(3) NOT NULL,
  `status` enum('submitted','approved','declined') NOT NULL DEFAULT 'submitted',
  `notes` text DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`yudisium_participant_id`,`yudisium_requirement_id`),
  KEY `yudisium_participant_requirements_yudisium_requirement_id_fkey` (`yudisium_requirement_id`),
  KEY `yudisium_participant_requirements_document_id_fkey` (`document_id`),
  KEY `yudisium_participant_requirements_verified_by_fkey` (`verified_by`),
  CONSTRAINT `yudisium_participant_requirements_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `yudisium_participant_requirements_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisium_participant_requirements_yudisium_participant_id_fkey` FOREIGN KEY (`yudisium_participant_id`) REFERENCES `yudisium_participants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `yudisium_participant_requirements_yudisium_requirement_id_fkey` FOREIGN KEY (`yudisium_requirement_id`) REFERENCES `yudisium_requirements` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yudisium_participant_requirements`
--

LOCK TABLES `yudisium_participant_requirements` WRITE;
/*!40000 ALTER TABLE `yudisium_participant_requirements` DISABLE KEYS */;
/*!40000 ALTER TABLE `yudisium_participant_requirements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yudisium_participants`
--

DROP TABLE IF EXISTS `yudisium_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `yudisium_participants` (
  `id` varchar(191) NOT NULL,
  `thesis_id` varchar(191) NOT NULL,
  `yudisium_id` varchar(191) NOT NULL,
  `registered_at` datetime(3) DEFAULT NULL,
  `status` enum('registered','under_review','approved','rejected','finalized') NOT NULL DEFAULT 'registered',
  `appointed_at` datetime(3) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `yudisium_participants_thesis_id_fkey` (`thesis_id`),
  KEY `yudisium_participants_yudisium_id_fkey` (`yudisium_id`),
  CONSTRAINT `yudisium_participants_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `yudisium_participants_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yudisium_participants`
--

LOCK TABLES `yudisium_participants` WRITE;
/*!40000 ALTER TABLE `yudisium_participants` DISABLE KEYS */;
/*!40000 ALTER TABLE `yudisium_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yudisium_requirements`
--

DROP TABLE IF EXISTS `yudisium_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `yudisium_requirements` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `order` int(11) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yudisium_requirements`
--

LOCK TABLES `yudisium_requirements` WRITE;
/*!40000 ALTER TABLE `yudisium_requirements` DISABLE KEYS */;
/*!40000 ALTER TABLE `yudisium_requirements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yudisiums`
--

DROP TABLE IF EXISTS `yudisiums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `yudisiums` (
  `id` varchar(191) NOT NULL,
  `decree_uploaded_by` varchar(191) DEFAULT NULL,
  `room_id` varchar(191) DEFAULT NULL,
  `document_id` varchar(191) DEFAULT NULL,
  `exit_survey_form_id` varchar(191) DEFAULT NULL,
  `exit_survey_open_date` date DEFAULT NULL,
  `exit_survey_close_date` date DEFAULT NULL,
  `registration_open_date` date DEFAULT NULL,
  `registration_close_date` date DEFAULT NULL,
  `event_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('draft','open','closed','in_review','finalized') NOT NULL DEFAULT 'draft',
  `decree_number` varchar(255) DEFAULT NULL,
  `decree_issued_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `yudisiums_decree_uploaded_by_fkey` (`decree_uploaded_by`),
  KEY `yudisiums_room_id_fkey` (`room_id`),
  KEY `yudisiums_document_id_fkey` (`document_id`),
  KEY `yudisiums_exit_survey_form_id_fkey` (`exit_survey_form_id`),
  CONSTRAINT `yudisiums_decree_uploaded_by_fkey` FOREIGN KEY (`decree_uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisiums_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisiums_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `yudisiums_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yudisiums`
--

LOCK TABLES `yudisiums` WRITE;
/*!40000 ALTER TABLE `yudisiums` DISABLE KEYS */;
/*!40000 ALTER TABLE `yudisiums` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-06  1:32:21
