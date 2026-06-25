import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, Platform, StatusBar, ActivityIndicator, Alert, Modal, Switch, Animated } from 'react-native';
import { supabase } from '../lib/supabase';

interface OrderItem {
  id: string;
  quantity: number;
  menu_items: { name: string };
}

interface KitchenOrder {
  id: string;
  table_no: string;
  status: 'pending' | 'preparing';
  created_at: string;
  order_items: OrderItem[];
}

export default function KitchenPanelScreen({ navigation }: any) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStockModalVisible, setIsStockModalVisible] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  useEffect(() => {
    fetchKitchenOrders();
    fetchMenuItems();

    let channel: any = null;
    let reconnectTimer: NodeJS.Timeout;

    const setupRealtime = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }

      channel = supabase
        .channel('kitchen_orders_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          fetchKitchenOrders();
          if (payload.new.status === 'pending') {
            Alert.alert('🔔 YENİ SİPARİŞ GELDİ!', `Masa ${payload.new.table_no} sipariş gönderdi, mutfak başına!`);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
          fetchKitchenOrders();
          if (payload.new.status === 'pending' && payload.old?.status !== 'pending') {
            Alert.alert('🔔 YENİ SİPARİŞ EKLENDİ!', `Masa ${payload.new.table_no} ek sipariş gönderdi!`);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
          fetchKitchenOrders();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
          fetchMenuItems();
        })
        .subscribe((status, err) => {
          console.log('Kitchen Orders Channel Status:', status);
          if (err) console.error('Kitchen Orders Channel Error:', err);

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('Kitchen channel disconnected, attempting to reconnect...');
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
        console.log('Auth token refreshed, reconnecting kitchen realtime...');
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

  const fetchKitchenOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          table_no,
          status,
          created_at,
          order_items (
            id,
            quantity,
            menu_items ( name )
          )
        `)
        .in('status', ['pending', 'preparing'])
        .order('created_at', { ascending: false }); // Newest orders at the top

      if (error) {
        console.error('Error fetching kitchen orders:', error);
      } else {
        setOrders(data as unknown as KitchenOrder[] || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('category_id')
        .order('name');
      if (error) throw error;
      setMenuItems(data || []);
    } catch (err) {
      console.error('Error fetching menu items:', err);
    }
  };

  const toggleAvailability = async (item: any) => {
    const previousState = [...menuItems];
    const newStatus = !item.is_available;
    
    // Optimistic UI update
    setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_available: newStatus } : m));

    try {
      const { data, error } = await supabase
        .from('menu_items')
        .update({ is_available: newStatus })
        .eq('id', item.id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        setMenuItems(previousState);
        Alert.alert('Yetki Hatası', 'Güncelleme veritabanına yazılamadı! RLS (Row Level Security) Update izniniz olmayabilir.');
      }
    } catch (err) {
      setMenuItems(previousState);
      console.error('Error updating availability:', err);
      Alert.alert('Hata', 'Stok durumu güncellenemedi.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      fetchKitchenOrders(); // Refresh locally after update
    } catch (err) {
      console.error(err);
      Alert.alert('Hata', 'Durum güncellenirken bir sorun oluştu.');
    }
  };

  const KitchenOrderCard = ({ item }: { item: KitchenOrder }) => {
    const [elapsedMinutes, setElapsedMinutes] = useState(0);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
      const calculateElapsed = () => {
        const created = new Date(item.created_at).getTime();
        const now = new Date().getTime();
        const diffMinutes = Math.floor((now - created) / 60000);
        setElapsedMinutes(diffMinutes);
      };

      calculateElapsed();
      const interval = setInterval(calculateElapsed, 30000); // Check every 30 secs

      return () => clearInterval(interval);
    }, [item.created_at]);

    useEffect(() => {
      if (elapsedMinutes >= 15 && item.status === 'pending') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 0.6,
              duration: 800,
              useNativeDriver: false,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: false,
            })
          ])
        ).start();
      } else {
        pulseAnim.setValue(1);
        pulseAnim.stopAnimation();
      }
    }, [elapsedMinutes, item.status]);

    const isPending = item.status === 'pending';
    const isDelayed = elapsedMinutes >= 15 && isPending;

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
      <Animated.View style={[
        styles.card, 
        isPending ? styles.cardPending : styles.cardPreparing, 
        isDelayed && { borderColor: '#ef4444', borderWidth: 3, opacity: pulseAnim }
      ]}>
        <View style={[styles.cardHeader, isDelayed && { backgroundColor: '#fee2e2', borderBottomColor: '#fca5a5' }]}>
          <Text style={[styles.tableNo, isDelayed && { color: '#b91c1c' }]}>Masa {item.table_no}</Text>
          <View style={{alignItems: 'flex-end'}}>
            <Text style={[styles.timeText, isDelayed && { color: '#dc2626', fontWeight: 'bold' }]}>⏱️ {elapsedMinutes} dk bekliyor</Text>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
        </View>

        <View style={styles.itemsContainer}>
          {item.order_items && item.order_items.map(orderItem => (
            <View key={orderItem.id} style={styles.itemRow}>
              <Text style={styles.itemQuantity}>{orderItem.quantity}x</Text>
              <Text style={styles.itemName}>{orderItem.menu_items?.name || 'Bilinmeyen Ürün'}</Text>
            </View>
          ))}
          {(!item.order_items || item.order_items.length === 0) && (
            <Text style={styles.emptyText}>Bu siparişte ürün bulunamadı.</Text>
          )}
        </View>

        <View style={styles.actionContainer}>
          {isPending ? (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.btnPreparing, isDelayed && { backgroundColor: '#ef4444' }]} 
              onPress={() => updateOrderStatus(item.id, 'preparing')}
            >
              <Text style={styles.actionBtnText}>{isDelayed ? 'ACİL: Hazırlamaya Başla' : 'Hazırlamaya Başla'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.btnReady]} 
              onPress={() => updateOrderStatus(item.id, 'ready')}
            >
              <Text style={styles.actionBtnText}>Hazır / Servis Et</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mutfak Paneli</Text>
          <Text style={styles.subtitle}>Sipariş Akışı</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <TouchableOpacity onPress={() => { setIsStockModalVisible(true); fetchMenuItems(); }} style={[styles.logoutBtn, {backgroundColor: '#e0e7ff', marginRight: 10}]}>
            <Text style={[styles.logoutText, {color: '#4f46e5'}]}>🍔 Stok</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Çıkış</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={isStockModalVisible} animationType="slide" transparent>
        <View style={styles.stockModalOverlay}>
          <View style={styles.stockModalContent}>
            <View style={styles.stockModalHeader}>
              <Text style={styles.stockModalTitle}>Ürün Stok Yönetimi</Text>
              <TouchableOpacity onPress={() => setIsStockModalVisible(false)} style={styles.stockCloseBtn}>
                <Text style={styles.stockCloseBtnText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={menuItems}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <View style={styles.stockItemRow}>
                  <View style={styles.stockItemInfo}>
                    <Text style={[styles.stockItemName, !item.is_available && styles.stockItemNameDisabled]}>
                      {item.name} {!item.is_available && '(TÜKENDİ)'}
                    </Text>
                    <Text style={styles.stockItemPrice}>{item.price} ₺</Text>
                  </View>
                  <Switch
                    trackColor={{ false: "#cbd5e1", true: "#34d399" }}
                    thumbColor={item.is_available ? "#059669" : "#94a3b8"}
                    ios_backgroundColor="#cbd5e1"
                    onValueChange={() => toggleAvailability(item)}
                    value={item.is_available}
                  />
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#f59e0b" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={orders}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <KitchenOrderCard item={item} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Sipariş Yok</Text>
                <Text style={styles.emptyDesc}>Şu an mutfakta bekleyen sipariş bulunmuyor. Rahatlayabilirsiniz!</Text>
              </View>
            }
          />
        )}
      </View>
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
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
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
  content: {
    flex: 1,
  },
  listContent: {
    padding: 15,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  cardPending: {
    borderLeftColor: '#f59e0b', // orange
  },
  cardPreparing: {
    borderLeftColor: '#3b82f6', // blue
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  tableNo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  itemsContainer: {
    marginBottom: 15,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemQuantity: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
    width: 35,
  },
  itemName: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  actionContainer: {
    marginTop: 'auto',
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPreparing: {
    backgroundColor: '#3b82f6',
  },
  btnReady: {
    backgroundColor: '#10b981',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 10,
  },
  emptyDesc: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  stockModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  stockModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  stockModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stockModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  stockCloseBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stockCloseBtnText: {
    color: '#475569',
    fontWeight: 'bold',
  },
  stockItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stockItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  stockItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  stockItemNameDisabled: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  stockItemPrice: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
});
