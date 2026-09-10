export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      badges: {
        Row: {
          code: string
          description: string
          emoji: string
          name: string
          sort_order: number
          tier: string
        }
        Insert: {
          code: string
          description: string
          emoji: string
          name: string
          sort_order?: number
          tier?: string
        }
        Update: {
          code?: string
          description?: string
          emoji?: string
          name?: string
          sort_order?: number
          tier?: string
        }
        Relationships: []
      }
      bot_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      fixture_teams: {
        Row: {
          colour: string
          created_at: string
          fixture_id: string
          goals: number | null
          id: string
          name: string
          side: string
        }
        Insert: {
          colour?: string
          created_at?: string
          fixture_id: string
          goals?: number | null
          id?: string
          name: string
          side: string
        }
        Update: {
          colour?: string
          created_at?: string
          fixture_id?: string
          goals?: number | null
          id?: string
          name?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
        ]
      }
      fixtures: {
        Row: {
          cancelled_reason: string | null
          created_at: string
          id: string
          kickoff_at: string
          players_per_team: number
          rsvp_chat_id: number | null
          rsvp_closes_at: string | null
          rsvp_message_id: number | null
          season_id: string
          status: string
          subs_per_team: number
          teams_message_id: number | null
          updated_at: string
          venue: string
        }
        Insert: {
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          kickoff_at: string
          players_per_team?: number
          rsvp_chat_id?: number | null
          rsvp_closes_at?: string | null
          rsvp_message_id?: number | null
          season_id: string
          status?: string
          subs_per_team?: number
          teams_message_id?: number | null
          updated_at?: string
          venue?: string
        }
        Update: {
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          kickoff_at?: string
          players_per_team?: number
          rsvp_chat_id?: number | null
          rsvp_closes_at?: string | null
          rsvp_message_id?: number | null
          season_id?: string
          status?: string
          subs_per_team?: number
          teams_message_id?: number | null
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons_public"
            referencedColumns: ["id"]
          },
        ]
      }
      match_reports: {
        Row: {
          assists: number
          created_at: string
          fixture_id: string
          flow_message_id: number | null
          flow_state: string
          goals: number
          id: string
          motm_player_id: string | null
          nutmegs: number
          own_goals: number
          player_id: string
          reported_goals_against: number | null
          reported_goals_for: number | null
          saves: number
          self_rating: number | null
          submitted_at: string | null
          tackles: number
          updated_at: string
        }
        Insert: {
          assists?: number
          created_at?: string
          fixture_id: string
          flow_message_id?: number | null
          flow_state?: string
          goals?: number
          id?: string
          motm_player_id?: string | null
          nutmegs?: number
          own_goals?: number
          player_id: string
          reported_goals_against?: number | null
          reported_goals_for?: number | null
          saves?: number
          self_rating?: number | null
          submitted_at?: string | null
          tackles?: number
          updated_at?: string
        }
        Update: {
          assists?: number
          created_at?: string
          fixture_id?: string
          flow_message_id?: number | null
          flow_state?: string
          goals?: number
          id?: string
          motm_player_id?: string | null
          nutmegs?: number
          own_goals?: number
          player_id?: string
          reported_goals_against?: number | null
          reported_goals_for?: number | null
          saves?: number
          self_rating?: number | null
          submitted_at?: string | null
          tackles?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "match_reports_motm_player_id_fkey"
            columns: ["motm_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_motm_player_id_fkey"
            columns: ["motm_player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      player_badges: {
        Row: {
          badge_code: string
          earned_at: string
          fixture_id: string | null
          id: string
          player_id: string
        }
        Insert: {
          badge_code: string
          earned_at?: string
          fixture_id?: string | null
          id?: string
          player_id: string
        }
        Update: {
          badge_code?: string
          earned_at?: string
          fixture_id?: string | null
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "v_badges_public"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_badges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          display_name: string
          emoji: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string | null
          private_chat_id: number | null
          rating: number
          telegram_user_id: number
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          emoji?: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          private_chat_id?: number | null
          rating?: number
          telegram_user_id: number
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          emoji?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          private_chat_id?: number | null
          rating?: number
          telegram_user_id?: number
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rating_events: {
        Row: {
          created_at: string
          delta: number
          fixture_id: string | null
          id: string
          player_id: string
          rating_after: number
          rating_before: number
          reason: string
        }
        Insert: {
          created_at?: string
          delta: number
          fixture_id?: string | null
          id?: string
          player_id: string
          rating_after: number
          rating_before: number
          reason?: string
        }
        Update: {
          created_at?: string
          delta?: number
          fixture_id?: string | null
          id?: string
          player_id?: string
          rating_after?: number
          rating_before?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: {
          created_at: string
          fixture_id: string
          id: string
          in_since: string | null
          player_id: string
          promoted_at: string | null
          responded_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fixture_id: string
          id?: string
          in_since?: string | null
          player_id: string
          promoted_at?: string | null
          responded_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fixture_id?: string
          id?: string
          in_since?: string | null
          player_id?: string
          promoted_at?: string | null
          responded_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ended_on: string | null
          id: string
          name: string
          started_on: string
        }
        Insert: {
          created_at?: string
          ended_on?: string | null
          id?: string
          name: string
          started_on: string
        }
        Update: {
          created_at?: string
          ended_on?: string | null
          id?: string
          name?: string
          started_on?: string
        }
        Relationships: []
      }
      team_players: {
        Row: {
          created_at: string
          fixture_id: string | null
          fixture_team_id: string
          id: string
          is_sub: boolean
          player_id: string
        }
        Insert: {
          created_at?: string
          fixture_id?: string | null
          fixture_team_id: string
          id?: string
          is_sub?: boolean
          player_id: string
        }
        Update: {
          created_at?: string
          fixture_id?: string | null
          fixture_team_id?: string
          id?: string
          is_sub?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_players_fixture_team_id_fkey"
            columns: ["fixture_team_id"]
            isOneToOne: false
            referencedRelation: "fixture_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_team_id_fkey"
            columns: ["fixture_team_id"]
            isOneToOne: false
            referencedRelation: "v_fixture_teams_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_emulator_messages: {
        Row: {
          chat_id: number | null
          created_at: string
          id: number
          method: string
          params: Json
          receiver_user_id: number | null
          target_message_id: number | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          id?: never
          method: string
          params?: Json
          receiver_user_id?: number | null
          target_message_id?: number | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          id?: never
          method?: string
          params?: Json
          receiver_user_id?: number | null
          target_message_id?: number | null
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          kind: string | null
          received_at: string
          update_id: number
        }
        Insert: {
          kind?: string | null
          received_at?: string
          update_id: number
        }
        Update: {
          kind?: string | null
          received_at?: string
          update_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_badges_public: {
        Row: {
          code: string | null
          description: string | null
          emoji: string | null
          name: string | null
          sort_order: number | null
          tier: string | null
        }
        Insert: {
          code?: string | null
          description?: string | null
          emoji?: string | null
          name?: string | null
          sort_order?: number | null
          tier?: string | null
        }
        Update: {
          code?: string | null
          description?: string | null
          emoji?: string | null
          name?: string | null
          sort_order?: number | null
          tier?: string | null
        }
        Relationships: []
      }
      v_fixture_motm_votes: {
        Row: {
          fixture_id: string | null
          player_id: string | null
          votes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "match_reports_motm_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_motm_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fixture_rsvps: {
        Row: {
          display_name: string | null
          emoji: string | null
          fixture_id: string | null
          in_since: string | null
          is_waitlisted: boolean | null
          player_id: string | null
          promoted_at: string | null
          rating: number | null
          responded_at: string | null
          squad_position: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fixture_teams_public: {
        Row: {
          colour: string | null
          fixture_id: string | null
          goals: number | null
          id: string | null
          name: string | null
          side: string | null
        }
        Insert: {
          colour?: string | null
          fixture_id?: string | null
          goals?: number | null
          id?: string | null
          name?: string | null
          side?: string | null
        }
        Update: {
          colour?: string | null
          fixture_id?: string | null
          goals?: number | null
          id?: string | null
          name?: string | null
          side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_teams_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
        ]
      }
      v_fixtures_public: {
        Row: {
          cancelled_reason: string | null
          capacity: number | null
          id: string | null
          kickoff_at: string | null
          players_per_team: number | null
          rsvp_closes_at: string | null
          season_id: string | null
          status: string | null
          subs_per_team: number | null
          venue: string | null
        }
        Insert: {
          cancelled_reason?: string | null
          capacity?: never
          id?: string | null
          kickoff_at?: string | null
          players_per_team?: number | null
          rsvp_closes_at?: string | null
          season_id?: string | null
          status?: string | null
          subs_per_team?: number | null
          venue?: string | null
        }
        Update: {
          cancelled_reason?: string | null
          capacity?: never
          id?: string | null
          kickoff_at?: string | null
          players_per_team?: number | null
          rsvp_closes_at?: string | null
          season_id?: string | null
          status?: string | null
          subs_per_team?: number | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_badges_public: {
        Row: {
          badge_code: string | null
          earned_at: string | null
          fixture_id: string | null
          player_id: string | null
        }
        Insert: {
          badge_code?: string | null
          earned_at?: string | null
          fixture_id?: string | null
          player_id?: string | null
        }
        Update: {
          badge_code?: string | null
          earned_at?: string | null
          fixture_id?: string | null
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "v_badges_public"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "player_badges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_career_stats: {
        Row: {
          appearances: number | null
          assists: number | null
          avg_self_rating: number | null
          draws: number | null
          first_played_at: string | null
          goals: number | null
          last_played_at: string | null
          losses: number | null
          motm_votes: number | null
          nutmegs: number | null
          own_goals: number | null
          player_id: string | null
          saves: number | null
          tackles: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_fixture_stats: {
        Row: {
          assists: number | null
          fixture_id: string | null
          goals: number | null
          goals_against: number | null
          goals_for: number | null
          is_sub: boolean | null
          kickoff_at: string | null
          motm_votes: number | null
          nutmegs: number | null
          outcome: string | null
          own_goals: number | null
          player_id: string | null
          reported: boolean | null
          saves: number | null
          season_id: string | null
          self_rating: number | null
          side: string | null
          tackles: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_season_stats: {
        Row: {
          appearances: number | null
          assists: number | null
          avg_self_rating: number | null
          draws: number | null
          goals: number | null
          last_played_at: string | null
          losses: number | null
          motm_votes: number | null
          nutmegs: number | null
          own_goals: number | null
          player_id: string | null
          saves: number | null
          season_id: string | null
          tackles: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v_seasons_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_players_public: {
        Row: {
          created_at: string | null
          display_name: string | null
          emoji: string | null
          id: string | null
          is_active: boolean | null
          rating: number | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          rating?: number | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          rating?: number | null
        }
        Relationships: []
      }
      v_seasons_public: {
        Row: {
          ended_on: string | null
          id: string | null
          name: string | null
          started_on: string | null
        }
        Insert: {
          ended_on?: string | null
          id?: string | null
          name?: string | null
          started_on?: string | null
        }
        Update: {
          ended_on?: string | null
          id?: string | null
          name?: string | null
          started_on?: string | null
        }
        Relationships: []
      }
      v_team_players_public: {
        Row: {
          fixture_id: string | null
          fixture_team_id: string | null
          is_sub: boolean | null
          player_id: string | null
        }
        Insert: {
          fixture_id?: string | null
          fixture_team_id?: string | null
          is_sub?: boolean | null
          player_id?: string | null
        }
        Update: {
          fixture_id?: string | null
          fixture_team_id?: string | null
          is_sub?: boolean | null
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_fixtures_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "v_player_fixture_stats"
            referencedColumns: ["fixture_id"]
          },
          {
            foreignKeyName: "team_players_fixture_team_id_fkey"
            columns: ["fixture_team_id"]
            isOneToOne: false
            referencedRelation: "fixture_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_fixture_team_id_fkey"
            columns: ["fixture_team_id"]
            isOneToOne: false
            referencedRelation: "v_fixture_teams_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_players_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fixture_capacity: {
        Args: { f: Database["public"]["Tables"]["fixtures"]["Row"] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

