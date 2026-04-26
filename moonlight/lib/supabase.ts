import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StoryRow = {
  slug: string;
  child_name: string;
  theme: string | null;
  duration_seconds: number | null;
  audio_url: string | null;
  story_text: string | null;
  created_at: string;
  play_count: number | null;
  user_id: string | null;
};

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "generating"
  | "pending_review"
  | "ready"
  | "audio_failed"
  | "failed";

export type OrderForm = {
  childName: string;
  childAge: string;
  interests: string;
  islamicValue: string;
  lengthMinutes: string;
  narratorVoice: "female" | "male";
  parentEmail: string;
  note?: string;
};

export type OrderRow = {
  id: string;
  status: OrderStatus;
  parent_email: string;
  form: OrderForm;
  story_slug: string | null;
  story_text: string | null;
  tts_word_count: number | null;
  tts_char_count: number | null;
  elevenlabs_request_id: string | null;
  elevenlabs_billed_characters: number | null;
  safety_reasons: string[] | null;
  error: string | null;
  stripe_session_id: string | null;
  one_time_credits_backfilled: boolean;
  story_ready_email_sent_at: string | null;
  admin_resolved_at: string | null;
  admin_resolved_by_email: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanTier = "free" | "monthly" | "unlimited";

export type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanTier;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  stories_this_period: number;
  extra_story_credits: number;
  created_at: string;
  updated_at: string;
};

export type LibraryFeedbackRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  message: string;
  page_url: string | null;
  created_at: string;
};

export type AdminRuntimeFlagsRow = {
  id: number;
  enable_story_review: boolean;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      stories: {
        Row: StoryRow;
        Insert: {
          slug: string;
          child_name: string;
          theme?: string | null;
          duration_seconds?: number | null;
          audio_url?: string | null;
          story_text?: string | null;
          created_at?: string;
          play_count?: number | null;
          user_id?: string | null;
        };
        Update: Partial<StoryRow>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: {
          id?: string;
          status?: OrderStatus;
          parent_email: string;
          form: OrderForm;
          story_slug?: string | null;
          story_text?: string | null;
          tts_word_count?: number | null;
          tts_char_count?: number | null;
          elevenlabs_request_id?: string | null;
          elevenlabs_billed_characters?: number | null;
          safety_reasons?: string[] | null;
          error?: string | null;
          stripe_session_id?: string | null;
          one_time_credits_backfilled?: boolean;
          story_ready_email_sent_at?: string | null;
          admin_resolved_at?: string | null;
          admin_resolved_by_email?: string | null;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<OrderRow>;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: {
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan?: PlanTier;
          status?: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          stories_this_period?: number;
          extra_story_credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<SubscriptionRow>;
        Relationships: [];
      };
      library_feedback: {
        Row: LibraryFeedbackRow;
        Insert: {
          id?: string;
          user_id?: string | null;
          email?: string | null;
          message: string;
          page_url?: string | null;
          created_at?: string;
        };
        Update: Partial<LibraryFeedbackRow>;
        Relationships: [];
      };
      admin_runtime_flags: {
        Row: AdminRuntimeFlagsRow;
        Insert: {
          id?: number;
          enable_story_review?: boolean;
          updated_at?: string;
        };
        Update: Partial<AdminRuntimeFlagsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_subscription_usage: {
        Args: { p_user_id: string };
        Returns: void;
      };
    };
    Enums: { order_status: OrderStatus; plan_tier: PlanTier };
    CompositeTypes: Record<string, never>;
  };
};

let _browserClient: SupabaseClient<Database> | null = null;

function readConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase renamed the public key: old "anon key" → new "publishable key".
  // Accept either so the same code works in old and new projects.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

/**
 * Returns a Supabase client configured with the public anon key.
 * Safe to call in server components (no auth cookies) and in the browser.
 * Returns null if env vars aren't set so callers can render a helpful message.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  const { url, anonKey } = readConfig();
  if (!url || !anonKey) return null;

  if (typeof window === "undefined") {
    return createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (!_browserClient) {
    _browserClient = createClient<Database>(url, anonKey);
  }
  return _browserClient;
}

export function isSupabaseConfigured() {
  const { url, anonKey } = readConfig();
  return Boolean(url && anonKey);
}
