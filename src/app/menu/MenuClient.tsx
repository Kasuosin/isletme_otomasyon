'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Info, CheckCircle, ArrowLeft, ChevronRight, CreditCard, ShieldCheck, Lock } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

type Category = { id: string; name: string; sort_order: number };
type MenuItem = { id: string; category_id: string; name: string; description: string; price: number; image_url: string; is_available: boolean };
type CartItem = MenuItem & { quantity: number };

export default function MenuClient({ categories, menuItems }: { categories: Category[], menuItems: MenuItem[] }) {
  const searchParams = useSearchParams();
  const tableNo = searchParams.get('table');
  const paymentStatus = searchParams.get('payment');
  const paymentReason = searchParams.get('reason');
  
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [displayCategory, setDisplayCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [iyzicoStep, setIyzicoStep] = useState<'form'|'processing'|'success'>('form');
  
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (paymentStatus === 'success') {
      setShowIyzicoModal(true);
      setIyzicoStep('success');
      setTimeout(() => {
        setShowIyzicoModal(false);
        setIsCartOpen(false);
        setCart([]);
        handleBackClick();
        router.replace(`/menu?table=${tableNo}`);
      }, 3500);
    } else if (paymentStatus === 'failed') {
      alert(`Ödeme Başarısız: ${paymentReason || 'İşlem reddedildi.'}`);
      router.replace(`/menu?table=${tableNo}`);
    }
  }, [paymentStatus]);

  const activeItems = displayCategory ? menuItems.filter(item => item.category_id === displayCategory) : [];

  const handleCategoryClick = (id: string) => {
    setDisplayCategory(id);
    setActiveCategory(id);
  };

  const handleBackClick = () => {
    setActiveCategory(null);
  };

  const addToCart = (item: MenuItem) => {
    if (item.is_available === false) {
      alert('Bu ürün şu an stokta yok.');
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQ = i.quantity + delta;
        return { ...i, quantity: newQ };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const submitOrder = async () => {
    if (cart.length === 0) return;
    
    if (!tableNo) {
      alert('Lütfen geçerli bir QR kod okutun. (Örn: ?table=5)');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Check if there is an active tab/order for this table
      const { data: activeOrder, error: checkError } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('table_no', tableNo)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (checkError) throw checkError;

      let currentOrderId = activeOrder?.id;

      if (!currentOrderId) {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
          table_no: tableNo,
          status: 'pending',
          total_amount: totalAmount,
          payment_method: 'cash'
        }).select().single();

        if (orderError) throw orderError;
        currentOrderId = newOrder.id;
      } else {
        // Update existing order total_amount
        await supabase.from('orders').update({
          total_amount: (activeOrder?.total_amount || 0) + totalAmount
        }).eq('id', currentOrderId);
      }

      // 2. Insert new order items
      const orderItems = [];
      for (const item of cart) {
        orderItems.push({
          order_id: currentOrderId,
          menu_item_id: item.id,
          quantity: item.quantity,
          price_at_time: item.price
        });
      }

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsCartOpen(false);
        setCart([]);
        handleBackClick();
      }, 3000);
    } catch (error) {
      console.error(error);
      alert('Sipariş iletilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const payOnline = async () => {
    if (!tableNo) {
      alert('Lütfen geçerli bir QR kod okutun. (Örn: ?table=5)');
      return;
    }
    setIyzicoStep('processing');
    setShowIyzicoModal(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_no: tableNo,
          amount: totalAmount,
          cart: cart
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        if (data.checkoutFormContent) {
          // document.write kullanmadan, script'i manuel olarak çalıştıracağız
          // 1. Script tag'ini HTML'den ayıkla
          const scriptRegex = /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/i;
          const match = data.checkoutFormContent.match(scriptRegex);
          const htmlWithoutScript = data.checkoutFormContent.replace(scriptRegex, '');
          
          // 2. HTML'i modal içerisine yerleştirmek için state'e kaydet veya direkt iyzico elementini ekle
          // iyzicoStep'i 'form' olarak bırakıyoruz ki modal açık kalsın ve HTML oraya yerleşebilsin.
          setIyzicoStep('form');
          
          // Mevcut modalın içine iyzico div'ini yerleştiriyoruz. Form'u gösterecek bir div eklemeliyiz.
          // Modal yapısını değiştirmemek için bir setTimeout ile modalin açılmasını bekleyip içeriği enjekte edebiliriz, 
          // veya daha güvenlisi modal içeriğini doğrudan state'ten okuyabiliriz.
          
          // Geçici bir çözüm olarak, güvenli bir şekilde div içine ekleyelim:
          setTimeout(() => {
            const container = document.getElementById('iyzico-form-container');
            if (container) {
              container.innerHTML = htmlWithoutScript + '<div id="iyzipay-checkout-form" class="responsive"></div>';
              
              if (match && match[1]) {
                const script = document.createElement('script');
                script.src = match[1];
                script.async = true;
                document.body.appendChild(script);
              }
            }
          }, 100);

        } else if (data.paymentPageUrl) {
          window.location.href = data.paymentPageUrl;
        } else {
          alert('Ödeme sayfası bilgisi alınamadı.');
          setShowIyzicoModal(false);
        }
      } else {
        alert(`Ödeme başlatılamadı: ${data.error}`);
        setShowIyzicoModal(false);
      }
    } catch (error) {
      alert('Sunucuya bağlanılamadı.');
      setShowIyzicoModal(false);
    }
  };

  if (categories.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Henüz menü eklenmemiş.</p>
        <button onClick={() => fetch('/api/seed').then(() => router.refresh())} className="mt-4 text-blue-600 underline">Örnek Veri Ekle</button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-700 bg-white rounded-3xl border border-[#e2d5c3] mt-10 p-8 shadow-sm">
        <div className="w-24 h-24 bg-[#4a5d4e]/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="text-[#4a5d4e]" size={48} />
        </div>
        <h2 className="text-3xl font-serif italic text-[#3b4b3e] mb-2">Teşekkürler!</h2>
        <h3 className="text-xl font-bold text-[#3b4b3e] mb-4">Siparişiniz Alındı</h3>
        <p className="text-md text-[#8a7a6a] mb-8 max-w-sm mx-auto leading-relaxed">
          Şefimiz siparişinizi hazırlamaya başladı bile. En kısa sürede masanıza servis edilecektir. Afiyet olsun!
        </p>
        <button 
          onClick={() => { setIsSuccess(false); router.refresh(); }}
          className="bg-[#4a5d4e] text-white px-10 py-3 rounded-full font-bold tracking-wide shadow-md hover:bg-[#344438] transition-all"
        >
          Menüye Dön
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="relative w-full h-[100dvh] overflow-hidden bg-black font-sans">
        {/* FULL SCREEN DUAL-SCENE SLIDER */}
        
        {/* SCENE 1: CATEGORIES (Light Cream with Cacti) */}
        <div className={`absolute inset-0 w-full h-full bg-[#fdfaf5] text-[#3d4d42] overflow-y-auto overflow-x-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${activeCategory ? '-translate-x-full' : 'translate-x-0'}`}>
          
          {/* Background Watercolor Illustrations with Mix Blend Multiply to hide white background completely */}
          <img src="/cactus_left.png" alt="Cactus" className="absolute top-8 left-2 md:top-10 md:left-8 w-80 md:w-[36rem] mix-blend-multiply pointer-events-none z-0 [filter:contrast(1.2)_brightness(1.05)]" />
          <img src="/cactus_right.png" alt="Saguaro" className="absolute top-8 right-2 md:top-10 md:right-8 w-80 md:w-[36rem] mix-blend-multiply pointer-events-none z-0 [filter:contrast(1.2)_brightness(1.05)]" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full flex justify-center pointer-events-none z-0 mix-blend-multiply" style={{ mixBlendMode: 'multiply' }}>
            <img src="/new_cactus_bottom.png" alt="Potted Cactus" className="w-64 md:w-80 [filter:contrast(1.2)_brightness(1.05)]" />
          </div>

          <div className="relative z-10 min-h-full flex flex-col pb-32">
            
            {/* Header */}
            <div className="pt-16 pb-6 flex flex-col items-center justify-center">
              <h1 className="text-6xl md:text-8xl font-serif italic text-[#3b4b3e] tracking-tight -mb-2">Kaktüs</h1>
              <div className="flex items-center gap-4 text-[#8a7a6a] mt-2">
                <div className="w-16 h-[1px] bg-[#8a7a6a]"></div>
                <span className="tracking-[0.3em] font-light text-lg">CAFE</span>
                <div className="w-16 h-[1px] bg-[#8a7a6a]"></div>
              </div>
              <div className="mt-4 text-[#8a7a6a]">♡</div>
            </div>

            {/* Error/Info Banner */}
            {!tableNo && (
              <div className="max-w-2xl mx-auto w-full px-4 mb-6">
                <div className="p-4 bg-[#f4ebd8] border border-[#d4c5b0] text-[#5c4d3c] rounded-2xl flex items-start gap-3 shadow-sm">
                  <Info className="flex-shrink-0 mt-0.5 text-[#8a7a6a]" size={20} />
                  <p className="text-sm font-medium">Masaya tanımlı bir QR kod okutmadınız. Ürünleri inceleyebilirsiniz ancak sipariş verebilmek için masadaki QR kodu okutmanız gerekmektedir. (Örn: ?table=5)</p>
                </div>
              </div>
            )}

            {/* Categories Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 max-w-2xl mx-auto w-full">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className="group relative overflow-hidden bg-[#fdfaf5]/80 backdrop-blur-md border border-[#d4c5b0] p-8 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 flex items-center justify-between"
                >
                  <h2 className="text-2xl font-serif font-bold text-[#3b4b3e] tracking-wide">{cat.name}</h2>
                  <div className="w-10 h-10 rounded-full bg-[#f4ebd8] border border-[#d4c5b0] flex items-center justify-center text-[#4a5d4e] group-hover:bg-[#4a5d4e] group-hover:border-[#4a5d4e] group-hover:text-[#fdfaf5] transition-colors">
                    <ChevronRight size={24} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SCENE 2: ITEMS (Deep Cactus Green) */}
        <div className={`absolute inset-0 w-full h-full bg-[#1b2620] text-[#e8dac8] overflow-y-auto overflow-x-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${activeCategory ? 'translate-x-0' : 'translate-x-full'}`}>
          
          {/* Subtle dark texture/gradient for depth */}
          <div className="fixed inset-0 bg-gradient-to-b from-[#111a14] to-transparent opacity-50 pointer-events-none z-0"></div>

          <div className="relative z-10 min-h-full flex flex-col pb-32 px-4 md:px-8 max-w-2xl mx-auto pt-8 w-full">
            
            {/* Header & Back Button */}
            <div className="flex items-center justify-between mb-8">
              <button 
                onClick={handleBackClick} 
                className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/10 text-[#a0b0a8] shadow-sm hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 transition-all"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-[#e8dac8] tracking-wide bg-black/20 px-6 py-2 rounded-full border border-white/5 shadow-sm">
                {categories.find(c => c.id === displayCategory)?.name}
              </h2>
              <div className="w-12"></div> {/* Spacer for perfect centering */}
            </div>

            {/* Items List */}
            <div className="flex flex-col gap-6 bg-[#25332b]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-xl">
              {activeItems.map(item => (
                <div key={item.id} className={`flex flex-col ${item.is_available === false ? 'opacity-50 grayscale' : ''}`}>
                  <div className="flex items-end justify-between w-full">
                    <h3 className={`font-medium text-[#e8dac8] text-lg whitespace-nowrap ${item.is_available === false ? 'line-through opacity-70' : ''}`}>
                      {item.name} {item.is_available === false && <span className="text-rose-400 font-bold ml-1 text-[10px] uppercase px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-sm">Tükendi</span>}
                    </h3>
                    
                    {/* Dotted Line */}
                    <div className="flex-1 border-b-[2px] border-dotted border-white/20 mx-3 mb-1.5 opacity-50"></div>
                    
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#a0b0a8] text-lg">{item.price} ₺</span>
                      <button 
                        onClick={() => addToCart(item)}
                        disabled={item.is_available === false}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          item.is_available === false 
                            ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5' 
                            : 'bg-white/10 text-[#e8dac8] border border-white/20 hover:bg-white/20 active:scale-95 shadow-sm'
                        }`}
                      >
                        <Plus size={18} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-sm text-[#a0b0a8] mt-1 pr-16">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#fdfaf5] border-t border-[#e2d5c3] shadow-[0_-10px_20px_rgba(138,122,106,0.1)] z-20">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-widest text-[#8a7a6a] uppercase">Toplam Tutar</span>
              <span className="text-2xl font-bold text-[#3b4b3e]">{totalAmount} ₺</span>
            </div>
            <button 
              onClick={() => setIsCartOpen(true)}
              className="bg-[#4a5d4e] text-[#fdfaf5] px-6 py-3 rounded-full font-bold shadow-md hover:bg-[#344438] transition-all hover:scale-[1.02] active:scale-95 flex items-center"
            >
              <ShoppingCart size={20} className="mr-2" />
              Sepeti Görüntüle ({cart.reduce((a,b)=>a+b.quantity,0)})
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-[#fdfaf5] w-full max-w-md h-full flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl border-l border-[#e2d5c3]">
            <div className="p-5 border-b border-[#e2d5c3] flex justify-between items-center bg-[#fdfaf5]">
              <h2 className="text-xl font-bold text-[#3b4b3e] flex items-center"><ShoppingCart className="mr-3 text-[#4a5d4e]"/> Sipariş Özeti</h2>
              <button onClick={() => setIsCartOpen(false)} className="text-[#8a7a6a] hover:text-[#3b4b3e] font-bold p-2 text-2xl transition-colors">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center border-b border-[#e2d5c3] pb-4">
                  <div className="flex-1 pr-4">
                    <h4 className="font-medium text-[#3b4b3e] text-lg">{item.name}</h4>
                    <span className="text-[#8a7a6a] font-bold">{item.price} ₺</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white rounded-full px-3 py-1.5 border border-[#e2d5c3] shadow-sm">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 text-[#8a7a6a] hover:text-[#3b4b3e] rounded-full transition-colors"><Minus size={16}/></button>
                    <span className="font-bold w-6 text-center text-[#3b4b3e]">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 text-[#8a7a6a] hover:text-[#3b4b3e] rounded-full transition-colors"><Plus size={16}/></button>
                  </div>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="p-5 border-t border-[#e2d5c3] bg-white">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[#8a7a6a] font-bold uppercase tracking-widest text-sm">Genel Toplam</span>
                  <span className="text-3xl font-black text-[#3b4b3e]">{totalAmount} ₺</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={payOnline}
                    disabled={isSubmitting || !tableNo}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-4 rounded-xl font-bold text-lg tracking-wide hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 transition-all shadow-[0_8px_20px_rgba(59,130,246,0.3)] flex justify-center items-center"
                  >
                    <CreditCard size={22} className="mr-2" />
                    Hemen Öde (Kredi Kartı)
                  </button>

                  <button 
                    onClick={submitOrder}
                    disabled={isSubmitting || !tableNo}
                    className="w-full bg-[#fdfaf5] text-[#4a5d4e] border-2 border-[#4a5d4e] py-3.5 rounded-xl font-bold text-md hover:bg-[#f0e9df] disabled:opacity-50 transition-all flex justify-center items-center"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center"><div className="w-5 h-5 border-2 border-[#4a5d4e]/50 border-t-[#4a5d4e] rounded-full animate-spin mr-2"></div> İletiliyor...</span>
                    ) : (tableNo ? 'Siparişi Mutfağa İlet (Ödeme Kasada)' : 'QR Kod Okutulmadı!')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* iyzico Simulation Modal */}
      {showIyzicoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <div className="flex items-center gap-2 text-blue-800 font-black tracking-tight text-xl">
                <ShieldCheck className="text-blue-600" /> iyzico <span className="font-medium text-gray-500 text-sm">| Güvenli Ödeme</span>
              </div>
              {iyzicoStep === 'form' && (
                <button onClick={() => setShowIyzicoModal(false)} className="text-gray-400 hover:text-gray-900 text-2xl font-bold">&times;</button>
              )}
            </div>

            <div className="p-6">
              {iyzicoStep === 'form' && (
                <div id="iyzico-form-container" className="w-full flex justify-center items-center min-h-[300px]">
                  {/* Script and form will be injected here */}
                </div>
              )}

              {iyzicoStep === 'processing' && (
                <div className="py-12 flex flex-col items-center justify-center animate-in zoom-in text-center">
                  <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <h3 className="font-bold text-gray-800 text-lg">Güvenli Ödeme Sayfasına Yönlendiriliyorsunuz...</h3>
                  <p className="text-gray-500 text-sm mt-1">Lütfen bekleyin, iyzico sistemine bağlanılıyor.</p>
                  <p className="text-xs text-blue-500 mt-4 font-mono font-bold">256-BIT SSL BAĞLANTISI KURULUYOR</p>
                </div>
              )}

              {iyzicoStep === 'success' && (
                <div className="py-8 flex flex-col items-center justify-center animate-in zoom-in text-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="text-green-500" size={48} />
                  </div>
                  <h3 className="font-black text-gray-800 text-2xl">Ödeme Başarılı!</h3>
                  <p className="text-gray-500 text-md mt-2">Siparişiniz alındı ve mutfağa iletildi.</p>
                  <div className="mt-4 bg-gray-50 rounded-lg p-3 w-full border border-gray-100 border-dashed">
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">İşlem Özeti</p>
                    <p className="text-lg font-black text-gray-800">{totalAmount} ₺</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
