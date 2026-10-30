/** Claude API tool definitions for the agent.
 *  Format: Anthropic tool-use schema (no SDK dependency).
 *
 *  member_id is omitted from schemas — injected server-side so
 *  the model never chooses or hallucinates it. */

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const agentTools: ToolSchema[] = [
  {
    name: "check_schedule",
    description:
      "Look up upcoming classes and their availability. All parameters are optional — defaults to the next 7 days.",
    input_schema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "ISO-8601 datetime. Defaults to now.",
        },
        end_date: {
          type: "string",
          description:
            "ISO-8601 datetime. Defaults to 7 days after start_date.",
        },
        class_type: {
          type: "string",
          description:
            'Filter by class type, e.g. "vinyasa", "hatha", "yin", "power".',
        },
      },
    },
  },
  {
    name: "book_class",
    description:
      "Prepare a class booking for the current member. Returns a preview with a pending_action_id. The booking is NOT confirmed yet — present the details to the member and call confirm_action after they agree.",
    input_schema: {
      type: "object",
      properties: {
        class_id: {
          type: "string",
          description: "UUID of the class to book.",
        },
      },
      required: ["class_id"],
    },
  },
  {
    name: "cancel_class",
    description:
      "Prepare a cancellation for the current member's booking. Returns a preview (including any late-cancel fee) with a pending_action_id. The cancellation is NOT confirmed yet — present the details to the member and call confirm_action after they agree.",
    input_schema: {
      type: "object",
      properties: {
        booking_id: {
          type: "string",
          description: "UUID of the booking to cancel.",
        },
      },
      required: ["booking_id"],
    },
  },
  {
    name: "lookup_bookings",
    description:
      "Look up the current member's active bookings. Returns a list of upcoming booked classes with booking IDs, class details, and times.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "lookup_membership",
    description:
      "Look up the current member's membership status, including start date, freeze info, and freezes used.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "confirm_action",
    description:
      "Execute a previously previewed action (book or cancel) after the member has confirmed. Pass the pending_action_id returned by book_class or cancel_class.",
    input_schema: {
      type: "object",
      properties: {
        pending_action_id: {
          type: "string",
          description: "The pending_action_id from the preview step.",
        },
      },
      required: ["pending_action_id"],
    },
  },
];
