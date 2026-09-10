import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_name', 'guiralsarahjoy@gmail.com');
  console.log("Sarah's records:", data);
  console.log("Error:", error);
}
run();
