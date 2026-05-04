export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      broadcast_reads: {
        Row: {
          broadcast_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reads_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          target: string
          target_tier: Database["public"]["Enums"]["user_tier"] | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          target?: string
          target_tier?: Database["public"]["Enums"]["user_tier"] | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          target?: string
          target_tier?: Database["public"]["Enums"]["user_tier"] | null
          title?: string
        }
        Relationships: []
      }
      credit_caps: {
        Row: {
          max_credit_cents: number
          plan_id: string
          updated_at: string
        }
        Insert: {
          max_credit_cents?: number
          plan_id: string
          updated_at?: string
        }
        Update: {
          max_credit_cents?: number
          plan_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          allowed_weekdays: number[]
          code: string
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          allowed_weekdays: number[]
          code: string
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          allowed_weekdays?: number[]
          code?: string
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      meal_redemptions: {
        Row: {
          id: string
          redeemed_at: string
          redeemed_by: string | null
          redeemed_on: string
          slot_id: string | null
          subscription_id: string
          user_id: string
        }
        Insert: {
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
          redeemed_on?: string
          slot_id?: string | null
          subscription_id: string
          user_id: string
        }
        Update: {
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
          redeemed_on?: string
          slot_id?: string | null
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_redemptions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "meal_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_slots: {
        Row: {
          capacity: number
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          label: string
          start_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          capacity: number
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          label: string
          start_time: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          label?: string
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      offer_redemptions: {
        Row: {
          applied_cents: number
          created_at: string
          id: string
          offer_id: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          applied_cents: number
          created_at?: string
          id?: string
          offer_id: string
          subscription_id: string
          user_id: string
        }
        Update: {
          applied_cents?: number
          created_at?: string
          id?: string
          offer_id?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          applicable_plan_ids: string[]
          code: string
          created_at: string
          created_by: string | null
          current_redemptions: number
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          min_subtotal_cents: number
          name: string
          per_user_limit: number
          starts_at: string
          updated_at: string
        }
        Insert: {
          applicable_plan_ids?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          current_redemptions?: number
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          min_subtotal_cents?: number
          name: string
          per_user_limit?: number
          starts_at?: string
          updated_at?: string
        }
        Update: {
          applicable_plan_ids?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          current_redemptions?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          min_subtotal_cents?: number
          name?: string
          per_user_limit?: number
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          discount_wallet_balance_cents: number
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          name: string | null
          primary_phone: string | null
          qr_code_pass: string | null
          secondary_phone: string | null
          student_number: string | null
          surname: string | null
          tier: Database["public"]["Enums"]["user_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discount_wallet_balance_cents?: number
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          name?: string | null
          primary_phone?: string | null
          qr_code_pass?: string | null
          secondary_phone?: string | null
          student_number?: string | null
          surname?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discount_wallet_balance_cents?: number
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          name?: string | null
          primary_phone?: string | null
          qr_code_pass?: string | null
          secondary_phone?: string | null
          student_number?: string | null
          surname?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code_used: string
          completed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          plan_id: string | null
          referred_user_id: string
          referrer_user_id: string
          reward_cents: number
          rewarded_at: string | null
          signed_up_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          code_used: string
          completed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          plan_id?: string | null
          referred_user_id: string
          referrer_user_id: string
          reward_cents?: number
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          code_used?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          plan_id?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          reward_cents?: number
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          amount_cents: number
          created_at: string
          end_date: string | null
          id: string
          plan_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
          yoco_checkout_id: string | null
          yoco_payment_id: string | null
        }
        Insert: {
          activated_at?: string | null
          amount_cents: number
          created_at?: string
          end_date?: string | null
          id?: string
          plan_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
          yoco_checkout_id?: string | null
          yoco_payment_id?: string | null
        }
        Update: {
          activated_at?: string | null
          amount_cents?: number
          created_at?: string
          end_date?: string | null
          id?: string
          plan_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
          yoco_checkout_id?: string | null
          yoco_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_config: {
        Row: {
          min_paid_referrals: number
          tier: Database["public"]["Enums"]["user_tier"]
          updated_at: string
        }
        Insert: {
          min_paid_referrals: number
          tier: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
        }
        Update: {
          min_paid_referrals?: number
          tier?: Database["public"]["Enums"]["user_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          balance_after_cents: number
          created_at: string
          delta_cents: number
          id: string
          notes: string | null
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          balance_after_cents: number
          created_at?: string
          delta_cents: number
          id?: string
          notes?: string | null
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          balance_after_cents?: number
          created_at?: string
          delta_cents?: number
          id?: string
          notes?: string | null
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_activate_subscription: {
        Args: {
          _end_date?: string
          _plan_id: string
          _start_date?: string
          _target_user: string
        }
        Returns: Json
      }
      admin_analytics_summary: { Args: { _days?: number }; Returns: Json }
      admin_cancel_subscription: {
        Args: { _subscription_id: string }
        Returns: Json
      }
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_find_user_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          name: string
          student_number: string
          surname: string
          user_id: string
        }[]
      }
      admin_grant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          active_end_date: string
          active_plan_name: string
          active_subscription_id: string
          email: string
          name: string
          roles: Database["public"]["Enums"]["app_role"][]
          student_number: string
          surname: string
          user_id: string
        }[]
      }
      admin_recent_redemptions: {
        Args: { _limit?: number }
        Returns: {
          id: string
          name: string
          redeemed_at: string
          redeemed_on: string
          served_by_name: string
          student_number: string
          surname: string
          user_id: string
        }[]
      }
      admin_referral_tree: {
        Args: { _limit?: number }
        Returns: {
          paid_referrals: number
          pending_referrals: number
          referrer_email: string
          referrer_name: string
          referrer_surname: string
          referrer_tier: Database["public"]["Enums"]["user_tier"]
          referrer_user_id: string
          referrer_wallet_cents: number
          total_reward_cents: number
        }[]
      }
      admin_reissue_pass_code: { Args: { _target_user: string }; Returns: Json }
      admin_revoke_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: Json
      }
      apply_wallet_credit_to_subscription: {
        Args: { _subscription_id: string }
        Returns: Json
      }
      claim_first_admin: { Args: never; Returns: Json }
      credit_wallet: {
        Args: {
          _delta: number
          _notes?: string
          _reason: string
          _ref?: string
          _user: string
        }
        Returns: number
      }
      generate_qr_pass_code: { Args: never; Returns: string }
      get_my_wallet_summary: { Args: never; Returns: Json }
      get_or_create_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_my_broadcasts: {
        Args: never
        Returns: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          title: string
        }[]
      }
      redeem_offer_code: {
        Args: { _code: string; _subscription_id: string }
        Returns: Json
      }
      redeem_referral_code: { Args: { _code: string }; Returns: Json }
      referral_reward_for_count: { Args: { _count: number }; Returns: number }
      serve_meal_by_pass: {
        Args: { _kitchen_user_id?: string; _pass_code: string }
        Returns: Json
      }
      serve_meal_by_pass_with_slot: {
        Args: {
          _kitchen_user_id?: string
          _pass_code: string
          _slot_id: string
        }
        Returns: Json
      }
      slot_remaining_capacity: {
        Args: { _date: string; _slot_id: string }
        Returns: number
      }
      tier_for_paid_count: {
        Args: { _count: number }
        Returns: Database["public"]["Enums"]["user_tier"]
      }
      verify_pass: { Args: { _pass_code: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "kitchen" | "student"
      subscription_status:
        | "pending"
        | "active"
        | "expired"
        | "failed"
        | "cancelled"
      user_tier: "bronze" | "silver" | "gold" | "elite"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "kitchen", "student"],
      subscription_status: [
        "pending",
        "active",
        "expired",
        "failed",
        "cancelled",
      ],
      user_tier: ["bronze", "silver", "gold", "elite"],
    },
  },
} as const
