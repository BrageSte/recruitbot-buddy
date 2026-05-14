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
      application_attachments: {
        Row: {
          ai_summary: string | null
          application_id: string
          created_at: string
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          application_id: string
          created_at?: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          application_id?: string
          created_at?: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_attachments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_cv_revisions: {
        Row: {
          application_id: string
          created_at: string
          id: string
          instruction: string
          metadata: Json
          next_cv: Json
          next_section_order: string[] | null
          previous_cv: Json
          previous_section_order: string[] | null
          tweak_id: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          instruction?: string
          metadata?: Json
          next_cv?: Json
          next_section_order?: string[] | null
          previous_cv?: Json
          previous_section_order?: string[] | null
          tweak_id?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          instruction?: string
          metadata?: Json
          next_cv?: Json
          next_section_order?: string[] | null
          previous_cv?: Json
          previous_section_order?: string[] | null
          tweak_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_cv_revisions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_cv_revisions_tweak_id_fkey"
            columns: ["tweak_id"]
            isOneToOne: false
            referencedRelation: "application_cv_tweaks"
            referencedColumns: ["id"]
          },
        ]
      }
      application_cv_tweaks: {
        Row: {
          application_id: string
          created_at: string
          deemphasize: string[] | null
          highlight_experiences: string[] | null
          id: string
          notes: string | null
          prioritize_skills: string[] | null
          rephrase_suggestions: Json | null
          section_order: string[] | null
          tailored_cv: Json | null
          tailored_cv_markdown: string | null
          tailored_intro: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          deemphasize?: string[] | null
          highlight_experiences?: string[] | null
          id?: string
          notes?: string | null
          prioritize_skills?: string[] | null
          rephrase_suggestions?: Json | null
          section_order?: string[] | null
          tailored_cv?: Json | null
          tailored_cv_markdown?: string | null
          tailored_intro?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          deemphasize?: string[] | null
          highlight_experiences?: string[] | null
          id?: string
          notes?: string | null
          prioritize_skills?: string[] | null
          rephrase_suggestions?: Json | null
          section_order?: string[] | null
          tailored_cv?: Json | null
          tailored_cv_markdown?: string | null
          tailored_intro?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_cv_tweaks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
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
          cv_style: Database["public"]["Enums"]["cv_style"] | null
          cv_template_id: string | null
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
          cv_style?: Database["public"]["Enums"]["cv_style"] | null
          cv_template_id?: string | null
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
          cv_style?: Database["public"]["Enums"]["cv_style"] | null
          cv_template_id?: string | null
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
      auto_apply_settings: {
        Row: {
          created_at: string
          daily_limit: number
          exclude_with_risks: boolean
          is_enabled: boolean
          min_score: number
          only_from_rss: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          exclude_with_risks?: boolean
          is_enabled?: boolean
          min_score?: number
          only_from_rss?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          exclude_with_risks?: boolean
          is_enabled?: boolean
          min_score?: number
          only_from_rss?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_searches: {
        Row: {
          blocked_hint: string | null
          created_at: string
          extra_params: Json
          id: string
          is_active: boolean
          items_found: number
          last_checked_at: string | null
          last_error: string | null
          last_status: Database["public"]["Enums"]["auto_search_status"]
          location: string | null
          name: string
          query: string
          source: Database["public"]["Enums"]["auto_search_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_hint?: string | null
          created_at?: string
          extra_params?: Json
          id?: string
          is_active?: boolean
          items_found?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: Database["public"]["Enums"]["auto_search_status"]
          location?: string | null
          name: string
          query?: string
          source: Database["public"]["Enums"]["auto_search_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_hint?: string | null
          created_at?: string
          extra_params?: Json
          id?: string
          is_active?: boolean
          items_found?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_status?: Database["public"]["Enums"]["auto_search_status"]
          location?: string | null
          name?: string
          query?: string
          source?: Database["public"]["Enums"]["auto_search_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          application_id: string | null
          created_at: string
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["calendar_event_kind"]
          location: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["calendar_event_kind"]
          location?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["calendar_event_kind"]
          location?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_templates: {
        Row: {
          certifications: Json
          created_at: string
          cv_style: Database["public"]["Enums"]["cv_style"]
          education: Json
          email: string | null
          experiences: Json
          full_name: string | null
          headline: string | null
          id: string
          intro: string | null
          is_active: boolean
          is_default: boolean
          languages: Json
          linkedin_url: string | null
          location: string | null
          phone: string | null
          photo_url: string | null
          projects: Json
          section_order: string[]
          skills: Json
          updated_at: string
          user_id: string
          variant_description: string | null
          variant_name: string
          website_url: string | null
        }
        Insert: {
          certifications?: Json
          created_at?: string
          cv_style?: Database["public"]["Enums"]["cv_style"]
          education?: Json
          email?: string | null
          experiences?: Json
          full_name?: string | null
          headline?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          is_default?: boolean
          languages?: Json
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          photo_url?: string | null
          projects?: Json
          section_order?: string[]
          skills?: Json
          updated_at?: string
          user_id: string
          variant_description?: string | null
          variant_name?: string
          website_url?: string | null
        }
        Update: {
          certifications?: Json
          created_at?: string
          cv_style?: Database["public"]["Enums"]["cv_style"]
          education?: Json
          email?: string | null
          experiences?: Json
          full_name?: string | null
          headline?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          is_default?: boolean
          languages?: Json
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          photo_url?: string | null
          projects?: Json
          section_order?: string[]
          skills?: Json
          updated_at?: string
          user_id?: string
          variant_description?: string | null
          variant_name?: string
          website_url?: string | null
        }
        Relationships: []
      }
      external_jobs: {
        Row: {
          company: string | null
          created_at: string
          deadline: string | null
          description: string | null
          external_id: string
          fetched_at: string
          id: string
          last_seen_at: string
          location: string | null
          provider: Database["public"]["Enums"]["external_job_provider"]
          provider_updated_at: string | null
          raw_data: Json
          source_url: string | null
          status: Database["public"]["Enums"]["external_job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          external_id: string
          fetched_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          provider: Database["public"]["Enums"]["external_job_provider"]
          provider_updated_at?: string | null
          raw_data?: Json
          source_url?: string | null
          status?: Database["public"]["Enums"]["external_job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          external_id?: string
          fetched_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          provider?: Database["public"]["Enums"]["external_job_provider"]
          provider_updated_at?: string | null
          raw_data?: Json
          source_url?: string | null
          status?: Database["public"]["Enums"]["external_job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          ai_generated: boolean
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["goal_kind"]
          parent_goal_id: string | null
          progress_count: number
          sort_order: number
          status: Database["public"]["Enums"]["goal_status"]
          target_count: number | null
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["goal_kind"]
          parent_goal_id?: string | null
          progress_count?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["goal_status"]
          target_count?: number | null
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["goal_kind"]
          parent_goal_id?: string | null
          progress_count?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["goal_status"]
          target_count?: number | null
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      job_score_feedback: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["job_interest_level"]
          external_job_id: string | null
          id: string
          job_id: string | null
          metadata: Json
          note: string | null
          original_score: number | null
          user_id: string
          user_job_match_id: string | null
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["job_interest_level"]
          external_job_id?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          note?: string | null
          original_score?: number | null
          user_id: string
          user_job_match_id?: string | null
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["job_interest_level"]
          external_job_id?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          note?: string | null
          original_score?: number | null
          user_id?: string
          user_job_match_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_score_feedback_external_job_id_fkey"
            columns: ["external_job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_score_feedback_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_score_feedback_user_job_match_id_fkey"
            columns: ["user_job_match_id"]
            isOneToOne: false
            referencedRelation: "user_job_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_summary: string | null
          auto_draft_at: string | null
          company: string | null
          created_at: string
          deadline: string | null
          description: string | null
          external_id: string | null
          external_job_id: string | null
          id: string
          interest_level: Database["public"]["Enums"]["job_interest_level"]
          location: string | null
          match_reasoning: Json
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
          auto_draft_at?: string | null
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          external_id?: string | null
          external_job_id?: string | null
          id?: string
          interest_level?: Database["public"]["Enums"]["job_interest_level"]
          location?: string | null
          match_reasoning?: Json
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
          auto_draft_at?: string | null
          company?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          external_id?: string | null
          external_job_id?: string | null
          id?: string
          interest_level?: Database["public"]["Enums"]["job_interest_level"]
          location?: string | null
          match_reasoning?: Json
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
        Relationships: [
          {
            foreignKeyName: "jobs_external_job_id_fkey"
            columns: ["external_job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      match_visibility_rules: {
        Row: {
          action: Database["public"]["Enums"]["match_visibility_rule_action"]
          company_terms: string[]
          created_at: string
          description_terms: string[]
          id: string
          is_active: boolean
          location_terms: string[]
          name: string
          source_terms: string[]
          title_terms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["match_visibility_rule_action"]
          company_terms?: string[]
          created_at?: string
          description_terms?: string[]
          id?: string
          is_active?: boolean
          location_terms?: string[]
          name: string
          source_terms?: string[]
          title_terms?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["match_visibility_rule_action"]
          company_terms?: string[]
          created_at?: string
          description_terms?: string[]
          id?: string
          is_active?: boolean
          location_terms?: string[]
          name?: string
          source_terms?: string[]
          title_terms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          application_id: string | null
          body: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["notification_kind"]
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["notification_kind"]
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["notification_kind"]
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_interest_signals: {
        Row: {
          category: Database["public"]["Enums"]["profile_signal_category"]
          confidence: number
          created_at: string
          id: string
          label: string
          metadata: Json
          source: Database["public"]["Enums"]["profile_signal_source"]
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["profile_signal_category"]
          confidence?: number
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          source?: Database["public"]["Enums"]["profile_signal_source"]
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["profile_signal_category"]
          confidence?: number
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          source?: Database["public"]["Enums"]["profile_signal_source"]
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      profile_onboarding_runs: {
        Row: {
          answers: Json
          chat_messages: Json
          completed_at: string | null
          created_at: string
          current_step: string
          cv_draft: Json
          id: string
          profile_draft: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          chat_messages?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: string
          cv_draft?: Json
          id?: string
          profile_draft?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          chat_messages?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: string
          cv_draft?: Json
          id?: string
          profile_draft?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_source_suggestions_enabled: boolean
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          linkedin_url: string | null
          master_profile: string | null
          match_min_visible_score: number
          notify_email: boolean
          notify_high_match_min_score: number
          notify_push: boolean
          onboarding_completed_at: string | null
          onboarding_skipped_at: string | null
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
          auto_source_suggestions_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_url?: string | null
          master_profile?: string | null
          match_min_visible_score?: number
          notify_email?: boolean
          notify_high_match_min_score?: number
          notify_push?: boolean
          onboarding_completed_at?: string | null
          onboarding_skipped_at?: string | null
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
          auto_source_suggestions_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_url?: string | null
          master_profile?: string | null
          match_min_visible_score?: number
          notify_email?: boolean
          notify_high_match_min_score?: number
          notify_push?: boolean
          onboarding_completed_at?: string | null
          onboarding_skipped_at?: string | null
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
      rss_feeds: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          items_found: number
          last_checked_at: string | null
          last_error: string | null
          last_item_guid: string | null
          name: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          items_found?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_item_guid?: string | null
          name: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          items_found?: number
          last_checked_at?: string | null
          last_error?: string | null
          last_item_guid?: string | null
          name?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      rss_seen_items: {
        Row: {
          feed_id: string
          guid: string
          id: string
          link: string | null
          seen_at: string
        }
        Insert: {
          feed_id: string
          guid: string
          id?: string
          link?: string | null
          seen_at?: string
        }
        Update: {
          feed_id?: string
          guid?: string
          id?: string
          link?: string | null
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rss_seen_items_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "rss_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      source_ingest_state: {
        Row: {
          created_at: string
          cursor_url: string | null
          last_checked_at: string | null
          last_error: string | null
          last_etag: string | null
          last_feed_url: string | null
          last_modified_at: string | null
          last_run_stats: Json
          last_status: string
          pending_last_modified_at: string | null
          provider: Database["public"]["Enums"]["external_job_provider"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          cursor_url?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_etag?: string | null
          last_feed_url?: string | null
          last_modified_at?: string | null
          last_run_stats?: Json
          last_status?: string
          pending_last_modified_at?: string | null
          provider: Database["public"]["Enums"]["external_job_provider"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          cursor_url?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_etag?: string | null
          last_feed_url?: string | null
          last_modified_at?: string | null
          last_run_stats?: Json
          last_status?: string
          pending_last_modified_at?: string | null
          provider?: Database["public"]["Enums"]["external_job_provider"]
          updated_at?: string
        }
        Relationships: []
      }
      source_suggestion_hits: {
        Row: {
          created_at: string
          external_job_id: string
          found_at: string
          id: string
          location: string | null
          metadata: Json
          provider: Database["public"]["Enums"]["external_job_provider"]
          query: string
          rank: number | null
          rss_feed_id: string | null
          score: number | null
          source_suggestion_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_job_id: string
          found_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          provider: Database["public"]["Enums"]["external_job_provider"]
          query: string
          rank?: number | null
          rss_feed_id?: string | null
          score?: number | null
          source_suggestion_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_job_id?: string
          found_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          provider?: Database["public"]["Enums"]["external_job_provider"]
          query?: string
          rank?: number | null
          rss_feed_id?: string | null
          score?: number | null
          source_suggestion_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_suggestion_hits_external_job_id_fkey"
            columns: ["external_job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_suggestion_hits_rss_feed_id_fkey"
            columns: ["rss_feed_id"]
            isOneToOne: false
            referencedRelation: "rss_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_suggestion_hits_source_suggestion_id_fkey"
            columns: ["source_suggestion_id"]
            isOneToOne: false
            referencedRelation: "source_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      source_suggestions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          is_active: boolean
          last_generated_at: string
          location: string | null
          metadata: Json
          name: string
          provider: Database["public"]["Enums"]["source_suggestion_provider"]
          query: string
          reason: string | null
          rss_url: string | null
          search_url: string
          status: Database["public"]["Enums"]["source_suggestion_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_generated_at?: string
          location?: string | null
          metadata?: Json
          name: string
          provider?: Database["public"]["Enums"]["source_suggestion_provider"]
          query: string
          reason?: string | null
          rss_url?: string | null
          search_url: string
          status?: Database["public"]["Enums"]["source_suggestion_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_generated_at?: string
          location?: string | null
          metadata?: Json
          name?: string
          provider?: Database["public"]["Enums"]["source_suggestion_provider"]
          query?: string
          reason?: string | null
          rss_url?: string | null
          search_url?: string
          status?: Database["public"]["Enums"]["source_suggestion_status"]
          updated_at?: string
          user_id?: string
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
      user_match_run_candidates: {
        Row: {
          created_at: string
          external_job_id: string
          id: string
          last_error: string | null
          lexical_rank: number
          match_id: string | null
          run_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_job_id: string
          id?: string
          last_error?: string | null
          lexical_rank?: number
          match_id?: string | null
          run_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_job_id?: string
          id?: string
          last_error?: string | null
          lexical_rank?: number
          match_id?: string | null
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_match_run_candidates_external_job_id_fkey"
            columns: ["external_job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_match_run_candidates_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "user_job_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_match_run_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "user_match_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_match_runs: {
        Row: {
          candidate_count: number
          completed_at: string | null
          created_at: string
          cursor_external_job_id: string | null
          id: string
          jobs_created_count: number
          last_error: string | null
          min_visible_score: number
          mode: string
          profile_hash: string
          provider: Database["public"]["Enums"]["external_job_provider"] | null
          scanned_count: number
          scored_count: number
          started_at: string | null
          status: string
          total_estimate: number
          updated_at: string
          user_id: string
          visible_count: number
        }
        Insert: {
          candidate_count?: number
          completed_at?: string | null
          created_at?: string
          cursor_external_job_id?: string | null
          id?: string
          jobs_created_count?: number
          last_error?: string | null
          min_visible_score?: number
          mode?: string
          profile_hash: string
          provider?: Database["public"]["Enums"]["external_job_provider"] | null
          scanned_count?: number
          scored_count?: number
          started_at?: string | null
          status?: string
          total_estimate?: number
          updated_at?: string
          user_id: string
          visible_count?: number
        }
        Update: {
          candidate_count?: number
          completed_at?: string | null
          created_at?: string
          cursor_external_job_id?: string | null
          id?: string
          jobs_created_count?: number
          last_error?: string | null
          min_visible_score?: number
          mode?: string
          profile_hash?: string
          provider?: Database["public"]["Enums"]["external_job_provider"] | null
          scanned_count?: number
          scored_count?: number
          started_at?: string | null
          status?: string
          total_estimate?: number
          updated_at?: string
          user_id?: string
          visible_count?: number
        }
        Relationships: []
      }
      user_job_matches: {
        Row: {
          computed_at: string
          created_at: string
          external_job_id: string
          id: string
          job_id: string | null
          match_reasoning: Json
          match_score: number | null
          profile_hash: string | null
          risk_flags: string[] | null
          score_culture: number | null
          score_enthusiasm: number | null
          score_practical: number | null
          score_professional: number | null
          status: Database["public"]["Enums"]["user_job_match_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          created_at?: string
          external_job_id: string
          id?: string
          job_id?: string | null
          match_reasoning?: Json
          match_score?: number | null
          profile_hash?: string | null
          risk_flags?: string[] | null
          score_culture?: number | null
          score_enthusiasm?: number | null
          score_practical?: number | null
          score_professional?: number | null
          status?: Database["public"]["Enums"]["user_job_match_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_at?: string
          created_at?: string
          external_job_id?: string
          id?: string
          job_id?: string | null
          match_reasoning?: Json
          match_score?: number | null
          profile_hash?: string | null
          risk_flags?: string[] | null
          score_culture?: number | null
          score_enthusiasm?: number | null
          score_practical?: number | null
          score_professional?: number | null
          status?: Database["public"]["Enums"]["user_job_match_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_matches_external_job_id_fkey"
            columns: ["external_job_id"]
            isOneToOne: false
            referencedRelation: "external_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_job_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
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
      auto_search_source: "finn" | "arbeidsplassen" | "linkedin"
      auto_search_status: "ok" | "blocked" | "error" | "pending"
      calendar_event_kind: "interview" | "follow_up" | "note" | "custom"
      cv_style: "skandinavisk" | "korporat" | "akademisk" | "startup" | "bold"
      external_job_provider: "arbeidsplassen" | "finn"
      external_job_status: "active" | "inactive" | "unknown"
      file_kind: "cv" | "previous_application" | "other"
      goal_kind: "target_date" | "weekly_apps" | "milestone" | "custom"
      goal_status: "active" | "completed" | "missed" | "archived"
      job_interest_level:
        | "none"
        | "uninterested"
        | "interested"
        | "very_interested"
      job_source:
        | "manual"
        | "url"
        | "rss"
        | "linkedin"
        | "file"
        | "auto_search"
        | "arbeidsplassen"
        | "finn"
      job_status:
        | "discovered"
        | "considering"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "archived"
      match_visibility_rule_action: "include" | "exclude"
      notification_kind:
        | "high_match_job"
        | "deadline_soon"
        | "interview_reminder"
        | "system"
      profile_signal_category:
        | "role"
        | "industry"
        | "task"
        | "skill"
        | "value"
        | "work_style"
        | "location"
        | "dealbreaker"
        | "other"
      profile_signal_source:
        | "manual"
        | "cv"
        | "application"
        | "swipe"
        | "ai_suggested"
      source_suggestion_provider: "finn" | "arbeidsplassen"
      source_suggestion_status: "suggested" | "active" | "paused" | "dismissed"
      user_job_match_status: "new" | "saved" | "dismissed" | "archived"
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
      auto_search_source: ["finn", "arbeidsplassen", "linkedin"],
      auto_search_status: ["ok", "blocked", "error", "pending"],
      calendar_event_kind: ["interview", "follow_up", "note", "custom"],
      cv_style: ["skandinavisk", "korporat", "akademisk", "startup", "bold"],
      external_job_provider: ["arbeidsplassen", "finn"],
      external_job_status: ["active", "inactive", "unknown"],
      file_kind: ["cv", "previous_application", "other"],
      goal_kind: ["target_date", "weekly_apps", "milestone", "custom"],
      goal_status: ["active", "completed", "missed", "archived"],
      job_interest_level: [
        "none",
        "uninterested",
        "interested",
        "very_interested",
      ],
      job_source: [
        "manual",
        "url",
        "rss",
        "linkedin",
        "file",
        "auto_search",
        "arbeidsplassen",
        "finn",
      ],
      job_status: [
        "discovered",
        "considering",
        "applied",
        "interview",
        "offer",
        "rejected",
        "archived",
      ],
      match_visibility_rule_action: ["include", "exclude"],
      notification_kind: [
        "high_match_job",
        "deadline_soon",
        "interview_reminder",
        "system",
      ],
      profile_signal_category: [
        "role",
        "industry",
        "task",
        "skill",
        "value",
        "work_style",
        "location",
        "dealbreaker",
        "other",
      ],
      profile_signal_source: [
        "manual",
        "cv",
        "application",
        "swipe",
        "ai_suggested",
      ],
      source_suggestion_provider: ["finn", "arbeidsplassen"],
      source_suggestion_status: ["suggested", "active", "paused", "dismissed"],
      user_job_match_status: ["new", "saved", "dismissed", "archived"],
    },
  },
} as const
