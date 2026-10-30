export type MembershipStatus = "active" | "frozen" | "none";
export type BookingStatus = "booked" | "cancelled" | "late_cancelled" | "no_show";

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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};
