-- Migration 003: Add content authoring fields to content_calendar
-- Run in Supabase SQL Editor

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS thumbnail_text    text,
  ADD COLUMN IF NOT EXISTS publish_title     text,
  ADD COLUMN IF NOT EXISTS video_description text,
  ADD COLUMN IF NOT EXISTS script            text;
