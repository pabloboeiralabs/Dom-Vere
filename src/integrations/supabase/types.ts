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
      appointments: {
        Row: {
          created_at: string | null
          customer_id: string | null
          date: string
          end_time: string
          id: string
          notes: string | null
          professional_id: string | null
          service_id: string | null
          start_time: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          date: string
          end_time: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          service_id?: string | null
          start_time: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          date?: string
          end_time?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_conversation_stages: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          instruction: string
          name: string
          skip_if_registered: boolean | null
          stage_order: number
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          instruction: string
          name: string
          skip_if_registered?: boolean | null
          stage_order: number
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          instruction?: string
          name?: string
          skip_if_registered?: boolean | null
          stage_order?: number
          user_id?: string
        }
        Relationships: []
      }
      bot_trigger_responses: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          response_text: string
          trigger_word: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          response_text: string
          trigger_word: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          response_text?: string
          trigger_word?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          appointment_id: string | null
          bot_msg_count: number | null
          bot_paused: boolean | null
          created_at: string | null
          current_stage: number | null
          customer_id: string | null
          id: string
          last_interaction_at: string | null
          name: string
          notes: string | null
          phone: string | null
          reminder_sent: boolean | null
          stage: string
          user_id: string
          wa_chatid: string | null
        }
        Insert: {
          appointment_id?: string | null
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          reminder_sent?: boolean | null
          stage?: string
          user_id: string
          wa_chatid?: string | null
        }
        Update: {
          appointment_id?: string | null
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          reminder_sent?: boolean | null
          stage?: string
          user_id?: string
          wa_chatid?: string | null
        }
        Relationships: []
      }
      customer_plans: {
        Row: {
          active: boolean | null
          created_at: string | null
          customer_id: string | null
          expires_at: string
          id: string
          paid_amount: number | null
          period: string
          plan_id: string | null
          starts_at: string
          total_price: number
          usage_count: number | null
          usage_limit: number
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          expires_at: string
          id?: string
          paid_amount?: number | null
          period?: string
          plan_id?: string | null
          starts_at?: string
          total_price?: number
          usage_count?: number | null
          usage_limit: number
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          paid_amount?: number | null
          period?: string
          plan_id?: string | null
          starts_at?: string
          total_price?: number
          usage_count?: number | null
          usage_limit?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birth_date: string | null
          created_at: string | null
          credit_balance: number | null
          id: string
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          credit_balance?: number | null
          id?: string
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          credit_balance?: number | null
          id?: string
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cuts: {
        Row: {
          created_at: string | null
          credits_used: number | null
          customer_id: string | null
          id: string
          notes: string | null
          professional_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_used?: number | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          professional_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_used?: number | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          professional_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuts_professional"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_services: {
        Row: {
          id: string
          plan_id: string | null
          quantity: number | null
          service_id: string | null
        }
        Insert: {
          id?: string
          plan_id?: string | null
          quantity?: number | null
          service_id?: string | null
        }
        Update: {
          id?: string
          plan_id?: string | null
          quantity?: number | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_usage_records: {
        Row: {
          created_at: string | null
          customer_plan_id: string | null
          id: string
          professional_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_plan_id?: string | null
          id?: string
          professional_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_plan_id?: string | null
          id?: string
          professional_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_plan_usage_records_professional"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_usage_records_customer_plan_id_fkey"
            columns: ["customer_plan_id"]
            isOneToOne: false
            referencedRelation: "customer_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_usage_services: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          id: string
          service_id: string | null
          service_name: string
          usage_record_id: string | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          service_id?: string | null
          service_name: string
          usage_record_id?: string | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          service_id?: string | null
          service_name?: string
          usage_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_usage_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_usage_services_usage_record_id_fkey"
            columns: ["usage_record_id"]
            isOneToOne: false
            referencedRelation: "plan_usage_records"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          period: string | null
          price: number
          usage_limit: number | null
          user_id: string
          validity_days: number | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          period?: string | null
          price: number
          usage_limit?: number | null
          user_id: string
          validity_days?: number | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          period?: string | null
          price?: number
          usage_limit?: number | null
          user_id?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      product_sales: {
        Row: {
          commission_amount: number
          created_at: string
          customer_id: string | null
          id: string
          product_id: string
          professional_id: string | null
          quantity: number
          sale_type: string
          total_price: number
          unit_price: number
          user_id: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id: string
          professional_id?: string | null
          quantity?: number
          sale_type?: string
          total_price: number
          unit_price: number
          user_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id?: string
          professional_id?: string | null
          quantity?: number
          sale_type?: string
          total_price?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          commission_percent: number | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          stock_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          commission_percent?: number | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          stock_quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          commission_percent?: number | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          stock_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      professional_schedules: {
        Row: {
          active: boolean | null
          day_of_week: number
          end_time: string
          id: string
          professional_id: string | null
          start_time: string
        }
        Insert: {
          active?: boolean | null
          day_of_week: number
          end_time?: string
          id?: string
          professional_id?: string | null
          start_time?: string
        }
        Update: {
          active?: boolean | null
          day_of_week?: number
          end_time?: string
          id?: string
          professional_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_schedules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean | null
          commission_percent: number | null
          created_at: string | null
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          commission_percent?: number | null
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          commission_percent?: number | null
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string
          id: string
          must_change_password: boolean | null
          name: string
          owner_id: string | null
          professional_id: string | null
          role: string
          subscription_expires_at: string | null
          subscription_type: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email: string
          id: string
          must_change_password?: boolean | null
          name: string
          owner_id?: string | null
          professional_id?: string | null
          role?: string
          subscription_expires_at?: string | null
          subscription_type?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          must_change_password?: boolean | null
          name?: string
          owner_id?: string | null
          professional_id?: string | null
          role?: string
          subscription_expires_at?: string | null
          subscription_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_logs: {
        Row: {
          customer_id: string
          customer_plan_id: string | null
          id: string
          reminder_for: string
          reminder_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          customer_id: string
          customer_plan_id?: string | null
          id?: string
          reminder_for: string
          reminder_type: string
          sent_at?: string
          user_id: string
        }
        Update: {
          customer_id?: string
          customer_plan_id?: string | null
          id?: string
          reminder_for?: string
          reminder_type?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          price: number | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          price?: number | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          price?: number | null
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          auto_reminder_enabled: boolean
          auto_reminder_expiry_template: string | null
          auto_reminder_return_template: string | null
          bot_enabled: boolean
          bot_human_transfer_msg: string | null
          bot_msg_limit: number | null
          bot_prompt: string | null
          bot_trigger_words: string[] | null
          clinic_address: string | null
          clinic_lat: string | null
          clinic_lng: string | null
          credit_price: number | null
          id: string
          min_purchase: number | null
          shop_name: string | null
          updated_at: string | null
          user_id: string
          validity_days: number | null
        }
        Insert: {
          auto_reminder_enabled?: boolean
          auto_reminder_expiry_template?: string | null
          auto_reminder_return_template?: string | null
          bot_enabled?: boolean
          bot_human_transfer_msg?: string | null
          bot_msg_limit?: number | null
          bot_prompt?: string | null
          bot_trigger_words?: string[] | null
          clinic_address?: string | null
          clinic_lat?: string | null
          clinic_lng?: string | null
          credit_price?: number | null
          id?: string
          min_purchase?: number | null
          shop_name?: string | null
          updated_at?: string | null
          user_id: string
          validity_days?: number | null
        }
        Update: {
          auto_reminder_enabled?: boolean
          auto_reminder_expiry_template?: string | null
          auto_reminder_return_template?: string | null
          bot_enabled?: boolean
          bot_human_transfer_msg?: string | null
          bot_msg_limit?: number | null
          bot_prompt?: string | null
          bot_trigger_words?: string[] | null
          clinic_address?: string | null
          clinic_lat?: string | null
          clinic_lng?: string | null
          credit_price?: number | null
          id?: string
          min_purchase?: number | null
          shop_name?: string | null
          updated_at?: string | null
          user_id?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      subscription_pricing: {
        Row: {
          features: Json
          icon: string
          id: string
          price: number
          subtitle: string
          type: string
          updated_at: string | null
        }
        Insert: {
          features?: Json
          icon?: string
          id?: string
          price?: number
          subtitle?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          features?: Json
          icon?: string
          id?: string
          price?: number
          subtitle?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string | null
          id: string
          notes: string | null
          professional_id: string | null
          total: number | null
          type: string
          unit_price: number | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          professional_id?: string | null
          total?: number | null
          type: string
          unit_price?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          professional_id?: string | null
          total?: number | null
          type?: string
          unit_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_professional"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      whatsapp_config: {
        Row: {
          api_url: string
          created_at: string | null
          id: string
          instance_token: string
          user_id: string
        }
        Insert: {
          api_url?: string
          created_at?: string | null
          id?: string
          instance_token: string
          user_id: string
        }
        Update: {
          api_url?: string
          created_at?: string | null
          id?: string
          instance_token?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_json_configs: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          json_content: Json
          name: string
          type: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          json_content?: Json
          name: string
          type?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          json_content?: Json
          name?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string | null
          from_me: boolean | null
          id: string
          msg_type: string | null
          push_name: string | null
          text: string | null
          user_id: string
          wa_chatid: string
          wa_message_id: string | null
          wa_timestamp: number
        }
        Insert: {
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          msg_type?: string | null
          push_name?: string | null
          text?: string | null
          user_id: string
          wa_chatid: string
          wa_message_id?: string | null
          wa_timestamp: number
        }
        Update: {
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          msg_type?: string | null
          push_name?: string | null
          text?: string | null
          user_id?: string
          wa_chatid?: string
          wa_message_id?: string | null
          wa_timestamp?: number
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      client_portal_history: {
        Args: { p_customer_id: string }
        Returns: {
          amount: number
          description: string
          record_date: string
          record_type: string
        }[]
      }
      exec_sql: { Args: { sql_query: string }; Returns: Json }
      get_admin_stats: {
        Args: never
        Returns: {
          total_revenue: number
          total_shops: number
          total_users: number
        }[]
      }
      get_appointments_with_details: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          customer_id: string
          customer_name: string
          date: string
          end_time: string
          id: string
          notes: string
          professional_id: string
          service_id: string
          service_name: string
          start_time: string
          status: string
        }[]
      }
      get_clients_with_plans: {
        Args: { p_user_id: string }
        Returns: {
          birth_date: string
          credit_balance: number
          id: string
          name: string
          phone: string
          plan_name: string
        }[]
      }
      get_customer_history: {
        Args: { p_customer_id: string; p_user_id: string }
        Returns: {
          amount: number
          created_at: string
          notes: string
          total: number
          type: string
        }[]
      }
      get_customer_plan_details: {
        Args: { p_customer_id: string; p_user_id: string }
        Returns: {
          active: boolean
          expires_at: string
          id: string
          paid_amount: number
          period: string
          plan_id: string
          plan_name: string
          plan_price: number
          starts_at: string
          total_price: number
          usage_count: number
          usage_limit: number
        }[]
      }
      get_cuts_chart: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          cuts: number
          day: string
        }[]
      }
      get_dashboard_metrics: {
        Args: { p_user_id: string }
        Returns: {
          active_clients: number
          pending_credits: number
          revenue: number
          total_cuts: number
        }[]
      }
      get_expirations: {
        Args: { p_user_id: string }
        Returns: {
          credit_balance: number
          customer_id: string
          customer_name: string
          customer_phone: string
          last_usage_at: string
          paid_amount: number
          plan_expires_at: string
          plan_name: string
          plan_starts_at: string
          total_price: number
          usage_count: number
          usage_limit: number
          validity_days: number
        }[]
      }
      get_new_clients_chart: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          day: string
          new_clients: number
        }[]
      }
      get_pending_services: {
        Args: { p_customer_id: string; p_user_id: string }
        Returns: {
          created_at: string
          customer_plan_id: string
          id: string
          service_name: string
        }[]
      }
      get_plan_popularity: {
        Args: { p_user_id: string }
        Returns: {
          client_count: number
          plan_id: string
          plan_name: string
        }[]
      }
      get_plan_services_with_names: {
        Args: { p_plan_ids: string[] }
        Returns: {
          plan_id: string
          quantity: number
          service_id: string
          service_name: string
        }[]
      }
      get_professional_history: {
        Args: { p_professional_id: string; p_user_id: string }
        Returns: {
          amount: number
          customer_name: string
          notes: string
          record_date: string
          record_type: string
          service_name: string
        }[]
      }
      get_professional_stats: {
        Args: { p_days: number; p_user_id: string }
        Returns: {
          commission_percent: number
          completed: number
          name: string
          professional_id: string
          revenue: number
          total_appointments: number
        }[]
      }
      get_report_summary: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          clients: number
          cuts: number
          revenue: number
          tx_count: number
        }[]
      }
      get_sales_chart: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          day: string
          total: number
        }[]
      }
      get_sales_history: {
        Args: { p_user_id: string }
        Returns: {
          amount: number
          created_at: string
          customer_name: string
          id: string
          notes: string
          total: number
        }[]
      }
      get_usage_pending_services: {
        Args: { p_customer_plan_id: string }
        Returns: {
          completed: boolean
          created_at: string
          id: string
          service_id: string
          service_name: string
          usage_record_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      repair_plan_transactions: { Args: { p_user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "atendente" | "desenvolvedor"
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
      app_role: ["admin", "atendente", "desenvolvedor"],
    },
  },
} as const
