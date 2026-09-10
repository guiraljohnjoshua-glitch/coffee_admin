import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { error } = await supabase.auth.signInWithPassword({
    email: 'johnjoshuaguiral12@gmail.com',
    password: 'password' // I don't know the password
  });
  console.log("Login Error:", error);
}
run();
