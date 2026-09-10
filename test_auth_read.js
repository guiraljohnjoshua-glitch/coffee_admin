import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `testuser3_${Date.now()}@example.com`;
  const password = 'Password123!';
  
  await supabase.auth.signUp({ email, password });
  
  // They are now authenticated. Let's try to read orders
  const { data, error } = await supabase.from('orders').select('*');
  console.log("Read Error:", error);
  console.log("Read Data Length:", data?.length);
}
run();
