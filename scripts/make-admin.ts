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
  // exact match first, then a case-insensitive match only when it is unique
  const exact = await supabase.from('players').select('id, username').eq('username', username).maybeSingle()
  if (exact.error) {
    console.error(exact.error.message)
    process.exit(1)
  }
  let data = exact.data
  if (!data) {
    const matches: { id: string; username: string }[] = []
    for (let from = 0; ; from += 1000) {
      const page = await supabase.from('players').select('id, username').order('id').range(from, from + 999)
      if (page.error) {
        console.error(page.error.message)
        process.exit(1)
      }
      matches.push(...page.data.filter((p) => p.username.toLowerCase() === username.toLowerCase()))
      if (page.data.length < 1000) break
    }
    if (matches.length > 1) {
      console.error(`ambiguous username (${matches.map((p) => p.username).join(', ')}): use the exact spelling`)
      process.exit(1)
    }
    data = matches[0] ?? null
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
