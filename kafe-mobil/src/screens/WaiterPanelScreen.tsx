import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, Dimensions, Platform, StatusBar, Modal, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const SPACING = 10;
const ITEM_WIDTH = (width - SPACING * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

type FilterType = 'all' | 'occupied' | 'empty';

interface Order {
  id: string;
  table_no: string;
  status: string;
  total_amount: number;
}

interface OrderItem {
  id: string;
  quantity: number;
  price_at_time: number;
  is_paid?: boolean;
  menu_items: {
    name: string;
  };
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  price: number;
  is_available: boolean;
}

export default function WaiterPanelScreen({ navigation }: any) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  
  // Table Modal states
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItem[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isDiscountViewVisible, setIsDiscountViewVisible] = useState(false);
  const [isReceiptViewVisible, setIsReceiptViewVisible] = useState(false);
  const [isTransferViewVisible, setIsTransferViewVisible] = useState(false);
  const [isSplitBillVisible, setIsSplitBillVisible] = useState(false);
  const [selectedSplitItems, setSelectedSplitItems] = useState<string[]>([]);

  // Menu/Cart states
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isMenuModalVisible, setIsMenuModalVisible] = useState(false);
  const [cart, setCart] = useState<{ [itemId: string]: number }>({});
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // 1 to 15 tables
  const tables = Array.from({ length: 15 }, (_, i) => (i + 1).toString());

  useEffect(() => {
    fetchOrders();
    fetchMenuData();

    let channel: any = null;
    let reconnectTimer: NodeJS.Timeout;

    const setupRealtime = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }

      channel = supabase
        .channel('waiter_orders_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          console.log('Supabase Orders Event (Waiter):', payload);
          fetchOrders();
          if (payload.eventType === 'UPDATE' && payload.new.status === 'ready' && payload.old?.status !== 'ready') {
            Alert.alert('🔔 MUTFAKTAN BİLDİRİM!', `Masa ${payload.new.table_no}'nun siparişi hazır! Lütfen servise çıkın.`);
          }
        })
        .subscribe((status, err) => {
          console.log('Waiter Orders Channel Status:', status);
          if (err) console.error('Waiter Orders Channel Error:', err);

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('Waiter channel disconnected, attempting to reconnect...');
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              setupRealtime();
            }, 3000);
          }
        });
    };

    setupRealtime();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        console.log('Auth token refreshed, reconnecting waiter realtime...');
        setupRealtime();
      }
    });

    return () => {
      clearTimeout(reconnectTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_no, status, total_amount')
        .in('status', ['pending', 'preparing', 'ready']);

      if (error) {
        console.error('Error fetching orders:', error);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuData = async () => {
    try {
      const [catsRes, itemsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('menu_items').select('*').order('name')
      ]);

      if (catsRes.error) throw catsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setCategories(catsRes.data || []);
      if (catsRes.data && catsRes.data.length > 0) {
        setSelectedCategoryId(catsRes.data[0].id);
      }
      setMenuItems(itemsRes.data || []);
    } catch (err) {
      console.error('Error fetching menu data:', err);
    }
  };

  const getTableOrder = (tableNo: string) => {
    return orders.find(o => o.table_no === tableNo);
  };

  const filteredTables = tables.filter(tableNo => {
    const isOccupied = !!getTableOrder(tableNo);
    if (filter === 'occupied') return isOccupied;
    if (filter === 'empty') return !isOccupied;
    return true;
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  const handleTablePress = async (tableNo: string) => {
    setSelectedTable(tableNo);
    const order = getTableOrder(tableNo);
    if (order) {
      setDetailsLoading(true);
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select(`
            id,
            quantity,
            price_at_time,
            is_paid,
            menu_items ( name )
          `)
          .eq('order_id', order.id);
          
        if (error) throw error;
        setSelectedOrderItems((data as unknown) as OrderItem[] || []);
      } catch (err) {
        console.error('Error fetching order items:', err);
      } finally {
        setDetailsLoading(false);
      }
    } else {
      setSelectedOrderItems([]);
    }
  };

  const closeModal = () => {
    setSelectedTable(null);
    setSelectedOrderItems([]);
    setIsDiscountViewVisible(false);
    setIsReceiptViewVisible(false);
    setIsTransferViewVisible(false);
    setIsSplitBillVisible(false);
    setSelectedSplitItems([]);
  };

  const applyDiscount = async (discountPercent: number, orderId: string, currentTotal: number) => {
    try {
      const discountAmount = currentTotal * (discountPercent / 100);
      const newTotal = currentTotal - discountAmount;

      const { error } = await supabase
        .from('orders')
        .update({ total_amount: newTotal })
        .eq('id', orderId);

      if (error) throw error;

      Alert.alert('Başarılı', `%${discountPercent} iskonto uygulandı. Yeni Tutar: ₺${newTotal.toFixed(2)}`);
      closeModal();
      fetchOrders();
    } catch (err) {
      console.error(err);
      Alert.alert('Hata', 'İskonto uygulanırken bir hata oluştu.');
    }
  };

  const toggleSplitItem = (itemId: string) => {
    setSelectedSplitItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const handleSplitBillPay = async () => {
    if (selectedSplitItems.length === 0) {
      Alert.alert('Uyarı', 'Lütfen ödenecek ürünleri seçin.');
      return;
    }

    if (!selectedTable) return;
    const currentOrder = getTableOrder(selectedTable);
    if (!currentOrder) return;

    setDetailsLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('order_items')
        .update({ is_paid: true })
        .in('id', selectedSplitItems);

      if (updateError) throw updateError;

      const { data: updatedItems, error: fetchError } = await supabase
        .from('order_items')
        .select('id, is_paid')
        .eq('order_id', currentOrder.id);

      if (fetchError) throw fetchError;

      const allPaid = updatedItems.every(item => item.is_paid === true);

      if (allPaid) {
        const { error: completeError } = await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', currentOrder.id);
        
        if (completeError) throw completeError;
        Alert.alert('Başarılı', 'Masadaki tüm ürünler ödendi. Masa kapatıldı.');
        closeModal();
      } else {
        Alert.alert('Başarılı', 'Seçili ürünlerin ödemesi alındı.');
        await handleTablePress(selectedTable);
      }
      
      setSelectedSplitItems([]);
      setIsSplitBillVisible(false);
      fetchOrders();
    } catch (err) {
      console.error('Split bill error:', err);
      Alert.alert('Hata', 'Kısmi ödeme alınırken bir hata oluştu. "is_paid" sütununun veritabanında olduğundan emin olun.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleTransfer = async (targetTableNo: string) => {
    if (!selectedTable) return;
    const currentOrder = getTableOrder(selectedTable);
    if (!currentOrder) return;

    setDetailsLoading(true);
    try {
      const targetOrder = getTableOrder(targetTableNo);

      if (!targetOrder) {
        const { error } = await supabase
          .from('orders')
          .update({ table_no: targetTableNo })
          .eq('id', currentOrder.id);
        if (error) throw error;
        Alert.alert('Başarılı', `Masa ${selectedTable}, Masa ${targetTableNo}'ye taşındı.`);
      } else {
        const { error: itemsError } = await supabase
          .from('order_items')
          .update({ order_id: targetOrder.id })
          .eq('order_id', currentOrder.id);
        if (itemsError) throw itemsError;

        const newTotal = Number(targetOrder.total_amount) + Number(currentOrder.total_amount);
        const { error: updateError } = await supabase
          .from('orders')
          .update({ total_amount: newTotal })
          .eq('id', targetOrder.id);
        if (updateError) throw updateError;

        const { error: deleteError } = await supabase
          .from('orders')
          .delete()
          .eq('id', currentOrder.id);
        if (deleteError) throw deleteError;

        Alert.alert('Başarılı', `Masa ${selectedTable} hesapları Masa ${targetTableNo} ile birleştirildi.`);
      }
      
      closeModal();
      fetchOrders();
    } catch (error) {
      console.error(error);
      Alert.alert('Hata', 'Taşıma/Birleştirme sırasında bir hata oluştu.');
      setDetailsLoading(false);
    }
  };

  const performCheckout = async (method: 'cash' | 'credit_card', targetOrderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered', payment_method: method })
        .eq('id', targetOrderId);
        
      if (error) throw error;
      
    } catch (err) {
      console.warn('payment_method hatasi, fallback deneniyor:', err);
      try {
        await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', targetOrderId);
      } catch (fallbackErr) {
        console.error('Fallback update de basarisiz oldu:', fallbackErr);
      }
    } finally {
      Alert.alert('Başarılı', 'Ödeme alındı ve hesap başarıyla kapatıldı.');
      closeModal();
      fetchOrders(); 
    }
  };

  const handleCheckoutPress = (orderId: string) => {
    Alert.alert(
      "Hesabı Kapat",
      "Ödeme yöntemini seçin:",
      [
        { text: "Nakit", onPress: () => performCheckout('cash', orderId) },
        { text: "Kredi Kartı", onPress: () => performCheckout('credit_card', orderId) },
        { text: "İptal", style: "cancel" }
      ]
    );
  };

  const openMenuModal = () => {
    setCart({}); // clear cart
    setIsMenuModalVisible(true);
  };

  const closeMenuModal = () => {
    setIsMenuModalVisible(false);
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = current + delta;
      if (next <= 0) {
        const newCart = { ...prev };
        delete newCart[itemId];
        return newCart;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const cartTotal = Object.entries(cart).reduce((sum, [itemId, quantity]) => {
    const item = menuItems.find(m => m.id === itemId);
    return sum + (item ? item.price * quantity : 0);
  }, 0);

  const handleSubmitOrder = async () => {
    if (Object.keys(cart).length === 0) {
      Alert.alert('Uyarı', 'Sepetiniz boş!');
      return;
    }

    if (!selectedTable) return;
    setSubmittingOrder(true);

    try {
      const existingOrder = getTableOrder(selectedTable);
      let targetOrderId = existingOrder?.id;

      if (!targetOrderId) {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            table_no: selectedTable,
            status: 'pending',
            total_amount: cartTotal
          })
          .select('id')
          .single();

        if (orderError) throw orderError;
        targetOrderId = newOrder.id;
      } else {
        // Update existing order total and FORCE status to pending so kitchen sees new items
        const newTotal = (existingOrder?.total_amount || 0) + cartTotal;
        const { error: updateError } = await supabase
          .from('orders')
          .update({ total_amount: newTotal, status: 'pending' })
          .eq('id', targetOrderId);

        if (updateError) throw updateError;
      }

      // Insert order items
      const orderItemsToInsert = Object.entries(cart).map(([itemId, quantity]) => {
        const item = menuItems.find(m => m.id === itemId);
        return {
          order_id: targetOrderId,
          menu_item_id: itemId,
          quantity: quantity,
          price_at_time: item?.price || 0
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsToInsert);

      if (itemsError) throw itemsError;

      Alert.alert('Başarılı', 'Sipariş mutfağa gönderildi!');
      closeMenuModal();
      
      // If adding to existing order, refetch details. If new, close all.
      if (existingOrder) {
        handleTablePress(selectedTable); // refresh items
      } else {
        closeModal();
      }
      fetchOrders();
    } catch (err) {
      console.error(err);
      Alert.alert('Hata', 'Sipariş gönderilirken bir sorun oluştu.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const renderTableDetailsModal = () => {
    if (!selectedTable) return null;
    
    const order = getTableOrder(selectedTable);
    const isOccupied = !!order;

    const totalAmount = selectedOrderItems.reduce((sum, item) => sum + (item.price_at_time * item.quantity), 0);

    return (
      <Modal visible={!!selectedTable && !isMenuModalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isOccupied ? `Masa ${selectedTable} Siparişi` : `Masa ${selectedTable} - Yeni Sipariş`}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Kapat</Text>
              </TouchableOpacity>
            </View>

            {isOccupied ? (
              <View style={styles.modalBody}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                  <View style={[styles.statusBadgeWrapper, {marginBottom: 0}]}>
                    <Text style={styles.statusBadgeText}>
                      Durum: {order.status === 'pending' ? 'Bekliyor' : order.status === 'preparing' ? 'Hazırlanıyor' : 'Hazır'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.transferBtn} onPress={() => setIsTransferViewVisible(true)}>
                    <Text style={styles.transferBtnText}>🔄 Taşı/Birleştir</Text>
                  </TouchableOpacity>
                </View>

                {detailsLoading ? (
                  <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 20 }} />
                ) : isTransferViewVisible ? (
                  <View style={styles.transferContainer}>
                    <Text style={styles.transferTitle}>Hedef Masa Seçin</Text>
                    <ScrollView style={styles.transferList} showsVerticalScrollIndicator={false}>
                      {tables.filter(t => t !== selectedTable).map(t => {
                        const isTargetOccupied = !!getTableOrder(t);
                        return (
                          <TouchableOpacity 
                            key={t} 
                            style={[styles.transferOptionBtn, isTargetOccupied ? styles.transferOptionOccupied : styles.transferOptionEmpty]} 
                            onPress={() => handleTransfer(t)}
                          >
                            <Text style={[styles.transferOptionText, isTargetOccupied && styles.transferOptionTextOccupied]}>
                              Masa {t} {isTargetOccupied ? '(Dolu - Birleştir)' : '(Boş - Taşı)'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity style={styles.discountCancelBtn} onPress={() => setIsTransferViewVisible(false)}>
                      <Text style={styles.discountCancelText}>Vazgeç</Text>
                    </TouchableOpacity>
                  </View>
                ) : isReceiptViewVisible ? (
                  <View style={styles.receiptContainer}>
                    <Text style={styles.receiptHeader}>DÖNEM POS / ADİSYON FİŞİ</Text>
                    <Text style={styles.receiptSubHeader}>Masa: {selectedTable}</Text>
                    <Text style={styles.receiptSubHeader}>Tarih: {new Date().toLocaleString('tr-TR')}</Text>
                    <View style={styles.receiptDivider} />
                    
                    <ScrollView style={styles.receiptItemsScroll} showsVerticalScrollIndicator={false}>
                      {selectedOrderItems.map(item => (
                        <View key={item.id} style={styles.receiptRow}>
                          <Text style={styles.receiptItemName}>{item.quantity}x {item.menu_items?.name}</Text>
                          <Text style={styles.receiptItemPrice}>{(item.price_at_time * item.quantity).toFixed(2)}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptTotalLabel}>Ara Toplam</Text>
                      <Text style={styles.receiptTotalValue}>{totalAmount.toFixed(2)}</Text>
                    </View>
                    {totalAmount > (order?.total_amount || 0) && (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptTotalLabel}>İskonto</Text>
                        <Text style={styles.receiptTotalValue}>-{(totalAmount - (order?.total_amount || 0)).toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptNetLabel}>NET TUTAR</Text>
                      <Text style={styles.receiptNetValue}>{(order?.total_amount || 0).toFixed(2)} ₺</Text>
                    </View>
                    
                    <TouchableOpacity style={styles.receiptCloseBtn} onPress={() => setIsReceiptViewVisible(false)}>
                      <Text style={styles.receiptCloseBtnText}>Geri Dön</Text>
                    </TouchableOpacity>
                  </View>
                ) : isDiscountViewVisible ? (
                  <View style={styles.discountContainer}>
                    <Text style={styles.discountTitle}>İskonto Oranı Seçin</Text>
                    <View style={styles.discountButtonsRow}>
                      <TouchableOpacity style={styles.discountOptionBtn} onPress={() => applyDiscount(10, order.id, order.total_amount)}>
                        <Text style={styles.discountOptionText}>%10</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.discountOptionBtn} onPress={() => applyDiscount(20, order.id, order.total_amount)}>
                        <Text style={styles.discountOptionText}>%20</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.discountOptionBtn, {backgroundColor: '#10b981'}]} onPress={() => applyDiscount(100, order.id, order.total_amount)}>
                        <Text style={[styles.discountOptionText, {color: '#fff'}]}>İkram</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.discountCancelBtn} onPress={() => setIsDiscountViewVisible(false)}>
                      <Text style={styles.discountCancelText}>Vazgeç</Text>
                    </TouchableOpacity>
                  </View>
                ) : isSplitBillVisible ? (
                  <View style={styles.splitBillContainer}>
                    <Text style={styles.splitBillTitle}>Ödenecek Ürünleri Seçin</Text>
                    <ScrollView style={styles.splitBillList} showsVerticalScrollIndicator={false}>
                      {selectedOrderItems.filter(item => !item.is_paid).map(item => {
                        const isSelected = selectedSplitItems.includes(item.id);
                        return (
                          <TouchableOpacity 
                            key={item.id} 
                            style={[styles.splitItemRow, isSelected && styles.splitItemSelected]} 
                            onPress={() => toggleSplitItem(item.id)}
                          >
                            <View style={styles.splitItemCheckbox}>
                              {isSelected && <View style={styles.splitItemCheckboxInner} />}
                            </View>
                            <Text style={styles.splitItemName}>{item.quantity}x {item.menu_items?.name}</Text>
                            <Text style={styles.splitItemPrice}>{(item.price_at_time * item.quantity).toFixed(2)} ₺</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {selectedOrderItems.filter(item => !item.is_paid).length === 0 && (
                        <Text style={styles.emptyText}>Ödenecek ürün kalmadı.</Text>
                      )}
                    </ScrollView>
                    
                    <View style={styles.splitBillActions}>
                      <TouchableOpacity style={styles.discountCancelBtn} onPress={() => setIsSplitBillVisible(false)}>
                        <Text style={styles.discountCancelText}>Vazgeç</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.splitBillPayBtn} onPress={handleSplitBillPay}>
                        <Text style={styles.splitBillPayText}>Seçilenleri Öde</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.orderItemsContainer}>
                    <FlatList
                      data={selectedOrderItems}
                      keyExtractor={item => item.id}
                      renderItem={({ item }) => (
                        <View style={[styles.orderItemRow, item.is_paid && { opacity: 0.5 }]}>
                          <Text style={[styles.orderItemName, item.is_paid && { textDecorationLine: 'line-through' }]}>
                            {item.quantity}x {item.menu_items?.name || 'Ürün bulunamadı'} {item.is_paid ? '(Ödendi)' : ''}
                          </Text>
                          <Text style={styles.orderItemPrice}>₺{(item.price_at_time * item.quantity).toFixed(2)}</Text>
                        </View>
                      )}
                      ListEmptyComponent={<Text style={styles.emptyText}>Henüz ürün eklenmemiş.</Text>}
                    />
                    
                    {selectedOrderItems.length > 0 && (
                      <View style={styles.totalRow}>
                        <View style={{flexDirection: 'column', alignItems: 'flex-end', marginRight: 10}}>
                          <Text style={styles.totalLabel}>Ara Toplam: ₺{totalAmount.toFixed(2)}</Text>
                          <Text style={styles.totalAmountLabel}>Ödenecek:</Text>
                        </View>
                        <Text style={styles.totalAmount}>₺{((order?.total_amount || 0) - selectedOrderItems.filter(i=>i.is_paid).reduce((s,i)=>s+(i.price_at_time*i.quantity),0)).toFixed(2)}</Text>
                      </View>
                    )}
                  </View>
                )}
                
                {!isDiscountViewVisible && !isReceiptViewVisible && !isTransferViewVisible && !isSplitBillVisible && (
                  <>
                    <TouchableOpacity style={styles.receiptBtn} onPress={() => setIsReceiptViewVisible(true)}>
                      <Text style={styles.receiptBtnText}>📄 Adisyon Önizle</Text>
                    </TouchableOpacity>
                    <View style={[styles.modalActions, { marginTop: 10 }]}>
                      <TouchableOpacity style={styles.addBtn} onPress={openMenuModal}>
                        <Text style={styles.addBtnText}>+ Ekle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.discountModeBtn, {backgroundColor: '#3b82f6', flex: 1, marginHorizontal: 5}]} onPress={() => setIsSplitBillVisible(true)}>
                        <Text style={styles.discountModeBtnText}>💳 Böl</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.discountModeBtn, {flex: 1}]} onPress={() => setIsDiscountViewVisible(true)}>
                        <Text style={styles.discountModeBtnText}>% İsk</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.checkoutBtn} onPress={() => handleCheckoutPress(order.id)}>
                        <Text style={styles.checkoutBtnText}>Kapat</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.emptyTableWrapper}>
                  <Text style={styles.emptyTableText}>Bu masa şu an boş.</Text>
                </View>
                <TouchableOpacity style={styles.createOrderBtn} onPress={openMenuModal}>
                  <Text style={styles.createOrderBtnText}>Sipariş Oluştur</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderMenuModal = () => {
    const displayedMenuItems = menuItems.filter(m => m.category_id === selectedCategoryId);

    return (
      <Modal visible={isMenuModalVisible} transparent animationType="slide" onRequestClose={closeMenuModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { minHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Menü - Masa {selectedTable}</Text>
              <TouchableOpacity onPress={closeMenuModal} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>İptal</Text>
              </TouchableOpacity>
            </View>

            {/* Categories */}
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                {categories.map(cat => (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={[styles.categoryTab, selectedCategoryId === cat.id && styles.categoryTabActive]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Text style={[styles.categoryTabText, selectedCategoryId === cat.id && styles.categoryTabTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Menu Items */}
            <FlatList
              data={displayedMenuItems}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingVertical: 10 }}
              renderItem={({ item }) => {
                const quantity = cart[item.id] || 0;
                return (
                  <View style={[styles.menuItemCard, !item.is_available && { opacity: 0.5 }]}>
                    <View style={styles.menuItemInfo}>
                      <Text style={[styles.menuItemName, !item.is_available && { textDecorationLine: 'line-through' }]}>
                        {item.name} {!item.is_available && '(TÜKENDİ)'}
                      </Text>
                      <Text style={styles.menuItemPrice}>₺{item.price.toFixed(2)}</Text>
                    </View>
                    <View style={styles.cartControls}>
                      <TouchableOpacity 
                        style={[styles.cartBtn, (quantity === 0 || !item.is_available) && { opacity: 0.3 }]} 
                        onPress={() => updateCart(item.id, -1)}
                        disabled={quantity === 0}
                      >
                        <Text style={styles.cartBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.cartQuantity}>{quantity}</Text>
                      <TouchableOpacity 
                        style={[styles.cartBtn, !item.is_available && { opacity: 0.3 }]} 
                        onPress={() => updateCart(item.id, 1)}
                        disabled={!item.is_available}
                      >
                        <Text style={styles.cartBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>Bu kategoride ürün yok.</Text>}
            />

            {/* Cart Footer */}
            <View style={styles.cartFooter}>
              <View style={styles.cartFooterInfo}>
                <Text style={styles.cartFooterLabel}>Sepet Toplamı</Text>
                <Text style={styles.cartFooterTotal}>₺{cartTotal.toFixed(2)}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.submitOrderBtn, (cartTotal === 0 || submittingOrder) && { opacity: 0.5 }]} 
                onPress={handleSubmitOrder}
                disabled={cartTotal === 0 || submittingOrder}
              >
                {submittingOrder ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitOrderBtnText}>Siparişi Mutfağa Gönder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };


  const renderTable = ({ item: tableNo }: { item: string }) => {
    const order = getTableOrder(tableNo);
    const isOccupied = !!order;
    
    let bgColor = '#f1f5f9'; // empty (gray)
    let textColor = '#64748b';
    let statusText = 'Boş';

    if (isOccupied) {
      textColor = '#ffffff';
      if (order.status === 'pending') {
        bgColor = '#f59e0b'; // orange
        statusText = 'Bekliyor';
      } else if (order.status === 'preparing') {
        bgColor = '#3b82f6'; // blue
        statusText = 'Hazırlanıyor';
      } else if (order.status === 'ready') {
        bgColor = '#10b981'; // green
        statusText = 'Hazır';
      }
    }

    return (
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: bgColor }]}
        onPress={() => handleTablePress(tableNo)}
      >
        <Text style={[styles.tableNumber, { color: textColor }]}>Masa {tableNo}</Text>
        <Text style={[styles.tableStatus, { color: textColor }]}>{statusText}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Garson Paneli</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filtersContainer}>
        {(['all', 'occupied', 'empty'] as FilterType[]).map(f => (
          <TouchableOpacity 
            key={f} 
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'Tüm Masalar' : f === 'occupied' ? 'Dolu' : 'Boş'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTables}
        keyExtractor={item => item}
        renderItem={renderTable}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
      />

      {renderTableDetailsModal()}
      {renderMenuModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  logoutText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  filtersContainer: {
    flexDirection: 'row',
    padding: 15,
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    marginBottom: 10,
  },
  filterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterBtnActive: {
    backgroundColor: '#6366f1',
  },
  filterText: {
    color: '#64748b',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: SPACING,
  },
  row: {
    justifyContent: 'flex-start',
  },
  card: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    margin: SPACING / 2,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  tableNumber: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  tableStatus: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.9,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#64748b',
    fontWeight: 'bold',
  },
  modalBody: {
    flex: 1,
  },
  statusBadgeWrapper: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 15,
  },
  statusBadgeText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: 'bold',
  },
  orderItemsContainer: {
    flex: 1,
    maxHeight: 250,
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderItemName: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '500',
  },
  orderItemPrice: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 20,
    fontStyle: 'italic',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 15,
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 18,
    color: '#64748b',
    marginRight: 10,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10b981',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  addBtn: {
    flex: 1,
    backgroundColor: '#e0e7ff',
    padding: 16,
    borderRadius: 12,
    marginRight: 10,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#4f46e5',
    fontWeight: 'bold',
    fontSize: 16,
  },
  checkoutBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    marginLeft: 10,
    alignItems: 'center',
  },
  checkoutBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  splitBillContainer: {
    flex: 1,
  },
  splitBillTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  splitBillList: {
    flex: 1,
    marginBottom: 10,
  },
  splitItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  splitItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  splitItemCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitItemCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  splitItemName: {
    flex: 1,
    fontSize: 16,
    color: '#334155',
  },
  splitItemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  splitBillActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  splitBillPayBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  splitBillPayText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyTableWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTableText: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 20,
  },
  createOrderBtn: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 'auto',
  },
  createOrderBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },

  // Menu Modal Styles
  categoriesScroll: {
    flexGrow: 0,
    marginBottom: 15,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    marginRight: 10,
  },
  categoryTabActive: {
    backgroundColor: '#4f46e5',
  },
  categoryTabText: {
    color: '#64748b',
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: '#ffffff',
  },
  menuItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 10,
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: 15,
    color: '#10b981',
    fontWeight: '600',
  },
  cartControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cartBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
  },
  cartBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  cartQuantity: {
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    minWidth: 20,
    textAlign: 'center',
  },
  cartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 10,
  },
  cartFooterInfo: {
    flex: 1,
  },
  cartFooterLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  cartFooterTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#10b981',
  },
  submitOrderBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitOrderBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  discountContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    minHeight: 250,
  },
  discountTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 30,
  },
  discountButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  discountOptionBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 12,
  },
  discountOptionText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  discountCancelBtn: {
    padding: 15,
  },
  discountCancelText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  discountModeBtn: {
    flex: 1,
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  discountModeBtnText: {
    color: '#d97706',
    fontWeight: 'bold',
    fontSize: 15,
  },
  totalAmountLabel: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: 'bold',
    marginTop: 4,
  },
  receiptBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  receiptBtnText: {
    color: '#334155',
    fontWeight: 'bold',
    fontSize: 15,
  },
  receiptContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 350,
  },
  receiptHeader: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 10,
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptSubHeader: {
    textAlign: 'center',
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptDivider: {
    height: 1,
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  receiptItemsScroll: {
    maxHeight: 150,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptItemName: {
    fontSize: 14,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptItemPrice: {
    fontSize: 14,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptTotalLabel: {
    fontSize: 14,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptTotalValue: {
    fontSize: 14,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptNetLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptNetValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  receiptCloseBtn: {
    marginTop: 20,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  receiptCloseBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  transferBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  transferBtnText: {
    color: '#334155',
    fontWeight: 'bold',
    fontSize: 14,
  },
  transferContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: 12,
  },
  transferTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 15,
    textAlign: 'center',
  },
  transferList: {
    maxHeight: 300,
  },
  transferOptionBtn: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  transferOptionEmpty: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  transferOptionOccupied: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  transferOptionText: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '500',
    textAlign: 'center',
  },
  transferOptionTextOccupied: {
    color: '#d97706',
    fontWeight: 'bold',
  },
});
