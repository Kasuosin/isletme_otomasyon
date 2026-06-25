import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createCheckoutForm } from '@/utils/iyzico';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { table_no, amount, cart } = body;

    if (!table_no || !cart || cart.length === 0) {
      return NextResponse.json({ error: 'Eksik parametreler (table_no veya cart)' }, { status: 400 });
    }

    // Canlı domain (Vercel vb.) veya tünel URL'sini al, yoksa origin'e dön.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
      || request.headers.get('origin') 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      
    const callbackUrl = `${baseUrl}/api/checkout/callback`;

    // Kullanıcı IP'sini al
    let userIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '85.34.78.112';
    userIp = userIp.split(',')[0].trim();
    if (userIp === '::1' || userIp === '127.0.0.1') userIp = '85.34.78.112';

    const supabase = await createClient();

    // Masanın ID'sini bul (Eğer masalar tablosunda tanımlıysa)
    const { data: tableData } = await supabase.from('tables').select('id').eq('table_number', table_no).maybeSingle();
    const tableId = tableData?.id;

    // Aktif siparişi bul veya oluştur
    const { data: activeOrder } = await supabase
      .from('orders')
      .select('id, total_amount')
      .eq('table_no', table_no)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let currentOrderId = activeOrder?.id;

    if (!currentOrderId) {
      const insertData: any = {
        table_no: table_no,
        status: 'pending', 
        total_amount: amount,
        payment_method: 'qr_pay',
        is_paid: false // Ödeme henüz onaylanmadı
      };
      if (tableId) insertData.table_id = tableId;

      const { data: newOrder, error: orderError } = await supabase.from('orders').insert(insertData).select().single();

      if (orderError) throw orderError;
      currentOrderId = newOrder.id;
    } else {
      const newTotal = Number(activeOrder?.total_amount || 0) + Number(amount);
      await supabase.from('orders').update({
        total_amount: newTotal,
        payment_method: 'qr_pay'
      }).eq('id', currentOrderId);
    }

    // Sepetteki ürünleri order_items'a ekle (Mutfak için)
    // Not: Şimdilik pending ekliyoruz. Eğer ödeme iptal olursa, bu sipariş satırlarını silmek daha doğru bir senaryo olur, 
    // ancak Sandbox testi için ödeme formu açıkken ürünlerin mutfağa düşmesi sorun değilse böyle kalabilir.
    const orderItemsToInsert = cart.map((item: any) => ({
      order_id: currentOrderId,
      menu_item_id: item.id,
      quantity: item.quantity,
      price_at_time: item.price
    }));
    await supabase.from('order_items').insert(orderItemsToInsert);
    if (tableId) {
      await supabase.from('tables').update({ status: 'occupied' }).eq('id', tableId);
    }


    // --- IYZICO ÖDEME FORMU İNİTİALİZE İŞLEMİ ---
    
    // Sepet ürünlerini Iyzico formatına çevir
    const basketItems = cart.map((item: any) => ({
        id: item.id, // Tam UUID gönderelim
        name: item.name,
        category1: 'Food', // Türkçe karakter kullanmayalım
        itemType: 'PHYSICAL', // veya VIRTUAL
        price: Number(item.price * item.quantity).toFixed(2)
    }));

    const formattedAmount = Number(amount).toFixed(2);

    const requestData = {
        locale: 'tr',
        conversationId: currentOrderId, // Bizim sipariş ID'miz
        price: formattedAmount,
        paidPrice: formattedAmount,
        currency: 'TRY',
        basketId: currentOrderId,
        paymentGroup: 'PRODUCT',
        callbackUrl: callbackUrl,
        buyer: {
            id: 'BY789',
            name: 'Musteri', // Türkçe karakter yok
            surname: table_no,
            gsmNumber: '+905320000000',
            email: 'email@email.com',
            identityNumber: '11111111111', // Test TC
            lastLoginDate: '2015-10-05 12:43:35',
            registrationDate: '2013-04-21 15:12:09',
            registrationAddress: 'Nidakule Goztepe, Merdivenkoy Mah. Bora Sok. No:1',
            ip: userIp, 
            city: 'Istanbul',
            country: 'Turkey',
            zipCode: '34732'
        },
        shippingAddress: {
            contactName: `Masa ${table_no}`,
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Restoran Ici', // Türkçe karakter yok
            zipCode: '34732'
        },
        billingAddress: {
            contactName: `Masa ${table_no}`,
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Restoran Ici', // Türkçe karakter yok
            zipCode: '34732'
        },
        basketItems: basketItems
    };

    // Iyzico'dan Form Başlatma İsteği At
    const result = await createCheckoutForm(requestData);

    if (result.status === 'success') {
        console.log("[IYZICO] Form başlatıldı. Orijinal Response:", result);
        
        // Iyzico Sandbox bug fix: Eğer Iyzico canlı script'ini gönderiyorsa sandbox ile değiştir!
        let htmlContent = result.checkoutFormContent;
        if (htmlContent) {
            htmlContent = htmlContent.replace(/(?<!sandbox-)static\.iyzipay\.com/g, 'sandbox-static.iyzipay.com');
        }

        let paymentUrl = result.paymentPageUrl;
        if (paymentUrl) {
            paymentUrl = paymentUrl.replace(/(?<!sandbox-)static\.iyzipay\.com/g, 'sandbox-static.iyzipay.com');
            paymentUrl = paymentUrl + '&iframe=false';
        }

        return NextResponse.json({
            success: true,
            checkoutFormContent: htmlContent,
            paymentPageUrl: paymentUrl,
            token: result.token
        }, { status: 200 });
    } else {
        console.error("[IYZICO] Form Hatası:", result);
        return NextResponse.json({ error: result.errorMessage || 'Ödeme formu başlatılamadı.' }, { status: 400 });
    }

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
