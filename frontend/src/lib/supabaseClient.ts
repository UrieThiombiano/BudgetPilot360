import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans frontend/.env"
  );
}

// Seule la clé "anon" est utilisée côté frontend — elle respecte la RLS.
// La clé "service_role" ne doit JAMAIS apparaître dans le code frontend.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
