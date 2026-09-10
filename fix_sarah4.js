import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('orders').insert([{
    customer_name: 'guiralsarahjoy@gmail.com',
    email: 'guiralsarahjoy@gmail.com',
    phone: '',
    city: 'Unassigned',
    address: '',
    product_name: 'Employee Registration',
    product_variant: 'EMPLOYEE_ACCOUNT',
    quantity: 1,
    status: 'pending'
  }]);
  console.log("Insert result:", error);
}
run();
