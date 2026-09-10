import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  // Sarah has 3 records, let's delete the first two (older ones)
  const idsToDelete = ['8adbfe35-9125-4291-8e6a-c7a245653a8a', '4e422edc-a3ae-44a4-b441-0699bd454f6e'];
  const { data, error } = await supabase.from('orders').delete().in('id', idsToDelete);
  console.log("Delete error:", error);
}
run();
