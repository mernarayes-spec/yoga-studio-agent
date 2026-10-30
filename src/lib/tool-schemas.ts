/** Claude API tool definitions for the agent.
 *  Format: Anthropic tool-use schema (no SDK dependency). */

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
      "Book a class for a member. The member must have an active membership and the class must have available spots.",
    input_schema: {
      type: "object",
      properties: {
        member_id: {
          type: "string",
          description: "UUID of the member.",
        },
        class_id: {
          type: "string",
          description: "UUID of the class to book.",
        },
      },
      required: ["member_id", "class_id"],
    },
  },
  {
    name: "cancel_class",
    description:
      "Cancel an existing booking. Cancelling within 10 hours of class start incurs a $15 late-cancellation fee.",
    input_schema: {
      type: "object",
      properties: {
        member_id: {
          type: "string",
          description: "UUID of the member.",
        },
        booking_id: {
          type: "string",
          description: "UUID of the booking to cancel.",
        },
      },
      required: ["member_id", "booking_id"],
    },
  },
];
