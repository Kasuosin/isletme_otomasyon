const { createClient } = require('@supabase/supabase-js');


const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Cleaning up ghost items...");
  
  // 1. Kapanmış siparişlere ait order_items'ları delivered yap
  const { data: closedOrders } = await supabase.from('orders').select('id').in('status', ['delivered', 'cancelled']);
  if (closedOrders && closedOrders.length > 0) {
    const ids = closedOrders.map(o => o.id);
    await supabase.from('order_items').update({ status: 'delivered' }).in('order_id', ids);
    console.log(`Cleaned ${ids.length} closed orders.`);
  }

  // 2. Boş (empty) masalara ait askıda kalmış siparişleri temizle
  const { data: emptyTables } = await supabase.from('tables').select('id').eq('status', 'empty');
  if (emptyTables && emptyTables.length > 0) {
    const tIds = emptyTables.map(t => t.id);
    const { data: orphanOrders } = await supabase.from('orders').select('id').in('table_id', tIds);
    if (orphanOrders && orphanOrders.length > 0) {
      const oIds = orphanOrders.map(o => o.id);
      await supabase.from('order_items').update({ status: 'delivered' }).in('order_id', oIds);
      console.log(`Cleaned items for ${oIds.length} orphan orders on empty tables.`);
    }
  }
  
  console.log("Database synchronization complete.");
}

run();
