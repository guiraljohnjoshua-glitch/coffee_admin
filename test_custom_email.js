import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const customEmail = `crew_${Date.now()}@employee.local`;
  const { data, error } = await supabase.auth.signUp({
    email: customEmail,
    password: 'Password123!'
  });
  console.log("SignUp with @employee.local:", data?.user?.email, error);
}
run();
