import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { agentTools } from "@/lib/tool-schemas";
import { dispatchTool, clearPendingActions } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/system-prompt";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MAX_TOOL_ROUNDS = 6;

/** Tools that take a member_id parameter (injected server-side). */
const MEMBER_ID_TOOLS = new Set(["book_class", "cancel_class"]);

interface ChatRequest {
  member_id: string;
  member_name: string;
  messages: Anthropic.MessageParam[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequest;
  const { member_id, member_name, messages } = body;

  if (!member_id || !member_name || !messages?.length) {
    return NextResponse.json(
      { error: "member_id, member_name, and messages are required" },
      { status: 400 }
    );
  }

  // Fresh pending-action store for this request
  clearPendingActions();

  const systemPrompt = buildSystemPrompt(member_name);
  let currentMessages: Anthropic.MessageParam[] = [...messages];
  let rounds = 0;

  try {
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "model_call",
          round: rounds,
          message_count: currentMessages.length,
        })
      );

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-20250414",
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
        const textParts = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text);

        return NextResponse.json({
          role: "assistant",
          content: textParts.join("\n"),
          messages: [
            ...currentMessages,
            { role: "assistant", content: response.content },
          ],
        });
      }

      // Execute each tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolBlocks) {
        const input = { ...(toolBlock.input as Record<string, unknown>) };

        // Server-side member_id injection — always override, model never chooses
        if (MEMBER_ID_TOOLS.has(toolBlock.name)) {
          input.member_id = member_id;
        }

        // Escalation logging
        if (toolBlock.name === "escalate_to_human") {
          console.log(
            JSON.stringify({
              ts: new Date().toISOString(),
              event: "escalation",
              member_id,
              reason: input.reason ?? "unknown",
            })
          );
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

    // Exhausted rounds
    return NextResponse.json(
      { error: "Too many tool rounds — please try a simpler request." },
      { status: 500 }
    );
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
