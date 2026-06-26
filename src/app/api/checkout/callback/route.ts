import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { retrieveCheckoutForm } from '@/utils/iyzico';

export async function POST(request: Request) {
  try {
    // Iyzico POST isteğini form data olarak gönderir
    const formData = await request.formData();
    // formData.get returns FormDataEntryValue | null, we cast to string
    const token = (formData as any).get('token') as string | null;

    if (!token) {
      return NextResponse.json({ error: 'Token bulunamadı' }, { status: 400 });
    }

    console.log(`[IYZICO CALLBACK] Token alındı: ${token}`);

    // Iyzico'dan işlemin sonucunu sorgula
    const result = await retrieveCheckoutForm({ 
        locale: 'tr',
        token: token.toString() 
    });

    console.log(`[IYZICO CALLBACK] Retrieve Sonucu:`, result);

    if (result.status !== 'success') {
        console.error(`[IYZICO CALLBACK] Retrieve Başarısız! Hata:`, result.errorMessage);
        // İyzico'da genel hata gösterilmemesi için yine de frontend'e yönlendirelim
    }

    const orderId = result.conversationId || result.basketId;

    if (!orderId) {
      console.error(`[IYZICO CALLBACK] Sipariş ID (conversationId) eksik! Result:`, result);
      // Hata detayını ekrana basalım ki ne döndüğünü görebilelim
      return NextResponse.json({ 
          error: 'Sipariş ID bulunamadı.',
          message: result.errorMessage || 'Iyzico response missing order ID',
          iyzico_result: result 
      }, { status: 400 });
    }

    const supabase = await createClient();

    // Siparişi bul ve masa numarasını al
    const { data: orderData } = await supabase.from('orders').select('table_no').eq('id', orderId).single();
    const tableNo = orderData?.table_no || '1';

    if (result.paymentStatus === 'SUCCESS') {
      console.log(`[IYZICO] Ödeme BAŞARILI! Sipariş ID: ${orderId}, Payment ID: ${result.paymentId}`);
      
      // Veritabanını güncelle
      await supabase.from('orders').update({
        is_paid: true,
        pos_transaction_id: result.paymentId
      }).eq('id', orderId);

      // Kullanıcıyı menüye başarı mesajıyla geri yönlendir
      // Origin URL'yi oluştur. Request url'sinden host bilgisini alalım.
      const url = new URL(request.url);
      const redirectUrl = `${url.protocol}//${url.host}/menu?table=${tableNo}&payment=success&amount=${result.paidPrice || 0}`;
      return NextResponse.redirect(redirectUrl, 303);

    } else {
      console.error(`[IYZICO] Ödeme BAŞARISIZ! Sebep: ${result.errorMessage}`);
      
      // Kullanıcıyı hata mesajıyla geri yönlendir
      const url = new URL(request.url);
      const redirectUrl = `${url.protocol}//${url.host}/menu?table=${tableNo}&payment=failed&reason=${encodeURIComponent(result.errorMessage || 'Ödeme reddedildi')}`;
      return NextResponse.redirect(redirectUrl, 303);
    }

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
