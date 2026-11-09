export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_sync_push_outbox: {
        Row: {
          attempted_at: string | null
          body: string
          customer_id: string | null
          delivered_at: string | null
          event_id: number
          id: number
          recipient_user_id: string
          title: string
          url: string
        }
        Insert: {
          attempted_at?: string | null
          body: string
          customer_id?: string | null
          delivered_at?: string | null
          event_id: number
          id?: never
          recipient_user_id: string
          title: string
          url: string
        }
        Update: {
          attempted_at?: string | null
          body?: string
          customer_id?: string | null
          delivered_at?: string | null
          event_id?: number
          id?: never
          recipient_user_id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      app_sync_state: {
        Row: {
          revision: number
          scope: string
          source_table: string
          updated_at: string
          user_id: string
        }
        Insert: {
          revision?: number
          scope: string
          source_table: string
          updated_at?: string
          user_id: string
        }
        Update: {
          revision?: number
          scope?: string
          source_table?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointment_change_history: {
        Row: {
          actor_id: string | null
          actor_name: string
          actor_type: string
          appointment_id: string
          created_at: string
          customer_id: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name: string
          actor_type: string
          appointment_id: string
          created_at?: string
          customer_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          actor_type?: string
          appointment_id?: string
          created_at?: string
          customer_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancelled_by_type: string | null
          changed_at: string | null
          changed_by_name: string | null
          changed_by_type: string | null
          created_at: string | null
          customer_id: string | null
          date: string
          end_time: string
          id: string
          notes: string | null
          professional_id: string | null
          reminder_at: string | null
          reminder_attempted_at: string | null
          reminder_delivery_state: string
          reminder_followup_claimed_at: string | null
          reminder_followup_sent_at: string | null
          reminder_hours: number | null
          reminder_in_app_sent_at: string | null
          reminder_last_error: string | null
          reminder_push_sent_at: string | null
          reminder_scheduled_at: string | null
          reminder_sent: boolean
          reminder_wa_sent_at: string | null
          service_id: string | null
          service_ids: string[] | null
          service_names: string | null
          service_total_price: number | null
          start_time: string
          status: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_type?: string | null
          changed_at?: string | null
          changed_by_name?: string | null
          changed_by_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          date: string
          end_time: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          reminder_at?: string | null
          reminder_attempted_at?: string | null
          reminder_delivery_state?: string
          reminder_followup_claimed_at?: string | null
          reminder_followup_sent_at?: string | null
          reminder_hours?: number | null
          reminder_in_app_sent_at?: string | null
          reminder_last_error?: string | null
          reminder_push_sent_at?: string | null
          reminder_scheduled_at?: string | null
          reminder_sent?: boolean
          reminder_wa_sent_at?: string | null
          service_id?: string | null
          service_ids?: string[] | null
          service_names?: string | null
          service_total_price?: number | null
          start_time: string
          status?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_type?: string | null
          changed_at?: string | null
          changed_by_name?: string | null
          changed_by_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          date?: string
          end_time?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          reminder_at?: string | null
          reminder_attempted_at?: string | null
          reminder_delivery_state?: string
          reminder_followup_claimed_at?: string | null
          reminder_followup_sent_at?: string | null
          reminder_hours?: number | null
          reminder_in_app_sent_at?: string | null
          reminder_last_error?: string | null
          reminder_push_sent_at?: string | null
          reminder_scheduled_at?: string | null
          reminder_sent?: boolean
          reminder_wa_sent_at?: string | null
          service_id?: string | null
          service_ids?: string[] | null
          service_names?: string | null
          service_total_price?: number | null
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
      cash_movements: {
        Row: {
          amount: number
          cash_register_id: string
          category: string
          created_at: string | null
          description: string | null
          financial_entry_id: string | null
          id: string
          payment_method: string | null
          payment_split_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          category: string
          created_at?: string | null
          description?: string | null
          financial_entry_id?: string | null
          id?: string
          payment_method?: string | null
          payment_split_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          category?: string
          created_at?: string | null
          description?: string | null
          financial_entry_id?: string | null
          id?: string
          payment_method?: string | null
          payment_split_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cash_movements_payment_split"
            columns: ["payment_split_id"]
            isOneToOne: false
            referencedRelation: "payment_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_sessions: {
        Row: {
          closed_at: string | null
          closing_balance: number | null
          created_at: string | null
          difference: number | null
          expected_closing_balance: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_balance: number
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string | null
          difference?: number | null
          expected_closing_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_balance?: number
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closing_balance?: number | null
          created_at?: string | null
          difference?: number | null
          expected_closing_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_balance?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      client_login_limits: {
        Row: {
          attempts: number
          key: string
          started_at: string
        }
        Insert: {
          attempts?: number
          key: string
          started_at?: string
        }
        Update: {
          attempts?: number
          key?: string
          started_at?: string
        }
        Relationships: []
      }
      client_notifications: {
        Row: {
          body: string
          created_at: string | null
          customer_id: string | null
          id: string
          read: boolean | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          read?: boolean | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          read?: boolean | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_plan_offers: {
        Row: {
          accepted_at: string | null
          activated_at: string | null
          created_at: string
          customer_id: string
          customer_plan_id: string | null
          expires_at: string
          id: string
          period: string
          plan_id: string
          plan_name: string
          price: number
          services: Json
          status: string
          usage_limit: number
          user_id: string
          validity_days: number
        }
        Insert: {
          accepted_at?: string | null
          activated_at?: string | null
          created_at?: string
          customer_id: string
          customer_plan_id?: string | null
          expires_at?: string
          id?: string
          period: string
          plan_id: string
          plan_name: string
          price: number
          services?: Json
          status?: string
          usage_limit: number
          user_id: string
          validity_days: number
        }
        Update: {
          accepted_at?: string | null
          activated_at?: string | null
          created_at?: string
          customer_id?: string
          customer_plan_id?: string | null
          expires_at?: string
          id?: string
          period?: string
          plan_id?: string
          plan_name?: string
          price?: number
          services?: Json
          status?: string
          usage_limit?: number
          user_id?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_plan_offers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_offers_customer_plan_id_fkey"
            columns: ["customer_plan_id"]
            isOneToOne: false
            referencedRelation: "customer_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_plan_offers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pwa_sessions: {
        Row: {
          customer_id: string
          expires_at: string
          last_seen_at: string
          revoked: boolean
          token: string
          visible: boolean
        }
        Insert: {
          customer_id: string
          expires_at?: string
          last_seen_at?: string
          revoked?: boolean
          token?: string
          visible?: boolean
        }
        Update: {
          customer_id?: string
          expires_at?: string
          last_seen_at?: string
          revoked?: boolean
          token?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_pwa_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          bot_enabled_when_global_off: boolean
          appointment_id: string | null
          assigned_staff_id: string | null
          bot_msg_count: number | null
          bot_paused: boolean | null
          created_at: string | null
          current_stage: number | null
          customer_id: string | null
          id: string
          last_interaction_at: string | null
          manual_finished_at: string | null
          manual_started_at: string | null
          name: string
          notes: string | null
          phone: string | null
          presence_state: string | null
          presence_updated_at: string | null
          reminder_sent: boolean | null
          stage: string
          user_id: string
          wa_chatid: string | null
        }
        Insert: {
          bot_enabled_when_global_off?: boolean
          appointment_id?: string | null
          assigned_staff_id?: string | null
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          manual_finished_at?: string | null
          manual_started_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          presence_state?: string | null
          presence_updated_at?: string | null
          reminder_sent?: boolean | null
          stage?: string
          user_id: string
          wa_chatid?: string | null
        }
        Update: {
          bot_enabled_when_global_off?: boolean
          appointment_id?: string | null
          assigned_staff_id?: string | null
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          manual_finished_at?: string | null
          manual_started_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          presence_state?: string | null
          presence_updated_at?: string | null
          reminder_sent?: boolean | null
          stage?: string
          user_id?: string
          wa_chatid?: string | null
        }
        Relationships: []
      }
      crm_leads_duplicate_archive: {
        Row: {
          appointment_id: string | null
          archived_at: string
          bot_msg_count: number | null
          bot_paused: boolean | null
          created_at: string | null
          current_stage: number | null
          customer_id: string | null
          id: string
          last_interaction_at: string | null
          merged_into: string | null
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
          archived_at?: string
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          merged_into?: string | null
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
          archived_at?: string
          bot_msg_count?: number | null
          bot_paused?: boolean | null
          created_at?: string | null
          current_stage?: number | null
          customer_id?: string | null
          id?: string
          last_interaction_at?: string | null
          merged_into?: string | null
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
          reminder_hours: number | null
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          credit_balance?: number | null
          id?: string
          name: string
          phone?: string | null
          reminder_hours?: number | null
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          credit_balance?: number | null
          id?: string
          name?: string
          phone?: string | null
          reminder_hours?: number | null
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
      financial_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string
          created_at: string | null
          credit_transaction_id: string | null
          date: string
          description: string | null
          id: string
          payment_method: string
          product_sale_id: string | null
          professional_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category: string
          created_at?: string | null
          credit_transaction_id?: string | null
          date?: string
          description?: string | null
          id?: string
          payment_method: string
          product_sale_id?: string | null
          professional_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string
          created_at?: string | null
          credit_transaction_id?: string | null
          date?: string
          description?: string | null
          id?: string
          payment_method?: string
          product_sale_id?: string | null
          professional_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_credit_transaction_id_fkey"
            columns: ["credit_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_product_sale_id_fkey"
            columns: ["product_sale_id"]
            isOneToOne: false
            referencedRelation: "product_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_booking_sessions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_booking_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      payment_splits: {
        Row: {
          amount: number
          cash_change: number | null
          cash_received: number | null
          created_at: string | null
          financial_entry_id: string
          id: string
          payment_method: string
        }
        Insert: {
          amount: number
          cash_change?: number | null
          cash_received?: number | null
          created_at?: string | null
          financial_entry_id: string
          id?: string
          payment_method: string
        }
        Update: {
          amount?: number
          cash_change?: number | null
          cash_received?: number | null
          created_at?: string | null
          financial_entry_id?: string
          id?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_splits_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_notifications: {
        Row: {
          customer_plan_id: string
          id: string
          sent_at: string
          sent_date: string
          type: string
        }
        Insert: {
          customer_plan_id: string
          id?: string
          sent_at?: string
          sent_date?: string
          type: string
        }
        Update: {
          customer_plan_id?: string
          id?: string
          sent_at?: string
          sent_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_notifications_customer_plan_id_fkey"
            columns: ["customer_plan_id"]
            isOneToOne: false
            referencedRelation: "customer_plans"
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
          appointment_id: string | null
          created_at: string | null
          customer_plan_id: string | null
          id: string
          professional_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          customer_plan_id?: string | null
          id?: string
          professional_id?: string | null
        }
        Update: {
          appointment_id?: string | null
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
            foreignKeyName: "plan_usage_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
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
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_billing_contracts: {
        Row: {
          access_tier: string
          amount_cents: number
          auto_block: boolean
          billing_mode: string
          down_payment_cents: number
          down_payment_due_date: string | null
          due_day: number | null
          enabled: boolean
          grace_days: number
          monthly_amount_cents: number
          monthly_start_date: string | null
          next_due_date: string | null
          plan_name: string
          reminder_channel: string
          reminder_days: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_tier?: string
          amount_cents?: number
          auto_block?: boolean
          billing_mode?: string
          down_payment_cents?: number
          down_payment_due_date?: string | null
          due_day?: number | null
          enabled?: boolean
          grace_days?: number
          monthly_amount_cents?: number
          monthly_start_date?: string | null
          next_due_date?: string | null
          plan_name?: string
          reminder_channel?: string
          reminder_days?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_tier?: string
          amount_cents?: number
          auto_block?: boolean
          billing_mode?: string
          down_payment_cents?: number
          down_payment_due_date?: string | null
          due_day?: number | null
          enabled?: boolean
          grace_days?: number
          monthly_amount_cents?: number
          monthly_start_date?: string | null
          next_due_date?: string | null
          plan_name?: string
          reminder_channel?: string
          reminder_days?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_deliveries: {
        Row: {
          attempts: number
          channel: string
          invoice_id: string
          last_error: string | null
          notice_date: string
          provider_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          invoice_id: string
          last_error?: string | null
          notice_date: string
          provider_id?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          invoice_id?: string
          last_error?: string | null
          notice_date?: string
          provider_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_deliveries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          invoice_id: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          invoice_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          invoice_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_identities: {
        Row: {
          city: string
          complement: string
          district: string
          email: string
          legal_name: string
          number: string
          person_type: string
          phone: string
          state: string
          street: string
          tax_id: string
          tenant_id: string
          trade_name: string
          updated_at: string
          updated_by: string | null
          zip: string
        }
        Insert: {
          city?: string
          complement?: string
          district?: string
          email?: string
          legal_name: string
          number?: string
          person_type: string
          phone?: string
          state?: string
          street?: string
          tax_id: string
          tenant_id: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          zip?: string
        }
        Update: {
          city?: string
          complement?: string
          district?: string
          email?: string
          legal_name?: string
          number?: string
          person_type?: string
          phone?: string
          state?: string
          street?: string
          tax_id?: string
          tenant_id?: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_notices: {
        Row: {
          invoice_id: string
          notice_date: string
          state: string
        }
        Insert: {
          invoice_id: string
          notice_date?: string
          state?: string
        }
        Update: {
          invoice_id?: string
          notice_date?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_notices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_checkout_attempts: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string
          method: string
          provider_id: string | null
          state: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          invoice_id: string
          method: string
          provider_id?: string | null
          state?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invoice_id?: string
          method?: string
          provider_id?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_checkout_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_clients: {
        Row: {
          city: string
          complement: string
          created_at: string
          district: string
          email: string
          id: string
          legal_name: string
          number: string
          person_type: string | null
          phone: string
          state: string
          street: string
          tax_id: string | null
          trade_name: string
          updated_at: string
          updated_by: string | null
          zip: string
        }
        Insert: {
          city?: string
          complement?: string
          created_at?: string
          district?: string
          email?: string
          id?: string
          legal_name: string
          number?: string
          person_type?: string | null
          phone?: string
          state?: string
          street?: string
          tax_id?: string | null
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          zip?: string
        }
        Update: {
          city?: string
          complement?: string
          created_at?: string
          district?: string
          email?: string
          id?: string
          legal_name?: string
          number?: string
          person_type?: string | null
          phone?: string
          state?: string
          street?: string
          tax_id?: string | null
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          zip?: string
        }
        Relationships: []
      }
      platform_connectors: {
        Row: {
          created_at: string
          enabled: boolean
          last_synced_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          last_synced_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          last_synced_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connectors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          amount_cents: number
          billing_kind: string
          checkout_url: string | null
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          installment_amount_cents: number
          installment_count: number | null
          installment_number: number | null
          is_down_payment: boolean
          manual_paid_by: string | null
          manual_payment_note: string | null
          monthly_amount_cents: number
          monthly_cycle: string | null
          net_amount_cents: number | null
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          payment_token: string
          plan_name: string
          preference_id: string | null
          provider_updated_at: string | null
          replaced_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          billing_kind?: string
          checkout_url?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id?: string
          installment_amount_cents?: number
          installment_count?: number | null
          installment_number?: number | null
          is_down_payment?: boolean
          manual_paid_by?: string | null
          manual_payment_note?: string | null
          monthly_amount_cents?: number
          monthly_cycle?: string | null
          net_amount_cents?: number | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_token?: string
          plan_name: string
          preference_id?: string | null
          provider_updated_at?: string | null
          replaced_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          billing_kind?: string
          checkout_url?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          installment_amount_cents?: number
          installment_count?: number | null
          installment_number?: number | null
          is_down_payment?: boolean
          manual_paid_by?: string | null
          manual_payment_note?: string | null
          monthly_amount_cents?: number
          monthly_cycle?: string | null
          net_amount_cents?: number | null
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_token?: string
          plan_name?: string
          preference_id?: string | null
          provider_updated_at?: string | null
          replaced_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_receipts: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          number: string
          snapshot: Json
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          number?: string
          snapshot: Json
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          number?: string
          snapshot?: Json
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_receipt_deliveries: {
        Row: {
          last_error: string | null
          provider_id: string | null
          receipt_id: string
          sent_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          provider_id?: string | null
          receipt_id: string
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          provider_id?: string | null
          receipt_id?: string
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_receipt_deliveries_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "platform_payment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_subscription_payments: {
        Row: {
          authorized_id: string
          created_at: string
          invoice_id: string
          payment_id: string
          subscription_id: string
        }
        Insert: {
          authorized_id: string
          created_at?: string
          invoice_id: string
          payment_id: string
          subscription_id: string
        }
        Update: {
          authorized_id?: string
          created_at?: string
          invoice_id?: string
          payment_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscription_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_subscriptions: {
        Row: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          due_day: number
          id: string
          payer_email: string
          plan_name: string
          provider_id: string | null
          provider_updated_at: string | null
          source_invoice: string
          start_date: string
          state: string
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          checkout_url?: string | null
          created_at?: string
          due_day: number
          id?: string
          payer_email: string
          plan_name: string
          provider_id?: string | null
          provider_updated_at?: string | null
          source_invoice: string
          start_date: string
          state?: string
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          checkout_url?: string | null
          created_at?: string
          due_day?: number
          id?: string
          payer_email?: string
          plan_name?: string
          provider_id?: string | null
          provider_updated_at?: string | null
          source_invoice?: string
          start_date?: string
          state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_source_invoice_fkey"
            columns: ["source_invoice"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_whatsapp: {
        Row: {
          enabled: boolean
          instance_name: string
          instance_token: string
          singleton: boolean
        }
        Insert: {
          enabled?: boolean
          instance_name: string
          instance_token: string
          singleton?: boolean
        }
        Update: {
          enabled?: boolean
          instance_name?: string
          instance_token?: string
          singleton?: boolean
        }
        Relationships: []
      }
      product_sales: {
        Row: {
          commission_amount: number
          created_at: string
          customer_id: string | null
          id: string
          payment_method: string | null
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
          payment_method?: string | null
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
          payment_method?: string | null
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
          shift_key: string | null
          start_time: string
        }
        Insert: {
          active?: boolean | null
          day_of_week: number
          end_time?: string
          id?: string
          professional_id?: string | null
          shift_key?: string | null
          start_time?: string
        }
        Update: {
          active?: boolean | null
          day_of_week?: number
          end_time?: string
          id?: string
          professional_id?: string | null
          shift_key?: string | null
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
          phone: string
          professional_id: string | null
          role: string
          sessions_revoked_at: string | null
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
          phone?: string
          professional_id?: string | null
          role?: string
          sessions_revoked_at?: string | null
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
          phone?: string
          professional_id?: string | null
          role?: string
          sessions_revoked_at?: string | null
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
      push_subscriptions: {
        Row: {
          app_origin: string | null
          auth_key: string
          created_at: string | null
          customer_id: string | null
          device_id: string | null
          endpoint: string
          id: string
          last_seen_at: string | null
          p256dh_key: string
          user_id: string
        }
        Insert: {
          app_origin?: string | null
          auth_key: string
          created_at?: string | null
          customer_id?: string | null
          device_id?: string | null
          endpoint: string
          id?: string
          last_seen_at?: string | null
          p256dh_key: string
          user_id: string
        }
        Update: {
          app_origin?: string | null
          auth_key?: string
          created_at?: string | null
          customer_id?: string | null
          device_id?: string | null
          endpoint?: string
          id?: string
          last_seen_at?: string | null
          p256dh_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      secretary_groq_pacing: {
        Row: {
          id: boolean
          next_at: string
        }
        Insert: {
          id?: boolean
          next_at: string
        }
        Update: {
          id?: boolean
          next_at?: string
        }
        Relationships: []
      }
      secretary_memory: {
        Row: {
          awaiting_reminder: boolean
          chat: string
          customer_birth_date: string | null
          customer_name: string | null
          introduction_at: string | null
          introduction_identity: string | null
          offered_at: string | null
          offered_date: string | null
          offered_slots: Json | null
          pending: Json | null
          pending_at: string | null
          phone: string
          preferred_professional: string | null
          preferred_service: string | null
          registration_stage: string | null
          reminder_appointment_id: string | null
          requested_date: string | null
          requested_period: string | null
          requested_services: string[] | null
          slot_selection: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          awaiting_reminder?: boolean
          chat: string
          customer_birth_date?: string | null
          customer_name?: string | null
          introduction_at?: string | null
          introduction_identity?: string | null
          offered_at?: string | null
          offered_date?: string | null
          offered_slots?: Json | null
          pending?: Json | null
          pending_at?: string | null
          phone: string
          preferred_professional?: string | null
          preferred_service?: string | null
          registration_stage?: string | null
          reminder_appointment_id?: string | null
          requested_date?: string | null
          requested_period?: string | null
          requested_services?: string[] | null
          slot_selection?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          awaiting_reminder?: boolean
          chat?: string
          customer_birth_date?: string | null
          customer_name?: string | null
          introduction_at?: string | null
          introduction_identity?: string | null
          offered_at?: string | null
          offered_date?: string | null
          offered_slots?: Json | null
          pending?: Json | null
          pending_at?: string | null
          phone?: string
          preferred_professional?: string | null
          preferred_service?: string | null
          registration_stage?: string | null
          reminder_appointment_id?: string | null
          requested_date?: string | null
          requested_period?: string | null
          requested_services?: string[] | null
          slot_selection?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      secretary_queue: {
        Row: {
          attempts: number
          available_at: string
          chat: string
          created_at: string
          delivery_started: boolean
          finished_at: string | null
          id: string
          last_error: string | null
          lease_token: string | null
          locked_until: string | null
          message_id: string
          payload: Json | null
          position: number
          state: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          chat: string
          created_at?: string
          delivery_started?: boolean
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lease_token?: string | null
          locked_until?: string | null
          message_id: string
          payload?: Json | null
          position?: never
          state?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          chat?: string
          created_at?: string
          delivery_started?: boolean
          finished_at?: string | null
          id?: string
          last_error?: string | null
          lease_token?: string | null
          locked_until?: string | null
          message_id?: string
          payload?: Json | null
          position?: never
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          name: string
          price: number | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          price?: number | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          duration_minutes?: number | null
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
          bot_mode: string
          bot_msg_limit: number | null
          bot_prompt: string | null
          bot_trigger_words: string[] | null
          clinic_address: string | null
          clinic_lat: string | null
          clinic_lng: string | null
          credit_price: number | null
          id: string
          min_purchase: number | null
          reminder_hours: number
          secretary_name: string
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
          bot_mode?: string
          bot_msg_limit?: number | null
          bot_prompt?: string | null
          bot_trigger_words?: string[] | null
          clinic_address?: string | null
          clinic_lat?: string | null
          clinic_lng?: string | null
          credit_price?: number | null
          id?: string
          min_purchase?: number | null
          reminder_hours?: number
          secretary_name?: string
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
          bot_mode?: string
          bot_msg_limit?: number | null
          bot_prompt?: string | null
          bot_trigger_words?: string[] | null
          clinic_address?: string | null
          clinic_lat?: string | null
          clinic_lng?: string | null
          credit_price?: number | null
          id?: string
          min_purchase?: number | null
          reminder_hours?: number
          secretary_name?: string
          shop_name?: string | null
          updated_at?: string | null
          user_id?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      shop_checkout_attempts: {
        Row: {
          created_at: string
          id: string
          method: string
          order_id: string
          provider_id: string | null
          request_id: string
          state: string
        }
        Insert: {
          created_at?: string
          id?: string
          method: string
          order_id: string
          provider_id?: string | null
          request_id: string
          state?: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          provider_id?: string | null
          request_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_checkout_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_plan_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_mp_connections: {
        Row: {
          account_label: string
          collector_id: string
          created_at: string
          enabled: boolean
          id: string
          live_mode: boolean
          public_key: string | null
          recurring_enabled: boolean
          tenant_id: string
          token_cipher: string
          updated_at: string
          user_id: string
          webhook_cipher: string
        }
        Insert: {
          account_label: string
          collector_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          live_mode?: boolean
          public_key?: string | null
          recurring_enabled?: boolean
          tenant_id: string
          token_cipher: string
          updated_at?: string
          user_id: string
          webhook_cipher: string
        }
        Update: {
          account_label?: string
          collector_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          live_mode?: boolean
          public_key?: string | null
          recurring_enabled?: boolean
          tenant_id?: string
          token_cipher?: string
          updated_at?: string
          user_id?: string
          webhook_cipher?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_mp_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_plan_orders: {
        Row: {
          amount_cents: number
          checkout_lock_until: string | null
          checkout_url: string | null
          connection_id: string
          created_at: string
          customer_id: string
          id: string
          last_checked_at: string | null
          offer_id: string
          paid_at: string | null
          preapproval_id: string | null
          preference_id: string | null
          recurring: boolean
          snapshot: Json
          status: string
          subscription_status: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          checkout_lock_until?: string | null
          checkout_url?: string | null
          connection_id: string
          created_at?: string
          customer_id: string
          id?: string
          last_checked_at?: string | null
          offer_id: string
          paid_at?: string | null
          preapproval_id?: string | null
          preference_id?: string | null
          recurring?: boolean
          snapshot: Json
          status?: string
          subscription_status?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          checkout_lock_until?: string | null
          checkout_url?: string | null
          connection_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          last_checked_at?: string | null
          offer_id?: string
          paid_at?: string | null
          preapproval_id?: string | null
          preference_id?: string | null
          recurring?: boolean
          snapshot?: Json
          status?: string
          subscription_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_plan_orders_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "shop_mp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_plan_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_plan_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "client_plan_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_plan_payments: {
        Row: {
          amount_cents: number
          connection_id: string
          created_at: string
          customer_plan_id: string | null
          id: string
          method: string | null
          order_id: string
          payment_id: string
          provider_updated: string
          reversed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          connection_id: string
          created_at?: string
          customer_plan_id?: string | null
          id?: string
          method?: string | null
          order_id: string
          payment_id: string
          provider_updated: string
          reversed_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          connection_id?: string
          created_at?: string
          customer_plan_id?: string | null
          id?: string
          method?: string | null
          order_id?: string
          payment_id?: string
          provider_updated?: string
          reversed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_plan_payments_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "shop_mp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_plan_payments_customer_plan_id_fkey"
            columns: ["customer_plan_id"]
            isOneToOne: false
            referencedRelation: "customer_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_plan_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_plan_orders"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_admin_controls: {
        Row: {
          access_reason: string
          internal_notes: string
          license_expires_on: string | null
          plan_tier: string | null
          temporary_access_until: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_reason?: string
          internal_notes?: string
          license_expires_on?: string | null
          plan_tier?: string | null
          temporary_access_until?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_reason?: string
          internal_notes?: string
          license_expires_on?: string | null
          plan_tier?: string | null
          temporary_access_until?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_admin_controls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_admin_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: number
          subject_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_admin_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_deletion_jobs: {
        Row: {
          created_at: string
          delete_contract: boolean
          id: string
          last_error: string | null
          owner_id: string
          phase: string
          slug: string
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delete_contract: boolean
          id?: string
          last_error?: string | null
          owner_id: string
          phase?: string
          slug: string
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delete_contract?: boolean
          id?: string
          last_error?: string | null
          owner_id?: string
          phase?: string
          slug?: string
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_deletion_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_provision_jobs: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          state: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          state?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_provision_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          category: string
          client_id: string | null
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          deployment_type: string
          external_url: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string
          operational_deleted_at: string | null
          owner_id: string | null
          primary_color: string
          service_category: string | null
          slug: string
          status: string
        }
        Insert: {
          category?: string
          client_id?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          deployment_type?: string
          external_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string
          operational_deleted_at?: string | null
          owner_id?: string | null
          primary_color?: string
          service_category?: string | null
          slug: string
          status?: string
        }
        Update: {
          category?: string
          client_id?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          deployment_type?: string
          external_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string
          operational_deleted_at?: string | null
          owner_id?: string | null
          primary_color?: string
          service_category?: string | null
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "platform_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string | null
          id: string
          notes: string | null
          payment_method: string | null
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
          payment_method?: string | null
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
          payment_method?: string | null
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
      whatsapp_chat_events: {
        Row: {
          nonce: string | null
          updated_at: string | null
          user_id: string
          wa_chatid: string
        }
        Insert: {
          nonce?: string | null
          updated_at?: string | null
          user_id: string
          wa_chatid: string
        }
        Update: {
          nonce?: string | null
          updated_at?: string | null
          user_id?: string
          wa_chatid?: string
        }
        Relationships: []
      }
      whatsapp_chat_preferences: {
        Row: {
          archived: boolean | null
          draft: string | null
          labels: string[] | null
          last_read_at: string | null
          muted: boolean | null
          pinned: boolean | null
          staff_id: string
          unread_override: boolean | null
          user_id: string
          wa_chatid: string
        }
        Insert: {
          archived?: boolean | null
          draft?: string | null
          labels?: string[] | null
          last_read_at?: string | null
          muted?: boolean | null
          pinned?: boolean | null
          staff_id: string
          unread_override?: boolean | null
          user_id: string
          wa_chatid: string
        }
        Update: {
          archived?: boolean | null
          draft?: string | null
          labels?: string[] | null
          last_read_at?: string | null
          muted?: boolean | null
          pinned?: boolean | null
          staff_id?: string
          unread_override?: boolean | null
          user_id?: string
          wa_chatid?: string
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          api_url: string
          created_at: string | null
          id: string
          instance_token: string
          secretary_queue_enabled: boolean
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          api_url?: string
          created_at?: string | null
          id?: string
          instance_token: string
          secretary_queue_enabled?: boolean
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          api_url?: string
          created_at?: string | null
          id?: string
          instance_token?: string
          secretary_queue_enabled?: boolean
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      whatsapp_contact_cache: {
        Row: {
          contacts_checked_at: string | null
          display_name: string | null
          photo_checked_at: string | null
          photo_url: string | null
          user_id: string
          wa_chatid: string
        }
        Insert: {
          contacts_checked_at?: string | null
          display_name?: string | null
          photo_checked_at?: string | null
          photo_url?: string | null
          user_id: string
          wa_chatid: string
        }
        Update: {
          contacts_checked_at?: string | null
          display_name?: string | null
          photo_checked_at?: string | null
          photo_url?: string | null
          user_id?: string
          wa_chatid?: string
        }
        Relationships: []
      }
      whatsapp_internal_notes: {
        Row: {
          created_at: string | null
          id: string
          staff_id: string
          text: string
          user_id: string
          wa_chatid: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          staff_id: string
          text: string
          user_id: string
          wa_chatid: string
        }
        Update: {
          created_at?: string | null
          id?: string
          staff_id?: string
          text?: string
          user_id?: string
          wa_chatid?: string
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
      whatsapp_lid_phone_map: {
        Row: {
          lid: string
          phone: string
        }
        Insert: {
          lid: string
          phone: string
        }
        Update: {
          lid?: string
          phone?: string
        }
        Relationships: []
      }
      whatsapp_message_preferences: {
        Row: {
          hidden: boolean | null
          message_id: string
          staff_id: string
          starred: boolean | null
          user_id: string
        }
        Insert: {
          hidden?: boolean | null
          message_id: string
          staff_id: string
          starred?: boolean | null
          user_id: string
        }
        Update: {
          hidden?: boolean | null
          message_id?: string
          staff_id?: string
          starred?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_preferences_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          delivery_status: string | null
          edited_at: string | null
          from_me: boolean | null
          id: string
          media_filename: string | null
          media_mimetype: string | null
          media_path: string | null
          media_payload: Json | null
          media_type: string | null
          media_url: string | null
          msg_type: string | null
          push_name: string | null
          quoted_message_id: string | null
          quoted_text: string | null
          reactions: Json | null
          sender_staff_id: string | null
          text: string | null
          user_id: string
          wa_chatid: string
          wa_message_id: string | null
          wa_timestamp: number
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_status?: string | null
          edited_at?: string | null
          from_me?: boolean | null
          id?: string
          media_filename?: string | null
          media_mimetype?: string | null
          media_path?: string | null
          media_payload?: Json | null
          media_type?: string | null
          media_url?: string | null
          msg_type?: string | null
          push_name?: string | null
          quoted_message_id?: string | null
          quoted_text?: string | null
          reactions?: Json | null
          sender_staff_id?: string | null
          text?: string | null
          user_id: string
          wa_chatid: string
          wa_message_id?: string | null
          wa_timestamp: number
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          delivery_status?: string | null
          edited_at?: string | null
          from_me?: boolean | null
          id?: string
          media_filename?: string | null
          media_mimetype?: string | null
          media_path?: string | null
          media_payload?: Json | null
          media_type?: string | null
          media_url?: string | null
          msg_type?: string | null
          push_name?: string | null
          quoted_message_id?: string | null
          quoted_text?: string | null
          reactions?: Json | null
          sender_staff_id?: string | null
          text?: string | null
          user_id?: string
          wa_chatid?: string
          wa_message_id?: string | null
          wa_timestamp?: number
        }
        Relationships: []
      }
      whatsapp_send_requests: {
        Row: {
          created_at: string | null
          provider_id: string | null
          request_id: string
          staff_id: string
          state: string
          user_id: string
          wa_chatid: string
        }
        Insert: {
          created_at?: string | null
          provider_id?: string | null
          request_id: string
          staff_id: string
          state?: string
          user_id: string
          wa_chatid: string
        }
        Update: {
          created_at?: string | null
          provider_id?: string | null
          request_id?: string
          staff_id?: string
          state?: string
          user_id?: string
          wa_chatid?: string
        }
        Relationships: []
      }
      whatsapp_shop_tools: {
        Row: {
          away_enabled: boolean | null
          away_message: string | null
          greeting: string | null
          greeting_enabled: boolean | null
          labels: Json | null
          quick_replies: Json | null
          user_id: string
        }
        Insert: {
          away_enabled?: boolean | null
          away_message?: string | null
          greeting?: string | null
          greeting_enabled?: boolean | null
          labels?: Json | null
          quick_replies?: Json | null
          user_id: string
        }
        Update: {
          away_enabled?: boolean | null
          away_message?: string | null
          greeting?: string | null
          greeting_enabled?: boolean | null
          labels?: Json | null
          quick_replies?: Json | null
          user_id?: string
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
      account_enabled: { Args: never; Returns: boolean }
      admin_assert_tenant: {
        Args: { p_actor: string | null; p_tenant: string }
        Returns: string
      }
      admin_assert_tenant_user: {
        Args: { p_owner: string; p_user: string }
        Returns: undefined
      }
      admin_confirm_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_link_tenant_user: {
        Args: {
          p_actor: string | null
          p_email: string
          p_name: string
          p_phone: string
          p_professional: string
          p_tenant: string
          p_user: string
        }
        Returns: string
      }
      admin_revoke_staff_sessions: {
        Args: {
          p_actor: string | null
          p_force_password?: boolean
          p_tenant: string
          p_user: string
        }
        Returns: undefined
      }
      admin_save_tenant_access: {
        Args: {
          p_actor: string | null
          p_expires: string | null
          p_reason: string
          p_temporary: string | null
          p_tenant: string
          p_tier: string
        }
        Returns: undefined
      }
      admin_save_tenant_shop: {
        Args: {
          p_actor: string | null
          p_address: string
          p_color: string
          p_logo: string
          p_name: string
          p_notes: string
          p_tenant: string
        }
        Returns: undefined
      }
      admin_save_tenant_user: {
        Args: {
          p_active: boolean
          p_actor: string | null
          p_email: string
          p_name: string
          p_phone: string
          p_require_password: boolean
          p_revoke?: boolean
          p_tenant: string
          p_user: string
        }
        Returns: undefined
      }
      admin_staff_session_valid: {
        Args: { p_session: string; p_user: string }
        Returns: boolean
      }
      admin_tenant_users: {
        Args: { p_actor: string | null; p_tenant: string }
        Returns: Json
      }
      app_sync_revision: {
        Args: {
          p_customer?: string
          p_owner?: string
          p_professional?: string
          p_session?: string
        }
        Returns: Json
      }
      assert_client: { Args: { p_customer: string }; Returns: undefined }
      assert_shop: { Args: { p_owner: string }; Returns: undefined }
      billing_access_allowed: { Args: { p_owner: string }; Returns: boolean }
      billing_access_allowed_financial_base: {
        Args: { p_owner: string }
        Returns: boolean
      }
      billing_apply_payment: {
        Args: {
          p_amount: number
          p_currency: string
          p_invoice: string
          p_method: string
          p_net: number | null
          p_payment: string
          p_status: string
          p_updated: string
        }
        Returns: Json
      }
      billing_apply_subscription_payment: {
        Args: {
          p_amount: number
          p_authorized: string
          p_currency: string
          p_due: string
          p_method: string
          p_net: number | null
          p_payment: string
          p_status: string
          p_subscription: string
          p_updated: string
        }
        Returns: Json
      }
      billing_claim_checkout: {
        Args: { p_invoice: string; p_method: string; p_request: string }
        Returns: Json
      }
      billing_claim_checkout_checked: {
        Args: {
          p_amount: number
          p_invoice: string
          p_method: string
          p_request: string
        }
        Returns: Json
      }
      billing_claim_delivery: {
        Args: { p_channel: string; p_date: string; p_invoice: string }
        Returns: boolean
      }
      billing_claim_manual_delivery: {
        Args: { p_channel: string; p_date: string; p_invoice: string }
        Returns: boolean
      }
      billing_claim_receipt: { Args: { p_receipt: string }; Returns: boolean }
      billing_claim_subscription: {
        Args: { p_email: string; p_invoice: string }
        Returns: Json
      }
      billing_delete_cancelled_invoice: {
        Args: { p_actor: string | null; p_invoice: string }
        Returns: undefined
      }
      billing_ensure_receipt: { Args: { p_invoice: string }; Returns: string }
      billing_mark_paid_manual: {
        Args: {
          p_actor: string | null
          p_date: string
          p_invoice: string
          p_method: string
          p_note: string
        }
        Returns: Json
      }
      billing_projection_rows: {
        Args: { p_category?: string; p_from: string; p_to: string }
        Returns: {
          due_date: string
          monthly_cents: number
          sale_cents: number
          unissued_cents: number
        }[]
      }
      billing_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      billing_report_category: {
        Args: { p_category: string; p_from: string; p_to: string }
        Returns: Json
      }
      billing_report_category_before_mixed: {
        Args: { p_category: string; p_from: string; p_to: string }
        Returns: Json
      }
      billing_save_contact_contract: {
        Args: {
          p_actor: string | null
          p_amount: number
          p_auto: boolean
          p_channel: string
          p_day: number
          p_due: string
          p_enabled: boolean
          p_grace: number
          p_name: string
          p_phone: string
          p_plan: string
          p_reminder: number
          p_tenant: string
          p_tier: string
        }
        Returns: undefined
      }
      billing_save_contract: {
        Args: {
          p_actor: string | null
          p_amount: number
          p_auto: boolean
          p_day: number
          p_due: string
          p_enabled: boolean
          p_grace: number
          p_plan: string
          p_reminder: number
          p_tenant: string
          p_tier: string
        }
        Returns: undefined
      }
      billing_save_replacement: {
        Args: {
          p_actor: string | null
          p_contract: Json
          p_mode: string
          p_parts: Json
          p_replace: boolean
        }
        Returns: undefined
      }
      billing_save_replacement_before_clients: {
        Args: {
          p_actor: string | null
          p_contract: Json
          p_mode: string
          p_parts: Json
          p_replace: boolean
        }
        Returns: undefined
      }
      billing_save_sale: {
        Args: { p_actor: string | null; p_contract: Json; p_parts: Json }
        Returns: undefined
      }
      billing_tick: { Args: never; Returns: number }
      can_read_whatsapp_chat_signals: {
        Args: { shop_user_id: string }
        Returns: boolean
      }
      check_no_shows: { Args: never; Returns: undefined }
      claim_appointment_followups: { Args: never; Returns: Json }
      claim_appointment_reminder: {
        Args: { p_appointment: string }
        Returns: string
      }
      claim_secretary_message: { Args: never; Returns: Json }
      client_cancel_appointment: {
        Args: { p_appointment_id: string; p_session_token: string }
        Returns: boolean
      }
      client_confirm_appointment: {
        Args: { p_appointment_id: string }
        Returns: boolean
      }
      client_confirm_appointment_secure: {
        Args: { p_appointment_id: string; p_session_token: string }
        Returns: boolean
      }
      client_delete_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      client_mark_all_read: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      client_mark_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      client_notifications_list: {
        Args: { p_customer_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          read: boolean
          title: string
          url: string
        }[]
      }
      client_plan_offer_answer: {
        Args: { p_accept: boolean; p_offer: string }
        Returns: Json
      }
      client_plan_offers_list: {
        Args: { p_customer: string; p_staff?: boolean }
        Returns: Json
      }
      client_plan_services: {
        Args: { p_plan_id: string }
        Returns: {
          service_id: string
        }[]
      }
      client_portal_appointments: {
        Args: { p_customer_id: string }
        Returns: {
          cancelled_at: string
          cancelled_by_name: string
          cancelled_by_type: string
          changed_at: string
          changed_by_name: string
          changed_by_type: string
          date: string
          end_time: string
          id: string
          notes: string
          professional_name: string
          reminder_hours: number
          reminder_sent: boolean
          service_name: string
          start_time: string
          status: string
        }[]
      }
      client_portal_appointments_sync_base: {
        Args: { p_customer_id: string }
        Returns: {
          date: string
          end_time: string
          id: string
          notes: string
          professional_name: string
          reminder_hours: number
          reminder_sent: boolean
          service_name: string
          start_time: string
          status: string
        }[]
      }
      client_portal_cancel_appointment: {
        Args: { p_appointment_id: string }
        Returns: boolean
      }
      client_portal_history: {
        Args: { p_customer_id: string }
        Returns: {
          amount: number
          description: string
          record_date: string
          record_type: string
        }[]
      }
      client_portal_login: {
        Args: { p_birth_date: string; p_phone: string }
        Returns: {
          credit_balance: number
          customer_id: string
          customer_plan_id: string
          name: string
          phone: string
          plan_expires_at: string
          plan_id: string
          plan_name: string
          plan_usage_count: number
          plan_usage_limit: number
          pwa_session_token: string
          shop_name: string
          user_id: string
        }[]
      }
      client_portal_login_untracked: {
        Args: { p_birth_date: string; p_phone: string }
        Returns: {
          credit_balance: number
          customer_id: string
          customer_plan_id: string
          name: string
          phone: string
          plan_expires_at: string
          plan_id: string
          plan_name: string
          plan_usage_count: number
          plan_usage_limit: number
          shop_name: string
          user_id: string
        }[]
      }
      client_portal_refresh: {
        Args: { p_customer_id: string }
        Returns: {
          credit_balance: number
          customer_id: string
          customer_plan_id: string
          name: string
          phone: string
          plan_expires_at: string
          plan_id: string
          plan_name: string
          plan_usage_count: number
          plan_usage_limit: number
          shop_name: string
          user_id: string
        }[]
      }
      client_portal_sync_snapshot: {
        Args: { p_customer_id: string; p_session_token?: string }
        Returns: Json
      }
      client_pwa_heartbeat: {
        Args: { p_logout?: boolean; p_token: string; p_visible?: boolean }
        Returns: boolean
      }
      client_pwa_status: {
        Args: never
        Returns: {
          customer_id: string
          has_pwa: boolean
          last_seen_at: string
          online: boolean
          session_active: boolean
        }[]
      }
      client_unread_count: { Args: { p_customer_id: string }; Returns: number }
      close_cash_register: {
        Args: {
          p_actual_balance: number
          p_notes?: string
          p_session_id: string
        }
        Returns: undefined
      }
      confirm_whatsapp_send: {
        Args: {
          p_chat: string
          p_fields: Json
          p_owner: string
          p_provider_id: string
          p_request: string
          p_staff: string
          p_timestamp: number
        }
        Returns: Json
      }
      due_appointment_reminders: {
        Args: { p_appointment?: string }
        Returns: Json
      }
      enqueue_secretary_message: {
        Args: {
          p_chat: string
          p_message_id: string
          p_owner: string
          p_payload: Json
        }
        Returns: string
      }
      ensure_whatsapp_lead: {
        Args: { p_chat: string; p_phone: string; p_user_id: string }
        Returns: {
          bot_paused: boolean
          id: string
        }[]
      }
      exec_sql: { Args: { sql_query: string }; Returns: Json }
      external_license_snapshot: { Args: { p_slug: string }; Returns: Json }
      finish_tenant_deletion: { Args: { p_job: string }; Returns: undefined }
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
          cancelled_at: string
          cancelled_by_name: string
          cancelled_by_type: string
          changed_at: string
          changed_by_name: string
          changed_by_type: string
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
      get_appointments_with_details_sync_base: {
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
      get_barber_shop_owner_id: { Args: { p_auth_id: string }; Returns: string }
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
      get_commission_report: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          commission_by_professional: Json
          total_commission: number
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
      get_plan_notification_targets: {
        Args: {
          p_expiry_days_threshold?: number
          p_notif_type: string
          p_user_id: string
        }
        Returns: {
          customer_id: string
          customer_name: string
          customer_phone: string
          customer_plan_id: string
          days_overdue: number
          days_until_expiry: number
          expires_at: string
          plan_name: string
          return_date: string
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
      get_reminder_delivery: { Args: { p_user_id: string }; Returns: Json }
      get_reminders: {
        Args: { p_user_id: string }
        Returns: {
          customer_name: string
          customer_phone: string
          date: string
          id: string
          professional_name: string
          reminder_hours: number
          reminder_sent: boolean
          service_name: string
          start_time: string
          status: string
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
      guest_booking_allowed: {
        Args: { p_customer: string; p_owner: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      limit_client_login: { Args: { p_phone: string }; Returns: undefined }
      my_barbershop_login: { Args: never; Returns: Json }
      normalize_auth_user_tokens: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      open_cash_register: {
        Args: { p_initial_balance?: number }
        Returns: string
      }
      platform_admin: { Args: { p_id?: string }; Returns: boolean }
      platform_provision_tenant: {
        Args: {
          p_color: string
          p_logo: string
          p_name: string
          p_owner: string
          p_slug: string
        }
        Returns: Json
      }
      platform_register_project: {
        Args: { p_amount?: number | null; p_owner?: string; p_project: Json }
        Returns: Json
      }
      platform_register_project_before_clients: {
        Args: { p_amount?: number; p_owner?: string; p_project: Json }
        Returns: Json
      }
      platform_save_client: {
        Args: {
          p_actor: string | null
          p_client: string
          p_profile: Json
          p_tenant?: string
        }
        Returns: string
      }
      professional_schedule_snapshot: {
        Args: { p_professional: string }
        Returns: Json
      }
      public_booking_slots: {
        Args: { p_date: string; p_professional: string; p_services: string[] }
        Returns: Json
      }
      public_busy: {
        Args: { p_date: string; p_professional: string }
        Returns: {
          end_time: string
          start_time: string
        }[]
      }
      public_guest_customer: {
        Args: {
          p_birth_date?: string
          p_name: string
          p_owner: string
          p_phone: string
          p_register?: boolean
        }
        Returns: Json
      }
      public_tenant: { Args: { p_slug: string }; Returns: Json }
      recalculate_expected_balance: {
        Args: { p_session_id: string }
        Returns: number
      }
      repair_plan_transactions: { Args: { p_user_id: string }; Returns: number }
      request_client_id: { Args: never; Returns: string }
      request_tenant_deletion: {
        Args: {
          p_actor: string | null
          p_delete_contract: boolean
          p_name: string
          p_tenant: string
        }
        Returns: Json
      }
      reserve_secretary_groq_call: { Args: never; Returns: number }
      respond_whatsapp_reminder: {
        Args: { p_chat: string; p_confirm: boolean; p_owner: string }
        Returns: Json
      }
      restricted_client_delete_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      restricted_client_mark_all_read: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      restricted_client_mark_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      restricted_client_notifications_list: {
        Args: { p_customer_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          read: boolean
          title: string
          url: string
        }[]
      }
      restricted_client_portal_appointments: {
        Args: { p_customer_id: string }
        Returns: {
          cancelled_at: string
          cancelled_by_name: string
          cancelled_by_type: string
          changed_at: string
          changed_by_name: string
          changed_by_type: string
          date: string
          end_time: string
          id: string
          notes: string
          professional_name: string
          reminder_hours: number
          reminder_sent: boolean
          service_name: string
          start_time: string
          status: string
        }[]
      }
      restricted_client_portal_history: {
        Args: { p_customer_id: string }
        Returns: {
          amount: number
          description: string
          record_date: string
          record_type: string
        }[]
      }
      restricted_client_portal_refresh: {
        Args: { p_customer_id: string }
        Returns: {
          credit_balance: number
          customer_id: string
          customer_plan_id: string
          name: string
          phone: string
          plan_expires_at: string
          plan_id: string
          plan_name: string
          plan_usage_count: number
          plan_usage_limit: number
          shop_name: string
          user_id: string
        }[]
      }
      restricted_client_portal_sync_snapshot: {
        Args: { p_customer_id: string; p_session_token?: string }
        Returns: Json
      }
      restricted_client_unread_count: {
        Args: { p_customer_id: string }
        Returns: number
      }
      restricted_get_appointments_with_details: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          cancelled_at: string
          cancelled_by_name: string
          cancelled_by_type: string
          changed_at: string
          changed_by_name: string
          changed_by_type: string
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
      restricted_get_commission_report: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          commission_by_professional: Json
          total_commission: number
        }[]
      }
      restricted_get_professional_history: {
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
      restricted_get_reminders: {
        Args: { p_user_id: string }
        Returns: {
          customer_name: string
          customer_phone: string
          date: string
          id: string
          professional_name: string
          reminder_hours: number
          reminder_sent: boolean
          service_name: string
          start_time: string
          status: string
        }[]
      }
      save_professional_schedules: {
        Args: {
          p_expected_revision?: number
          p_professional: string
          p_schedules: Json
        }
        Returns: boolean
      }
      save_professional_schedules_sync_base: {
        Args: { p_professional: string; p_schedules: Json }
        Returns: boolean
      }
      secretary_confirm: {
        Args: { p_chat: string; p_owner: string }
        Returns: Json
      }
      secretary_confirm_profile_base: {
        Args: { p_chat: string; p_owner: string }
        Returns: Json
      }
      secretary_customer: {
        Args: { p_owner: string; p_phone: string }
        Returns: string
      }
      secretary_has_work_period: {
        Args: {
          p_date: string
          p_owner: string
          p_period?: string
          p_professional?: string
        }
        Returns: boolean
      }
      secretary_next_slots: {
        Args: {
          p_after: string
          p_owner: string
          p_period?: string
          p_professional?: string
          p_service: string
        }
        Returns: Json
      }
      secretary_next_slots_multi: {
        Args: {
          p_after: string
          p_owner: string
          p_period?: string
          p_professional?: string
          p_services: string[]
        }
        Returns: Json
      }
      secretary_offer_plan: {
        Args: { p_owner: string; p_phone: string; p_plan: string }
        Returns: Json
      }
      secretary_phone_key: { Args: { p_phone: string }; Returns: string }
      secretary_propose: {
        Args: {
          p_chat: string
          p_date: string
          p_owner: string
          p_professional: string
          p_service: string
          p_time: string
        }
        Returns: Json
      }
      secretary_propose_change: {
        Args: {
          p_appointment: string
          p_chat: string
          p_date?: string
          p_operation: string
          p_owner: string
          p_professional?: string
          p_service?: string
          p_time?: string
        }
        Returns: Json
      }
      secretary_propose_multi: {
        Args: {
          p_chat: string
          p_date: string
          p_owner: string
          p_professional: string
          p_services: string[]
          p_time: string
        }
        Returns: Json
      }
      secretary_set_reminder: {
        Args: { p_chat: string; p_hours: number; p_owner: string }
        Returns: Json
      }
      secretary_set_reminder_at: {
        Args: { p_chat: string; p_owner: string; p_when: string }
        Returns: Json
      }
      secretary_slots: {
        Args: {
          p_date?: string
          p_owner: string
          p_professional?: string
          p_service: string
        }
        Returns: Json
      }
      secretary_slots_multi: {
        Args: {
          p_date?: string
          p_owner: string
          p_professional?: string
          p_services: string[]
        }
        Returns: Json
      }
      secretary_valid_full_name: { Args: { p_name: string }; Returns: boolean }
      shop_access: { Args: { p_owner: string }; Returns: boolean }
      shop_activate_plan_offer: { Args: { p_offer: string }; Returns: Json }
      shop_activate_plan_offer_base: {
        Args: { p_offer: string }
        Returns: Json
      }
      shop_claim_checkout: {
        Args: { p_method: string; p_order: string; p_request: string }
        Returns: Json
      }
      shop_identity: { Args: { p_owner: string }; Returns: boolean }
      shop_plan_apply_payment: {
        Args: { p_order: string; p_payment: Json }
        Returns: Json
      }
      shop_plan_customer_payments: {
        Args: { p_customer: string }
        Returns: Json
      }
      shop_plan_prepare_order: {
        Args: { p_offer: string; p_recurring: boolean }
        Returns: Json
      }
      shop_switch_checkout_mode: {
        Args: { p_order: string; p_recurring: boolean }
        Returns: undefined
      }
      staff_access: { Args: never; Returns: Json }
      staff_session_valid: { Args: never; Returns: boolean }
      start_manual_service: {
        Args: { p_chat: string; p_user_id: string }
        Returns: undefined
      }
      tenant_effective_tier: { Args: { p_owner: string }; Returns: string }
      tenant_operational_access: { Args: { p_owner: string }; Returns: boolean }
      touch_app_sync: {
        Args: { p_owner: string; p_scope: string; p_table: string }
        Returns: undefined
      }
      whatsapp_chat_summaries: {
        Args: { p_owner: string; p_staff: string }
        Returns: {
          last_text: string
          last_timestamp: number
          last_type: string
          unread_count: number
          wa_chatid: string
        }[]
      }
      whatsapp_chat_summaries_fast: {
        Args: { p_owner: string; p_staff: string }
        Returns: {
          last_push_name: string
          last_text: string
          last_timestamp: number
          last_type: string
          unread_count: number
          wa_chatid: string
        }[]
      }
      whatsapp_phone_key: { Args: { p_value: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "atendente" | "desenvolvedor" | "master"
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
      app_role: ["admin", "atendente", "desenvolvedor", "master"],
    },
  },
} as const
