import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `testuser4_${Date.now()}@example.com`;
  const password = 'Password123!';
  
  await supabase.auth.signUp({ email, password });
  
  // Now logout to insert
  await supabase.auth.signOut();
  await supabase.from('orders').insert([{
    customer_name: email,
    email: email, // <--- THIS MATCHES THE JWT EMAIL
    phone: '',
    city: 'Unassigned',
    address: '',
    product_name: 'Employee Registration',
    product_variant: 'EMPLOYEE_ACCOUNT',
    quantity: 1,
    status: 'pending'
  }]);
  
  // Login again
  await supabase.auth.signInWithPassword({ email, password });
  
  const { data, error } = await supabase.from('orders').select('*');
  console.log("Read Data Length:", data?.length);
  console.log("Read Error:", error);
}
run();
