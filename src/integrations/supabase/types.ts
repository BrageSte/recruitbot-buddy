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
      application_events: {
        Row: {
          application_id: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          cv_notes: string | null
          generated_text: string | null
          id: string
          job_id: string
          notes: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cv_notes?: string | null
          generated_text?: string | null
          id?: string
          job_id: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cv_notes?: string | null
          generated_text?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_summary: string | null
          company: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          location: string | null
          match_score: number | null
          notes: string | null
          risk_flags: string[] | null
          score_culture: number | null
          score_enthusiasm: number | null
          score_practical: number | null
          score_professional: number | null
          source: Database["public"]["Enums"]["job_source"]
          source_url: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          location?: string | null
          match_score?: number | null
          notes?: string | null
          risk_flags?: string[] | null
          score_culture?: number | null
          score_enthusiasm?: number | null
          score_practical?: number | null
          score_professional?: number | null
          source?: Database["public"]["Enums"]["job_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          location?: string | null
          match_score?: number | null
          notes?: string | null
          risk_flags?: string[] | null
          score_culture?: number | null
          score_enthusiasm?: number | null
          score_practical?: number | null
          score_professional?: number | null
          source?: Database["public"]["Enums"]["job_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          linkedin_url: string | null
          master_profile: string | null
          rules_green: string | null
          rules_red: string | null
          rules_yellow: string | null
          style_guide: string | null
          updated_at: string
          user_id: string
          weekly_goal: number
          weight_culture: number
          weight_enthusiasm: number
          weight_practical: number
          weight_professional: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_url?: string | null
          master_profile?: string | null
          rules_green?: string | null
          rules_red?: string | null
          rules_yellow?: string | null
          style_guide?: string | null
          updated_at?: string
          user_id: string
          weekly_goal?: number
          weight_culture?: number
          weight_enthusiasm?: number
          weight_practical?: number
          weight_professional?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_url?: string | null
          master_profile?: string | null
          rules_green?: string | null
          rules_red?: string | null
          rules_yellow?: string | null
          style_guide?: string | null
          updated_at?: string
          user_id?: string
          weekly_goal?: number
          weight_culture?: number
          weight_enthusiasm?: number
          weight_practical?: number
          weight_professional?: number
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          created_at: string
          extracted_text: string | null
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          file_name: string
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "demo"
      application_status:
        | "draft"
        | "sent"
        | "response_received"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      file_kind: "cv" | "previous_application" | "other"
      job_source: "manual" | "url" | "rss" | "linkedin" | "file"
      job_status:
        | "discovered"
        | "considering"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "archived"
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
      app_role: ["owner", "demo"],
      application_status: [
        "draft",
        "sent",
        "response_received",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      file_kind: ["cv", "previous_application", "other"],
      job_source: ["manual", "url", "rss", "linkedin", "file"],
      job_status: [
        "discovered",
        "considering",
        "applied",
        "interview",
        "offer",
        "rejected",
        "archived",
      ],
    },
  },
} as const
