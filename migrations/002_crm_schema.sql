-- CRM Contacts
CREATE TABLE IF NOT EXISTS crm_contacts (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  organization     TEXT,
  role             TEXT,
  email            TEXT,
  phone            TEXT,
  website          TEXT,
  relationship_type TEXT NOT NULL DEFAULT 'other',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- CRM Activities (reminders, follow-ups, calls, meetings, notes)
CREATE TABLE IF NOT EXISTS crm_activities (
  id               SERIAL PRIMARY KEY,
  contact_id       INT REFERENCES crm_contacts(id) ON DELETE CASCADE,
  opportunity_id   INT REFERENCES partner_opportunities(id) ON DELETE SET NULL,
  activity_type    TEXT NOT NULL DEFAULT 'follow_up',
  title            TEXT NOT NULL,
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'open',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- Link existing partner_opportunities to contacts
ALTER TABLE partner_opportunities
  ADD COLUMN IF NOT EXISTS contact_id INT REFERENCES crm_contacts(id) ON DELETE SET NULL;
