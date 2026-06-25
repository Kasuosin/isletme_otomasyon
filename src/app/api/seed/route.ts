import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  try {
    // 1. Check if categories exist
    const { data: existing } = await supabase.from('categories').select('id').limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ message: 'Database already seeded' });
    }

    // 2. Insert Categories
    const { data: cats, error: catError } = await supabase.from('categories').insert([
      { name: 'Ana Yemekler', sort_order: 1 },
      { name: 'Tatlılar', sort_order: 2 },
      { name: 'İçecekler', sort_order: 3 }
    ]).select();

    if (catError) throw catError;

    // 3. Insert Menu Items
    const anaYemekId = cats.find(c => c.name === 'Ana Yemekler')?.id;
    const tatliId = cats.find(c => c.name === 'Tatlılar')?.id;
    const icecekId = cats.find(c => c.name === 'İçecekler')?.id;

    const { error: itemError } = await supabase.from('menu_items').insert([
      { category_id: anaYemekId, name: 'Izgara Köfte', description: 'Közlenmiş biber ve domates ile', price: 250, image_url: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=500&q=80' },
      { category_id: anaYemekId, name: 'Tavuk Şiş', description: 'Özel sosla marine edilmiş tavuk göğsü', price: 210, image_url: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500&q=80' },
      { category_id: tatliId, name: 'Sütlaç', description: 'Fırınlanmış geleneksel sütlaç', price: 90, image_url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=500&q=80' },
      { category_id: icecekId, name: 'Ayran', description: 'Yayık ayranı', price: 40, image_url: 'https://images.unsplash.com/photo-1623832168393-273a21eeeb2f?w=500&q=80' }
    ]);

    if (itemError) throw itemError;

    return NextResponse.json({ message: 'Seed successful' });
  } catch (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
