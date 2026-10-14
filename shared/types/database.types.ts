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
      budget_item_shares: {
        Row: {
          item_id: string
          member_id: string
          trip_id: string
        }
        Insert: {
          item_id: string
          member_id: string
          trip_id: string
        }
        Update: {
          item_id?: string
          member_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_item_shares_item_id_trip_id_fkey"
            columns: ["item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_item_shares_member_id_trip_id_fkey"
            columns: ["member_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      budget_items: {
        Row: {
          actual_amount: number | null
          actual_rate: number | null
          category: Database["public"]["Enums"]["budget_category"]
          created_at: string
          currency: string
          estimated_amount: number | null
          extras: Json
          id: string
          name: string
          notes: string | null
          paid_by: string | null
          paid_on: string | null
          place_id: string | null
          sort_order: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          actual_rate?: number | null
          category?: Database["public"]["Enums"]["budget_category"]
          created_at?: string
          currency: string
          estimated_amount?: number | null
          extras?: Json
          id?: string
          name: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          place_id?: string | null
          sort_order?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          actual_rate?: number | null
          category?: Database["public"]["Enums"]["budget_category"]
          created_at?: string
          currency?: string
          estimated_amount?: number | null
          extras?: Json
          id?: string
          name?: string
          notes?: string | null
          paid_by?: string | null
          paid_on?: string | null
          place_id?: string | null
          sort_order?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_paid_by_trip_id_fkey"
            columns: ["paid_by", "trip_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_items_place_id_trip_id_fkey"
            columns: ["place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "budget_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          latitude: number
          longitude: number
          mapbox_id: string | null
          name: string
          origin_trip_id: string | null
          photo_path: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          latitude: number
          longitude: number
          mapbox_id?: string | null
          name: string
          origin_trip_id?: string | null
          photo_path?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          latitude?: number
          longitude?: number
          mapbox_id?: string | null
          name?: string
          origin_trip_id?: string | null
          photo_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_places_origin_trip_id_fkey"
            columns: ["origin_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
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
          catalog_place_id: string
          created_at: string
          history: string | null
          history_source: string | null
          mapbox_id: string | null
          opening_hours: string | null
          phone: string | null
          photo_credit: string | null
          photo_url: string | null
          updated_at: string
          website: string | null
          wikidata_id: string | null
          wikipedia_url: string | null
        }
        Insert: {
          catalog_place_id: string
          created_at?: string
          history?: string | null
          history_source?: string | null
          mapbox_id?: string | null
          opening_hours?: string | null
          phone?: string | null
          photo_credit?: string | null
          photo_url?: string | null
          updated_at?: string
          website?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          catalog_place_id?: string
          created_at?: string
          history?: string | null
          history_source?: string | null
          mapbox_id?: string | null
          opening_hours?: string | null
          phone?: string | null
          photo_credit?: string | null
          photo_url?: string | null
          updated_at?: string
          website?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_info_catalog_place_fk"
            columns: ["catalog_place_id"]
            isOneToOne: true
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          catalog_place_id: string
          created_at: string
          description: string | null
          id: string
          sort_order: number
          trip_id: string
          updated_at: string
          votable: boolean
        }
        Insert: {
          catalog_place_id: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          trip_id: string
          updated_at?: string
          votable?: boolean
        }
        Update: {
          catalog_place_id?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          trip_id?: string
          updated_at?: string
          votable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "places_catalog_place_fk"
            columns: ["catalog_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
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
      trip_exchange_rates: {
        Row: {
          currency: string
          rate: number
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          currency: string
          rate: number
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          currency?: string
          rate?: number
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_exchange_rates_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_currency: string
          budget_published: boolean
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
          budget_currency?: string
          budget_published?: boolean
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
          budget_currency?: string
          budget_published?: boolean
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
      _distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
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
      budget_extras_valid: { Args: { p: Json }; Returns: boolean }
      catalog_in_bounds: {
        Args: {
          p_east: number
          p_exclude_trip?: string
          p_limit?: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: Database["public"]["CompositeTypes"]["catalog_place_row"][]
        SetofOptions: {
          from: "*"
          to: "catalog_place_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_near: {
        Args: {
          p_exclude_trip?: string
          p_lat: number
          p_lng: number
          p_meters?: number
        }
        Returns: Database["public"]["CompositeTypes"]["catalog_place_row"][]
        SetofOptions: {
          from: "*"
          to: "catalog_place_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_place_editable: { Args: { p_id: string }; Returns: boolean }
      catalog_place_update: {
        Args: { p_id: string; p_patch: Json }
        Returns: undefined
      }
      catalog_place_visible: { Args: { p_id: string }; Returns: boolean }
      catalog_places_visible: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["catalog_place_row"][]
        SetofOptions: {
          from: "*"
          to: "catalog_place_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      catalog_search: {
        Args: {
          p_exclude_trip?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_query: string
        }
        Returns: Database["public"]["CompositeTypes"]["catalog_place_row"][]
        SetofOptions: {
          from: "*"
          to: "catalog_place_row"
          isOneToOne: false
          isSetofReturn: true
        }
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
      set_budget_item_shares: {
        Args: { p_item_id: string; p_member_ids: string[] }
        Returns: undefined
      }
      storage_catalog_place_id: { Args: { p_name: string }; Returns: string }
      storage_photo_unreferenced: { Args: { p_name: string }; Returns: boolean }
      storage_trip_id: { Args: { p_name: string }; Returns: string }
      trip_add_place: {
        Args: {
          p_catalog_place_id?: string
          p_description?: string
          p_new?: Json
          p_trip_id: string
          p_votable?: boolean
        }
        Returns: Json
      }
      trip_covers: {
        Args: never
        Returns: {
          info_photo_url: string
          photo_path: string
          trip_id: string
        }[]
      }
    }
    Enums: {
      budget_category:
        | "lodging"
        | "transport"
        | "tickets"
        | "food"
        | "shopping"
        | "other"
      member_status: "pending" | "accepted" | "declined"
    }
    CompositeTypes: {
      catalog_place_row: {
        id: string | null
        name: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
        mapbox_id: string | null
        category: string | null
        photo_path: string | null
        is_public: boolean | null
        is_mine: boolean | null
        editable: boolean | null
        used_elsewhere: boolean | null
      }
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
      budget_category: [
        "lodging",
        "transport",
        "tickets",
        "food",
        "shopping",
        "other",
      ],
      member_status: ["pending", "accepted", "declined"],
    },
  },
} as const
