import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey

// If env vars are missing, export a dummy client — the app will show an error
// banner via supabaseMisconfigured before any real calls are made.
export const supabase = supabaseMisconfigured
  ? createClient('https://placeholder.supabase.co', 'placeholder')
  : createClient(supabaseUrl!, supabaseAnonKey!)
