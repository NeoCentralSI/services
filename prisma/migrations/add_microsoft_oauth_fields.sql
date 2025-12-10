-- Add Microsoft OAuth fields to users table
ALTER TABLE `users` 
ADD COLUMN `oauth_provider` VARCHAR(191) NULL AFTER `refresh_token`,
ADD COLUMN `oauth_id` VARCHAR(191) NULL AFTER `oauth_provider`,
ADD COLUMN `oauth_access_token` TEXT NULL AFTER `oauth_id`,
ADD COLUMN `oauth_refresh_token` TEXT NULL AFTER `oauth_access_token`;

-- Add index for OAuth lookups
CREATE INDEX `idx_users_oauth_provider_id` ON `users`(`oauth_provider`, `oauth_id`);
