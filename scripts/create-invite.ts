import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })
import { createClient } from '@supabase/supabase-js'

const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
async function main() {
  const { error } = await supabase.from('invite_codes').insert({ code })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log(code)
}

main()
