import { createClient } from '@/utils/supabase/server';
import MenuClient from './MenuClient';
import { Suspense } from 'react';

export default async function MenuPage() {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('*')
    .order('name');

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#fdfaf5] text-[#3d4d42] font-serif text-2xl">Yükleniyor...</div>}>
      <MenuClient categories={categories || []} menuItems={menuItems || []} />
    </Suspense>
  );
}
