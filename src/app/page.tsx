"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMemberIndex, setSelectedMemberIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const member = DEMO_MEMBERS[selectedMemberIndex];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleNewChat() {
    setMessages([]);
    setApiMessages([]);
    setInput("");
  }

  function handleMemberChange(index: number) {
    setSelectedMemberIndex(index);
    handleNewChat();
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Something went wrong." },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
      setApiMessages(data.messages);
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
        <h1 className="text-xl font-bold tracking-tight mb-6">Demo Studio</h1>

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
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary text-sm">
                Send a message to start chatting with the studio assistant.
              </p>
            </div>
          )}

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
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
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
