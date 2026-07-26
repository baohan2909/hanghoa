import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, DB_SCHEMA } from './config'

// db.schema => supabase-js tự gửi header Accept-Profile / Content-Profile: care
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: DB_SCHEMA },
  auth: { persistSession: false }
})
