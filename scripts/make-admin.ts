import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  const username = process.argv[2]
  if (!username) {
    console.error('usage: npm run admin -- <username>')
    process.exit(1)
  }
  const { data, error } = await supabase.from('players').select('id, username').ilike('username', username).maybeSingle()
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  if (!data) {
    console.error(`unknown player: ${username}`)
    process.exit(1)
  }
  const { error: insErr } = await supabase.from('admins').upsert({ player_id: data.id })
  if (insErr) {
    console.error(insErr.message)
    process.exit(1)
  }
  console.log(`admin: ${data.username}`)
}

main()
