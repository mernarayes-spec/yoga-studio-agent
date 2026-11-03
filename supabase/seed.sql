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
  -- deterministic uuid: encode day offset and slot into the uuid (offset by 15 so always positive)
  ('c0000000-0000-0000-0000-' || lpad((((d.day_offset + 5) * 3) + s.slot)::text, 12, '0'))::uuid,
  (ARRAY['Yoga Sculpt', 'Yoga Strength', 'Hot Traditional Yoga'])[s.slot + 1],
  (ARRAY['Maya', 'Jordan', 'Suki', 'Leo'])[1 + (((d.day_offset + 5) * 3 + s.slot) % 4)],
  -- Start from beginning of today (ET = America/New_York), add days + hours
  (date_trunc('day', now() AT TIME ZONE 'America/New_York')
    + (d.day_offset || ' days')::interval
    + (s.hour || ' hours')::interval)
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
  -- pick the class for day_offset=1, slot=0 → index = (1+5)*3+0 = 18
  'c0000000-0000-0000-0000-000000000018'::uuid
);

-- ============================================================
-- Bookings
-- ============================================================

-- Alice: 3 bookings spread across Nov 4 12 PM, Nov 6 6 AM, Nov 9 12 PM
-- (day_offset=1 slot=1 → index 19, day_offset=3 slot=0 → index 24, day_offset=6 slot=1 → index 34)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000019',
   'booked'),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000024',
   'booked'),
  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000034',
   'booked')
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Bob: 3 bookings spread across Nov 5 6 AM, Nov 7 6 PM, Nov 10 12 PM
-- (day_offset=2 slot=0 → index 21, day_offset=4 slot=2 → index 29, day_offset=7 slot=1 → index 37)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES
  ('b0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000021',
   'booked'),
  ('b0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000029',
   'booked'),
  ('b0000000-0000-0000-0000-000000000008',
   'a0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000037',
   'booked')
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Carol: 1 past no-show + 2 future bookings on Nov 5 6 PM, Nov 8 12 PM
-- (past no-show kept as custom class, future: day_offset=2 slot=2 → index 23, day_offset=5 slot=1 → index 31)
INSERT INTO classes (id, class_type, instructor, starts_at, capacity)
VALUES (
  'c1000000-0000-0000-0000-000000000003',
  'Hot Traditional Yoga', 'Leo',
  date_trunc('hour', now() - interval '2 days'),
  20
)
ON CONFLICT (id) DO UPDATE SET
  starts_at = EXCLUDED.starts_at;

INSERT INTO bookings (id, member_id, class_id, status, fee_charged)
VALUES
  ('b0000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000003',
   'no_show',
   25),
  ('b0000000-0000-0000-0000-000000000009',
   'a0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000023',
   'booked',
   0),
  ('b0000000-0000-0000-0000-000000000010',
   'a0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000031',
   'booked',
   0)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status,
  fee_charged = EXCLUDED.fee_charged;

-- Frank: 3 bookings on Nov 4 6 PM, Nov 7 6 AM, Nov 9 6 AM
-- (day_offset=1 slot=2 → index 20, day_offset=4 slot=0 → index 27, day_offset=6 slot=0 → index 33)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES
  ('b0000000-0000-0000-0000-000000000011',
   'a0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000020',
   'booked'),
  ('b0000000-0000-0000-0000-000000000012',
   'a0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000027',
   'booked'),
  ('b0000000-0000-0000-0000-000000000013',
   'a0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000033',
   'booked')
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;

-- Capacity-1 class: book it so it's full (Alice books it)
INSERT INTO bookings (id, member_id, class_id, status)
VALUES (
  'b0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000018',
  'booked'
)
ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  class_id = EXCLUDED.class_id,
  status = EXCLUDED.status;
