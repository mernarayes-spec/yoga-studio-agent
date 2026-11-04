import { Resend } from "resend";
import { CANCEL_WINDOW_HOURS, LATE_CANCEL_FEE } from "../config";

/** Module-level client — created once, reused across calls. */
export const resend = new Resend(process.env.RESEND_API_KEY);

interface BookingEmailParams {
  memberName: string;
  classType: string;
  instructor: string;
  startsAt: string; // pre-formatted ET string from preview
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

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">You're booked, ${memberName}!</h2>
      <p><strong>${classType}</strong> with ${instructor}<br/>
      ${startsAt}</p>
      <div style="background-color: #f97316; color: white; padding: 16px 20px; border-radius: 8px; margin-top: 24px; font-size: 14px;">
        <strong>Cancellation policy:</strong> You can cancel for free up to ${CANCEL_WINDOW_HOURS} hours
        before class. Cancellations within ${CANCEL_WINDOW_HOURS} hours incur a
        $${LATE_CANCEL_FEE} late-cancel fee.
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "Demo Studio <onboarding@resend.dev>",
      to,
      subject: `Booking confirmed: ${classType} — ${startsAt}`,
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
