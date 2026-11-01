export type MembershipStatus = "active" | "frozen" | "none";
export type BookingStatus = "booked" | "cancelled" | "late_cancelled" | "no_show";
export type ConversationStatus = "open" | "resolved" | "escalated";
export type ResolutionType = "booked" | "cancelled" | "rescheduled" | "answered";

export type Member = {
  id: string;
  name: string;
  email: string;
  membership_status: MembershipStatus;
  membership_start_date: string | null;
  freeze_start_date: string | null;
  freeze_end_date: string | null;
  freezes_used: number;
  created_at: string;
};

export type Class = {
  id: string;
  class_type: string;
  instructor: string;
  starts_at: string;
  capacity: number;
  created_at: string;
};

export type Booking = {
  id: string;
  member_id: string;
  class_id: string;
  status: BookingStatus;
  fee_charged: number;
  credit_lost: boolean;
  booked_at: string;
  cancelled_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  member_id: string;
  status: ConversationStatus;
  resolution_type: ResolutionType | null;
  summary: string | null;
  api_messages: unknown[];
  created_at: string;
  updated_at: string;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  display_text: string;
  tool_names: string[] | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      members: {
        Row: Member;
        Insert: Omit<Member, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Member, "id">>;
        Relationships: [];
      };
      classes: {
        Row: Class;
        Insert: Omit<Class, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Class, "id">>;
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Booking, "id">>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Conversation, "id">>;
        Relationships: [];
      };
      conversation_messages: {
        Row: ConversationMessage;
        Insert: Omit<ConversationMessage, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ConversationMessage, "id">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};
