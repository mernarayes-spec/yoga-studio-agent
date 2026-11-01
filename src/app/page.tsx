"use client";

import { useState, useRef, useEffect, FormEvent, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DemoMember {
  id: string;
  name: string;
  status: "active" | "frozen" | "none";
}

const DEMO_MEMBERS: DemoMember[] = [
  { id: "a0000000-0000-0000-0000-000000000001", name: "Alice", status: "active" },
  { id: "a0000000-0000-0000-0000-000000000002", name: "Bob", status: "active" },
  { id: "a0000000-0000-0000-0000-000000000003", name: "Carol", status: "active" },
  { id: "a0000000-0000-0000-0000-000000000004", name: "Dana", status: "frozen" },
  { id: "a0000000-0000-0000-0000-000000000005", name: "Eve", status: "none" },
  { id: "a0000000-0000-0000-0000-000000000006", name: "Frank", status: "active" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  frozen: "bg-blue-400",
  none: "bg-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  frozen: "Frozen",
  none: "No membership",
};

const STORAGE_KEY = "yoga-studio-member-index";

function getInitialMemberIndex(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const idx = parseInt(stored, 10);
    if (idx >= 0 && idx < DEMO_MEMBERS.length) return idx;
  }
  return 0;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMemberIndex, setSelectedMemberIndex] = useState(getInitialMemberIndex);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const member = DEMO_MEMBERS[selectedMemberIndex];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist selectedMemberIndex to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(selectedMemberIndex));
  }, [selectedMemberIndex]);

  // Load existing open conversation on mount / member change
  const loadConversation = useCallback(async (memberId: string) => {
    setIsRestoring(true);
    try {
      const res = await fetch(`/api/conversations?member_id=${memberId}`);
      if (!res.ok) {
        setIsRestoring(false);
        return;
      }
      const data = await res.json();
      if (data.conversation && data.messages?.length > 0) {
        setConversationId(data.conversation.id);
        setApiMessages(data.conversation.api_messages ?? []);
        setMessages(
          data.messages.map((m: { role: string; display_text: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.display_text,
          }))
        );
      } else {
        setConversationId(null);
        setApiMessages([]);
        setMessages([]);
      }
    } catch {
      // Silently fail — user can still start a new conversation
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    loadConversation(member.id);
  }, [member.id, loadConversation]);

  function handleNewChat() {
    setMessages([]);
    setApiMessages([]);
    setConversationId(null);
    setInput("");
  }

  function handleMemberChange(index: number) {
    setSelectedMemberIndex(index);
    setMessages([]);
    setApiMessages([]);
    setConversationId(null);
    setInput("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const outgoing = [...apiMessages, { role: "user", content: text }];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          member_name: member.name,
          messages: outgoing,
          conversation_id: conversationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Something went wrong." },
        ]);
        // Still capture conversation_id if returned
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
        }
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
      setApiMessages(data.messages);
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] shrink-0 border-r border-border bg-surface flex flex-col p-6">
        <h1 className="text-xl font-bold tracking-tight">Yoga Studio</h1>
        <p className="text-sm text-text-secondary mb-6">Customer Service Center</p>

        <label className="text-sm font-medium text-text-secondary mb-2">
          Member
        </label>
        <select
          value={selectedMemberIndex}
          onChange={(e) => handleMemberChange(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent mb-4"
        >
          {DEMO_MEMBERS.map((m, i) => (
            <option key={m.id} value={i}>
              {m.name} — {STATUS_LABELS[m.status]}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 text-sm mb-6">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[member.status]}`}
          />
          <span className="text-text-secondary">{STATUS_LABELS[member.status]}</span>
        </div>

        <button
          onClick={handleNewChat}
          className="mt-auto w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-surface transition-colors"
        >
          New conversation
        </button>
      </aside>

      {/* Chat panel */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex justify-end px-6 py-3 border-b border-border">
          <span className="text-xs text-text-secondary bg-surface border border-border rounded-full px-3 py-1">
            Speaking as {member.name}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isRestoring ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary text-sm">Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary text-sm">
                Send a message to start chatting with the studio assistant.
              </p>
            </div>
          ) : null}

          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-user-bubble text-foreground"
                      : "bg-assistant-bubble text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-assistant-bubble rounded-2xl px-4 py-3 text-sm text-text-secondary">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-border px-6 py-4"
        >
          <div className="max-w-2xl mx-auto flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={isLoading || isRestoring}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || isRestoring || !input.trim()}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
