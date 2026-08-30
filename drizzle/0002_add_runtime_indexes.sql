CREATE INDEX IF NOT EXISTS `rooms_updated_at_idx` ON `rooms` (`updated_at`);
CREATE INDEX IF NOT EXISTS `category_set_name_idx` ON `category_set_memberships` (`set_name`);
CREATE INDEX IF NOT EXISTS `voice_signals_room_time_idx` ON `voice_signals` (`room_code`, `created_at`);
