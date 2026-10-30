import { supabase } from "./supabase";
import { getNow } from "./time";
import { CANCEL_WINDOW_HOURS, LATE_CANCEL_FEE } from "../config";
import { randomUUID } from "crypto";

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

// --- Pending actions ---

export interface PendingAction {
  id: string;
  action: "book_class" | "cancel_class";
  params: Record<string, unknown>;
  preview: Record<string, unknown>;
}

/** In-memory store scoped to a single request's tool-loop. */
const pendingActions = new Map<string, PendingAction>();

export function clearPendingActions() {
  pendingActions.clear();
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

// --- book_class (preview only — creates a pending action) ---

interface BookParams {
  member_id: string;
  class_id: string;
}

export async function bookClass(
  params: BookParams
): Promise<ToolResult<{ pending_action_id: string; summary: string; class_type: string; instructor: string; starts_at: string }>> {
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

  // All validations pass — create pending action instead of writing
  const actionId = randomUUID();
  const preview = {
    class_type: cls.class_type,
    instructor: cls.instructor,
    starts_at: cls.starts_at,
  };
  pendingActions.set(actionId, {
    id: actionId,
    action: "book_class",
    params: { member_id: params.member_id, class_id: params.class_id },
    preview,
  });

  const summary = `Book ${cls.class_type} with ${cls.instructor} at ${cls.starts_at}`;
  const result = success({
    pending_action_id: actionId,
    summary,
    ...preview,
  });
  logTool("book_class", "exit", result);
  return result;
}

// --- cancel_class (preview only — creates a pending action) ---

interface CancelParams {
  member_id: string;
  booking_id: string;
}

export async function cancelClass(
  params: CancelParams
): Promise<ToolResult<{ pending_action_id: string; summary: string; fee_charged: number; hours_before_class: number; class_type: string; starts_at: string }>> {
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
  const fee = isLate ? LATE_CANCEL_FEE : 0;
  const newStatus = isLate ? "late_cancelled" : "cancelled";

  // Create pending action instead of writing
  const actionId = randomUUID();
  const preview = {
    new_status: newStatus,
    fee_charged: fee,
    hours_before_class: Math.round(hoursUntilClass * 100) / 100,
    class_type: cls.class_type,
    starts_at: cls.starts_at,
  };
  pendingActions.set(actionId, {
    id: actionId,
    action: "cancel_class",
    params: { member_id: params.member_id, booking_id: params.booking_id },
    preview,
  });

  const feeNote = fee > 0 ? ` A $${fee} late-cancellation fee will apply.` : "";
  const summary = `Cancel ${cls.class_type} at ${cls.starts_at}.${feeNote}`;
  const result = success({
    pending_action_id: actionId,
    summary,
    fee_charged: fee,
    hours_before_class: Math.round(hoursUntilClass * 100) / 100,
    class_type: cls.class_type,
    starts_at: cls.starts_at,
  });
  logTool("cancel_class", "exit", result);
  return result;
}

// --- confirm_action (executes a pending action) ---

interface ConfirmParams {
  pending_action_id: string;
}

export async function confirmAction(
  params: ConfirmParams
): Promise<ToolResult<unknown>> {
  logTool("confirm_action", "entry", params);

  const action = pendingActions.get(params.pending_action_id);
  if (!action) {
    const result = fail("No pending action found with that ID. It may have expired or already been confirmed.");
    logTool("confirm_action", "exit", result);
    return result;
  }

  pendingActions.delete(params.pending_action_id);

  if (action.action === "book_class") {
    const p = action.params as { member_id: string; class_id: string };
    const { data: booking, error: insertErr } = await supabase
      .from("bookings")
      .insert({
        member_id: p.member_id,
        class_id: p.class_id,
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
      logTool("confirm_action", "exit", result);
      return result;
    }

    const result = success({
      confirmed: true,
      booking_id: booking.id,
      ...action.preview,
    });
    logTool("confirm_action", "exit", result);
    return result;
  }

  if (action.action === "cancel_class") {
    const p = action.params as { member_id: string; booking_id: string };
    const preview = action.preview as { new_status: "cancelled" | "late_cancelled"; fee_charged: number };
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        status: preview.new_status,
        fee_charged: preview.fee_charged,
        cancelled_at: getNow().toISOString(),
      })
      .eq("id", p.booking_id);

    if (updateErr) {
      const result = fail(`Failed to cancel booking: ${updateErr.message}`);
      logTool("confirm_action", "exit", result);
      return result;
    }

    const result = success({
      confirmed: true,
      booking_id: p.booking_id,
      ...action.preview,
    });
    logTool("confirm_action", "exit", result);
    return result;
  }

  const result = fail(`Unknown action type: ${action.action}`);
  logTool("confirm_action", "exit", result);
  return result;
}

// --- Dispatcher ---

const WRITE_TOOLS = new Set(["book_class", "cancel_class", "confirm_action"]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

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
    case "confirm_action":
      return confirmAction(input as unknown as ConfirmParams);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}
