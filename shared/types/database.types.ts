// Tipos de la base de datos.
// Generados con:  npm run db:types

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      itinerary_stops: {
        Row: {
          created_at: string
          day: string
          end_time: string | null
          id: string
          notes: string | null
          place_id: string | null
          sort_order: number
          start_time: string | null
          title: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day: string
          end_time?: string | null
          id?: string
          notes?: string | null
          place_id?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          place_id?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_stops_place_id_trip_id_fkey"
            columns: ["place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "itinerary_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          token: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          token?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          token?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      place_info: {
        Row: {
          created_at: string
          history: string | null
          history_source: string | null
          mapbox_id: string | null
          opening_hours: string | null
          phone: string | null
          photo_credit: string | null
          photo_url: string | null
          place_id: string
          trip_id: string
          updated_at: string
          website: string | null
          wikidata_id: string | null
          wikipedia_url: string | null
        }
        Insert: {
          created_at?: string
          history?: string | null
          history_source?: string | null
          mapbox_id?: string | null
          opening_hours?: string | null
          phone?: string | null
          photo_credit?: string | null
          photo_url?: string | null
          place_id: string
          trip_id: string
          updated_at?: string
          website?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          created_at?: string
          history?: string | null
          history_source?: string | null
          mapbox_id?: string | null
          opening_hours?: string | null
          phone?: string | null
          photo_credit?: string | null
          photo_url?: string | null
          place_id?: string
          trip_id?: string
          updated_at?: string
          website?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_info_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_info_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          ai_error: string | null
          ai_generated_at: string | null
          ai_info: Json | null
          ai_requested_at: string | null
          ai_status: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          latitude: number
          longitude: number
          mapbox_id: string | null
          name: string
          photo_path: string | null
          sort_order: number
          trip_id: string
          updated_at: string
          votable: boolean
        }
        Insert: {
          address?: string | null
          ai_error?: string | null
          ai_generated_at?: string | null
          ai_info?: Json | null
          ai_requested_at?: string | null
          ai_status?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latitude: number
          longitude: number
          mapbox_id?: string | null
          name: string
          photo_path?: string | null
          sort_order?: number
          trip_id: string
          updated_at?: string
          votable?: boolean
        }
        Update: {
          address?: string | null
          ai_error?: string | null
          ai_generated_at?: string | null
          ai_info?: Json | null
          ai_requested_at?: string | null
          ai_status?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number
          longitude?: number
          mapbox_id?: string | null
          name?: string
          photo_path?: string | null
          sort_order?: number
          trip_id?: string
          updated_at?: string
          votable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      trip_admins: {
        Row: {
          created_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_admins_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          description: string | null
          destination: string | null
          end_date: string
          id: string
          itinerary_published: boolean
          name: string
          owner_id: string
          rsvp_deadline: string
          start_date: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          destination?: string | null
          end_date: string
          id?: string
          itinerary_published?: boolean
          name: string
          owner_id?: string
          rsvp_deadline: string
          start_date: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          destination?: string | null
          end_date?: string
          id?: string
          itinerary_published?: boolean
          name?: string
          owner_id?: string
          rsvp_deadline?: string
          start_date?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          member_id: string
          place_id: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          place_id: string
          trip_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          place_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_member_id_trip_id_fkey"
            columns: ["member_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "votes_place_id_trip_id_fkey"
            columns: ["place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _member_assert_open: { Args: { p_trip_id: string }; Returns: undefined }
      _member_find: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          id: string
          name: string
          notes: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          token: string
          trip_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _member_lock: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          id: string
          name: string
          notes: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          token: string
          trip_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_trip_admin: {
        Args: { p_email: string; p_trip_id: string }
        Returns: string
      }
      is_trip_admin: { Args: { p_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { p_trip_id: string }; Returns: boolean }
      member_get_trip: { Args: { p_token: string }; Returns: Json }
      member_list_places: { Args: { p_token: string }; Returns: Json }
      member_respond: {
        Args: {
          p_status: Database["public"]["Enums"]["member_status"]
          p_token: string
        }
        Returns: Json
      }
      member_unvote: {
        Args: { p_place_id: string; p_token: string }
        Returns: Json
      }
      member_vote: {
        Args: { p_place_id: string; p_token: string }
        Returns: Json
      }
      regenerate_member_token: {
        Args: { p_member_id: string }
        Returns: string
      }
      storage_trip_id: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      member_status: "pending" | "accepted" | "declined"
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
  public: {
    Enums: {
      member_status: ["pending", "accepted", "declined"],
    },
  },
} as const
