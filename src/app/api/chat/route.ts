import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { agentTools } from "@/lib/tool-schemas";
import { dispatchTool } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { supabase } from "@/lib/supabase";
import type { ConversationStatus, ResolutionType } from "@/lib/database.types";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MAX_TOOL_ROUNDS = 6;

/** Tools that take a member_id parameter (injected server-side). */
const MEMBER_ID_TOOLS = new Set(["book_class", "cancel_class", "reschedule_class", "lookup_bookings", "lookup_membership"]);

/** Map confirm_action action types to resolution types. */
const ACTION_TO_RESOLUTION: Record<string, ResolutionType> = {
  book_class: "booked",
  cancel_class: "cancelled",
  reschedule_class: "rescheduled",
};

interface ChatRequest {
  member_id: string;
  member_name: string;
  messages: Anthropic.MessageParam[];
  conversation_id?: string;
}

/** Truncate text to ~200 chars for summary. */
function truncateSummary(text: string): string {
  if (text.length <= 200) return text;
  return text.slice(0, 197) + "...";
}

/** Extract tool names from assistant content blocks. */
function extractToolNames(content: Anthropic.ContentBlock[]): string[] {
  return content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => b.name);
}

/** Extract display text from assistant content blocks. */
function extractDisplayText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequest;
  const { member_id, member_name, messages, conversation_id } = body;

  if (!member_id || !member_name || !messages?.length) {
    return NextResponse.json(
      { error: "member_id, member_name, and messages are required" },
      { status: 400 }
    );
  }

  const systemPrompt = buildSystemPrompt(member_name);

  // --- Load or create conversation ---
  let convId = conversation_id ?? null;
  let apiMessages: Anthropic.MessageParam[];

  if (convId) {
    // Load existing conversation's api_messages from DB
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("api_messages")
      .eq("id", convId)
      .single();

    if (convError || !conv) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    apiMessages = conv.api_messages as Anthropic.MessageParam[];
  } else {
    // Create a new conversation
    const { data: newConv, error: createError } = await supabase
      .from("conversations")
      .insert({
        member_id,
        status: "open" as const,
        resolution_type: null,
        summary: null,
        api_messages: [],
      })
      .select("id")
      .single();

    if (createError || !newConv) {
      console.error("Failed to create conversation:", createError);
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }

    convId = newConv.id;
    apiMessages = [];
  }

  // The last message from the client should be the new user message
  const lastClientMsg = messages[messages.length - 1];
  const userDisplayText =
    typeof lastClientMsg.content === "string"
      ? lastClientMsg.content
      : "(complex message)";

  // Append new user message to the DB-sourced history
  apiMessages = [...apiMessages, lastClientMsg];

  // Strip thinking blocks from conversation history
  const sanitizedMessages: Anthropic.MessageParam[] = apiMessages.map((msg) => {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const filtered = (msg.content as Anthropic.ContentBlockParam[]).filter(
        (block) => (block as { type: string }).type !== "thinking"
      );
      return { ...msg, content: filtered } as Anthropic.MessageParam;
    }
    return msg;
  });

  let currentMessages: Anthropic.MessageParam[] = [...sanitizedMessages];
  let rounds = 0;

  // Track resolution across tool rounds
  let newStatus: ConversationStatus | null = null;
  let newResolutionType: ResolutionType | null = null;
  let allToolNames: string[] = [];

  try {
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "model_call",
          round: rounds,
          message_count: currentMessages.length,
          conversation_id: convId,
        })
      );

      const response = await anthropic.messages.create({
        model: "claude-haiku-5-5",
        max_tokens: 1024,
        system: systemPrompt,
        tools: agentTools as Anthropic.Tool[],
        messages: currentMessages,
      });

      // Check if the model wants to use tools
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolBlocks.length === 0 || response.stop_reason === "end_turn") {
        // No tool calls — return the final text response
        const displayText = extractDisplayText(response.content);

        // Final messages array for DB storage
        const finalApiMessages: Anthropic.MessageParam[] = [
          ...currentMessages,
          { role: "assistant", content: response.content },
        ];

        // If not already escalated, an end_turn with no tools = answered
        if (!newStatus || newStatus !== "escalated") {
          newStatus = "resolved";
          newResolutionType = newResolutionType ?? "answered";
        }

        // Persist to DB
        await persistConversation(convId!, finalApiMessages, displayText, userDisplayText, allToolNames, newStatus, newResolutionType);

        return NextResponse.json({
          role: "assistant",
          content: displayText,
          messages: finalApiMessages,
          conversation_id: convId,
        });
      }

      // Execute each tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      const roundToolNames = extractToolNames(response.content);
      allToolNames = [...allToolNames, ...roundToolNames];

      for (const toolBlock of toolBlocks) {
        const input = { ...(toolBlock.input as Record<string, unknown>) };

        // Server-side member_id injection — always override, model never chooses
        if (MEMBER_ID_TOOLS.has(toolBlock.name)) {
          input.member_id = member_id;
        }

        // Escalation logging + status tracking
        if (toolBlock.name === "escalate_to_human") {
          console.log(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "escalation",
              member_id,
              reason: input.reason ?? "unknown",
              conversation_id: convId,
            })
          );
          newStatus = "escalated";
          newResolutionType = null;
        }

        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "tool_call",
            tool: toolBlock.name,
            input,
          })
        );

        const result = await dispatchTool(toolBlock.name, input);

        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "tool_result",
            tool: toolBlock.name,
            ok: result.ok,
          })
        );

        // Track confirm_action success for resolution
        if (toolBlock.name === "confirm_action" && result.ok && newStatus !== "escalated") {
          const confirmed = result as { ok: true; data: { confirmed: boolean } & Record<string, unknown> };
          if (confirmed.data.confirmed) {
            // Determine the action type from the result data or tool names used earlier
            // The confirm_action result includes fields from the preview, so we check
            // what action was pending by looking at earlier tool calls
            const actionType = detectActionType(allToolNames);
            if (actionType) {
              newStatus = "resolved";
              newResolutionType = ACTION_TO_RESOLUTION[actionType] ?? null;
            }
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      // Append assistant response + tool results, loop again
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    // Exhausted rounds — persist what we have
    await persistConversation(convId!, currentMessages, "", userDisplayText, allToolNames, newStatus ?? "open", newResolutionType);

    return NextResponse.json(
      { error: "Too many tool rounds — please try a simpler request.", conversation_id: convId },
      { status: 500 }
    );
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Internal server error", conversation_id: convId },
      { status: 500 }
    );
  }
}

/** Detect which mutation action preceded a confirm_action call. */
function detectActionType(toolNames: string[]): string | null {
  // Walk backwards through tool names to find the most recent mutation tool before confirm_action
  for (let i = toolNames.length - 1; i >= 0; i--) {
    if (toolNames[i] in ACTION_TO_RESOLUTION) {
      return toolNames[i];
    }
  }
  return null;
}

/** Persist conversation state and messages to Supabase. */
async function persistConversation(
  conversationId: string,
  apiMessages: Anthropic.MessageParam[],
  assistantDisplayText: string,
  userDisplayText: string,
  toolNames: string[],
  status: ConversationStatus,
  resolutionType: ResolutionType | null
) {
  // First check if conversation is already escalated (sticky)
  const { data: existing } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", conversationId)
    .single();

  const isAlreadyEscalated = existing?.status === "escalated";
  const finalStatus = isAlreadyEscalated ? "escalated" : status;
  const finalResolution = isAlreadyEscalated ? null : resolutionType;

  const summary = assistantDisplayText ? truncateSummary(assistantDisplayText) : null;

  // Update the conversation row
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      api_messages: apiMessages as unknown[],
      summary,
      status: finalStatus,
      resolution_type: finalResolution,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateError) {
    console.error("Failed to update conversation:", updateError);
  }

  // Insert display messages (user + assistant)
  const messagesToInsert: Array<{
    conversation_id: string;
    role: "user" | "assistant";
    display_text: string;
    tool_names: string[] | null;
  }> = [];

  if (userDisplayText && userDisplayText !== "(complex message)") {
    messagesToInsert.push({
      conversation_id: conversationId,
      role: "user",
      display_text: userDisplayText,
      tool_names: null,
    });
  }

  if (assistantDisplayText) {
    messagesToInsert.push({
      conversation_id: conversationId,
      role: "assistant",
      display_text: assistantDisplayText,
      tool_names: toolNames.length > 0 ? toolNames : null,
    });
  }

  if (messagesToInsert.length > 0) {
    const { error: msgError } = await supabase
      .from("conversation_messages")
      .insert(messagesToInsert);

    if (msgError) {
      console.error("Failed to insert conversation messages:", msgError);
    }
  }
}
