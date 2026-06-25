import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';

// 1. Monkey-patch fs.readdirSync (Next.js Turbopack bypass)
const originalReaddirSync = fs.readdirSync;
(fs as any).readdirSync = function (path: string | Buffer | URL, options?: any) {
  const pathStr = String(path).replace(/\\/g, '/');
  if (pathStr.includes('iyzipay') && pathStr.includes('resources')) {
    return [
      "ApiTest.js", "Apm.js", "Approval.js", "BasicBkm.js", "BasicBkmInitialize.js", "BasicPayment.js",
      "BasicPaymentPostAuth.js", "BasicPaymentPreAuth.js", "BasicThreedsInitialize.js", "BasicThreedsInitializePreAuth.js",
      "BasicThreedsPayment.js", "BinNumber.js", "Bkm.js", "BkmInitialize.js", "BouncedBankTransferList.js", "Cancel.js",
      "Card.js", "CardList.js", "CheckoutForm.js", "CheckoutFormInitialize.js", "CheckoutFormInitializePreAuth.js",
      "CrossBookingFromSubMerchant.js", "CrossBookingToSubMerchant.js", "Disapproval.js", "InstallmentHtml.js",
      "InstallmentInfo.js", "IyziLink.js", "PayWithIyzico.js", "Payment.js", "PaymentItem.js", "PaymentPostAuth.js",
      "PaymentPreAuth.js", "PayoutCompletedTransactionList.js", "PeccoInitialize.js", "PeccoPayment.js", "Refund.js",
      "RefundChargedFromMerchant.js", "RefundToBalance.js", "RefundV2.js", "ReportingBouncedPayments.js",
      "ReportingPayoutCompleted.js", "ReportingScrollTransactions.js", "ReportingTransactionDetails.js",
      "ReportingTransactions.js", "SettlementToBalance.js", "SubMerchant.js", "Subscription.js", "SubscriptionCard.js",
      "SubscriptionCheckoutForm.js", "SubscriptionCustomer.js", "SubscriptionExistingCustomer.js", "SubscriptionPayment.js",
      "SubscriptionPricingPlan.js", "SubscriptionProduct.js", "ThreedsInitialize.js", "ThreedsInitializePreAuth.js",
      "ThreedsPayment.js", "ThreedsV2Payment.js", "UniversalCardStorageInitialize.js"
    ] as any;
  }
  return originalReaddirSync.call(fs, path, options);
};

export async function POST(request: Request) {
  try {
    // 2. Dinamik olarak yükle (Monkey patch devreye girdikten SONRA)
    const Iyzipay = (await import('iyzipay')).default || require('iyzipay');
    const iyzipay = new Iyzipay({
      apiKey: process.env.NEXT_PUBLIC_IYZICO_API_KEY,
      secretKey: process.env.NEXT_PUBLIC_IYZICO_SECRET_KEY,
      uri: 'https://sandbox-api.iyzipay.com'
    });

    const body = await request.json();
    const { table_no, amount, cart } = body;

    if (!table_no || !cart || cart.length === 0) {
      return NextResponse.json({ error: 'Eksik parametreler (table_no veya cart)' }, { status: 400 });
    }

    // Canlı domain (Vercel vb.) veya tünel URL'sini al, yoksa origin'e dön.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.headers.get('origin')) 
      || 'http://localhost:3000';
      
    const callbackUrl = `${baseUrl}/api/checkout/callback`;

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
            identityNumber: '74300864791',
            lastLoginDate: '2015-10-05 12:43:35',
            registrationDate: '2013-04-21 15:12:09',
            registrationAddress: 'Nidakule Goztepe, Merdivenkoy Mah. Bora Sok. No:1',
            ip: '85.34.78.112', // Localhost IP'leri Iyzico tarafından reddedilebilir, sabit public IP!
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
    return new Promise<NextResponse>((resolve) => {
        iyzipay.checkoutFormInitialize.create(requestData, (err: any, result: any) => {
            if (err) {
                console.error("Iyzico Error:", err);
                resolve(NextResponse.json({ error: 'Ödeme formu başlatılamadı.' }, { status: 500 }));
                return;
            }
            
            if (result.status === 'success') {
                console.log("[IYZICO] Form başlatıldı. URL:", result.paymentPageUrl);
                resolve(NextResponse.json({
                    success: true,
                    paymentPageUrl: result.paymentPageUrl + '&iframe=false',
                    token: result.token
                }, { status: 200 }));
            } else {
                console.error("[IYZICO] Form Hatası:", result);
                resolve(NextResponse.json({ error: result.errorMessage }, { status: 400 }));
            }
        });
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Sunucu tarafında beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
