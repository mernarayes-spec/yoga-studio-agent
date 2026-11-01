import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get("member_id");

  if (!memberId) {
    return NextResponse.json(
      { error: "member_id query parameter is required" },
      { status: 400 }
    );
  }

  // Find the most recent open conversation for this member
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("member_id", memberId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (convError) {
    console.error("Error fetching conversation:", convError);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }

  if (!conversation) {
    return NextResponse.json({ conversation: null, messages: [] });
  }

  // Fetch display messages for this conversation
  const { data: messages, error: msgError } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("Error fetching conversation messages:", msgError);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    conversation,
    messages: messages ?? [],
  });
}
