import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { table_id, order_id, amount } = body;

    if (!order_id || !table_id) {
      return NextResponse.json({ error: 'Eksik parametreler (order_id veya table_id)' }, { status: 400 });
    }

    // 1. FİZİKSEL POS CİHAZI SİMÜLASYONU (Beko/Hugin vb. JSON API Mimarisi)
    console.log(`[POS ENTEGRASYONU] İstek atılıyor... Tutar: ${amount} ₺, Sipariş: ${order_id}`);
    
    // Gerçek dünyada burada 'axios' veya 'fetch' ile POS servis sağlayıcısının uç noktasına gidilir.
    // Örnek: await fetch('https://api.pos-provider.com/v1/payment', { body: JSON.stringify({ amount, terminalId: 'TRM-101' }) })
    
    // İşlem gecikmesi simülasyonu (Müşteri kartı takar, şifre girer...)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // MOCK Başarılı POS Yanıtı (Gerçek bir cihazdan gelen tipik JSON gövdesi)
    const mockPosResponse = {
      status: 'SUCCESS',
      auth_code: `AUTH-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      terminal_id: 'TRM-101',
      transaction_date: new Date().toISOString()
    };

    console.log(`[POS ENTEGRASYONU] Onay kodu alındı: ${mockPosResponse.auth_code}`);

    // 2. SUPABASE GÜNCELLEMESİ
    const supabase = await createClient();

    // Siparişi kapat, ödeme alındı (is_paid = true) ve POS kodunu kaydet
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        is_paid: true,
        payment_method: 'credit_card',
        pos_transaction_id: mockPosResponse.auth_code,
        total_amount: amount // İndirimli son tutarı kaydet
      })
      .eq('id', order_id);

    if (orderError) {
      console.error('Supabase güncelleme hatası:', orderError);
      return NextResponse.json({ error: 'Ödeme alındı ancak veritabanı güncellenemedi.' }, { status: 500 });
    }

    // Masadaki açık ürünleri de servis edildi (delivered) olarak işaretle
    const { error: itemsError } = await supabase
      .from('order_items')
      .update({ status: 'delivered' })
      .eq('order_id', order_id);

    if (itemsError) {
      console.error('Sipariş detayları güncellenemedi:', itemsError);
    }

    // Masayı boş olarak işaretle (Bunu admin frontend de yapıyor ama backend güvencesi de eklendi)
    await supabase.from('tables').update({ status: 'empty' }).eq('id', table_id);

    // 3. BAŞARILI YANIT DÖN
    return NextResponse.json({
      success: true,
      auth_code: mockPosResponse.auth_code,
      message: 'Ödeme başarıyla tamamlandı ve adisyon kapatıldı.'
    }, { status: 200 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
