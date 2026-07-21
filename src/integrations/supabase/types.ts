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
      ad_spend_daily: {
        Row: {
          brand_id: string | null
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          conversations_started: number
          created_at: string
          date: string
          id: string
          impressions: number | null
          meta_account_id: string
          spend_usd: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          conversations_started?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          meta_account_id: string
          spend_usd?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          conversations_started?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          meta_account_id?: string
          spend_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_daily_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          code: string
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      campaign_brand_map: {
        Row: {
          brand_id: string
          campaign_id: string
          campaign_name: string | null
          created_at: string
          id: string
          meta_account_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          campaign_id: string
          campaign_name?: string | null
          created_at?: string
          id?: string
          meta_account_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          campaign_name?: string | null
          created_at?: string
          id?: string
          meta_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_brand_map_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          date: string
          source: string
          usd_kzt: number
        }
        Insert: {
          created_at?: string
          date: string
          source?: string
          usd_kzt: number
        }
        Update: {
          created_at?: string
          date?: string
          source?: string
          usd_kzt?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          brand_id: string | null
          called: boolean | null
          city: string | null
          comment: string | null
          created_at: string
          ctwa_clid: string | null
          event_created: boolean | null
          id: string
          interest: string | null
          meta_account_id: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_form_id: string | null
          name: string | null
          phone: string | null
          qualified: boolean | null
          raw_payload: Json | null
          sent_to_1c: boolean
          source: Database["public"]["Enums"]["lead_source"]
          source_ref: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          called?: boolean | null
          city?: string | null
          comment?: string | null
          created_at?: string
          ctwa_clid?: string | null
          event_created?: boolean | null
          id?: string
          interest?: string | null
          meta_account_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          name?: string | null
          phone?: string | null
          qualified?: boolean | null
          raw_payload?: Json | null
          sent_to_1c?: boolean
          source?: Database["public"]["Enums"]["lead_source"]
          source_ref?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          called?: boolean | null
          city?: string | null
          comment?: string | null
          created_at?: string
          ctwa_clid?: string | null
          event_created?: boolean | null
          id?: string
          interest?: string | null
          meta_account_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          name?: string | null
          phone?: string | null
          qualified?: boolean | null
          raw_payload?: Json | null
          sent_to_1c?: boolean
          source?: Database["public"]["Enums"]["lead_source"]
          source_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_integration: {
        Row: {
          access_token: string | null
          ad_accounts: Json | null
          connected_at: string | null
          id: number
          meta_user_id: string | null
          selected_forms: Json | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          ad_accounts?: Json | null
          connected_at?: string | null
          id?: number
          meta_user_id?: string | null
          selected_forms?: Json | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          ad_accounts?: Json | null
          connected_at?: string | null
          id?: number
          meta_user_id?: string | null
          selected_forms?: Json | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_messaging_monthly: {
        Row: {
          brand_id: string
          conversations_started: number
          meta_account_id: string
          month: string
          synced_at: string
        }
        Insert: {
          brand_id: string
          conversations_started?: number
          meta_account_id: string
          month: string
          synced_at?: string
        }
        Update: {
          brand_id?: string
          conversations_started?: number
          meta_account_id?: string
          month?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_messaging_monthly_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          dashboard_access: boolean
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_access?: boolean
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_access?: boolean
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          id: string
          kind: string
          message: string | null
          meta: Json | null
          ran_at: string
          status: string
        }
        Insert: {
          id?: string
          kind: string
          message?: string | null
          meta?: Json | null
          ran_at?: string
          status: string
        }
        Update: {
          id?: string
          kind?: string
          message?: string | null
          meta?: Json | null
          ran_at?: string
          status?: string
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
      whatsapp_integration: {
        Row: {
          access_token: string | null
          connected_at: string | null
          default_brand_id: string | null
          id: number
          phone_number_id: string | null
          updated_at: string
          verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          default_brand_id?: string | null
          id?: number
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          default_brand_id?: string | null
          id?: number
          phone_number_id?: string | null
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_integration_default_brand_id_fkey"
            columns: ["default_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_dashboard_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "marketer" | "manager"
      lead_source: "meta_lead_form" | "whatsapp" | "manual"
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
      app_role: ["admin", "operator", "marketer", "manager"],
      lead_source: ["meta_lead_form", "whatsapp", "manual"],
    },
  },
} as const
