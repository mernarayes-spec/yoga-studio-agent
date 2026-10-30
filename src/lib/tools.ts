import { supabase } from "./supabase";
import { getNow } from "./time";
import { CANCEL_WINDOW_HOURS, LATE_CANCEL_FEE } from "../config";

// --- Result types ---

type ToolSuccess<T> = { ok: true; data: T };
type ToolError = { ok: false; error: string };
export type ToolResult<T> = ToolSuccess<T> | ToolError;

function success<T>(data: T): ToolSuccess<T> {
  return { ok: true, data };
}

function fail(error: string): ToolError {
  return { ok: false, error };
}

// --- Logging ---

function logTool(tool: string, phase: "entry" | "exit", detail: unknown) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), tool, phase, detail })
  );
}

// --- check_schedule ---

interface ScheduleParams {
  start_date?: string;
  end_date?: string;
  class_type?: string;
}

interface ScheduleRow {
  id: string;
  class_type: string;
  instructor: string;
  starts_at: string;
  capacity: number;
  booked_count: number;
  spots_available: number;
}

export async function checkSchedule(
  params: ScheduleParams
): Promise<ToolResult<ScheduleRow[]>> {
  logTool("check_schedule", "entry", params);

  const now = getNow();
  const start = params.start_date ?? now.toISOString();
  const end =
    params.end_date ??
    new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("classes")
    .select("*")
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  if (params.class_type) {
    query = query.eq("class_type", params.class_type);
  }

  const { data: classes, error: classError } = await query;
  if (classError) {
    const result = fail(`DB error fetching classes: ${classError.message}`);
    logTool("check_schedule", "exit", result);
    return result;
  }
  if (!classes || classes.length === 0) {
    const result = success<ScheduleRow[]>([]);
    logTool("check_schedule", "exit", { count: 0 });
    return result;
  }

  const classIds = classes.map((c) => c.id);
  const { data: bookings, error: bookingError } = await supabase
    .from("bookings")
    .select("class_id")
    .in("class_id", classIds)
    .eq("status", "booked");

  if (bookingError) {
    const result = fail(`DB error fetching bookings: ${bookingError.message}`);
    logTool("check_schedule", "exit", result);
    return result;
  }

  const countByClass: Record<string, number> = {};
  for (const b of bookings ?? []) {
    countByClass[b.class_id] = (countByClass[b.class_id] ?? 0) + 1;
  }

  const rows: ScheduleRow[] = classes.map((c) => {
    const booked = countByClass[c.id] ?? 0;
    return {
      id: c.id,
      class_type: c.class_type,
      instructor: c.instructor,
      starts_at: c.starts_at,
      capacity: c.capacity,
      booked_count: booked,
      spots_available: c.capacity - booked,
    };
  });

  logTool("check_schedule", "exit", { count: rows.length });
  return success(rows);
}

// --- book_class ---

interface BookParams {
  member_id: string;
  class_id: string;
}

interface BookResult {
  booking_id: string;
  class_type: string;
  instructor: string;
  starts_at: string;
}

export async function bookClass(
  params: BookParams
): Promise<ToolResult<BookResult>> {
  logTool("book_class", "entry", params);

  // Validate member
  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("*")
    .eq("id", params.member_id)
    .single();

  if (memberErr || !member) {
    const result = fail("Member not found.");
    logTool("book_class", "exit", result);
    return result;
  }
  if (member.membership_status !== "active") {
    const result = fail(
      `Member's membership is "${member.membership_status}". Only active members can book.`
    );
    logTool("book_class", "exit", result);
    return result;
  }

  // Validate class
  const { data: cls, error: clsErr } = await supabase
    .from("classes")
    .select("*")
    .eq("id", params.class_id)
    .single();

  if (clsErr || !cls) {
    const result = fail("Class not found.");
    logTool("book_class", "exit", result);
    return result;
  }
  if (new Date(cls.starts_at) <= getNow()) {
    const result = fail("Cannot book a class that has already started.");
    logTool("book_class", "exit", result);
    return result;
  }

  // Check spots
  const { count, error: countErr } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("class_id", params.class_id)
    .eq("status", "booked");

  if (countErr) {
    const result = fail(`DB error counting bookings: ${countErr.message}`);
    logTool("book_class", "exit", result);
    return result;
  }
  if ((count ?? 0) >= cls.capacity) {
    const result = fail("Class is full — no spots available.");
    logTool("book_class", "exit", result);
    return result;
  }

  // Check duplicate
  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("member_id", params.member_id)
    .eq("class_id", params.class_id)
    .eq("status", "booked")
    .maybeSingle();

  if (existing) {
    const result = fail("Member already has an active booking for this class.");
    logTool("book_class", "exit", result);
    return result;
  }

  // Insert
  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      member_id: params.member_id,
      class_id: params.class_id,
      status: "booked",
      fee_charged: 0,
      credit_lost: false,
      booked_at: getNow().toISOString(),
      cancelled_at: null,
    })
    .select()
    .single();

  if (insertErr || !booking) {
    const result = fail(`Failed to create booking: ${insertErr?.message}`);
    logTool("book_class", "exit", result);
    return result;
  }

  const result = success<BookResult>({
    booking_id: booking.id,
    class_type: cls.class_type,
    instructor: cls.instructor,
    starts_at: cls.starts_at,
  });
  logTool("book_class", "exit", result);
  return result;
}

// --- cancel_class ---

interface CancelParams {
  member_id: string;
  booking_id: string;
}

interface CancelResult {
  booking_id: string;
  new_status: "cancelled" | "late_cancelled";
  fee_charged: number;
  hours_before_class: number;
  class_type: string;
  starts_at: string;
}

export async function cancelClass(
  params: CancelParams
): Promise<ToolResult<CancelResult>> {
  logTool("cancel_class", "entry", params);

  // Validate booking
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", params.booking_id)
    .single();

  if (bookingErr || !booking) {
    const result = fail("Booking not found.");
    logTool("cancel_class", "exit", result);
    return result;
  }
  if (booking.member_id !== params.member_id) {
    const result = fail("Booking does not belong to this member.");
    logTool("cancel_class", "exit", result);
    return result;
  }
  if (booking.status !== "booked") {
    const result = fail(
      `Booking is already "${booking.status}" — can only cancel active bookings.`
    );
    logTool("cancel_class", "exit", result);
    return result;
  }

  // Get class info
  const { data: cls, error: clsErr } = await supabase
    .from("classes")
    .select("*")
    .eq("id", booking.class_id)
    .single();

  if (clsErr || !cls) {
    const result = fail("Associated class not found.");
    logTool("cancel_class", "exit", result);
    return result;
  }

  const now = getNow();
  const classStart = new Date(cls.starts_at);

  if (classStart <= now) {
    const result = fail("Cannot cancel — class has already started.");
    logTool("cancel_class", "exit", result);
    return result;
  }

  const msUntilClass = classStart.getTime() - now.getTime();
  const hoursUntilClass = msUntilClass / (1000 * 60 * 60);
  const isLate = hoursUntilClass < CANCEL_WINDOW_HOURS;
  const newStatus = isLate ? "late_cancelled" : "cancelled";
  const fee = isLate ? LATE_CANCEL_FEE : 0;

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: newStatus,
      fee_charged: fee,
      cancelled_at: now.toISOString(),
    })
    .eq("id", params.booking_id);

  if (updateErr) {
    const result = fail(`Failed to update booking: ${updateErr.message}`);
    logTool("cancel_class", "exit", result);
    return result;
  }

  const result = success<CancelResult>({
    booking_id: params.booking_id,
    new_status: newStatus,
    fee_charged: fee,
    hours_before_class: Math.round(hoursUntilClass * 100) / 100,
    class_type: cls.class_type,
    starts_at: cls.starts_at,
  });
  logTool("cancel_class", "exit", result);
  return result;
}

// --- Dispatcher ---

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult<unknown>> {
  switch (name) {
    case "check_schedule":
      return checkSchedule(input as ScheduleParams);
    case "book_class":
      return bookClass(input as unknown as BookParams);
    case "cancel_class":
      return cancelClass(input as unknown as CancelParams);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}
