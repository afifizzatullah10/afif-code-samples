export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'dropdown'
  | 'rating'
  | 'nps'
  | 'opinion_scale'
  | 'yes_no'
  | 'number'
  | 'statement'
  | 'email'
  | 'url'
  | 'phone'
  | 'date'
  | 'legal'

export interface ScaleConfig {
  min: number
  max: number
  min_label?: string
  max_label?: string
}

export interface DiscussionGuideQuestion {
  id: string
  text: string
  text_id?: string
  description?: string
  /** Optional image above the prompt — only used for short_text / long_text (public HTTPS URL). */
  image_url?: string | null
  type: QuestionType
  required: boolean
  options?: string[] | null
  allow_multiple?: boolean
  /** Show an additional configurable "Others" option for multiple_choice / dropdown. */
  allow_other_option?: boolean
  /** Label shown for the additional option (defaults to "Others"). */
  other_option_label?: string | null
  /** Whether respondents must type a value after selecting the Others option. */
  require_other_text?: boolean
  scale?: ScaleConfig | null
  ai_follow_up_enabled: boolean
  follow_up_instructions?: string | null
  max_follow_ups: number
}

export interface DiscussionGuide {
  questions: DiscussionGuideQuestion[]
  system_instructions: string
  estimated_duration_minutes: number
  /** True when the guide was first created via generate-guide (stored in JSON with the form). */
  created_with_ai?: boolean
}

export interface FormBranding {
  logo_url?: string
  /** Optional hero image on the respondent welcome screen (HTTPS URL). */
  welcome_image_url?: string
  primary_color?: string
  company_name?: string
  /** Whether AI read aloud starts enabled for respondents on first load. */
  ai_read_aloud_enabled?: boolean
}

export interface Form {
  id: string
  user_id: string
  title: string
  objective: string
  language: 'en' | 'id'
  discussion_guide: DiscussionGuide | null
  welcome_message: string | null
  thank_you_message: string
  redirect_url: string | null
  status: 'draft' | 'active' | 'paused' | 'completed'
  max_responses: number | null
  share_slug: string | null
  branding: FormBranding
  created_at: string
  updated_at: string
}

// Backward-compatible aliases while renaming internals.
export type StudyBranding = FormBranding
export type Study = Form

export interface TranscriptMessage {
  role: 'ai' | 'user'
  content: string
  timestamp: string
  /** Optional base64-encoded TTS audio for this AI message. */
  audio_base64?: string
  /** AI line from one-question flow: planned question vs generated follow-up */
  source?: 'question' | 'ai_follow_up'
  /** Stable guide question id for planned question lines. */
  question_id?: string
}

export interface RespondentMetadata {
  device?: string
  browser?: string
  language?: string
}

export interface Response {
  id: string
  form_id: string
  respondent_name: string | null
  respondent_metadata: RespondentMetadata
  transcript: TranscriptMessage[]
  status: 'in_progress' | 'completed' | 'abandoned'
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  ai_summary: string | null
  created_at: string
}

export interface ThemeQuote {
  text: string
  respondent: string
}

export interface InsightTheme {
  name: string
  description: string
  respondent_count: number
  quotes: ThemeQuote[]
}

export interface InsightRecommendation {
  title: string
  description: string
}

export interface InsightContent {
  themes?: InsightTheme[]
  executive_summary?: string
  recommendations?: InsightRecommendation[]
}

export interface FormInsight {
  id: string
  form_id: string
  insight_type: 'themes' | 'summary' | 'recommendations'
  content: InsightContent
  response_count: number
  generated_at: string
}

export type StudyInsight = FormInsight

export interface FormWithResponseCount extends Form {
  response_count: number
}

export type StudyWithResponseCount = FormWithResponseCount

export interface FormAnswer {
  questionId: string
  questionText: string
  answer: string
  followUps: { question: string; answer: string }[]
  timestamp: string
}

export type FormStatus =
  | 'welcome'
  | 'answering'
  | 'evaluating'
  | 'transitioning'
  | 'complete'
  | 'error'

export interface AdminUserRow {
  id: string
  email: string
  created_at: string
  forms_count: number
  responses_count: number
  last_activity_at: string | null
}

export interface AdminUsersResponse {
  rows: AdminUserRow[]
  total: number
}

export interface AdminFormRow {
  id: string
  title: string
  owner_id: string
  owner_email: string | null
  status: Form['status']
  language: Form['language']
  responses_count: number
  completion_rate: number
  last_response_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminFormsResponse {
  rows: AdminFormRow[]
  total: number
}

export interface AdminResponseRow {
  id: string
  form_id: string
  form_title: string
  form_language: Form['language']
  form_status: Form['status']
  status: Response['status']
  respondent_name: string | null
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  created_at: string
  transcript_preview: string[]
}

export interface AdminResponsesResponse {
  rows: AdminResponseRow[]
  total: number
}

export interface AdminWaitlistRow {
  id: string
  email: string
  created_at: string
}

export interface AdminWaitlistResponse {
  rows: AdminWaitlistRow[]
  total: number
}

export interface AdminHealthResponse {
  totals: {
    forms: number
    responses: number
  }
  forms_by_status: Record<string, number>
  responses_by_status: Record<string, number>
  avg_completed_duration_seconds: number | null
  ai_summary_coverage_percent: number
  failed_requests_proxy: {
    last_24h: number
    last_7d: number
    note: string
  }
  edge_function_errors: Record<string, number | null>
}
