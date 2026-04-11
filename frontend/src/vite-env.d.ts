interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
  readonly VITE_AI_REQUEST_DELAY_HOURS?: string
  readonly VITE_RESCORE_DELAY_HOURS?: string // deprecated alias, kept for fallback
  readonly VITE_JOB_DESCRIPTION_MAX_CHARS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
