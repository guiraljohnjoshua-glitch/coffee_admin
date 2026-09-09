import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `testuser_${Date.now()}@gmail.com`;
  const password = 'Password123!';
  
  console.log("Signing up:", email);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email, password
  });
  console.log("SignUp Error:", signUpError?.message);
  
  console.log("Signing in...");
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email, password
  });
  console.log("SignIn Error:", signInError?.message);
}
run();
