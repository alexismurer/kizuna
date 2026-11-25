import { createClient } from "@supabase/supabase-js";

// The service-role client, for server code only: reads data that is the same for every
// player (the catalogue, the boosters) inside cached functions, where cookies can't be read.
export const serviceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
