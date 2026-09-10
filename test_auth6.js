import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const email = `guiralsarahjoy@gmail.com`;
  
  const { data: employeeData, error } = await supabase
    .from('orders')
    .select('status, customer_name')
    .eq('product_variant', 'EMPLOYEE_ACCOUNT')
    .eq('customer_name', email)
    
  console.log("Employee records:", employeeData, error);
}
run();
