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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_audit_events: {
        Row: {
          actor_auth_user_id: string | null
          actor_member_id: string | null
          after_data: Json | null
          before_data: Json | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          event_type: string
          id: string
          legacy_glide_row_id: string | null
          metadata: Json
          source: string
          summary: string | null
          title: string | null
        }
        Insert: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          event_type: string
          id?: string
          legacy_glide_row_id?: string | null
          metadata?: Json
          source?: string
          summary?: string | null
          title?: string | null
        }
        Update: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          event_type?: string
          id?: string
          legacy_glide_row_id?: string | null
          metadata?: Json
          source?: string
          summary?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_audit_events_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_choices: {
        Row: {
          accounts_receivable_csm_report_display: string | null
          accounts_receivable_display: string | null
          accounts_receivable_value: string | null
          activity_selection_options: string | null
          ai_sentiment_display: string | null
          ai_sentiment_value: string | null
          archetype_display: string | null
          archetype_help_label: string | null
          archetype_resource: string | null
          archetype_value: string | null
          buy_in_display: string | null
          buy_in_resource: string | null
          buy_in_value: string | null
          call_ai_month_filter_display: string | null
          call_ai_month_filter_value: string | null
          change_type_code: string | null
          change_type_color: string | null
          change_type_display: string | null
          churn_display_old: string | null
          churn_value_new: string | null
          churn_value_old: string | null
          client_date_filters: string | null
          client_type: string | null
          company_views: string | null
          contact_calendar_filters: string | null
          contact_calendar_filters_display: string | null
          csm_report_end: number | null
          csm_report_selection: string | null
          csm_report_start: number | null
          dashboard: string | null
          data: Json | null
          days_ago_number: number | null
          default_call_type_list: string | null
          glide_row_id: string
          index: number | null
          milestone_defaults: string | null
          milestone_value: string | null
          month_filter_display_full: string | null
          next_days_number: number | null
          offer_defaults: string | null
          offer_value: string | null
          option: string | null
          program_emoji: string | null
          program_is_active: boolean | null
          program_label: string | null
          program_show_status: boolean | null
          program_value: string | null
          progress_display: string | null
          progress_resource: string | null
          progress_value: string | null
          recurring_day_name: string | null
          recurring_day_number: number | null
          role_description: string | null
          role_id: number | null
          role_label: string | null
          success_display: string | null
          success_resource: string | null
          success_value: string | null
          suitable_display: string | null
          suitable_value: string | null
          synced_at: string
          task_choices: string | null
          task_colors: string | null
          task_labels: string | null
          task_priority: string | null
          tasks_to_show_display: string | null
          tasks_to_show_value: string | null
          yes_ask_no_display: string | null
          yes_ask_no_value: string | null
        }
        Insert: {
          accounts_receivable_csm_report_display?: string | null
          accounts_receivable_display?: string | null
          accounts_receivable_value?: string | null
          activity_selection_options?: string | null
          ai_sentiment_display?: string | null
          ai_sentiment_value?: string | null
          archetype_display?: string | null
          archetype_help_label?: string | null
          archetype_resource?: string | null
          archetype_value?: string | null
          buy_in_display?: string | null
          buy_in_resource?: string | null
          buy_in_value?: string | null
          call_ai_month_filter_display?: string | null
          call_ai_month_filter_value?: string | null
          change_type_code?: string | null
          change_type_color?: string | null
          change_type_display?: string | null
          churn_display_old?: string | null
          churn_value_new?: string | null
          churn_value_old?: string | null
          client_date_filters?: string | null
          client_type?: string | null
          company_views?: string | null
          contact_calendar_filters?: string | null
          contact_calendar_filters_display?: string | null
          csm_report_end?: number | null
          csm_report_selection?: string | null
          csm_report_start?: number | null
          dashboard?: string | null
          data?: Json | null
          days_ago_number?: number | null
          default_call_type_list?: string | null
          glide_row_id: string
          index?: number | null
          milestone_defaults?: string | null
          milestone_value?: string | null
          month_filter_display_full?: string | null
          next_days_number?: number | null
          offer_defaults?: string | null
          offer_value?: string | null
          option?: string | null
          program_emoji?: string | null
          program_is_active?: boolean | null
          program_label?: string | null
          program_show_status?: boolean | null
          program_value?: string | null
          progress_display?: string | null
          progress_resource?: string | null
          progress_value?: string | null
          recurring_day_name?: string | null
          recurring_day_number?: number | null
          role_description?: string | null
          role_id?: number | null
          role_label?: string | null
          success_display?: string | null
          success_resource?: string | null
          success_value?: string | null
          suitable_display?: string | null
          suitable_value?: string | null
          synced_at?: string
          task_choices?: string | null
          task_colors?: string | null
          task_labels?: string | null
          task_priority?: string | null
          tasks_to_show_display?: string | null
          tasks_to_show_value?: string | null
          yes_ask_no_display?: string | null
          yes_ask_no_value?: string | null
        }
        Update: {
          accounts_receivable_csm_report_display?: string | null
          accounts_receivable_display?: string | null
          accounts_receivable_value?: string | null
          activity_selection_options?: string | null
          ai_sentiment_display?: string | null
          ai_sentiment_value?: string | null
          archetype_display?: string | null
          archetype_help_label?: string | null
          archetype_resource?: string | null
          archetype_value?: string | null
          buy_in_display?: string | null
          buy_in_resource?: string | null
          buy_in_value?: string | null
          call_ai_month_filter_display?: string | null
          call_ai_month_filter_value?: string | null
          change_type_code?: string | null
          change_type_color?: string | null
          change_type_display?: string | null
          churn_display_old?: string | null
          churn_value_new?: string | null
          churn_value_old?: string | null
          client_date_filters?: string | null
          client_type?: string | null
          company_views?: string | null
          contact_calendar_filters?: string | null
          contact_calendar_filters_display?: string | null
          csm_report_end?: number | null
          csm_report_selection?: string | null
          csm_report_start?: number | null
          dashboard?: string | null
          data?: Json | null
          days_ago_number?: number | null
          default_call_type_list?: string | null
          glide_row_id?: string
          index?: number | null
          milestone_defaults?: string | null
          milestone_value?: string | null
          month_filter_display_full?: string | null
          next_days_number?: number | null
          offer_defaults?: string | null
          offer_value?: string | null
          option?: string | null
          program_emoji?: string | null
          program_is_active?: boolean | null
          program_label?: string | null
          program_show_status?: boolean | null
          program_value?: string | null
          progress_display?: string | null
          progress_resource?: string | null
          progress_value?: string | null
          recurring_day_name?: string | null
          recurring_day_number?: number | null
          role_description?: string | null
          role_id?: number | null
          role_label?: string | null
          success_display?: string | null
          success_resource?: string | null
          success_value?: string | null
          suitable_display?: string | null
          suitable_value?: string | null
          synced_at?: string
          task_choices?: string | null
          task_colors?: string | null
          task_labels?: string | null
          task_priority?: string | null
          tasks_to_show_display?: string | null
          tasks_to_show_value?: string | null
          yes_ask_no_display?: string | null
          yes_ask_no_value?: string | null
        }
        Relationships: []
      }
      backup_companies: {
        Row: {
          add_api_get_rows: string | null
          admin_access_id: string | null
          archived: boolean | null
          call_ai_auto_run: boolean | null
          call_ai_character_limit_override: number | null
          call_ai_header: string | null
          call_ai_prompt: string | null
          churned_reason_label_1: string | null
          churned_reason_label_2: string | null
          churned_reason_label_3: string | null
          churned_reason_label_4: string | null
          churned_reason_label_5: string | null
          churned_reason_label_6: string | null
          csm_change_history: boolean | null
          custom_fields_label_1: string | null
          custom_fields_label_2: string | null
          custom_fields_label_3: string | null
          custom_fields_label_4: string | null
          custom_fields_label_5: string | null
          custom_fields_label_6: string | null
          custom_fields_label_7: string | null
          data: Json | null
          definitions_buy_in_green: string | null
          definitions_buy_in_guidelines_link: string | null
          definitions_buy_in_red: string | null
          definitions_buy_in_yellow: string | null
          definitions_progress_green: string | null
          definitions_progress_guidelines_link: string | null
          definitions_progress_red: string | null
          definitions_progress_yellow: string | null
          definitions_success_green: string | null
          definitions_success_guidelines_link: string | null
          definitions_success_red: string | null
          enable_call_ai_for_csms: boolean | null
          enable_call_ai_sets_next_contact_date: boolean | null
          enable_secondary_assignee: boolean | null
          enable_set_next_contact_date_with_last: boolean | null
          glide_row_id: string
          milestone_1_name: string | null
          milestone_2_name: string | null
          milestone_3_name: string | null
          milestone_4_name: string | null
          milestone_5_name: string | null
          name: string | null
          name_simp: string | null
          number_of_days_until_next_contact_for_call_ai: number | null
          number_of_days_until_next_contact_for_quick_update: number | null
          offer_1: string | null
          offer_2: string | null
          offer_3: string | null
          offer_4: string | null
          offer_5: string | null
          program_paused_override: string | null
          program_suspended_override: string | null
          show_accounts_receivable: boolean | null
          show_auto_renew_contracts: boolean | null
          show_call_tracking: boolean | null
          show_churn_risk_notifications: boolean | null
          show_client_groups: boolean | null
          show_custom_embed_tab: boolean | null
          show_general_info_notes: boolean | null
          show_group_call_option_in_call_ai: boolean | null
          show_lms_course_completion: boolean | null
          show_offer_and_milestones_tab: boolean | null
          show_rga_notifications: boolean | null
          show_secondary_offers: boolean | null
          show_up_for_renewal_notifications: boolean | null
          synced_at: string
          tab_embed_link: string | null
          track_milestones_from_start_date: boolean | null
          uses_simplified_clients_screen: boolean | null
          uses_track_clients_payments_feature: boolean | null
          view_override: string | null
        }
        Insert: {
          add_api_get_rows?: string | null
          admin_access_id?: string | null
          archived?: boolean | null
          call_ai_auto_run?: boolean | null
          call_ai_character_limit_override?: number | null
          call_ai_header?: string | null
          call_ai_prompt?: string | null
          churned_reason_label_1?: string | null
          churned_reason_label_2?: string | null
          churned_reason_label_3?: string | null
          churned_reason_label_4?: string | null
          churned_reason_label_5?: string | null
          churned_reason_label_6?: string | null
          csm_change_history?: boolean | null
          custom_fields_label_1?: string | null
          custom_fields_label_2?: string | null
          custom_fields_label_3?: string | null
          custom_fields_label_4?: string | null
          custom_fields_label_5?: string | null
          custom_fields_label_6?: string | null
          custom_fields_label_7?: string | null
          data?: Json | null
          definitions_buy_in_green?: string | null
          definitions_buy_in_guidelines_link?: string | null
          definitions_buy_in_red?: string | null
          definitions_buy_in_yellow?: string | null
          definitions_progress_green?: string | null
          definitions_progress_guidelines_link?: string | null
          definitions_progress_red?: string | null
          definitions_progress_yellow?: string | null
          definitions_success_green?: string | null
          definitions_success_guidelines_link?: string | null
          definitions_success_red?: string | null
          enable_call_ai_for_csms?: boolean | null
          enable_call_ai_sets_next_contact_date?: boolean | null
          enable_secondary_assignee?: boolean | null
          enable_set_next_contact_date_with_last?: boolean | null
          glide_row_id: string
          milestone_1_name?: string | null
          milestone_2_name?: string | null
          milestone_3_name?: string | null
          milestone_4_name?: string | null
          milestone_5_name?: string | null
          name?: string | null
          name_simp?: string | null
          number_of_days_until_next_contact_for_call_ai?: number | null
          number_of_days_until_next_contact_for_quick_update?: number | null
          offer_1?: string | null
          offer_2?: string | null
          offer_3?: string | null
          offer_4?: string | null
          offer_5?: string | null
          program_paused_override?: string | null
          program_suspended_override?: string | null
          show_accounts_receivable?: boolean | null
          show_auto_renew_contracts?: boolean | null
          show_call_tracking?: boolean | null
          show_churn_risk_notifications?: boolean | null
          show_client_groups?: boolean | null
          show_custom_embed_tab?: boolean | null
          show_general_info_notes?: boolean | null
          show_group_call_option_in_call_ai?: boolean | null
          show_lms_course_completion?: boolean | null
          show_offer_and_milestones_tab?: boolean | null
          show_rga_notifications?: boolean | null
          show_secondary_offers?: boolean | null
          show_up_for_renewal_notifications?: boolean | null
          synced_at?: string
          tab_embed_link?: string | null
          track_milestones_from_start_date?: boolean | null
          uses_simplified_clients_screen?: boolean | null
          uses_track_clients_payments_feature?: boolean | null
          view_override?: string | null
        }
        Update: {
          add_api_get_rows?: string | null
          admin_access_id?: string | null
          archived?: boolean | null
          call_ai_auto_run?: boolean | null
          call_ai_character_limit_override?: number | null
          call_ai_header?: string | null
          call_ai_prompt?: string | null
          churned_reason_label_1?: string | null
          churned_reason_label_2?: string | null
          churned_reason_label_3?: string | null
          churned_reason_label_4?: string | null
          churned_reason_label_5?: string | null
          churned_reason_label_6?: string | null
          csm_change_history?: boolean | null
          custom_fields_label_1?: string | null
          custom_fields_label_2?: string | null
          custom_fields_label_3?: string | null
          custom_fields_label_4?: string | null
          custom_fields_label_5?: string | null
          custom_fields_label_6?: string | null
          custom_fields_label_7?: string | null
          data?: Json | null
          definitions_buy_in_green?: string | null
          definitions_buy_in_guidelines_link?: string | null
          definitions_buy_in_red?: string | null
          definitions_buy_in_yellow?: string | null
          definitions_progress_green?: string | null
          definitions_progress_guidelines_link?: string | null
          definitions_progress_red?: string | null
          definitions_progress_yellow?: string | null
          definitions_success_green?: string | null
          definitions_success_guidelines_link?: string | null
          definitions_success_red?: string | null
          enable_call_ai_for_csms?: boolean | null
          enable_call_ai_sets_next_contact_date?: boolean | null
          enable_secondary_assignee?: boolean | null
          enable_set_next_contact_date_with_last?: boolean | null
          glide_row_id?: string
          milestone_1_name?: string | null
          milestone_2_name?: string | null
          milestone_3_name?: string | null
          milestone_4_name?: string | null
          milestone_5_name?: string | null
          name?: string | null
          name_simp?: string | null
          number_of_days_until_next_contact_for_call_ai?: number | null
          number_of_days_until_next_contact_for_quick_update?: number | null
          offer_1?: string | null
          offer_2?: string | null
          offer_3?: string | null
          offer_4?: string | null
          offer_5?: string | null
          program_paused_override?: string | null
          program_suspended_override?: string | null
          show_accounts_receivable?: boolean | null
          show_auto_renew_contracts?: boolean | null
          show_call_tracking?: boolean | null
          show_churn_risk_notifications?: boolean | null
          show_client_groups?: boolean | null
          show_custom_embed_tab?: boolean | null
          show_general_info_notes?: boolean | null
          show_group_call_option_in_call_ai?: boolean | null
          show_lms_course_completion?: boolean | null
          show_offer_and_milestones_tab?: boolean | null
          show_rga_notifications?: boolean | null
          show_secondary_offers?: boolean | null
          show_up_for_renewal_notifications?: boolean | null
          synced_at?: string
          tab_embed_link?: string | null
          track_milestones_from_start_date?: boolean | null
          uses_simplified_clients_screen?: boolean | null
          uses_track_clients_payments_feature?: boolean | null
          view_override?: string | null
        }
        Relationships: []
      }
      backup_company_client_groups: {
        Row: {
          admin_access_id: string | null
          company_id: string | null
          csm_id: string | null
          data: Json | null
          end_date: string | null
          glide_row_id: string
          image_upload: string | null
          last_meeting: string | null
          meeting_cadence: string | null
          name: string | null
          next_meeting: string | null
          start_date: string | null
          synced_at: string
          zoom_link: string | null
        }
        Insert: {
          admin_access_id?: string | null
          company_id?: string | null
          csm_id?: string | null
          data?: Json | null
          end_date?: string | null
          glide_row_id: string
          image_upload?: string | null
          last_meeting?: string | null
          meeting_cadence?: string | null
          name?: string | null
          next_meeting?: string | null
          start_date?: string | null
          synced_at?: string
          zoom_link?: string | null
        }
        Update: {
          admin_access_id?: string | null
          company_id?: string | null
          csm_id?: string | null
          data?: Json | null
          end_date?: string | null
          glide_row_id?: string
          image_upload?: string | null
          last_meeting?: string | null
          meeting_cadence?: string | null
          name?: string | null
          next_meeting?: string | null
          start_date?: string | null
          synced_at?: string
          zoom_link?: string | null
        }
        Relationships: []
      }
      backup_company_clients: {
        Row: {
          admin_access_id: string | null
          churn_comments: string | null
          churn_reason_value: string | null
          churn_warning_notification_dismiss_date: string | null
          churn_warning_notification_prompt_for_churn_warning: boolean | null
          client_accounts_receivable_value: string | null
          client_age_date_offboarded: string | null
          client_age_date_offboarded_for_filtering: string | null
          client_age_date_onboarded: string | null
          client_archetype_value: string | null
          client_business: string | null
          client_communication_label: string | null
          client_communication_link: string | null
          client_director_notes: string | null
          client_email: string | null
          client_email_2: string | null
          client_email_3: string | null
          client_general_info: string | null
          client_image: string | null
          client_mailing_address: string | null
          client_name: string | null
          client_phone: string | null
          client_reference_label: string | null
          client_reference_link: string | null
          company_id: string | null
          course_completion: string | null
          csm_date_of_last_contact: string | null
          csm_date_of_last_contact_changed_by: string | null
          csm_date_of_next_contact: string | null
          csm_date_of_next_contact_changed_by: string | null
          csm_dismiss_date_of_next_contact_notification: boolean | null
          csm_hide_new_client_notification: boolean | null
          csm_last_updated_date_for_csm_reports: string | null
          csm_secondary_assignee_id: string | null
          csm_team_member_id: string | null
          current_contract_auto_renew: boolean | null
          current_contract_end_date: string | null
          current_contract_end_date_for_filtering: string | null
          current_contract_end_year_month_for_filtering: string | null
          current_contract_monthly_value: number | null
          current_contract_notes: string | null
          current_contract_of_days: number | null
          current_contract_reference_link: string | null
          current_contract_select_end_date: boolean | null
          current_contract_start_date: string | null
          custom_fields_1_value: string | null
          custom_fields_2_value: string | null
          custom_fields_3_value: string | null
          custom_fields_4_value: string | null
          custom_fields_5_value: string | null
          custom_fields_6_value: string | null
          custom_fields_7_value: string | null
          data: Json | null
          glide_row_id: string
          group_id: string | null
          milestone_1_completion_date: string | null
          milestone_1_start_date: string | null
          milestone_2_completion_date: string | null
          milestone_2_start_date: string | null
          milestone_3_completion_date: string | null
          milestone_3_start_date: string | null
          milestone_4_completion_date: string | null
          milestone_4_start_date: string | null
          milestone_5_completion_date: string | null
          milestone_5_start_date: string | null
          milestone_current_value: string | null
          next_steps_update_by: string | null
          next_steps_update_time: string | null
          next_steps_value: string | null
          north_star_update_by: string | null
          north_star_update_time: string | null
          north_star_value: string | null
          offer_current_value: string | null
          offer_milestones_2nd_current_milestone_change_date: string | null
          offer_milestones_2nd_current_milestone_id: string | null
          offer_milestones_2nd_current_offer_id: string | null
          offer_milestones_current_milestone_change_date: string | null
          offer_milestones_current_milestone_id: string | null
          offer_milestones_current_offer_id: string | null
          outcomes_buy_in_date: string | null
          outcomes_buy_in_for_filtering: string | null
          outcomes_buy_in_value: string | null
          outcomes_progress_date: string | null
          outcomes_progress_for_filtering: string | null
          outcomes_progress_value: string | null
          outcomes_referral_ask_date: string | null
          outcomes_referral_set: boolean | null
          outcomes_referral_yes_date: string | null
          outcomes_renewal_ask_date: string | null
          outcomes_renewal_set: boolean | null
          outcomes_renewal_yes_date: string | null
          outcomes_review_ask_date: string | null
          outcomes_review_set: boolean | null
          outcomes_review_yes_date: string | null
          outcomes_success_date: string | null
          outcomes_success_value: string | null
          outcomes_success_value_for_filtering: string | null
          outcomes_suitable_date: string | null
          outcomes_suitable_value: string | null
          outcomes_testimonial_ask_date: string | null
          outcomes_testimonial_set: boolean | null
          outcomes_testimonial_yes_date: string | null
          program_latest_back_end_start_date: string | null
          program_latest_paused_date: string | null
          program_latest_suspended_date: string | null
          program_re_sign: boolean | null
          program_status_value: string | null
          rga_notification_dismiss_date: string | null
          rga_notification_prompt_for_rga: boolean | null
          synced_at: string
          up_for_renewal_notification_dismiss_date: string | null
          up_for_renewal_notification_prompt_for_up_for_renewal: boolean | null
        }
        Insert: {
          admin_access_id?: string | null
          churn_comments?: string | null
          churn_reason_value?: string | null
          churn_warning_notification_dismiss_date?: string | null
          churn_warning_notification_prompt_for_churn_warning?: boolean | null
          client_accounts_receivable_value?: string | null
          client_age_date_offboarded?: string | null
          client_age_date_offboarded_for_filtering?: string | null
          client_age_date_onboarded?: string | null
          client_archetype_value?: string | null
          client_business?: string | null
          client_communication_label?: string | null
          client_communication_link?: string | null
          client_director_notes?: string | null
          client_email?: string | null
          client_email_2?: string | null
          client_email_3?: string | null
          client_general_info?: string | null
          client_image?: string | null
          client_mailing_address?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_reference_label?: string | null
          client_reference_link?: string | null
          company_id?: string | null
          course_completion?: string | null
          csm_date_of_last_contact?: string | null
          csm_date_of_last_contact_changed_by?: string | null
          csm_date_of_next_contact?: string | null
          csm_date_of_next_contact_changed_by?: string | null
          csm_dismiss_date_of_next_contact_notification?: boolean | null
          csm_hide_new_client_notification?: boolean | null
          csm_last_updated_date_for_csm_reports?: string | null
          csm_secondary_assignee_id?: string | null
          csm_team_member_id?: string | null
          current_contract_auto_renew?: boolean | null
          current_contract_end_date?: string | null
          current_contract_end_date_for_filtering?: string | null
          current_contract_end_year_month_for_filtering?: string | null
          current_contract_monthly_value?: number | null
          current_contract_notes?: string | null
          current_contract_of_days?: number | null
          current_contract_reference_link?: string | null
          current_contract_select_end_date?: boolean | null
          current_contract_start_date?: string | null
          custom_fields_1_value?: string | null
          custom_fields_2_value?: string | null
          custom_fields_3_value?: string | null
          custom_fields_4_value?: string | null
          custom_fields_5_value?: string | null
          custom_fields_6_value?: string | null
          custom_fields_7_value?: string | null
          data?: Json | null
          glide_row_id: string
          group_id?: string | null
          milestone_1_completion_date?: string | null
          milestone_1_start_date?: string | null
          milestone_2_completion_date?: string | null
          milestone_2_start_date?: string | null
          milestone_3_completion_date?: string | null
          milestone_3_start_date?: string | null
          milestone_4_completion_date?: string | null
          milestone_4_start_date?: string | null
          milestone_5_completion_date?: string | null
          milestone_5_start_date?: string | null
          milestone_current_value?: string | null
          next_steps_update_by?: string | null
          next_steps_update_time?: string | null
          next_steps_value?: string | null
          north_star_update_by?: string | null
          north_star_update_time?: string | null
          north_star_value?: string | null
          offer_current_value?: string | null
          offer_milestones_2nd_current_milestone_change_date?: string | null
          offer_milestones_2nd_current_milestone_id?: string | null
          offer_milestones_2nd_current_offer_id?: string | null
          offer_milestones_current_milestone_change_date?: string | null
          offer_milestones_current_milestone_id?: string | null
          offer_milestones_current_offer_id?: string | null
          outcomes_buy_in_date?: string | null
          outcomes_buy_in_for_filtering?: string | null
          outcomes_buy_in_value?: string | null
          outcomes_progress_date?: string | null
          outcomes_progress_for_filtering?: string | null
          outcomes_progress_value?: string | null
          outcomes_referral_ask_date?: string | null
          outcomes_referral_set?: boolean | null
          outcomes_referral_yes_date?: string | null
          outcomes_renewal_ask_date?: string | null
          outcomes_renewal_set?: boolean | null
          outcomes_renewal_yes_date?: string | null
          outcomes_review_ask_date?: string | null
          outcomes_review_set?: boolean | null
          outcomes_review_yes_date?: string | null
          outcomes_success_date?: string | null
          outcomes_success_value?: string | null
          outcomes_success_value_for_filtering?: string | null
          outcomes_suitable_date?: string | null
          outcomes_suitable_value?: string | null
          outcomes_testimonial_ask_date?: string | null
          outcomes_testimonial_set?: boolean | null
          outcomes_testimonial_yes_date?: string | null
          program_latest_back_end_start_date?: string | null
          program_latest_paused_date?: string | null
          program_latest_suspended_date?: string | null
          program_re_sign?: boolean | null
          program_status_value?: string | null
          rga_notification_dismiss_date?: string | null
          rga_notification_prompt_for_rga?: boolean | null
          synced_at?: string
          up_for_renewal_notification_dismiss_date?: string | null
          up_for_renewal_notification_prompt_for_up_for_renewal?: boolean | null
        }
        Update: {
          admin_access_id?: string | null
          churn_comments?: string | null
          churn_reason_value?: string | null
          churn_warning_notification_dismiss_date?: string | null
          churn_warning_notification_prompt_for_churn_warning?: boolean | null
          client_accounts_receivable_value?: string | null
          client_age_date_offboarded?: string | null
          client_age_date_offboarded_for_filtering?: string | null
          client_age_date_onboarded?: string | null
          client_archetype_value?: string | null
          client_business?: string | null
          client_communication_label?: string | null
          client_communication_link?: string | null
          client_director_notes?: string | null
          client_email?: string | null
          client_email_2?: string | null
          client_email_3?: string | null
          client_general_info?: string | null
          client_image?: string | null
          client_mailing_address?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_reference_label?: string | null
          client_reference_link?: string | null
          company_id?: string | null
          course_completion?: string | null
          csm_date_of_last_contact?: string | null
          csm_date_of_last_contact_changed_by?: string | null
          csm_date_of_next_contact?: string | null
          csm_date_of_next_contact_changed_by?: string | null
          csm_dismiss_date_of_next_contact_notification?: boolean | null
          csm_hide_new_client_notification?: boolean | null
          csm_last_updated_date_for_csm_reports?: string | null
          csm_secondary_assignee_id?: string | null
          csm_team_member_id?: string | null
          current_contract_auto_renew?: boolean | null
          current_contract_end_date?: string | null
          current_contract_end_date_for_filtering?: string | null
          current_contract_end_year_month_for_filtering?: string | null
          current_contract_monthly_value?: number | null
          current_contract_notes?: string | null
          current_contract_of_days?: number | null
          current_contract_reference_link?: string | null
          current_contract_select_end_date?: boolean | null
          current_contract_start_date?: string | null
          custom_fields_1_value?: string | null
          custom_fields_2_value?: string | null
          custom_fields_3_value?: string | null
          custom_fields_4_value?: string | null
          custom_fields_5_value?: string | null
          custom_fields_6_value?: string | null
          custom_fields_7_value?: string | null
          data?: Json | null
          glide_row_id?: string
          group_id?: string | null
          milestone_1_completion_date?: string | null
          milestone_1_start_date?: string | null
          milestone_2_completion_date?: string | null
          milestone_2_start_date?: string | null
          milestone_3_completion_date?: string | null
          milestone_3_start_date?: string | null
          milestone_4_completion_date?: string | null
          milestone_4_start_date?: string | null
          milestone_5_completion_date?: string | null
          milestone_5_start_date?: string | null
          milestone_current_value?: string | null
          next_steps_update_by?: string | null
          next_steps_update_time?: string | null
          next_steps_value?: string | null
          north_star_update_by?: string | null
          north_star_update_time?: string | null
          north_star_value?: string | null
          offer_current_value?: string | null
          offer_milestones_2nd_current_milestone_change_date?: string | null
          offer_milestones_2nd_current_milestone_id?: string | null
          offer_milestones_2nd_current_offer_id?: string | null
          offer_milestones_current_milestone_change_date?: string | null
          offer_milestones_current_milestone_id?: string | null
          offer_milestones_current_offer_id?: string | null
          outcomes_buy_in_date?: string | null
          outcomes_buy_in_for_filtering?: string | null
          outcomes_buy_in_value?: string | null
          outcomes_progress_date?: string | null
          outcomes_progress_for_filtering?: string | null
          outcomes_progress_value?: string | null
          outcomes_referral_ask_date?: string | null
          outcomes_referral_set?: boolean | null
          outcomes_referral_yes_date?: string | null
          outcomes_renewal_ask_date?: string | null
          outcomes_renewal_set?: boolean | null
          outcomes_renewal_yes_date?: string | null
          outcomes_review_ask_date?: string | null
          outcomes_review_set?: boolean | null
          outcomes_review_yes_date?: string | null
          outcomes_success_date?: string | null
          outcomes_success_value?: string | null
          outcomes_success_value_for_filtering?: string | null
          outcomes_suitable_date?: string | null
          outcomes_suitable_value?: string | null
          outcomes_testimonial_ask_date?: string | null
          outcomes_testimonial_set?: boolean | null
          outcomes_testimonial_yes_date?: string | null
          program_latest_back_end_start_date?: string | null
          program_latest_paused_date?: string | null
          program_latest_suspended_date?: string | null
          program_re_sign?: boolean | null
          program_status_value?: string | null
          rga_notification_dismiss_date?: string | null
          rga_notification_prompt_for_rga?: boolean | null
          synced_at?: string
          up_for_renewal_notification_dismiss_date?: string | null
          up_for_renewal_notification_prompt_for_up_for_renewal?: boolean | null
        }
        Relationships: []
      }
      backup_company_clients_ai_analysis_comments: {
        Row: {
          added_by_date: string | null
          added_by_image: string | null
          added_by_name: string | null
          admin_access_id: string | null
          call_id: string | null
          comment: string | null
          company_id: string | null
          data: Json | null
          glide_row_id: string
          synced_at: string
        }
        Insert: {
          added_by_date?: string | null
          added_by_image?: string | null
          added_by_name?: string | null
          admin_access_id?: string | null
          call_id?: string | null
          comment?: string | null
          company_id?: string | null
          data?: Json | null
          glide_row_id: string
          synced_at?: string
        }
        Update: {
          added_by_date?: string | null
          added_by_image?: string | null
          added_by_name?: string | null
          admin_access_id?: string | null
          call_id?: string | null
          comment?: string | null
          company_id?: string | null
          data?: Json | null
          glide_row_id?: string
          synced_at?: string
        }
        Relationships: []
      }
      backup_company_clients_ai_analysis_ondemand: {
        Row: {
          admin_access_id: string | null
          call_id: string | null
          company_id: string | null
          data: Json | null
          glide_row_id: string
          prompt_id: string | null
          prompt_name: string | null
          prompt_prompt: string | null
          result: string | null
          synced_at: string
        }
        Insert: {
          admin_access_id?: string | null
          call_id?: string | null
          company_id?: string | null
          data?: Json | null
          glide_row_id: string
          prompt_id?: string | null
          prompt_name?: string | null
          prompt_prompt?: string | null
          result?: string | null
          synced_at?: string
        }
        Update: {
          admin_access_id?: string | null
          call_id?: string | null
          company_id?: string | null
          data?: Json | null
          glide_row_id?: string
          prompt_id?: string | null
          prompt_name?: string | null
          prompt_prompt?: string | null
          result?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      backup_company_clients_contracts: {
        Row: {
          auto_renew: boolean | null
          client_id: string | null
          data: Json | null
          end_date: string | null
          glide_row_id: string
          last_modified_by: string | null
          last_modified_time: string | null
          monthly_value: number | null
          notes: string | null
          reference_link: string | null
          start_date: string | null
          synced_at: string
        }
        Insert: {
          auto_renew?: boolean | null
          client_id?: string | null
          data?: Json | null
          end_date?: string | null
          glide_row_id: string
          last_modified_by?: string | null
          last_modified_time?: string | null
          monthly_value?: number | null
          notes?: string | null
          reference_link?: string | null
          start_date?: string | null
          synced_at?: string
        }
        Update: {
          auto_renew?: boolean | null
          client_id?: string | null
          data?: Json | null
          end_date?: string | null
          glide_row_id?: string
          last_modified_by?: string | null
          last_modified_time?: string | null
          monthly_value?: number | null
          notes?: string | null
          reference_link?: string | null
          start_date?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      backup_company_clients_history: {
        Row: {
          call_ai_id: string | null
          change_type_code: string | null
          client_id: string | null
          context: string | null
          data: Json | null
          edit_by_on: string | null
          glide_row_id: string
          modified_by: string | null
          modified_date: string | null
          original_value: string | null
          synced_at: string
          value: string | null
          value_as_json: string | null
        }
        Insert: {
          call_ai_id?: string | null
          change_type_code?: string | null
          client_id?: string | null
          context?: string | null
          data?: Json | null
          edit_by_on?: string | null
          glide_row_id: string
          modified_by?: string | null
          modified_date?: string | null
          original_value?: string | null
          synced_at?: string
          value?: string | null
          value_as_json?: string | null
        }
        Update: {
          call_ai_id?: string | null
          change_type_code?: string | null
          client_id?: string | null
          context?: string | null
          data?: Json | null
          edit_by_on?: string | null
          glide_row_id?: string
          modified_by?: string | null
          modified_date?: string | null
          original_value?: string | null
          synced_at?: string
          value?: string | null
          value_as_json?: string | null
        }
        Relationships: []
      }
      backup_company_clients_milestones: {
        Row: {
          client_id: string | null
          completed_by_csm: string | null
          completion_date: string | null
          data: Json | null
          dismiss_completed_final_milestone_alert: boolean | null
          glide_row_id: string
          initiated_by_csm: string | null
          milestone_id: string | null
          offer_id: string | null
          start_date: string | null
          synced_at: string
        }
        Insert: {
          client_id?: string | null
          completed_by_csm?: string | null
          completion_date?: string | null
          data?: Json | null
          dismiss_completed_final_milestone_alert?: boolean | null
          glide_row_id: string
          initiated_by_csm?: string | null
          milestone_id?: string | null
          offer_id?: string | null
          start_date?: string | null
          synced_at?: string
        }
        Update: {
          client_id?: string | null
          completed_by_csm?: string | null
          completion_date?: string | null
          data?: Json | null
          dismiss_completed_final_milestone_alert?: boolean | null
          glide_row_id?: string
          initiated_by_csm?: string | null
          milestone_id?: string | null
          offer_id?: string | null
          start_date?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      backup_company_clients_tasks: {
        Row: {
          assigned_to_id: string | null
          client_id: string | null
          company_id: string | null
          completion_date: string | null
          created_by_id: string | null
          data: Json | null
          external_link: string | null
          glide_row_id: string
          is_manually_archived: boolean | null
          kanban_order: string | null
          priority: string | null
          recurring_is_recurring: boolean | null
          recurring_weekday: number | null
          start_date: string | null
          status_value: string | null
          synced_at: string
          task_description: string | null
          task_dismissed: boolean | null
          task_due_date: string | null
          task_last_updated_date: string | null
          task_name: string | null
          task_read: boolean | null
        }
        Insert: {
          assigned_to_id?: string | null
          client_id?: string | null
          company_id?: string | null
          completion_date?: string | null
          created_by_id?: string | null
          data?: Json | null
          external_link?: string | null
          glide_row_id: string
          is_manually_archived?: boolean | null
          kanban_order?: string | null
          priority?: string | null
          recurring_is_recurring?: boolean | null
          recurring_weekday?: number | null
          start_date?: string | null
          status_value?: string | null
          synced_at?: string
          task_description?: string | null
          task_dismissed?: boolean | null
          task_due_date?: string | null
          task_last_updated_date?: string | null
          task_name?: string | null
          task_read?: boolean | null
        }
        Update: {
          assigned_to_id?: string | null
          client_id?: string | null
          company_id?: string | null
          completion_date?: string | null
          created_by_id?: string | null
          data?: Json | null
          external_link?: string | null
          glide_row_id?: string
          is_manually_archived?: boolean | null
          kanban_order?: string | null
          priority?: string | null
          recurring_is_recurring?: boolean | null
          recurring_weekday?: number | null
          start_date?: string | null
          status_value?: string | null
          synced_at?: string
          task_description?: string | null
          task_dismissed?: boolean | null
          task_due_date?: string | null
          task_last_updated_date?: string | null
          task_name?: string | null
          task_read?: boolean | null
        }
        Relationships: []
      }
      backup_company_offer_milestones: {
        Row: {
          data: Json | null
          final_milestone: boolean | null
          glide_row_id: string
          name: string | null
          offer_id: string | null
          order: number | null
          synced_at: string
          target_days_to_complete_from_onboarding_date: number | null
          ttv_milestone: boolean | null
        }
        Insert: {
          data?: Json | null
          final_milestone?: boolean | null
          glide_row_id: string
          name?: string | null
          offer_id?: string | null
          order?: number | null
          synced_at?: string
          target_days_to_complete_from_onboarding_date?: number | null
          ttv_milestone?: boolean | null
        }
        Update: {
          data?: Json | null
          final_milestone?: boolean | null
          glide_row_id?: string
          name?: string | null
          offer_id?: string | null
          order?: number | null
          synced_at?: string
          target_days_to_complete_from_onboarding_date?: number | null
          ttv_milestone?: boolean | null
        }
        Relationships: []
      }
      backup_company_offers: {
        Row: {
          company_id: string | null
          data: Json | null
          glide_row_id: string
          name: string | null
          synced_at: string
        }
        Insert: {
          company_id?: string | null
          data?: Json | null
          glide_row_id: string
          name?: string | null
          synced_at?: string
        }
        Update: {
          company_id?: string | null
          data?: Json | null
          glide_row_id?: string
          name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      backup_company_team: {
        Row: {
          admin_access_id: string | null
          capacity_number: number | null
          company_id: string | null
          company_id_response: string | null
          data: Json | null
          email: string | null
          glide_row_id: string
          hide_notification_offboarded_clients: boolean | null
          hide_notification_paused_clients: boolean | null
          hide_notification_suspended_clients: boolean | null
          hide_notification_unassigned_clients: boolean | null
          is_archived: boolean | null
          name: string | null
          photo: string | null
          role_hide_from_csm_list: boolean | null
          role_id: number | null
          role_is_saa_s_admin: boolean | null
          role_read_only_user: boolean | null
          synced_at: string
        }
        Insert: {
          admin_access_id?: string | null
          capacity_number?: number | null
          company_id?: string | null
          company_id_response?: string | null
          data?: Json | null
          email?: string | null
          glide_row_id: string
          hide_notification_offboarded_clients?: boolean | null
          hide_notification_paused_clients?: boolean | null
          hide_notification_suspended_clients?: boolean | null
          hide_notification_unassigned_clients?: boolean | null
          is_archived?: boolean | null
          name?: string | null
          photo?: string | null
          role_hide_from_csm_list?: boolean | null
          role_id?: number | null
          role_is_saa_s_admin?: boolean | null
          role_read_only_user?: boolean | null
          synced_at?: string
        }
        Update: {
          admin_access_id?: string | null
          capacity_number?: number | null
          company_id?: string | null
          company_id_response?: string | null
          data?: Json | null
          email?: string | null
          glide_row_id?: string
          hide_notification_offboarded_clients?: boolean | null
          hide_notification_paused_clients?: boolean | null
          hide_notification_suspended_clients?: boolean | null
          hide_notification_unassigned_clients?: boolean | null
          is_archived?: boolean | null
          name?: string | null
          photo?: string | null
          role_hide_from_csm_list?: boolean | null
          role_id?: number | null
          role_is_saa_s_admin?: boolean | null
          role_read_only_user?: boolean | null
          synced_at?: string
        }
        Relationships: []
      }
      client_advocacy_events: {
        Row: {
          action: string
          actor_auth_user_id: string | null
          actor_member_id: string | null
          actor_member_legacy_id: string | null
          advocacy_type: string
          client_id: string | null
          client_legacy_id: string
          company_id: string
          company_legacy_id: string | null
          created_at: string
          csm_team_member_id: string | null
          id: string
          metadata: Json
          notes: string | null
          occurred_at: string | null
          source: string
        }
        Insert: {
          action: string
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          actor_member_legacy_id?: string | null
          advocacy_type: string
          client_id?: string | null
          client_legacy_id: string
          company_id: string
          company_legacy_id?: string | null
          created_at?: string
          csm_team_member_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          actor_member_legacy_id?: string | null
          advocacy_type?: string
          client_id?: string | null
          client_legacy_id?: string
          company_id?: string
          company_legacy_id?: string | null
          created_at?: string
          csm_team_member_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_advocacy_events_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_advocacy_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_advocacy_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_call_attendance_events: {
        Row: {
          actor_auth_user_id: string | null
          actor_member_id: string | null
          actor_member_legacy_id: string | null
          attendance_status: string
          client_id: string | null
          client_legacy_id: string
          company_id: string
          company_legacy_id: string | null
          created_at: string
          history_event_id: string | null
          id: string
          integration_intake_event_id: string | null
          metadata: Json
          notes: string | null
          occurred_at: string
          source: string
        }
        Insert: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          actor_member_legacy_id?: string | null
          attendance_status: string
          client_id?: string | null
          client_legacy_id: string
          company_id: string
          company_legacy_id?: string | null
          created_at?: string
          history_event_id?: string | null
          id?: string
          integration_intake_event_id?: string | null
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          source?: string
        }
        Update: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          actor_member_legacy_id?: string | null
          attendance_status?: string
          client_id?: string | null
          client_legacy_id?: string
          company_id?: string
          company_legacy_id?: string | null
          created_at?: string
          history_event_id?: string | null
          id?: string
          integration_intake_event_id?: string | null
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_call_attendance_events_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_call_attendance_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_call_attendance_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_call_attendance_events_history_event_id_fkey"
            columns: ["history_event_id"]
            isOneToOne: false
            referencedRelation: "client_history_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_call_attendance_events_integration_intake_event_id_fkey"
            columns: ["integration_intake_event_id"]
            isOneToOne: false
            referencedRelation: "integration_intake_events"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          archived_at: string | null
          auto_renew: boolean
          client_id: string
          company_glide_row_id: string
          company_id: string
          contract_days: number | null
          created_at: string
          end_date: string | null
          glide_row_id: string
          id: string
          metadata: Json
          monthly_value: number | null
          notes: string | null
          reference_link: string | null
          source_snapshot: Json
          start_date: string | null
          status: string | null
          total_contract_value: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_renew?: boolean
          client_id: string
          company_glide_row_id: string
          company_id: string
          contract_days?: number | null
          created_at?: string
          end_date?: string | null
          glide_row_id: string
          id?: string
          metadata?: Json
          monthly_value?: number | null
          notes?: string | null
          reference_link?: string | null
          source_snapshot?: Json
          start_date?: string | null
          status?: string | null
          total_contract_value?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_renew?: boolean
          client_id?: string
          company_glide_row_id?: string
          company_id?: string
          contract_days?: number | null
          created_at?: string
          end_date?: string | null
          glide_row_id?: string
          id?: string
          metadata?: Json
          monthly_value?: number | null
          notes?: string | null
          reference_link?: string | null
          source_snapshot?: Json
          start_date?: string | null
          status?: string | null
          total_contract_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_custom_field_values: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          custom_field_id: string
          field_key: string
          id: string
          metadata: Json
          source_key: string | null
          source_table: string | null
          updated_at: string
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          custom_field_id: string
          field_key: string
          id?: string
          metadata?: Json
          source_key?: string | null
          source_table?: string | null
          updated_at?: string
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          custom_field_id?: string
          field_key?: string
          id?: string
          metadata?: Json
          source_key?: string | null
          source_table?: string | null
          updated_at?: string
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_custom_field_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_custom_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "company_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      client_history_events: {
        Row: {
          actor_auth_user_id: string | null
          actor_member_id: string | null
          buy_in_status: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          last_contact_at: string | null
          legacy_client_glide_row_id: string
          metadata: Json
          next_contact_at: string | null
          next_steps: string | null
          notes: string | null
          payload: Json
          progress_status: string | null
          source: string
          success_status: string | null
          summary: string | null
          title: string | null
        }
        Insert: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          buy_in_status?: string | null
          company_id: string
          created_at?: string
          event_type?: string
          id?: string
          last_contact_at?: string | null
          legacy_client_glide_row_id: string
          metadata?: Json
          next_contact_at?: string | null
          next_steps?: string | null
          notes?: string | null
          payload?: Json
          progress_status?: string | null
          source?: string
          success_status?: string | null
          summary?: string | null
          title?: string | null
        }
        Update: {
          actor_auth_user_id?: string | null
          actor_member_id?: string | null
          buy_in_status?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_contact_at?: string | null
          legacy_client_glide_row_id?: string
          metadata?: Json
          next_contact_at?: string | null
          next_steps?: string | null
          notes?: string | null
          payload?: Json
          progress_status?: string | null
          source?: string
          success_status?: string | null
          summary?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_history_events_actor_member_id_fkey"
            columns: ["actor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_history_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_links: {
        Row: {
          archived_at: string | null
          client_id: string | null
          company_id: string
          created_at: string
          id: string
          label: string
          legacy_client_glide_row_id: string
          link_type: string
          metadata: Json
          sort_order: number
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          label: string
          legacy_client_glide_row_id: string
          link_type?: string
          metadata?: Json
          sort_order?: number
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          legacy_client_glide_row_id?: string
          link_type?: string
          metadata?: Json
          sort_order?: number
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_milestones: {
        Row: {
          archived_at: string | null
          client_id: string
          company_glide_row_id: string
          company_id: string
          completed_by_member_id: string | null
          completed_by_name: string | null
          completion_date: string | null
          created_at: string
          duration_days: number | null
          glide_row_id: string
          id: string
          initiated_by_member_id: string | null
          initiated_by_name: string | null
          metadata: Json
          milestone_id: string
          notes: string | null
          offer_id: string
          source_snapshot: Json
          start_date: string | null
          time_to_hit_days: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          company_glide_row_id: string
          company_id: string
          completed_by_member_id?: string | null
          completed_by_name?: string | null
          completion_date?: string | null
          created_at?: string
          duration_days?: number | null
          glide_row_id: string
          id?: string
          initiated_by_member_id?: string | null
          initiated_by_name?: string | null
          metadata?: Json
          milestone_id: string
          notes?: string | null
          offer_id: string
          source_snapshot?: Json
          start_date?: string | null
          time_to_hit_days?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          company_glide_row_id?: string
          company_id?: string
          completed_by_member_id?: string | null
          completed_by_name?: string | null
          completion_date?: string | null
          created_at?: string
          duration_days?: number | null
          glide_row_id?: string
          id?: string
          initiated_by_member_id?: string | null
          initiated_by_name?: string | null
          metadata?: Json
          milestone_id?: string
          notes?: string | null
          offer_id?: string
          source_snapshot?: Json
          start_date?: string | null
          time_to_hit_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_milestones_completed_by_member_id_fkey"
            columns: ["completed_by_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_milestones_initiated_by_member_id_fkey"
            columns: ["initiated_by_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          archived_at: string | null
          assigned_to_id: string | null
          client_id: string | null
          company_glide_row_id: string
          company_id: string
          completion_date: string | null
          created_at: string
          created_by_id: string | null
          external_link: string | null
          glide_row_id: string
          id: string
          is_manually_archived: boolean
          metadata: Json
          priority: string | null
          recurring_is_recurring: boolean
          source_snapshot: Json
          start_date: string | null
          status_value: string
          task_description: string | null
          task_due_date: string | null
          task_last_updated_date: string
          task_name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to_id?: string | null
          client_id?: string | null
          company_glide_row_id: string
          company_id: string
          completion_date?: string | null
          created_at?: string
          created_by_id?: string | null
          external_link?: string | null
          glide_row_id: string
          id?: string
          is_manually_archived?: boolean
          metadata?: Json
          priority?: string | null
          recurring_is_recurring?: boolean
          source_snapshot?: Json
          start_date?: string | null
          status_value?: string
          task_description?: string | null
          task_due_date?: string | null
          task_last_updated_date?: string
          task_name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to_id?: string | null
          client_id?: string | null
          company_glide_row_id?: string
          company_id?: string
          completion_date?: string | null
          created_at?: string
          created_by_id?: string | null
          external_link?: string | null
          glide_row_id?: string
          id?: string
          is_manually_archived?: boolean
          metadata?: Json
          priority?: string | null
          recurring_is_recurring?: boolean
          source_snapshot?: Json
          start_date?: string | null
          status_value?: string
          task_description?: string | null
          task_due_date?: string | null
          task_last_updated_date?: string
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_timed_checkpoint_completions: {
        Row: {
          archived_at: string | null
          checkpoint_type: string
          client_id: string | null
          company_glide_row_id: string
          company_id: string
          completed_at: string
          completed_by_member_id: string | null
          completed_by_name: string | null
          created_at: string
          due_at: string
          id: string
          legacy_client_id: string
          metadata: Json
          notes: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          checkpoint_type: string
          client_id?: string | null
          company_glide_row_id: string
          company_id: string
          completed_at?: string
          completed_by_member_id?: string | null
          completed_by_name?: string | null
          created_at?: string
          due_at: string
          id?: string
          legacy_client_id: string
          metadata?: Json
          notes?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          checkpoint_type?: string
          client_id?: string | null
          company_glide_row_id?: string
          company_id?: string
          completed_at?: string
          completed_by_member_id?: string | null
          completed_by_name?: string | null
          created_at?: string
          due_at?: string
          id?: string
          legacy_client_id?: string
          metadata?: Json
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_timed_checkpoint_completions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timed_checkpoint_completions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timed_checkpoint_completions_completed_by_member_id_fkey"
            columns: ["completed_by_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          advocacy_referral_asked_count: number
          advocacy_referral_last_asked_at: string | null
          advocacy_referral_last_note: string | null
          advocacy_referral_last_received_at: string | null
          advocacy_referral_received_count: number
          advocacy_referral_status: string
          advocacy_renewal_upsell_asked_count: number
          advocacy_renewal_upsell_last_asked_at: string | null
          advocacy_renewal_upsell_last_note: string | null
          advocacy_renewal_upsell_last_received_at: string | null
          advocacy_renewal_upsell_received_count: number
          advocacy_renewal_upsell_status: string
          advocacy_review_asked_count: number
          advocacy_review_last_asked_at: string | null
          advocacy_review_last_note: string | null
          advocacy_review_last_received_at: string | null
          advocacy_review_received_count: number
          advocacy_review_status: string
          advocacy_testimonial_asked_count: number
          advocacy_testimonial_last_asked_at: string | null
          advocacy_testimonial_last_note: string | null
          advocacy_testimonial_last_received_at: string | null
          advocacy_testimonial_received_count: number
          advocacy_testimonial_status: string
          archived_at: string | null
          churn_comments: string | null
          churn_reason_value: string | null
          client_age_date_offboarded: string | null
          client_age_date_offboarded_for_filtering: string | null
          client_age_date_onboarded: string | null
          client_archetype_value: string | null
          client_business: string | null
          client_director_notes: string | null
          client_email: string | null
          client_email_secondary: string | null
          client_email_tertiary: string | null
          client_general_info: string | null
          client_image: string | null
          client_name: string
          company_glide_row_id: string
          company_id: string
          created_at: string
          csm_date_of_last_contact: string | null
          csm_date_of_next_contact: string | null
          csm_secondary_assignee_id: string | null
          csm_team_member_id: string | null
          current_contract_auto_renew: boolean | null
          current_contract_end_date: string | null
          current_contract_end_date_for_filtering: string | null
          current_contract_monthly_value: number | null
          current_contract_notes: string | null
          current_contract_of_days: number | null
          current_contract_reference_link: string | null
          current_contract_start_date: string | null
          glide_row_id: string
          id: string
          metadata: Json
          milestone_current_value: string | null
          next_steps_value: string | null
          north_star_value: string | null
          offer_current_value: string | null
          offer_milestones_current_milestone_change_date: string | null
          offer_milestones_current_milestone_id: string | null
          offer_milestones_current_offer_id: string | null
          outcomes_buy_in_date: string | null
          outcomes_buy_in_for_filtering: string | null
          outcomes_buy_in_value: string | null
          outcomes_progress_date: string | null
          outcomes_progress_for_filtering: string | null
          outcomes_progress_value: string | null
          outcomes_success_date: string | null
          outcomes_success_value: string | null
          outcomes_success_value_for_filtering: string | null
          outcomes_suitable_date: string | null
          outcomes_suitable_value: string | null
          program_latest_back_end_start_date: string | null
          program_latest_pause_extension_days: number | null
          program_latest_paused_date: string | null
          program_latest_suspended_date: string | null
          program_paused_return_date: string | null
          program_status_reason: string | null
          program_status_value: string | null
          secondary_offer_milestones_current_milestone_change_date:
            | string
            | null
          secondary_offer_milestones_current_milestone_id: string | null
          secondary_offer_milestones_current_offer_id: string | null
          source_snapshot: Json
          updated_at: string
        }
        Insert: {
          advocacy_referral_asked_count?: number
          advocacy_referral_last_asked_at?: string | null
          advocacy_referral_last_note?: string | null
          advocacy_referral_last_received_at?: string | null
          advocacy_referral_received_count?: number
          advocacy_referral_status?: string
          advocacy_renewal_upsell_asked_count?: number
          advocacy_renewal_upsell_last_asked_at?: string | null
          advocacy_renewal_upsell_last_note?: string | null
          advocacy_renewal_upsell_last_received_at?: string | null
          advocacy_renewal_upsell_received_count?: number
          advocacy_renewal_upsell_status?: string
          advocacy_review_asked_count?: number
          advocacy_review_last_asked_at?: string | null
          advocacy_review_last_note?: string | null
          advocacy_review_last_received_at?: string | null
          advocacy_review_received_count?: number
          advocacy_review_status?: string
          advocacy_testimonial_asked_count?: number
          advocacy_testimonial_last_asked_at?: string | null
          advocacy_testimonial_last_note?: string | null
          advocacy_testimonial_last_received_at?: string | null
          advocacy_testimonial_received_count?: number
          advocacy_testimonial_status?: string
          archived_at?: string | null
          churn_comments?: string | null
          churn_reason_value?: string | null
          client_age_date_offboarded?: string | null
          client_age_date_offboarded_for_filtering?: string | null
          client_age_date_onboarded?: string | null
          client_archetype_value?: string | null
          client_business?: string | null
          client_director_notes?: string | null
          client_email?: string | null
          client_email_secondary?: string | null
          client_email_tertiary?: string | null
          client_general_info?: string | null
          client_image?: string | null
          client_name: string
          company_glide_row_id: string
          company_id: string
          created_at?: string
          csm_date_of_last_contact?: string | null
          csm_date_of_next_contact?: string | null
          csm_secondary_assignee_id?: string | null
          csm_team_member_id?: string | null
          current_contract_auto_renew?: boolean | null
          current_contract_end_date?: string | null
          current_contract_end_date_for_filtering?: string | null
          current_contract_monthly_value?: number | null
          current_contract_notes?: string | null
          current_contract_of_days?: number | null
          current_contract_reference_link?: string | null
          current_contract_start_date?: string | null
          glide_row_id: string
          id?: string
          metadata?: Json
          milestone_current_value?: string | null
          next_steps_value?: string | null
          north_star_value?: string | null
          offer_current_value?: string | null
          offer_milestones_current_milestone_change_date?: string | null
          offer_milestones_current_milestone_id?: string | null
          offer_milestones_current_offer_id?: string | null
          outcomes_buy_in_date?: string | null
          outcomes_buy_in_for_filtering?: string | null
          outcomes_buy_in_value?: string | null
          outcomes_progress_date?: string | null
          outcomes_progress_for_filtering?: string | null
          outcomes_progress_value?: string | null
          outcomes_success_date?: string | null
          outcomes_success_value?: string | null
          outcomes_success_value_for_filtering?: string | null
          outcomes_suitable_date?: string | null
          outcomes_suitable_value?: string | null
          program_latest_back_end_start_date?: string | null
          program_latest_pause_extension_days?: number | null
          program_latest_paused_date?: string | null
          program_latest_suspended_date?: string | null
          program_paused_return_date?: string | null
          program_status_reason?: string | null
          program_status_value?: string | null
          secondary_offer_milestones_current_milestone_change_date?:
            | string
            | null
          secondary_offer_milestones_current_milestone_id?: string | null
          secondary_offer_milestones_current_offer_id?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Update: {
          advocacy_referral_asked_count?: number
          advocacy_referral_last_asked_at?: string | null
          advocacy_referral_last_note?: string | null
          advocacy_referral_last_received_at?: string | null
          advocacy_referral_received_count?: number
          advocacy_referral_status?: string
          advocacy_renewal_upsell_asked_count?: number
          advocacy_renewal_upsell_last_asked_at?: string | null
          advocacy_renewal_upsell_last_note?: string | null
          advocacy_renewal_upsell_last_received_at?: string | null
          advocacy_renewal_upsell_received_count?: number
          advocacy_renewal_upsell_status?: string
          advocacy_review_asked_count?: number
          advocacy_review_last_asked_at?: string | null
          advocacy_review_last_note?: string | null
          advocacy_review_last_received_at?: string | null
          advocacy_review_received_count?: number
          advocacy_review_status?: string
          advocacy_testimonial_asked_count?: number
          advocacy_testimonial_last_asked_at?: string | null
          advocacy_testimonial_last_note?: string | null
          advocacy_testimonial_last_received_at?: string | null
          advocacy_testimonial_received_count?: number
          advocacy_testimonial_status?: string
          archived_at?: string | null
          churn_comments?: string | null
          churn_reason_value?: string | null
          client_age_date_offboarded?: string | null
          client_age_date_offboarded_for_filtering?: string | null
          client_age_date_onboarded?: string | null
          client_archetype_value?: string | null
          client_business?: string | null
          client_director_notes?: string | null
          client_email?: string | null
          client_email_secondary?: string | null
          client_email_tertiary?: string | null
          client_general_info?: string | null
          client_image?: string | null
          client_name?: string
          company_glide_row_id?: string
          company_id?: string
          created_at?: string
          csm_date_of_last_contact?: string | null
          csm_date_of_next_contact?: string | null
          csm_secondary_assignee_id?: string | null
          csm_team_member_id?: string | null
          current_contract_auto_renew?: boolean | null
          current_contract_end_date?: string | null
          current_contract_end_date_for_filtering?: string | null
          current_contract_monthly_value?: number | null
          current_contract_notes?: string | null
          current_contract_of_days?: number | null
          current_contract_reference_link?: string | null
          current_contract_start_date?: string | null
          glide_row_id?: string
          id?: string
          metadata?: Json
          milestone_current_value?: string | null
          next_steps_value?: string | null
          north_star_value?: string | null
          offer_current_value?: string | null
          offer_milestones_current_milestone_change_date?: string | null
          offer_milestones_current_milestone_id?: string | null
          offer_milestones_current_offer_id?: string | null
          outcomes_buy_in_date?: string | null
          outcomes_buy_in_for_filtering?: string | null
          outcomes_buy_in_value?: string | null
          outcomes_progress_date?: string | null
          outcomes_progress_for_filtering?: string | null
          outcomes_progress_value?: string | null
          outcomes_success_date?: string | null
          outcomes_success_value?: string | null
          outcomes_success_value_for_filtering?: string | null
          outcomes_suitable_date?: string | null
          outcomes_suitable_value?: string | null
          program_latest_back_end_start_date?: string | null
          program_latest_pause_extension_days?: number | null
          program_latest_paused_date?: string | null
          program_latest_suspended_date?: string | null
          program_paused_return_date?: string | null
          program_status_reason?: string | null
          program_status_value?: string | null
          secondary_offer_milestones_current_milestone_change_date?:
            | string
            | null
          secondary_offer_milestones_current_milestone_id?: string | null
          secondary_offer_milestones_current_offer_id?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archived_at: string | null
          created_at: string
          enable_archetypes: boolean
          enable_call_ai_for_csms: boolean
          enable_secondary_assignee: boolean
          enable_secondary_offers: boolean
          id: string
          legacy_glide_row_id: string | null
          logo_url: string | null
          metadata: Json
          migration_status: string
          name: string
          public_company_id: string
          status: string
          subscription_tier: string | null
          updated_at: string
          view_override: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          enable_archetypes?: boolean
          enable_call_ai_for_csms?: boolean
          enable_secondary_assignee?: boolean
          enable_secondary_offers?: boolean
          id?: string
          legacy_glide_row_id?: string | null
          logo_url?: string | null
          metadata?: Json
          migration_status?: string
          name: string
          public_company_id?: string
          status?: string
          subscription_tier?: string | null
          updated_at?: string
          view_override?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          enable_archetypes?: boolean
          enable_call_ai_for_csms?: boolean
          enable_secondary_assignee?: boolean
          enable_secondary_offers?: boolean
          id?: string
          legacy_glide_row_id?: string | null
          logo_url?: string | null
          metadata?: Json
          migration_status?: string
          name?: string
          public_company_id?: string
          status?: string
          subscription_tier?: string | null
          updated_at?: string
          view_override?: string | null
        }
        Relationships: []
      }
      "Company -> Clients -> AI Analysis -> On-demand": {
        Row: {
          "Admin Access ID": string | null
          "Call / ID": string | null
          "Company / ID": string | null
          glide_row_id: string | null
          id: string
          "Prompt / ID": string | null
          "Prompt / Name": string | null
          "Prompt / Prompt": string | null
          Result: string | null
        }
        Insert: {
          "Admin Access ID"?: string | null
          "Call / ID"?: string | null
          "Company / ID"?: string | null
          glide_row_id?: string | null
          id?: string
          "Prompt / ID"?: string | null
          "Prompt / Name"?: string | null
          "Prompt / Prompt"?: string | null
          Result?: string | null
        }
        Update: {
          "Admin Access ID"?: string | null
          "Call / ID"?: string | null
          "Company / ID"?: string | null
          glide_row_id?: string | null
          id?: string
          "Prompt / ID"?: string | null
          "Prompt / Name"?: string | null
          "Prompt / Prompt"?: string | null
          Result?: string | null
        }
        Relationships: []
      }
      company_churn_reasons: {
        Row: {
          archived_at: string | null
          category: string | null
          company_id: string
          counts_as_churn: boolean
          created_at: string
          id: string
          label: string
          metadata: Json
          position: number
          requires_notes: boolean
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          company_id: string
          counts_as_churn?: boolean
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          position?: number
          requires_notes?: boolean
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          company_id?: string
          counts_as_churn?: boolean
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          position?: number
          requires_notes?: boolean
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_churn_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_clients_ai_analysis: {
        Row: {
          data: Json
          glide_row_id: string
          synced_at: string
        }
        Insert: {
          data: Json
          glide_row_id: string
          synced_at?: string
        }
        Update: {
          data?: Json
          glide_row_id?: string
          synced_at?: string
        }
        Relationships: []
      }
      company_contract_templates: {
        Row: {
          applies_to_offer_id: string
          archived_at: string | null
          auto_renew: boolean
          company_id: string
          contract_days: number
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          metadata: Json
          monthly_value: number | null
          name: string
          notes: string | null
          position: number
          reference_link: string | null
          updated_at: string
        }
        Insert: {
          applies_to_offer_id: string
          archived_at?: string | null
          auto_renew?: boolean
          company_id: string
          contract_days: number
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json
          monthly_value?: number | null
          name: string
          notes?: string | null
          position?: number
          reference_link?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_offer_id?: string
          archived_at?: string | null
          auto_renew?: boolean
          company_id?: string
          contract_days?: number
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json
          monthly_value?: number | null
          name?: string
          notes?: string | null
          position?: number
          reference_link?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_custom_fields: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          description: string | null
          entity_type: string
          field_type: string
          id: string
          is_editable_by_csm: boolean
          is_required: boolean
          is_visible_on_client_detail: boolean
          is_visible_on_client_list: boolean
          key: string
          label: string
          metadata: Json
          options: Json
          position: number
          source_key: string | null
          source_table: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          entity_type?: string
          field_type?: string
          id?: string
          is_editable_by_csm?: boolean
          is_required?: boolean
          is_visible_on_client_detail?: boolean
          is_visible_on_client_list?: boolean
          key: string
          label: string
          metadata?: Json
          options?: Json
          position?: number
          source_key?: string | null
          source_table?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          entity_type?: string
          field_type?: string
          id?: string
          is_editable_by_csm?: boolean
          is_required?: boolean
          is_visible_on_client_detail?: boolean
          is_visible_on_client_list?: boolean
          key?: string
          label?: string
          metadata?: Json
          options?: Json
          position?: number
          source_key?: string | null
          source_table?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_integration_secrets: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          integration_type: string
          label: string
          last_used_at: string | null
          last_used_from: string | null
          metadata: Json
          revoked_at: string | null
          status: string
          token_hash: string
          token_prefix: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_type: string
          label?: string
          last_used_at?: string | null
          last_used_from?: string | null
          metadata?: Json
          revoked_at?: string | null
          status?: string
          token_hash: string
          token_prefix?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          integration_type?: string
          label?: string
          last_used_at?: string | null
          last_used_from?: string | null
          metadata?: Json
          revoked_at?: string | null
          status?: string
          token_hash?: string
          token_prefix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_integration_secrets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          archived_at: string | null
          auth_user_id: string | null
          capacity_number: number | null
          company_id: string
          created_at: string
          email: string
          hide_from_csm_list: boolean
          id: string
          is_read_only: boolean
          legacy_glide_row_id: string | null
          metadata: Json
          name: string | null
          photo_url: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auth_user_id?: string | null
          capacity_number?: number | null
          company_id: string
          created_at?: string
          email: string
          hide_from_csm_list?: boolean
          id?: string
          is_read_only?: boolean
          legacy_glide_row_id?: string | null
          metadata?: Json
          name?: string | null
          photo_url?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auth_user_id?: string | null
          capacity_number?: number | null
          company_id?: string
          created_at?: string
          email?: string
          hide_from_csm_list?: boolean
          id?: string
          is_read_only?: boolean
          legacy_glide_row_id?: string | null
          metadata?: Json
          name?: string | null
          photo_url?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_offer_milestones: {
        Row: {
          archived_at: string | null
          company_glide_row_id: string
          company_id: string
          created_at: string
          glide_row_id: string
          id: string
          is_final_milestone: boolean
          is_ttv_milestone: boolean
          legacy_glide_row_id: string | null
          metadata: Json
          name: string
          offer_id: string
          position: number
          status: string
          target_days_to_complete: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_glide_row_id: string
          company_id: string
          created_at?: string
          glide_row_id: string
          id?: string
          is_final_milestone?: boolean
          is_ttv_milestone?: boolean
          legacy_glide_row_id?: string | null
          metadata?: Json
          name: string
          offer_id: string
          position?: number
          status?: string
          target_days_to_complete?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_glide_row_id?: string
          company_id?: string
          created_at?: string
          glide_row_id?: string
          id?: string
          is_final_milestone?: boolean
          is_ttv_milestone?: boolean
          legacy_glide_row_id?: string | null
          metadata?: Json
          name?: string
          offer_id?: string
          position?: number
          status?: string
          target_days_to_complete?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_offer_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_offer_milestones_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "company_offers"
            referencedColumns: ["glide_row_id"]
          },
        ]
      }
      company_offers: {
        Row: {
          archived_at: string | null
          company_glide_row_id: string
          company_id: string
          created_at: string
          glide_row_id: string
          id: string
          legacy_glide_row_id: string | null
          metadata: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_glide_row_id: string
          company_id: string
          created_at?: string
          glide_row_id: string
          id?: string
          legacy_glide_row_id?: string | null
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_glide_row_id?: string
          company_id?: string
          created_at?: string
          glide_row_id?: string
          id?: string
          legacy_glide_row_id?: string | null
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_outcome_definitions: {
        Row: {
          archived_at: string | null
          color: string | null
          company_id: string
          created_at: string
          emoji: string | null
          id: string
          is_default: boolean
          label: string
          metadata: Json
          outcome_type: string
          position: number
          positive_rank: number | null
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean
          label: string
          metadata?: Json
          outcome_type: string
          position?: number
          positive_rank?: number | null
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean
          label?: string
          metadata?: Json
          outcome_type?: string
          position?: number
          positive_rank?: number | null
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_outcome_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          allow_status_change_retention: boolean
          company_id: string
          created_at: string
          dashboard_default_tab: string
          default_calendar_mode: string
          default_client_view: string
          enable_archetypes: boolean
          enable_call_ai_for_csms: boolean
          enable_embeds: boolean
          enable_secondary_assignee: boolean
          enable_secondary_offers: boolean
          enable_zapier_client_create: boolean
          id: string
          metadata: Json
          profile_upkeep_freshness_days: number
          updated_at: string
        }
        Insert: {
          allow_status_change_retention?: boolean
          company_id: string
          created_at?: string
          dashboard_default_tab?: string
          default_calendar_mode?: string
          default_client_view?: string
          enable_archetypes?: boolean
          enable_call_ai_for_csms?: boolean
          enable_embeds?: boolean
          enable_secondary_assignee?: boolean
          enable_secondary_offers?: boolean
          enable_zapier_client_create?: boolean
          id?: string
          metadata?: Json
          profile_upkeep_freshness_days?: number
          updated_at?: string
        }
        Update: {
          allow_status_change_retention?: boolean
          company_id?: string
          created_at?: string
          dashboard_default_tab?: string
          default_calendar_mode?: string
          default_client_view?: string
          enable_archetypes?: boolean
          enable_call_ai_for_csms?: boolean
          enable_embeds?: boolean
          enable_secondary_assignee?: boolean
          enable_secondary_offers?: boolean
          enable_zapier_client_create?: boolean
          id?: string
          metadata?: Json
          profile_upkeep_freshness_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_task_templates: {
        Row: {
          applies_to_milestone_id: string | null
          applies_to_offer_id: string | null
          archived_at: string | null
          assign_to_type: string
          assigned_member_legacy_id: string | null
          company_id: string
          created_at: string
          description: string | null
          due_offset_days: number
          id: string
          is_enabled: boolean
          metadata: Json
          name: string
          position: number
          priority: string | null
          recurring_interval_days: number | null
          recurring_is_recurring: boolean
          status_value: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          applies_to_milestone_id?: string | null
          applies_to_offer_id?: string | null
          archived_at?: string | null
          assign_to_type?: string
          assigned_member_legacy_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_enabled?: boolean
          metadata?: Json
          name: string
          position?: number
          priority?: string | null
          recurring_interval_days?: number | null
          recurring_is_recurring?: boolean
          status_value?: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          applies_to_milestone_id?: string | null
          applies_to_offer_id?: string | null
          archived_at?: string | null
          assign_to_type?: string
          assigned_member_legacy_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_enabled?: boolean
          metadata?: Json
          name?: string
          position?: number
          priority?: string | null
          recurring_interval_days?: number | null
          recurring_is_recurring?: boolean
          status_value?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_task_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      glide_companies: {
        Row: {
          admin_access_id: string
          data: Json
          synced_at: string
        }
        Insert: {
          admin_access_id: string
          data: Json
          synced_at?: string
        }
        Update: {
          admin_access_id?: string
          data?: Json
          synced_at?: string
        }
        Relationships: []
      }
      glide_rows: {
        Row: {
          data: Json
          glide_row_id: string
          glide_table_id: string
          id: string
          sync_run_id: string | null
          synced_at: string
        }
        Insert: {
          data: Json
          glide_row_id: string
          glide_table_id: string
          id?: string
          sync_run_id?: string | null
          synced_at?: string
        }
        Update: {
          data?: Json
          glide_row_id?: string
          glide_table_id?: string
          id?: string
          sync_run_id?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "glide_rows_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "glide_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      glide_sync_jobs: {
        Row: {
          batch_count: number
          continuation: string | null
          created_by: string | null
          error_count: number
          finished_at: string | null
          glide_table_id: string
          id: string
          last_error: string | null
          last_progress_at: string
          needs_restart_from_top: boolean
          pages_total: number
          rows_fetched_total: number
          rows_upserted_total: number
          started_at: string
          status: string
        }
        Insert: {
          batch_count?: number
          continuation?: string | null
          created_by?: string | null
          error_count?: number
          finished_at?: string | null
          glide_table_id: string
          id?: string
          last_error?: string | null
          last_progress_at?: string
          needs_restart_from_top?: boolean
          pages_total?: number
          rows_fetched_total?: number
          rows_upserted_total?: number
          started_at?: string
          status?: string
        }
        Update: {
          batch_count?: number
          continuation?: string | null
          created_by?: string | null
          error_count?: number
          finished_at?: string | null
          glide_table_id?: string
          id?: string
          last_error?: string | null
          last_progress_at?: string
          needs_restart_from_top?: boolean
          pages_total?: number
          rows_fetched_total?: number
          rows_upserted_total?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      glide_sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          glide_table_id: string
          id: string
          job_id: string | null
          pages_fetched: number
          rows_fetched: number
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          glide_table_id: string
          id?: string
          job_id?: string | null
          pages_fetched?: number
          rows_fetched?: number
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          glide_table_id?: string
          id?: string
          job_id?: string | null
          pages_fetched?: number
          rows_fetched?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "glide_sync_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "glide_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      glide_tables: {
        Row: {
          column_map: Json | null
          created_at: string
          glide_table_id: string
          id: string
          name: string | null
          target_table: string | null
        }
        Insert: {
          column_map?: Json | null
          created_at?: string
          glide_table_id: string
          id?: string
          name?: string | null
          target_table?: string | null
        }
        Update: {
          column_map?: Json | null
          created_at?: string
          glide_table_id?: string
          id?: string
          name?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      integration_intake_events: {
        Row: {
          company_id: string | null
          created_at: string
          error_message: string | null
          external_event_id: string | null
          id: string
          integration_type: string
          legacy_company_glide_row_id: string | null
          match_status: string
          matched_by: string | null
          matched_client_id: string | null
          matched_legacy_client_glide_row_id: string | null
          metadata: Json
          payload: Json
          processed_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          external_event_id?: string | null
          id?: string
          integration_type: string
          legacy_company_glide_row_id?: string | null
          match_status?: string
          matched_by?: string | null
          matched_client_id?: string | null
          matched_legacy_client_glide_row_id?: string | null
          metadata?: Json
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          external_event_id?: string | null
          id?: string
          integration_type?: string
          legacy_company_glide_row_id?: string | null
          match_status?: string
          matched_by?: string | null
          matched_client_id?: string | null
          matched_legacy_client_glide_row_id?: string | null
          metadata?: Json
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_intake_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          company_id: string
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          lead_days: number
          member_id: string | null
          metadata: Json
          notification_type: string
          quiet_hours: Json | null
          repeat_interval_days: number | null
          role: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          lead_days?: number
          member_id?: string | null
          metadata?: Json
          notification_type: string
          quiet_hours?: Json | null
          repeat_interval_days?: number | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          lead_days?: number
          member_id?: string | null
          metadata?: Json
          notification_type?: string
          quiet_hours?: Json | null
          repeat_interval_days?: number | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          client_id: string | null
          company_id: string
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          due_at: string | null
          entity_id: string | null
          entity_table: string | null
          id: string
          legacy_client_id: string | null
          metadata: Json
          read_at: string | null
          recipient_member_id: string | null
          recipient_role: string | null
          resolved_at: string | null
          scope: string
          severity: string
          title: string
          triggered_at: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          legacy_client_id?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_member_id?: string | null
          recipient_role?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          title: string
          triggered_at?: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          legacy_client_id?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_member_id?: string | null
          recipient_role?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          title?: string
          triggered_at?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          company_legacy_id: string | null
          content: string
          created_at: string
          description: string
          dynamic_key: string | null
          id: string
          is_dynamic: boolean
          loom_embed_url: string | null
          scope: string
          slug: string
          sort_order: number
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          company_legacy_id?: string | null
          content?: string
          created_at?: string
          description?: string
          dynamic_key?: string | null
          id?: string
          is_dynamic?: boolean
          loom_embed_url?: string | null
          scope?: string
          slug: string
          sort_order?: number
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_legacy_id?: string | null
          content?: string
          created_at?: string
          description?: string
          dynamic_key?: string | null
          id?: string
          is_dynamic?: boolean
          loom_embed_url?: string | null
          scope?: string
          slug?: string
          sort_order?: number
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      retainos_super_admins: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_rollout_history: {
        Row: {
          applied_at: string
          applied_by: string
          details: Json
          migration_name: string
          version: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string
          details?: Json
          migration_name: string
          version: string
        }
        Update: {
          applied_at?: string
          applied_by?: string
          details?: Json
          migration_name?: string
          version?: string
        }
        Relationships: []
      }
      sync_config: {
        Row: {
          active: boolean
          created_at: string
          glide_app_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          glide_app_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          glide_app_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_table_list: {
        Row: {
          backup_table_name: string | null
          created_at: string
          glide_table_id: string
          glide_table_name: string | null
          hidden: boolean
          id: string
          last_discovered_at: string | null
          last_schema_hash: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          sync_config_id: string
          sync_continuation: string | null
          updated_at: string
        }
        Insert: {
          backup_table_name?: string | null
          created_at?: string
          glide_table_id: string
          glide_table_name?: string | null
          hidden?: boolean
          id?: string
          last_discovered_at?: string | null
          last_schema_hash?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          sync_config_id: string
          sync_continuation?: string | null
          updated_at?: string
        }
        Update: {
          backup_table_name?: string | null
          created_at?: string
          glide_table_id?: string
          glide_table_name?: string | null
          hidden?: boolean
          id?: string
          last_discovered_at?: string | null
          last_schema_hash?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          sync_config_id?: string
          sync_continuation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_table_list_sync_config_id_fkey"
            columns: ["sync_config_id"]
            isOneToOne: false
            referencedRelation: "sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _generate_company_notifications_unchecked: {
        Args: {
          p_company_id: string
          p_window_end?: string
          p_window_start?: string
        }
        Returns: number
      }
      _glide_chain_tick: { Args: never; Returns: undefined }
      _set_chain_secret: { Args: { secret_value: string }; Returns: undefined }
      can_read_app_client: {
        Args: { target_client_id: string }
        Returns: boolean
      }
      can_read_app_client_legacy: {
        Args: { target_client_legacy_id: string; target_company_id: string }
        Returns: boolean
      }
      can_read_app_company: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      can_read_company: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      can_read_company_legacy: {
        Args: { target_company_legacy_id: string }
        Returns: boolean
      }
      can_read_mirror_client: {
        Args: {
          target_client_legacy_id: string
          target_company_legacy_id: string
        }
        Returns: boolean
      }
      can_read_mirror_company: {
        Args: { target_company_legacy_id: string }
        Returns: boolean
      }
      current_actor_app_policy_company_id: { Args: never; Returns: string }
      current_actor_app_policy_company_legacy_id: {
        Args: never
        Returns: string
      }
      current_actor_app_policy_member_ids: { Args: never; Returns: string[] }
      current_actor_app_policy_role: { Args: never; Returns: string }
      current_actor_app_scope: {
        Args: never
        Returns: {
          scope_company_id: string
          scope_company_legacy_id: string
          scope_member_id: string
          scope_member_legacy_id: string
          scope_role: string
        }[]
      }
      current_actor_effective_policy_company_legacy_id: {
        Args: never
        Returns: string
      }
      current_actor_effective_policy_role: { Args: never; Returns: string }
      current_actor_mirror_scope: {
        Args: never
        Returns: {
          scope_company_legacy_id: string
          scope_member_legacy_id: string
          scope_role: string
        }[]
      }
      current_member_company_ids: { Args: never; Returns: string[] }
      dashboard_authorized_app_clients: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          client_age_date_offboarded: string
          client_age_date_offboarded_for_filtering: string
          client_age_date_onboarded: string
          company_id: string
          company_legacy_id: string
          csm_secondary_assignee_id: string
          csm_team_member_id: string
          current_contract_end_date: string
          current_contract_of_days: number
          current_contract_start_date: string
          glide_row_id: string
          offer_milestones_current_milestone_id: string
          offer_milestones_current_offer_id: string
          outcomes_buy_in_for_filtering: string
          outcomes_progress_for_filtering: string
          program_status_value: string
        }[]
      }
      dashboard_chart_rollups_actor_scoped: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          bucket_key: string
          bucket_label: string
          capacity: number
          metric: string
          value: number
        }[]
      }
      dashboard_churn_reason_rollup_actor_scoped: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          bucket_key: string
          bucket_label: string
          capacity: number
          metric: string
          value: number
        }[]
      }
      dashboard_clients_list: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_detail_key: string
          p_limit?: number
          p_offset?: number
          p_program_value?: string
          p_search?: string
          p_secondary_assignee_id?: string
        }
        Returns: {
          client_image: string
          client_name: string
          csm_team_member_id: string
          glide_row_id: string
          total_count: number
        }[]
      }
      dashboard_kpi_counts: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_program_value?: string
          p_secondary_assignee_id?: string
        }
        Returns: {
          active_clients: number
          back_end_clients: number
          churn_percentage: number
          churned_clients: number
          front_end_clients: number
          off_boarded_clients: number
          renewing_clients: number
          retained_clients: number
          retention_percentage: number
        }[]
      }
      dashboard_kpi_counts_actor_scoped: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          active_clients: number
          active_renewing_clients: number
          back_end_clients: number
          churn_percentage: number
          churned_clients: number
          front_end_clients: number
          off_boarded_clients: number
          paused_clients: number
          renewing_clients: number
          retained_clients: number
          retention_percentage: number
          suspended_clients: number
        }[]
      }
      dashboard_kpi_counts_canonical: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          active_clients: number
          active_renewing_clients: number
          back_end_clients: number
          churn_percentage: number
          churned_clients: number
          front_end_clients: number
          off_boarded_clients: number
          paused_clients: number
          renewing_clients: number
          retained_clients: number
          retention_percentage: number
          suspended_clients: number
        }[]
      }
      dashboard_kpi_counts_primary: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_program_value?: string
          p_secondary_assignee_id?: string
        }
        Returns: {
          active_clients: number
          back_end_clients: number
          churn_percentage: number
          churned_clients: number
          front_end_clients: number
          off_boarded_clients: number
        }[]
      }
      dashboard_kpi_counts_retention: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_program_value?: string
          p_secondary_assignee_id?: string
        }
        Returns: {
          active_renewing_clients: number
          renewing_clients: number
          retained_clients: number
          retention_percentage: number
        }[]
      }
      dashboard_overview_rollups_actor_scoped: {
        Args: {
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          advocacy: Json
          ttv: Json
        }[]
      }
      dashboard_retention_counts_fast: {
        Args: {
          p_assigned_team_member_id?: string
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          retained_client_ids: string[]
          retained_clients: number
          retained_events: Json
        }[]
      }
      dashboard_renewal_cohort_counts_fast: {
        Args: {
          p_assigned_team_member_id?: string
          p_client_start_date_from?: string
          p_client_start_date_to?: string
          p_company_id: string
          p_csm_id?: string
          p_date_range_end?: string
          p_date_range_start?: string
          p_offer_id?: string
          p_program_values?: string[]
          p_secondary_assignee_id?: string
        }
        Returns: {
          renewal_cohort_client_ids: string[]
          renewal_cohort_clients: number
          renewal_cohort_events: Json
          retained_client_ids: string[]
          retained_clients: number
          retained_events: Json
        }[]
      }
      exec_sql: { Args: { sql: string }; Returns: undefined }
      generate_company_notifications: {
        Args: {
          p_company_id: string
          p_window_end?: string
          p_window_start?: string
        }
        Returns: number
      }
      get_table_row_estimate: { Args: { p_table: string }; Returns: number }
      is_retainos_super_admin: { Args: never; Returns: boolean }
      is_retainos_super_admin_bound: { Args: never; Returns: boolean }
      resolve_current_account: {
        Args: never
        Returns: {
          account_role: string
          company_legacy_id: string
          membership_source: string
          team_member_id: string
        }[]
      }
      search_client_notes: {
        Args: {
          p_assigned_team_member_id?: string
          p_buy_in_status?: string
          p_client_name?: string
          p_company_id: string
          p_csm_id?: string
          p_last_contact_age?: string
          p_limit?: number
          p_milestone_id?: string
          p_next_contact_window?: string
          p_offer_id?: string
          p_offset?: number
          p_program_values?: string[]
          p_progress_status?: string
          p_referral_advocacy_status?: string
          p_renewal_upsell_advocacy_status?: string
          p_renewal_window?: string
          p_review_advocacy_status?: string
          p_search: string
          p_secondary_assignee_id?: string
          p_success_status?: string
          p_testimonial_advocacy_status?: string
        }
        Returns: {
          client_id: string
          client_image: string
          client_name: string
          csm_team_member_id: string
          event_date: string
          matched_text: string
          source_key: string
          source_label: string
          source_type: string
          total_count: number
        }[]
      }
      seed_default_notification_preferences: {
        Args: { p_company_id: string }
        Returns: undefined
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
    Enums: {},
  },
} as const
