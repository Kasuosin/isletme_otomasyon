'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { LayoutGrid, Plus, Receipt, X, CheckCircle, CreditCard, Banknote, BellRing, Trash2, Tag } from 'lucide-react';

type Table = { id: string; table_number: string; status: 'empty' | 'occupied' };
type MenuItem = { id: string; name: string; price: number };
type OrderItem = { id: string; quantity: number; price_at_time: number; status: string; menu_items: { name: string } };
type Order = { id: string; total_amount: number; is_paid?: boolean; payment_method?: string; pos_transaction_id?: string; order_items: OrderItem[] };

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [readyCounts, setReadyCounts] = useState<Record<string, number>>({});
  
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [refreshModalTrigger, setRefreshModalTrigger] = useState(0);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  const supabase = createClient();

  useEffect(() => {
    fetchData();

    // Listen to tables changes
    const tablesChannel = supabase
      .channel('public:tables_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchData();
      })
      .subscribe();

    // Listen to order_items changes (for notifications from kitchen)
    const itemsChannel = supabase
      .channel('public:order_items_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchData();
        setRefreshModalTrigger(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tablesChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, []);

  // Modal auto-refresh when realtime updates arrive
  useEffect(() => {
    if (selectedTable && refreshModalTrigger > 0) {
      openTable(selectedTable);
    }
  }, [refreshModalTrigger]);

  const fetchData = async () => {
    // Fetch tables
    const { data: tData } = await supabase.from('tables').select('*').order('table_number');
    if (tData) setTables(tData as Table[]);

    // Fetch menu
    const { data: mData } = await supabase.from('menu_items').select('id, name, price').eq('is_available', true);
    if (mData) setMenuItems(mData as MenuItem[]);

    // Fetch ready items count per table
    const { data: rData } = await supabase
      .from('order_items')
      .select('id, orders!inner(table_id, status)')
      .eq('status', 'ready')
      .neq('orders.status', 'delivered')
      .neq('orders.status', 'cancelled');
      
    if (rData) {
      const counts: Record<string, number> = {};
      rData.forEach(item => {
        const tId = (item.orders as any).table_id;
        counts[tId] = (counts[tId] || 0) + 1;
      });
      setReadyCounts(counts);
    }
  };

  const openTable = async (table: Table) => {
    setSelectedTable(table);
    setCheckoutMode(false);
    setIsMenuOpen(false);
    setDiscountType('none');
    setDiscountValue(0);

    if (table.status === 'empty') {
      const { data: newOrder, error } = await supabase.from('orders').insert({
        table_id: table.id,
        status: 'pending',
        total_amount: 0,
        payment_method: 'cash'
      }).select().single();

      if (!error) {
        await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id);
        setActiveOrder({ ...newOrder, order_items: [] });
      }
    } else {
      const { data: existingOrder, error: orderFetchError } = await supabase
        .from('orders')
        .select(`id, total_amount, is_paid, payment_method, pos_transaction_id, order_items(id, quantity, price_at_time, status, menu_items(name))`)
        .eq('table_id', table.id)
        .neq('status', 'delivered')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (existingOrder) {
        setActiveOrder(existingOrder as unknown as Order);
      } else {
        // Hata toleransı: Masanın durumu dolu görünüyor ama aktif adisyon yok!
        // Masayı boş olarak onarıyoruz.
        await supabase.from('tables').update({ status: 'empty' }).eq('id', table.id);
        setSelectedTable(null);
        alert('Bu masanın adisyonu zaten kapatılmış veya silinmiş. Masa durumu "Boş" olarak düzeltildi.');
        fetchData();
      }
    }
  };

  const closeTableModal = () => {
    setSelectedTable(null);
    setActiveOrder(null);
    setDiscountType('none');
    setDiscountValue(0);
  };

  const addItemToOrder = async (item: MenuItem) => {
    if (!activeOrder) return;

    await supabase.from('order_items').insert({
      order_id: activeOrder.id,
      menu_item_id: item.id,
      quantity: 1,
      price_at_time: item.price,
      status: 'pending'
    });

    const newTotal = activeOrder.total_amount + item.price;
    await supabase.from('orders').update({ total_amount: newTotal }).eq('id', activeOrder.id);
    
    // UI optimistic update is handled by realtime or fetch
    setIsMenuOpen(false);
  };

  const serveItem = async (itemId: string) => {
    await supabase.from('order_items').update({ status: 'delivered' }).eq('id', itemId);
  };

  const cancelItem = async (itemId: string, itemTotal: number) => {
    if (!activeOrder) return;
    
    const confirmCancel = window.confirm('Bu ürünü adisyondan silmek istediğinize emin misiniz?');
    if (!confirmCancel) return;

    // 1. Veritabanından sil
    await supabase.from('order_items').delete().eq('id', itemId);

    // 2. Sipariş toplamını düş
    const newTotal = Math.max(0, activeOrder.total_amount - itemTotal);
    await supabase.from('orders').update({ total_amount: newTotal }).eq('id', activeOrder.id);

    // 3. Ekranı anında güncelle
    setActiveOrder(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        total_amount: newTotal,
        order_items: prev.order_items.filter(i => i.id !== itemId)
      };
    });
  };

  const subtotal = activeOrder ? activeOrder.total_amount : 0;
  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100;
  } else if (discountType === 'amount') {
    discountAmount = discountValue;
  }
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const handleCheckout = async (method: 'cash' | 'card') => {
    if (!activeOrder || !selectedTable) return;

    if (method === 'card') {
      setIsProcessingPayment(true);
      try {
        const response = await fetch('/api/pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table_id: selectedTable.id,
            order_id: activeOrder.id,
            amount: finalTotal
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          alert(`Ödeme Başarılı! (Onay Kodu: ${data.auth_code})\nMasa Kapatıldı.`);
          closeTableModal();
          // Realtime event will trigger fetchData() and UI update. But we can explicitly call it too:
          fetchData();
        } else {
          alert(`Ödeme Hatası: ${data.error || 'İşlem başarısız.'}`);
        }
      } catch (error) {
        alert('Sunucuya bağlanırken bir hata oluştu.');
      } finally {
        setIsProcessingPayment(false);
      }
    } else {
      // Nakit Ödeme (Eski mantık)
      await supabase.from('orders').update({
        status: 'delivered',
        payment_method: 'cash',
        is_paid: true,
        total_amount: finalTotal
      }).eq('id', activeOrder.id);

      await supabase.from('order_items').update({ status: 'delivered' }).eq('order_id', activeOrder.id);
      await supabase.from('tables').update({ status: 'empty' }).eq('id', selectedTable.id);

      alert('Hesap kapatıldı! (Nakit)');
      closeTableModal();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-10">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-4 rounded-2xl shadow-lg">
            <LayoutGrid size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Adisyon ve Salon Yönetimi</h1>
            <p className="text-gray-500 mt-1 text-sm font-medium">Aktif salon operasyonlarını, masa durumlarını ve finansal işlemleri anlık olarak yönetin.</p>
          </div>
        </header>

        {/* Masalar Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tables.map(table => {
          const hasReady = table.status === 'occupied' && readyCounts[table.id] > 0;
          return (
              <button
                key={table.id}
                onClick={() => openTable(table)}
                className={`relative p-6 rounded-2xl shadow-sm border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                  table.status === 'empty' 
                    ? 'bg-white border-green-200 hover:border-green-400' 
                    : (hasReady ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-400 animate-pulse' : 'bg-red-50 border-red-200 hover:border-red-400')
                }`}
              >
                {/* Bildirim Rozeti */}
                {hasReady && (
                  <div className="absolute -top-3 -right-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                    <BellRing size={12} /> {readyCounts[table.id]} Hazır
                  </div>
                )}

                <span className={`text-xl font-black mb-2 ${table.status === 'empty' ? 'text-green-700' : 'text-red-700'}`}>
                  {table.table_number}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  table.status === 'empty' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {table.status === 'empty' ? 'Boş' : 'Dolu'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Adisyon Modal */}
      {selectedTable && activeOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Receipt size={20} /> {selectedTable.table_number} Adisyonu
                </h2>
              </div>
              <button onClick={closeTableModal} className="text-gray-400 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeOrder?.is_paid ? (
                <div className="flex flex-col items-center justify-center py-10 animate-in fade-in">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="text-green-500" size={56} />
                  </div>
                  <h3 className="text-3xl font-black text-gray-800 mb-2">ÖDENDİ</h3>
                  <p className="text-gray-500 font-medium mb-6 text-center text-lg">Bu masanın hesabı müşteri tarafından ({activeOrder.payment_method === 'qr_pay' ? 'Online/QR' : activeOrder.payment_method}) başarıyla ödenmiştir.</p>
                  
                  {activeOrder.pos_transaction_id && (
                    <div className="bg-gray-50 border border-dashed border-gray-300 p-3 rounded-lg mb-8 font-mono text-gray-600 font-bold text-sm">
                      Onay Kodu: {activeOrder.pos_transaction_id}
                    </div>
                  )}

                  <button 
                    onClick={async () => {
                      await supabase.from('orders').update({ status: 'delivered' }).eq('id', activeOrder.id);
                      await supabase.from('tables').update({ status: 'empty' }).eq('id', selectedTable.id);
                      closeTableModal();
                    }}
                    className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg flex items-center justify-center text-lg"
                  >
                    <Trash2 className="mr-2" />
                    Masayı Temizle (Kapat)
                  </button>
                </div>
              ) : isProcessingPayment ? (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
                  <div className="w-20 h-20 border-8 border-gray-200 border-t-purple-600 rounded-full animate-spin mb-6"></div>
                  <h3 className="text-2xl font-black text-gray-800">POS Cihazından onay bekleniyor...</h3>
                  <p className="text-gray-500 mt-2 font-medium">Lütfen şifreyi girip slibi basınız.</p>
                </div>
              ) : checkoutMode ? (
                <div className="space-y-6 text-center py-6 animate-in fade-in">
                  <h3 className="text-lg font-medium text-gray-600">Ödenecek Tutar</h3>
                  <div className="text-5xl font-black text-gray-900">{finalTotal.toFixed(2)} ₺</div>
                  {discountAmount > 0 && <p className="text-green-600 font-medium mt-2">({discountAmount.toFixed(2)} ₺ İskonto Uygulandı)</p>}
                  
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button onClick={() => handleCheckout('cash')} className="bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 py-6 rounded-xl font-bold flex flex-col items-center gap-2">
                      <Banknote size={32} /> Nakit
                    </button>
                    <button onClick={() => handleCheckout('card')} className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 py-6 rounded-xl font-bold flex flex-col items-center gap-2">
                      <CreditCard size={32} /> Kredi Kartı
                    </button>
                  </div>
                  <button onClick={() => setCheckoutMode(false)} className="mt-4 text-gray-500 underline text-sm">İptal et</button>
                </div>
              ) : isMenuOpen ? (
                <div className="animate-in fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-700">Ürün Seçin</h3>
                    <button onClick={() => setIsMenuOpen(false)} className="text-sm text-blue-600 font-medium">Geri Dön</button>
                  </div>
                  <div className="space-y-2">
                    {menuItems.map(item => (
                      <button key={item.id} onClick={() => addItemToOrder(item)} className="w-full flex justify-between items-center p-3 border rounded-xl hover:bg-gray-50">
                        <span className="font-medium text-gray-800">{item.name}</span>
                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-lg text-sm font-bold flex items-center gap-1">
                          <Plus size={14} /> {item.price} ₺
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in">
                  {/* Servis Bekleyenler */}
                  {activeOrder.order_items.filter(i => i.status === 'ready').length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                      <h3 className="font-bold text-orange-800 flex items-center gap-2 mb-3">
                        <BellRing size={16} /> Mutfaktan Çıkanlar (Servis Et)
                      </h3>
                      <ul className="space-y-2">
                        {activeOrder.order_items.filter(i => i.status === 'ready').map((item, i) => (
                          <li key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border shadow-sm">
                            <span className="font-bold text-gray-800">{item.quantity}x {item.menu_items?.name}</span>
                            <button onClick={() => serveItem(item.id)} className="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-700 flex items-center gap-1">
                              <CheckCircle size={14} /> Masaya Verdik
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Adisyon Listesi */}
                  <div>
                    <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">Tüm Siparişler</h3>
                    {activeOrder.order_items.length === 0 ? (
                      <div className="text-center py-4 text-gray-400">Adisyonda henüz ürün yok.</div>
                    ) : (
                      <ul className="space-y-3">
                        {activeOrder.order_items.map((item, i) => (
                          <li key={item.id} className="flex justify-between items-center border-b pb-2 last:border-0 text-sm group">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{item.quantity}x {item.menu_items?.name}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                item.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                                item.status === 'preparing' ? 'bg-blue-100 text-blue-600' :
                                item.status === 'ready' ? 'bg-orange-100 text-orange-600' :
                                'bg-green-100 text-green-600'
                              }`}>
                                {item.status === 'delivered' ? 'Servis Edildi' : item.status === 'ready' ? 'Hazır' : item.status === 'preparing' ? 'Hazırlanıyor' : 'Bekliyor'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-600 font-bold">{item.price_at_time * item.quantity} ₺</span>
                              <button 
                                onClick={() => cancelItem(item.id, item.price_at_time * item.quantity)}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                title="Ürünü İptal Et / Sil"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button 
                    onClick={() => setIsMenuOpen(true)}
                    className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-colors flex justify-center items-center gap-2 mt-4"
                  >
                    <Plus size={18} /> Adisyona Ürün Ekle
                  </button>

                  {/* İskonto Bölümü */}
                  <div className="mt-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Tag size={16} className="text-purple-600"/> Özel İskonto Tanımla</h4>
                    <div className="flex items-center gap-3">
                      <select 
                        value={discountType} 
                        onChange={(e) => setDiscountType(e.target.value as 'none'|'percent'|'amount')}
                        className="border border-gray-300 rounded-lg p-2.5 text-sm font-medium text-gray-700 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 flex-1 transition-all shadow-sm"
                      >
                        <option value="none">İskonto Uygulanmasın</option>
                        <option value="percent">% Yüzde İndirimi</option>
                        <option value="amount">₺ Tutar İndirimi</option>
                      </select>
                      {discountType !== 'none' && (
                        <input 
                          type="number" 
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                          className="border border-gray-300 rounded-lg p-2.5 text-sm font-bold text-gray-900 bg-white w-28 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm text-center"
                          placeholder={discountType === 'percent' ? '% 0' : '0 ₺'}
                          min="0"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!checkoutMode && (
              <div className="p-5 border-t bg-white shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)]">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium">Ara Toplam</span>
                    <span className="font-bold text-gray-700">{subtotal.toFixed(2)} ₺</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-green-600 bg-green-50 px-2 py-1 rounded-md">
                      <span className="font-bold flex items-center gap-1"><Tag size={14}/> İskonto İndirimi</span>
                      <span className="font-black">- {discountAmount.toFixed(2)} ₺</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-gray-900 font-black text-lg">Genel Toplam</span>
                    <span className="text-3xl font-black text-purple-700">{finalTotal.toFixed(2)} ₺</span>
                  </div>
                </div>
                <button 
                  onClick={() => setCheckoutMode(true)}
                  disabled={activeOrder.order_items.some(i => i.status === 'ready')}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all flex justify-center items-center gap-2 shadow-lg"
                >
                  <CheckCircle size={20} /> {activeOrder.order_items.some(i => i.status === 'ready') ? 'Önce Ürünleri Servis Edin!' : (subtotal === 0 ? 'Boş Adisyonu Kapat' : 'Hesabı Kapat (Ödeme Al)')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
