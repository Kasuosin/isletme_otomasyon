import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import iyzipay from '@/utils/iyzico';

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
    return new Promise<NextResponse>((resolve) => {
      iyzipay.checkoutForm.retrieve({ token: token.toString() }, async (err: any, result: any) => {
        if (err) {
          console.error("Iyzico Retrieve Error:", err);
          resolve(NextResponse.json({ error: 'İşlem sorgulanamadı.' }, { status: 500 }));
          return;
        }

        const orderId = result.conversationId;

        if (!orderId) {
            resolve(NextResponse.json({ error: 'Sipariş ID bulunamadı.' }, { status: 400 }));
            return;
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
          const redirectUrl = `${url.protocol}//${url.host}/menu?table=${tableNo}&payment=success`;
          resolve(NextResponse.redirect(redirectUrl, 303));

        } else {
          console.error(`[IYZICO] Ödeme BAŞARISIZ! Sebep: ${result.errorMessage}`);
          
          // Kullanıcıyı hata mesajıyla geri yönlendir
          const url = new URL(request.url);
          const redirectUrl = `${url.protocol}//${url.host}/menu?table=${tableNo}&payment=failed&reason=${encodeURIComponent(result.errorMessage || 'Ödeme reddedildi')}`;
          resolve(NextResponse.redirect(redirectUrl, 303));
        }
      });
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
