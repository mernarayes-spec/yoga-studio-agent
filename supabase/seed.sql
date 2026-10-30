-- seed.sql
-- Re-runnable seed data for Demo Studio.
-- All times are relative to now() so edge cases hold on every run.

-- ============================================================
-- Members
-- ============================================================
INSERT INTO members (id, name, email, membership_status, membership_start_date, freeze_start_date, freeze_end_date, freezes_used)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Alice',  'alice@demo.studio',  'active', now() - interval '3 months', NULL, NULL, 0),
  ('a0000000-0000-0000-0000-000000000002', 'Bob',    'bob@demo.studio',    'active', now() - interval '6 months', NULL, NULL, 0),
  ('a0000000-0000-0000-0000-000000000003', 'Carol',  'carol@demo.studio',  'active', now() - interval '1 month',  NULL, NULL, 0),
  ('a0000000-0000-0000-0000-000000000004', 'Dana',   'dana@demo.studio',   'frozen', now() - interval '4 months', now() - interval '5 days', now() + interval '25 days', 1),
  ('a0000000-0000-0000-0000-000000000005', 'Eve',    'eve@demo.studio',    'none',   NULL, NULL, NULL, 0),
  ('a0000000-0000-0000-0000-000000000006', 'Frank',  'frank@demo.studio',  'active', now() - interval '2 months', NULL, NULL, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  membership_status = EXCLUDED.membership_status,
  membership_start_date = EXCLUDED.membership_start_date,
  freeze_start_date = EXCLUDED.freeze_start_date,
  freeze_end_date = EXCLUDED.freeze_end_date,
  freezes_used = EXCLUDED.freezes_used;

-- ============================================================
-- Classes — 3 per day (6 AM, 12 PM, 6 PM ET) for 30 days
-- ============================================================
-- We use generate_series and a deterministic id scheme so this is re-runnable.
-- Class types by time slot: 6 AM = Yoga Sculpt, 12 PM = Yoga Strength, 6 PM = Hot Traditional Yoga
-- Instructors rotate: Maya, Jordan, Suki, Leo

INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
SELECT
  -- deterministic uuid: encode day offset and slot into the uuid
  ('c0000000-0000-0000-0000-' || lpad(((d.day_offset * 3) + s.slot)::text, 12, '0'))::uuid,
  (ARRAY['Yoga Sculpt', 'Yoga Strength', 'Hot Traditional Yoga'])[s.slot + 1],
  (ARRAY['Maya', 'Jordan', 'Suki', 'Leo'])[1 + ((d.day_offset * 3 + s.slot) % 4)],
  -- Start from beginning of today (ET = America/New_York), add days + hours
  date_trunc('day', now() AT TIME ZONE 'America/New_York')
    + (d.day_offset || ' days')::interval
    + (s.hour || ' hours')::interval
    AT TIME ZONE 'America/New_York',
  20 -- default capacity
FROM
  generate_series(-5, 25) AS d(day_offset),
  (VALUES (0, 6), (1, 12), (2, 18)) AS s(slot, hour)
ON CONFLICT (id) DO UPDATE SET
  class_type = EXCLUDED.class_type,
  instructor = EXCLUDED.instructor,
  starts_at = EXCLUDED.starts_at,
  capacity = EXCLUDED.capacity;

-- One class with capacity = 1 (for "class full" test), tomorrow 6 AM
UPDATE classes
SET capacity = 1
WHERE id = (
  -- pick the class for day_offset=1, slot=0 → index = 1*3+0 = 3
  'c0000000-0000-0000-0000-000000000003'::uuid
);

-- ============================================================
-- Bookings
-- ============================================================

-- Alice: 2 bookings for classes 2+ days out (day_offset=3 slots 0,1 → indices 9,10)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000009',
   'booked'),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000010',
   'booked'),
  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000011',
   'booked')
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Bob: 1 booking for a class ~5 hours from now (inside 10-hr window)
-- We find the nearest future class and create an explicit one instead.
-- Use a class whose starts_at is now() + 5 hours.
INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'Yoga Strength', 'Jordan',
  now() + interval '5 hours',
  20
)
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at;

INSERT INTO bookings (id, member_id, class_id, status)
VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000001',
  'booked'
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Bob: 1 booking for a class ~15 hours from now (outside 10-hr window, safe cancel)
INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
VALUES (
  'c1000000-0000-0000-0000-000000000002',
  'Yoga Strength', 'Suki',
  now() + interval '15 hours',
  20
)
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at;

INSERT INTO bookings (id, member_id, class_id, status)
VALUES (
  'b0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000002',
  'booked'
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Carol: 1 past no-show booking
INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
VALUES (
  'c1000000-0000-0000-0000-000000000003',
  'Hot Traditional Yoga', 'Leo',
  now() - interval '2 days',
  20
)
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at;

INSERT INTO bookings (id, member_id, class_id, status, fee_charged)
VALUES (
  'b0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000003',
  'no_show',
  25
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status,
  fee_charged = EXCLUDED.fee_charged;

-- Capacity-1 class: book it so it's full (Alice books it)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES (
  'b0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'booked'
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Booking exactly at the 10-hour cutoff boundary
INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
VALUES (
  'c1000000-0000-0000-0000-000000000004',
  'Yoga Sculpt', 'Maya',
  now() + interval '10 hours',
  20
)
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at;

INSERT INTO bookings (id, member_id, class_id, status)
VALUES (
  'b0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000004',
  'booked'
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;
