-- 001_initial_schema.sql
-- Three core tables: members, classes, bookings

-- Members
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  membership_status text NOT NULL DEFAULT 'none',
  membership_start_date timestamptz,
  freeze_start_date timestamptz,
  freeze_end_date timestamptz,
  freezes_used int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type text NOT NULL,
  instructor text NOT NULL,
  starts_at timestamptz NOT NULL,
  capacity int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_starts_at ON classes (starts_at);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id),
  class_id uuid NOT NULL REFERENCES classes(id),
  status text NOT NULL DEFAULT 'booked',
  fee_charged int DEFAULT 0,
  credit_lost boolean DEFAULT false,
  booked_at timestamptz DEFAULT now(),
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_member_id ON bookings (member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_class_id ON bookings (class_id);
