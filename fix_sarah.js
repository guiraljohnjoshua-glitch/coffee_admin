import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `guiralsarahjoy@gmail.com`;
  
  const { data, error } = await supabase.from('orders').insert([{
    customer_name: email,
    email: email,
    phone: '',
    city: 'Crew Member',
    address: '',
    product_name: 'Employee Registration',
    product_variant: 'EMPLOYEE_ACCOUNT',
    quantity: 1,
    status: 'processing' // approved
  }]);
  console.log("Insert result:", error);
}
run();
