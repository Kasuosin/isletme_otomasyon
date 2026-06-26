import { createClient } from '@/utils/supabase/server';
import MenuClient from './MenuClient';
import { Suspense } from 'react';

// nextjs-agent-rules dictates we should await searchParams in Next.js 15+ if it's a promise, but usually it's an object. 
// However, the rule mentions "breaking changes". If searchParams is a promise, we await it.
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined } }) {
  const supabase = await createClient();
  
  // Resolve searchParams if it's a promise
  const resolvedParams = await searchParams;
  // Sıkı doğrulama: Parametre yoksa veya boşsa engelle
  const restaurantCode = resolvedParams?.restaurant;
  
  if (!restaurantCode || typeof restaurantCode !== 'string') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#fdfaf5] text-[#3d4d42] font-serif p-6 text-center">
        <div className="bg-red-50 p-8 rounded-2xl shadow-lg border border-red-100 max-w-md">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Restoran Bulunamadı!</h2>
          <p className="text-lg text-red-600">Lütfen masadaki karekodu tekrar okutunuz. Restoran kodu eksik veya hatalı.</p>
        </div>
      </div>
    );
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('restaurant_code', restaurantCode)
    .single();

  if (!restaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#fdfaf5] text-[#3d4d42] font-serif p-6 text-center">
        <div className="bg-red-50 p-8 rounded-2xl shadow-lg border border-red-100 max-w-md">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Restoran Bulunamadı!</h2>
          <p className="text-lg text-red-600">Lütfen masadaki karekodu tekrar okutunuz. Sistemde böyle bir restoran kaydı bulunmamaktadır.</p>
        </div>
      </div>
    );
  }

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order', { ascending: true });

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('name');

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#fdfaf5] text-[#3d4d42] font-serif text-2xl">Yükleniyor...</div>}>
      <MenuClient categories={categories || []} menuItems={menuItems || []} restaurantId={restaurant.id} />
    </Suspense>
  );
}