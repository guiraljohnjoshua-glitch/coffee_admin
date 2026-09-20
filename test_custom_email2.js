import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const tests = ['user1@test', 'myname123', 'any.email@test.com'];
  for (const t of tests) {
    let email = t.trim().toLowerCase();
    if (!email.includes('@')) {
      email = `${email}@employee.local`;
    } else if (!email.split('@')[1].includes('.')) {
      email = `${email}.com`;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: 'Password123!'
    });
    console.log(`Test "${t}" -> "${email}":`, error ? error.message : "SUCCESS");
  }
}
run();
