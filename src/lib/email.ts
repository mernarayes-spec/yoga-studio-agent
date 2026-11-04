import { Resend } from "resend";
import { toET } from "./time";
import { CANCEL_WINDOW_HOURS, LATE_CANCEL_FEE } from "../config";

/** Module-level client — created once, reused across calls. */
export const resend = new Resend(process.env.RESEND_API_KEY);

interface BookingEmailParams {
  memberName: string;
  classType: string;
  instructor: string;
  startsAt: string; // ISO-8601 UTC
  memberId: string;
  classId: string;
}

/**
 * Send a booking confirmation email.
 * Fire-and-forget: logs success or failure, never throws.
 */
export async function sendBookingConfirmation(params: BookingEmailParams): Promise<void> {
  const { memberName, classType, instructor, startsAt, memberId, classId } = params;
  const to = process.env.DEMO_EMAIL_TO;

  if (!to) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "email_skip",
        reason: "DEMO_EMAIL_TO not set",
        memberId,
        classId,
      })
    );
    return;
  }

  const formattedTime = toET(startsAt);

  const html = `
    <h2>You're booked, ${memberName}!</h2>
    <p><strong>${classType}</strong> with ${instructor}<br/>
    ${formattedTime}</p>
    <hr/>
    <p style="color: #666; font-size: 14px;">
      Need to cancel? You can cancel for free up to <strong>${CANCEL_WINDOW_HOURS} hours</strong>
      before class. Cancellations within ${CANCEL_WINDOW_HOURS} hours incur a
      <strong>$${LATE_CANCEL_FEE}</strong> late-cancel fee.
    </p>
  `;

  try {
    await resend.emails.send({
      from: "Demo Studio <onboarding@resend.dev>",
      to,
      subject: `Booking confirmed: ${classType} — ${formattedTime}`,
      html,
    });

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "email_send",
        status: "success",
        memberId,
        classId,
      })
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "email_send",
        status: "failure",
        memberId,
        classId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
