import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data } = await supabase.from('tables').select('*');
  console.log('Tables:', data);
  const { data: orders } = await supabase.from('orders').select('*');
  console.log('Orders:', orders);
}
run();
