import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `testuser_${Date.now()}@example.com`;
  const password = 'Password123!';
  
  const { data: authData } = await supabase.auth.signUp({ email, password });
  console.log("Auth user ID:", authData?.user?.id);
  
  const { data, error } = await supabase.from('orders').insert([{
    user_id: authData.user.id,
    customer_name: email,
    email: email,
    phone: '',
    city: 'Unassigned',
    address: '',
    product_name: 'Employee Registration',
    product_variant: 'EMPLOYEE_ACCOUNT',
    quantity: 1,
    status: 'pending'
  }]);
  console.log("Insert Error:", error);
}
run();
