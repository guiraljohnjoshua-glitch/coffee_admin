import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vujwrgqkkzatzlupqxxz.supabase.co';
const supabaseKey = 'sb_publishable_7TVgBzB0Y-Re4IWZ48kvFw_4dboMY9g';

export const supabase = createClient(supabaseUrl, supabaseKey);
