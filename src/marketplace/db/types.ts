/**
 * DB2's schema, as TypeScript. GENERATED — do not edit by hand.
 *
 *   npm run gen:types
 *
 * Read from the live database via PostgREST's OpenAPI description, so this
 * describes the schema that EXISTS, not the one src/marketplace/db/schema.sql
 * says should exist. When those two disagree that is worth knowing about, and
 * typing over it silently would hide it.
 *
 * 41 tables, 14 enums.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          full_name: string;
          phone: string;
          city: string;
          district: string | null;
          street: string | null;
          building: string | null;
          postal_code: string | null;
          notes: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          full_name: string;
          phone: string;
          city: string;
          district?: string | null;
          street?: string | null;
          building?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          full_name?: string;
          phone?: string;
          city?: string;
          district?: string | null;
          street?: string | null;
          building?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          id: number;
          actor: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          ip?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          actor?: string;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          ip?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      auth_otp_sends: {
        Row: {
          id: number;
          email: string;
          purpose: string;
          sent_at: string;
        };
        Insert: {
          id: number;
          email: string;
          purpose: string;
          sent_at?: string;
        };
        Update: {
          id?: number;
          email?: string;
          purpose?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          listing_id: string;
          vendor_id: string;
          buyer_user_id: string;
          state: Database['public']['Enums']['booking_state'];
          slot_start: string;
          slot_end: string;
          location: string | null;
          notes: string | null;
          order_id: string | null;
          confirmed_at: string | null;
          completed_at: string | null;
          cancelled_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          vendor_id: string;
          buyer_user_id: string;
          state?: Database['public']['Enums']['booking_state'];
          slot_start: string;
          slot_end: string;
          location?: string | null;
          notes?: string | null;
          order_id?: string | null;
          confirmed_at?: string | null;
          completed_at?: string | null;
          cancelled_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          vendor_id?: string;
          buyer_user_id?: string;
          state?: Database['public']['Enums']['booking_state'];
          slot_start?: string;
          slot_end?: string;
          location?: string | null;
          notes?: string | null;
          order_id?: string | null;
          confirmed_at?: string | null;
          completed_at?: string | null;
          cancelled_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      car_attribute_kinds: {
        Row: {
          slug: string;
          name: Json;
          description: Json | null;
          icon_url: string | null;
          image_url: string | null;
          show_on_card: boolean;
          sequence: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          name: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          show_on_card?: boolean;
          sequence?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          show_on_card?: boolean;
          sequence?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      car_attributes: {
        Row: {
          id: string;
          kind: string;
          slug: string;
          name: Json;
          description: Json | null;
          icon_url: string | null;
          image_url: string | null;
          color: string | null;
          sequence: number;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          slug: string;
          name: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          color?: string | null;
          sequence?: number;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          slug?: string;
          name?: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          color?: string | null;
          sequence?: number;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      car_brands: {
        Row: {
          id: string;
          slug: string;
          name: Json;
          description: Json | null;
          logo_url: string | null;
          image_url: string | null;
          icon_url: string | null;
          sequence: number;
          source_id: number | null;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: Json;
          description?: Json | null;
          logo_url?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: Json;
          description?: Json | null;
          logo_url?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      car_colors: {
        Row: {
          id: string;
          slug: string | null;
          name: Json;
          description: Json | null;
          hex: string | null;
          image_url: string | null;
          icon_url: string | null;
          sequence: number;
          source_id: number | null;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug?: string | null;
          name: Json;
          description?: Json | null;
          hex?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string | null;
          name?: Json;
          description?: Json | null;
          hex?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      car_models: {
        Row: {
          id: string;
          brand_id: string;
          slug: string;
          name: Json;
          description: Json | null;
          image_url: string | null;
          icon_url: string | null;
          sequence: number;
          source_id: number | null;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          slug: string;
          name: Json;
          description?: Json | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          slug?: string;
          name?: Json;
          description?: Json | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'car_models_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'car_brands';
            referencedColumns: ['id'];
          },
        ];
      };
      car_trims: {
        Row: {
          id: string;
          model_id: string;
          slug: string;
          name: Json;
          description: Json | null;
          code: string | null;
          image_url: string | null;
          icon_url: string | null;
          sequence: number;
          source_id: number | null;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          model_id: string;
          slug: string;
          name: Json;
          description?: Json | null;
          code?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          model_id?: string;
          slug?: string;
          name?: Json;
          description?: Json | null;
          code?: string | null;
          image_url?: string | null;
          icon_url?: string | null;
          sequence?: number;
          source_id?: number | null;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'car_trims_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'car_models';
            referencedColumns: ['id'];
          },
        ];
      };
      car_years: {
        Row: {
          id: string;
          value: number;
          source_id: number | null;
          is_custom: boolean;
          created_by_vendor_id: string | null;
          approved: boolean;
        };
        Insert: {
          id?: string;
          value: number;
          source_id?: number | null;
          is_custom?: boolean;
          created_by_vendor_id?: string | null;
          approved?: boolean;
        };
        Update: {
          id?: string;
          value?: number;
          source_id?: number | null;
          is_custom?: boolean;
          created_by_vendor_id?: string | null;
          approved?: boolean;
        };
        Relationships: [];
      };
      catalog_split_map: {
        Row: {
          table_name: string;
          vendor_id: string;
          old_id: string;
          new_id: string;
          created_at: string;
        };
        Insert: {
          table_name: string;
          vendor_id: string;
          old_id: string;
          new_id: string;
          created_at?: string;
        };
        Update: {
          table_name?: string;
          vendor_id?: string;
          old_id?: string;
          new_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_split_map_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      catalog_template_installs: {
        Row: {
          id: string;
          template: string;
          table_name: string;
          row_id: string;
          vendor_id: string | null;
          installed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template: string;
          table_name: string;
          row_id: string;
          vendor_id?: string | null;
          installed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          template?: string;
          table_name?: string;
          row_id?: string;
          vendor_id?: string | null;
          installed_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_template_installs_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          name: Json;
          description: Json | null;
          listing_type: Database['public']['Enums']['listing_type'];
          icon_url: string | null;
          image_url: string | null;
          attribute_schema: Json;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          slug: string;
          name: Json;
          description?: Json | null;
          listing_type: Database['public']['Enums']['listing_type'];
          icon_url?: string | null;
          image_url?: string | null;
          attribute_schema: Json;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          slug?: string;
          name?: Json;
          description?: Json | null;
          listing_type?: Database['public']['Enums']['listing_type'];
          icon_url?: string | null;
          image_url?: string | null;
          attribute_schema?: Json;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      commission_rules: {
        Row: {
          id: string;
          scope: string;
          listing_type: Database['public']['Enums']['listing_type'] | null;
          category_id: string | null;
          rate: number;
          min_fee: number;
          max_fee: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope: string;
          listing_type?: Database['public']['Enums']['listing_type'] | null;
          category_id?: string | null;
          rate: number;
          min_fee?: number;
          max_fee?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope?: string;
          listing_type?: Database['public']['Enums']['listing_type'] | null;
          category_id?: string | null;
          rate?: number;
          min_fee?: number;
          max_fee?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'commission_rules_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      disputes: {
        Row: {
          id: string;
          order_id: string;
          opened_by: string;
          opener_id: string;
          state: Database['public']['Enums']['dispute_state'];
          reason: string;
          detail: string | null;
          evidence: Json;
          vendor_sla_at: string | null;
          resolution: string | null;
          refund_amount: number | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          opened_by: string;
          opener_id: string;
          state?: Database['public']['Enums']['dispute_state'];
          reason: string;
          detail?: string | null;
          evidence: Json;
          vendor_sla_at?: string | null;
          resolution?: string | null;
          refund_amount?: number | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          opened_by?: string;
          opener_id?: string;
          state?: Database['public']['Enums']['dispute_state'];
          reason?: string;
          detail?: string | null;
          evidence?: Json;
          vendor_sla_at?: string | null;
          resolution?: string | null;
          refund_amount?: number | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'disputes_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          vendor_id: string;
          listing_id: string | null;
          listing_title: Json | null;
          buyer_user_id: string;
          contact_name: string;
          contact_phone: string;
          contact_email: string | null;
          answers: Json;
          message: string | null;
          stage: Database['public']['Enums']['lead_stage'];
          outcome_note: string | null;
          assigned_to: string | null;
          follow_up_at: string | null;
          source: string;
          created_at: string;
          updated_at: string;
          read_at: string | null;
          read_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          buyer_hidden_at: string | null;
          search_text: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          listing_id?: string | null;
          listing_title?: Json | null;
          buyer_user_id: string;
          contact_name: string;
          contact_phone: string;
          contact_email?: string | null;
          answers: Json;
          message?: string | null;
          stage?: Database['public']['Enums']['lead_stage'];
          outcome_note?: string | null;
          assigned_to?: string | null;
          follow_up_at?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
          read_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          buyer_hidden_at?: string | null;
          search_text?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          listing_id?: string | null;
          listing_title?: Json | null;
          buyer_user_id?: string;
          contact_name?: string;
          contact_phone?: string;
          contact_email?: string | null;
          answers?: Json;
          message?: string | null;
          stage?: Database['public']['Enums']['lead_stage'];
          outcome_note?: string | null;
          assigned_to?: string | null;
          follow_up_at?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
          read_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          buyer_hidden_at?: string | null;
          search_text?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'leads_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_offers: {
        Row: {
          id: string;
          vendor_id: string;
          listing_id: string;
          label: Json | null;
          discount_type: Database['public']['Enums']['offer_discount_type'];
          discount_value: number;
          starts_at: string | null;
          ends_at: string | null;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          offer_name_id: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          listing_id: string;
          label?: Json | null;
          discount_type?: Database['public']['Enums']['offer_discount_type'];
          discount_value: number;
          starts_at?: string | null;
          ends_at?: string | null;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          offer_name_id?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          listing_id?: string;
          label?: Json | null;
          discount_type?: Database['public']['Enums']['offer_discount_type'];
          discount_value?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          offer_name_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_offers_offer_name_id_fkey';
            columns: ['offer_name_id'];
            isOneToOne: false;
            referencedRelation: 'offer_names';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_specs: {
        Row: {
          id: string;
          listing_id: string;
          attribute_id: string;
          value: Json | null;
          display_value: string | null;
          sequence: number;
        };
        Insert: {
          id?: string;
          listing_id: string;
          attribute_id: string;
          value?: Json | null;
          display_value?: string | null;
          sequence?: number;
        };
        Update: {
          id?: string;
          listing_id?: string;
          attribute_id?: string;
          value?: Json | null;
          display_value?: string | null;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_specs_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_specs_attribute_id_fkey';
            columns: ['attribute_id'];
            isOneToOne: false;
            referencedRelation: 'spec_attributes';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_variants: {
        Row: {
          id: string;
          listing_id: string;
          color_id: string | null;
          name: Json | null;
          is_primary: boolean;
          media: Json;
          sequence: number;
          created_at: string;
          price: number | null;
          compare_at: number | null;
        };
        Insert: {
          id?: string;
          listing_id: string;
          color_id?: string | null;
          name?: Json | null;
          is_primary?: boolean;
          media: Json;
          sequence?: number;
          created_at?: string;
          price?: number | null;
          compare_at?: number | null;
        };
        Update: {
          id?: string;
          listing_id?: string;
          color_id?: string | null;
          name?: Json | null;
          is_primary?: boolean;
          media?: Json;
          sequence?: number;
          created_at?: string;
          price?: number | null;
          compare_at?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_variants_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_variants_color_id_fkey';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'car_colors';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          id: string;
          slug: string;
          public_ref: string;
          vendor_id: string;
          category_id: string;
          type: Database['public']['Enums']['listing_type'];
          state: Database['public']['Enums']['listing_state'];
          brand_id: string | null;
          model_id: string | null;
          year_id: string | null;
          trim_id: string | null;
          color_id: string | null;
          interior_color_id: string | null;
          name: Json;
          description: Json | null;
          meta_title: Json | null;
          meta_description: Json | null;
          meta_keywords: Json | null;
          og_title: Json | null;
          og_description: Json | null;
          canonical_url: string | null;
          price: number;
          compare_at: number | null;
          vat_included: boolean;
          vat_percentage: number;
          currency: string;
          available_on_request: boolean;
          stock: number | null;
          attributes: Json;
          media: Json;
          has_test_drive: boolean;
          test_drive_notes: Json | null;
          warranty_months: number | null;
          country_of_origin: string | null;
          part_number: string | null;
          city: string | null;
          views: number;
          is_featured: boolean;
          rejection_reason: string | null;
          published_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
          focus_keyword: Json | null;
          seo_index: boolean;
          seo_follow: boolean;
          og_image_url: string | null;
          og_type: string;
          twitter_card: string;
          twitter_title: Json | null;
          twitter_description: Json | null;
          twitter_image_url: string | null;
          seo_priority: number;
          seo_changefreq: string;
          structured_data: Json | null;
        };
        Insert: {
          id?: string;
          slug: string;
          public_ref?: string;
          vendor_id: string;
          category_id: string;
          type: Database['public']['Enums']['listing_type'];
          state?: Database['public']['Enums']['listing_state'];
          brand_id?: string | null;
          model_id?: string | null;
          year_id?: string | null;
          trim_id?: string | null;
          color_id?: string | null;
          interior_color_id?: string | null;
          name: Json;
          description?: Json | null;
          meta_title?: Json | null;
          meta_description?: Json | null;
          meta_keywords?: Json | null;
          og_title?: Json | null;
          og_description?: Json | null;
          canonical_url?: string | null;
          price: number;
          compare_at?: number | null;
          vat_included?: boolean;
          vat_percentage?: number;
          currency?: string;
          available_on_request?: boolean;
          stock?: number | null;
          attributes: Json;
          media: Json;
          has_test_drive?: boolean;
          test_drive_notes?: Json | null;
          warranty_months?: number | null;
          country_of_origin?: string | null;
          part_number?: string | null;
          city?: string | null;
          views?: number;
          is_featured?: boolean;
          rejection_reason?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          focus_keyword?: Json | null;
          seo_index?: boolean;
          seo_follow?: boolean;
          og_image_url?: string | null;
          og_type?: string;
          twitter_card?: string;
          twitter_title?: Json | null;
          twitter_description?: Json | null;
          twitter_image_url?: string | null;
          seo_priority?: number;
          seo_changefreq?: string;
          structured_data?: Json | null;
        };
        Update: {
          id?: string;
          slug?: string;
          public_ref?: string;
          vendor_id?: string;
          category_id?: string;
          type?: Database['public']['Enums']['listing_type'];
          state?: Database['public']['Enums']['listing_state'];
          brand_id?: string | null;
          model_id?: string | null;
          year_id?: string | null;
          trim_id?: string | null;
          color_id?: string | null;
          interior_color_id?: string | null;
          name?: Json;
          description?: Json | null;
          meta_title?: Json | null;
          meta_description?: Json | null;
          meta_keywords?: Json | null;
          og_title?: Json | null;
          og_description?: Json | null;
          canonical_url?: string | null;
          price?: number;
          compare_at?: number | null;
          vat_included?: boolean;
          vat_percentage?: number;
          currency?: string;
          available_on_request?: boolean;
          stock?: number | null;
          attributes?: Json;
          media?: Json;
          has_test_drive?: boolean;
          test_drive_notes?: Json | null;
          warranty_months?: number | null;
          country_of_origin?: string | null;
          part_number?: string | null;
          city?: string | null;
          views?: number;
          is_featured?: boolean;
          rejection_reason?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          focus_keyword?: Json | null;
          seo_index?: boolean;
          seo_follow?: boolean;
          og_image_url?: string | null;
          og_type?: string;
          twitter_card?: string;
          twitter_title?: Json | null;
          twitter_description?: Json | null;
          twitter_image_url?: string | null;
          seo_priority?: number;
          seo_changefreq?: string;
          structured_data?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'car_brands';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'car_models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_year_id_fkey';
            columns: ['year_id'];
            isOneToOne: false;
            referencedRelation: 'car_years';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_trim_id_fkey';
            columns: ['trim_id'];
            isOneToOne: false;
            referencedRelation: 'car_trims';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_color_id_fkey';
            columns: ['color_id'];
            isOneToOne: false;
            referencedRelation: 'car_colors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_interior_color_id_fkey';
            columns: ['interior_color_id'];
            isOneToOne: false;
            referencedRelation: 'car_colors';
            referencedColumns: ['id'];
          },
        ];
      };
      media_assets: {
        Row: {
          id: string;
          vendor_id: string | null;
          owner_user_id: string | null;
          kind: Database['public']['Enums']['media_kind'];
          storage_path: string;
          url: string;
          filename: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          width: number | null;
          height: number | null;
          alt: Json | null;
          tags: string[] | null;
          created_at: string;
          folder_id: string | null;
        };
        Insert: {
          id?: string;
          vendor_id?: string | null;
          owner_user_id?: string | null;
          kind?: Database['public']['Enums']['media_kind'];
          storage_path: string;
          url: string;
          filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          alt?: Json | null;
          tags?: string[] | null;
          created_at?: string;
          folder_id?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string | null;
          owner_user_id?: string | null;
          kind?: Database['public']['Enums']['media_kind'];
          storage_path?: string;
          url?: string;
          filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          alt?: Json | null;
          tags?: string[] | null;
          created_at?: string;
          folder_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_assets_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_assets_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'media_folders';
            referencedColumns: ['id'];
          },
        ];
      };
      media_folders: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
          slug: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          slug?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          slug?: string | null;
        };
        Relationships: [];
      };
      offer_names: {
        Row: {
          id: string;
          slug: string;
          name: Json;
          description: Json | null;
          icon_url: string | null;
          image_url: string | null;
          sequence: number;
          is_custom: boolean;
          approved: boolean;
          created_by_vendor_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          sequence?: number;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: Json;
          description?: Json | null;
          icon_url?: string | null;
          image_url?: string | null;
          sequence?: number;
          is_custom?: boolean;
          approved?: boolean;
          created_by_vendor_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_events: {
        Row: {
          id: string;
          order_id: string;
          actor: string;
          actor_id: string | null;
          event: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          actor: string;
          actor_id?: string | null;
          event: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          actor?: string;
          actor_id?: string | null;
          event?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_lines: {
        Row: {
          id: string;
          order_id: string;
          listing_id: string;
          qty: number;
          unit_price: number;
          line_total: number;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          listing_id: string;
          qty: number;
          unit_price: number;
          line_total: number;
          snapshot: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          listing_id?: string;
          qty?: number;
          unit_price?: number;
          line_total?: number;
          snapshot?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_lines_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_lines_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          ref: string;
          parent_ref: string;
          vendor_id: string;
          buyer_user_id: string;
          buyer_email: string | null;
          buyer_phone: string | null;
          state: Database['public']['Enums']['order_state'];
          subtotal: number;
          shipping: number;
          vat: number;
          total: number;
          commission_rate: number;
          commission_amount: number;
          vendor_net: number;
          funds_held: boolean;
          released_at: string | null;
          auto_release_at: string | null;
          shipping_address: Json;
          shipping_method: string | null;
          tracking_number: string | null;
          payment_ref: string | null;
          cancelled_reason: string | null;
          placed_at: string;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ref: string;
          parent_ref: string;
          vendor_id: string;
          buyer_user_id: string;
          buyer_email?: string | null;
          buyer_phone?: string | null;
          state?: Database['public']['Enums']['order_state'];
          subtotal: number;
          shipping?: number;
          vat?: number;
          total: number;
          commission_rate?: number;
          commission_amount?: number;
          vendor_net?: number;
          funds_held?: boolean;
          released_at?: string | null;
          auto_release_at?: string | null;
          shipping_address: Json;
          shipping_method?: string | null;
          tracking_number?: string | null;
          payment_ref?: string | null;
          cancelled_reason?: string | null;
          placed_at?: string;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ref?: string;
          parent_ref?: string;
          vendor_id?: string;
          buyer_user_id?: string;
          buyer_email?: string | null;
          buyer_phone?: string | null;
          state?: Database['public']['Enums']['order_state'];
          subtotal?: number;
          shipping?: number;
          vat?: number;
          total?: number;
          commission_rate?: number;
          commission_amount?: number;
          vendor_net?: number;
          funds_held?: boolean;
          released_at?: string | null;
          auto_release_at?: string | null;
          shipping_address?: Json;
          shipping_method?: string | null;
          tracking_number?: string | null;
          payment_ref?: string | null;
          cancelled_reason?: string | null;
          placed_at?: string;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      payout_lines: {
        Row: {
          id: string;
          payout_id: string;
          order_id: string;
          gross: number;
          commission: number;
          net: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payout_id: string;
          order_id: string;
          gross: number;
          commission: number;
          net: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          payout_id?: string;
          order_id?: string;
          gross?: number;
          commission?: number;
          net?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payout_lines_payout_id_fkey';
            columns: ['payout_id'];
            isOneToOne: false;
            referencedRelation: 'payouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payout_lines_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      payouts: {
        Row: {
          id: string;
          vendor_id: string;
          state: Database['public']['Enums']['payout_state'];
          period_start: string;
          period_end: string;
          gross: number;
          commission: number;
          refunds: number;
          net: number;
          iban: string | null;
          reference: string | null;
          failure_reason: string | null;
          approved_by: string | null;
          approved_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          state?: Database['public']['Enums']['payout_state'];
          period_start: string;
          period_end: string;
          gross?: number;
          commission?: number;
          refunds?: number;
          net?: number;
          iban?: string | null;
          reference?: string | null;
          failure_reason?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          state?: Database['public']['Enums']['payout_state'];
          period_start?: string;
          period_end?: string;
          gross?: number;
          commission?: number;
          refunds?: number;
          net?: number;
          iban?: string | null;
          reference?: string | null;
          failure_reason?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payouts_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          role: Database['public']['Enums']['app_role'];
          full_name: string | null;
          phone: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: Database['public']['Enums']['app_role'];
          full_name?: string | null;
          phone?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: Database['public']['Enums']['app_role'];
          full_name?: string | null;
          phone?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          listing_id: string | null;
          vendor_id: string;
          buyer_user_id: string;
          order_id: string | null;
          booking_id: string | null;
          rating: number;
          body: string | null;
          verified_purchase: boolean;
          vendor_reply: string | null;
          vendor_replied_at: string | null;
          hidden: boolean;
          hidden_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id?: string | null;
          vendor_id: string;
          buyer_user_id: string;
          order_id?: string | null;
          booking_id?: string | null;
          rating: number;
          body?: string | null;
          verified_purchase?: boolean;
          vendor_reply?: string | null;
          vendor_replied_at?: string | null;
          hidden?: boolean;
          hidden_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string | null;
          vendor_id?: string;
          buyer_user_id?: string;
          order_id?: string | null;
          booking_id?: string | null;
          rating?: number;
          body?: string | null;
          verified_purchase?: boolean;
          vendor_reply?: string | null;
          vendor_replied_at?: string | null;
          hidden?: boolean;
          hidden_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_listings: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_listings_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_searches: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          query: Json;
          notify: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          query: Json;
          notify?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          query?: Json;
          notify?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      spec_attribute_values: {
        Row: {
          id: string;
          attribute_id: string;
          name: Json;
          sequence: number;
          source_id: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          attribute_id: string;
          name: Json;
          sequence?: number;
          source_id?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          attribute_id?: string;
          name?: Json;
          sequence?: number;
          source_id?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'spec_attribute_values_attribute_id_fkey';
            columns: ['attribute_id'];
            isOneToOne: false;
            referencedRelation: 'spec_attributes';
            referencedColumns: ['id'];
          },
        ];
      };
      spec_attributes: {
        Row: {
          id: string;
          slug: string;
          category_name: Json;
          category_icon_url: string | null;
          category_sequence: number;
          attribute_name: Json;
          attribute_icon_url: string | null;
          attribute_sequence: number;
          description: Json | null;
          unit_code: Json | null;
          display_type: string | null;
          show_on_card: boolean;
          is_key: boolean;
          source_id: number | null;
          active: boolean;
          created_at: string;
          image_url: string | null;
          created_by_vendor_id: string | null;
          is_custom: boolean;
          approved: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          category_name: Json;
          category_icon_url?: string | null;
          category_sequence?: number;
          attribute_name: Json;
          attribute_icon_url?: string | null;
          attribute_sequence?: number;
          description?: Json | null;
          unit_code?: Json | null;
          display_type?: string | null;
          show_on_card?: boolean;
          is_key?: boolean;
          source_id?: number | null;
          active?: boolean;
          created_at?: string;
          image_url?: string | null;
          created_by_vendor_id?: string | null;
          is_custom?: boolean;
          approved?: boolean;
        };
        Update: {
          id?: string;
          slug?: string;
          category_name?: Json;
          category_icon_url?: string | null;
          category_sequence?: number;
          attribute_name?: Json;
          attribute_icon_url?: string | null;
          attribute_sequence?: number;
          description?: Json | null;
          unit_code?: Json | null;
          display_type?: string | null;
          show_on_card?: boolean;
          is_key?: boolean;
          source_id?: number | null;
          active?: boolean;
          created_at?: string;
          image_url?: string | null;
          created_by_vendor_id?: string | null;
          is_custom?: boolean;
          approved?: boolean;
        };
        Relationships: [];
      };
      trim_specs: {
        Row: {
          id: string;
          trim_id: string;
          attribute_id: string;
          value: Json | null;
          display_value: string | null;
        };
        Insert: {
          id?: string;
          trim_id: string;
          attribute_id: string;
          value?: Json | null;
          display_value?: string | null;
        };
        Update: {
          id?: string;
          trim_id?: string;
          attribute_id?: string;
          value?: Json | null;
          display_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trim_specs_trim_id_fkey';
            columns: ['trim_id'];
            isOneToOne: false;
            referencedRelation: 'car_trims';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trim_specs_attribute_id_fkey';
            columns: ['attribute_id'];
            isOneToOne: false;
            referencedRelation: 'spec_attributes';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_backups: {
        Row: {
          id: string;
          vendor_id: string;
          storage_path: string;
          url: string | null;
          size_bytes: number | null;
          contents: Json;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          storage_path: string;
          url?: string | null;
          size_bytes?: number | null;
          contents: Json;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          storage_path?: string;
          url?: string | null;
          size_bytes?: number | null;
          contents?: Json;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_backups_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_form_fields: {
        Row: {
          id: string;
          vendor_id: string;
          field_key: string;
          label: Json;
          help: Json | null;
          placeholder: Json | null;
          type: Database['public']['Enums']['lead_field_type'];
          options: Json;
          required: boolean;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
          width: Database['public']['Enums']['form_field_width'];
          tab_id: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          field_key: string;
          label: Json;
          help?: Json | null;
          placeholder?: Json | null;
          type?: Database['public']['Enums']['lead_field_type'];
          options: Json;
          required?: boolean;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          width?: Database['public']['Enums']['form_field_width'];
          tab_id?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          field_key?: string;
          label?: Json;
          help?: Json | null;
          placeholder?: Json | null;
          type?: Database['public']['Enums']['lead_field_type'];
          options?: Json;
          required?: boolean;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          width?: Database['public']['Enums']['form_field_width'];
          tab_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_form_fields_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_form_fields_tab_id_fkey';
            columns: ['tab_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_form_tabs';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_form_tabs: {
        Row: {
          id: string;
          vendor_id: string;
          label: Json;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          label: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          label?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_form_tabs_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_members: {
        Row: {
          vendor_id: string;
          user_id: string;
          role: Database['public']['Enums']['vendor_member_role'];
          created_at: string;
        };
        Insert: {
          vendor_id: string;
          user_id: string;
          role?: Database['public']['Enums']['vendor_member_role'];
          created_at?: string;
        };
        Update: {
          vendor_id?: string;
          user_id?: string;
          role?: Database['public']['Enums']['vendor_member_role'];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_members_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      vendors: {
        Row: {
          id: string;
          slug: string;
          name: Json;
          bio: Json | null;
          state: Database['public']['Enums']['vendor_state'];
          verified: boolean;
          cr_number: string | null;
          vat_number: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          city: string | null;
          logo_url: string | null;
          banner_url: string | null;
          policies: Json;
          commission_rate: number | null;
          rating_avg: number;
          rating_count: number;
          owner_user_id: string | null;
          approved_at: string | null;
          suspended_reason: string | null;
          created_at: string;
          updated_at: string;
          address: Json;
          working_hours: Json;
          social: Json;
          settings: Json;
          deleted_at: string | null;
          deletion_reason: string | null;
          lead_form_style: string;
          lead_form_theme: Json;
          meta_title: Json | null;
          meta_description: Json | null;
          og_image_url: string | null;
          seo_index: boolean;
          seo_follow: boolean;
          meta_keywords: Json | null;
          focus_keyword: Json | null;
          og_title: Json | null;
          og_description: Json | null;
          og_type: string;
          twitter_card: string;
          twitter_title: Json | null;
          twitter_description: Json | null;
          twitter_image_url: string | null;
          seo_priority: number;
          seo_changefreq: string;
          canonical_url: string | null;
          structured_data: Json | null;
          about: Json | null;
          social_links: Json;
        };
        Insert: {
          id?: string;
          slug: string;
          name: Json;
          bio?: Json | null;
          state?: Database['public']['Enums']['vendor_state'];
          verified?: boolean;
          cr_number?: string | null;
          vat_number?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          city?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          policies: Json;
          commission_rate?: number | null;
          rating_avg?: number;
          rating_count?: number;
          owner_user_id?: string | null;
          approved_at?: string | null;
          suspended_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          address: Json;
          working_hours: Json;
          social: Json;
          settings: Json;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          lead_form_style?: string;
          lead_form_theme: Json;
          meta_title?: Json | null;
          meta_description?: Json | null;
          og_image_url?: string | null;
          seo_index?: boolean;
          seo_follow?: boolean;
          meta_keywords?: Json | null;
          focus_keyword?: Json | null;
          og_title?: Json | null;
          og_description?: Json | null;
          og_type?: string;
          twitter_card?: string;
          twitter_title?: Json | null;
          twitter_description?: Json | null;
          twitter_image_url?: string | null;
          seo_priority?: number;
          seo_changefreq?: string;
          canonical_url?: string | null;
          structured_data?: Json | null;
          about?: Json | null;
          social_links: Json;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: Json;
          bio?: Json | null;
          state?: Database['public']['Enums']['vendor_state'];
          verified?: boolean;
          cr_number?: string | null;
          vat_number?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          city?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          policies?: Json;
          commission_rate?: number | null;
          rating_avg?: number;
          rating_count?: number;
          owner_user_id?: string | null;
          approved_at?: string | null;
          suspended_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          address?: Json;
          working_hours?: Json;
          social?: Json;
          settings?: Json;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          lead_form_style?: string;
          lead_form_theme?: Json;
          meta_title?: Json | null;
          meta_description?: Json | null;
          og_image_url?: string | null;
          seo_index?: boolean;
          seo_follow?: boolean;
          meta_keywords?: Json | null;
          focus_keyword?: Json | null;
          og_title?: Json | null;
          og_description?: Json | null;
          og_type?: string;
          twitter_card?: string;
          twitter_title?: Json | null;
          twitter_description?: Json | null;
          twitter_image_url?: string | null;
          seo_priority?: number;
          seo_changefreq?: string;
          canonical_url?: string | null;
          structured_data?: Json | null;
          about?: Json | null;
          social_links?: Json;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_role: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      can_see_order: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
      catalog_split_row: {
        Args: {
          source_row: string;
          target: string;
          tbl: string;
        };
        Returns: unknown;
      };
      i18n: {
        Args: {
          ar: string;
          en: string;
        };
        Returns: unknown;
      };
      i18n_text: {
        Args: {
          lang?: string;
          value: Json;
        };
        Returns: unknown;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      is_staff: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      is_vendor_member: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
      my_vendor_ids: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      my_vendor_role: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
      otp_send_allowed: {
        Args: {
          address_window?: unknown;
          cooldown?: unknown;
          kind: string;
          per_address?: number;
          per_hour?: number;
          target: string;
        };
        Returns: unknown;
      };
      owns_listing: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
      owns_vendor: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
      profile_complete: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      prune_auth_otp_sends: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      show_limit: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      show_trgm: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      vendor_catalog_rows: {
        Args: {
          target: string;
          tbl: string;
        };
        Returns: unknown;
      };
      vendor_state_of: {
        Args: {
          target: string;
        };
        Returns: unknown;
      };
    };
    Enums: {
      app_role: 'buyer' | 'staff' | 'admin';
      booking_state: 'requested' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
      dispute_state: 'open' | 'vendor_responding' | 'resolved' | 'escalated' | 'staff_review' | 'ruled_buyer' | 'ruled_vendor';
      form_field_width: 'full' | 'half' | 'third';
      lead_field_type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'date' | 'phone' | 'email';
      lead_stage: 'new' | 'contacted' | 'quoted' | 'won' | 'lost' | 'cancelled';
      listing_state: 'draft' | 'pending_review' | 'live' | 'paused' | 'rejected' | 'sold_out' | 'expired' | 'removed';
      listing_type: 'part' | 'car' | 'service' | 'accessory';
      media_kind: 'photo' | 'icon' | 'document' | 'logo';
      offer_discount_type: 'percent' | 'amount';
      order_state: 'pending_payment' | 'paid' | 'accepted' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';
      payout_state: 'draft' | 'approved' | 'paid' | 'failed';
      vendor_member_role: 'owner' | 'manager' | 'staff';
      vendor_state: 'applied' | 'documents_pending' | 'under_review' | 'approved' | 'suspended' | 'rejected';
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Row types by table name: `Row<'listings'>`. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Insert payloads by table name: `Insert<'listings'>`. */
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Update payloads by table name: `Update<'listings'>`. */
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** Enum unions by name: `Enum<'listing_state'>`. */
export type Enum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
