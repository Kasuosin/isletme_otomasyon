import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Platform, ActivityIndicator, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { LineChart, BarChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

type FilterType = 'today' | '7days' | 'all';

export default function AdminPanelScreen({ navigation }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('7days');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    let channel: any = null;
    let reconnectTimer: NodeJS.Timeout;

    const setupRealtime = () => {
      if (channel) {
        supabase.removeChannel(channel);
      }

      channel = supabase
        .channel('admin_panel_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          fetchData();
        })
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('Admin channel disconnected, attempting to reconnect...');
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

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, total_amount, payment_method, status, created_at,
        order_items ( id, quantity, price_at_time, menu_items(name) )
      `)
      .in('status', ['delivered', 'completed'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    } else if (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const filteredOrders = useMemo(() => {
    const now = new Date();
    return orders.filter(o => {
      const d = new Date(o.created_at);
      if (filter === 'today') {
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      } else if (filter === '7days') {
        const diffTime = Math.abs(now.getTime() - d.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      return true;
    });
  }, [orders, filter]);

  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0).map(() => ({ count: 0, revenue: 0 }));
    filteredOrders.forEach(o => {
      const h = new Date(o.created_at).getHours();
      hours[h].count += 1;
      hours[h].revenue += Number(o.total_amount);
    });
    
    // 6 blocks of 4 hours
    const blocks = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];
    const blockData = Array(6).fill(0).map(() => ({ count: 0, revenue: 0 }));
    hours.forEach((h, i) => {
      const bIdx = Math.floor(i / 4);
      blockData[bIdx].count += h.count;
      blockData[bIdx].revenue += h.revenue;
    });
    
    // If all revenue is 0, prevent chart crash
    if (blockData.every(b => b.revenue === 0)) {
       blockData[0].revenue = 0.01;
    }
    if (blockData.every(b => b.count === 0)) {
       blockData[0].count = 0.01;
    }

    return { blocks, data: blockData };
  }, [filteredOrders]);

  const productSales = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      o.order_items?.forEach((item: any) => {
        const name = item.menu_items?.name || 'Bilinmeyen';
        map[name] = (map[name] || 0) + item.quantity;
      });
    });
    const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 5); // top 5
    if (sorted.length === 0) return { labels: ['Yok'], data: [0.01] };
    return {
      labels: sorted.map(s => s[0].substring(0, 8) + (s[0].length > 8 ? '..' : '')),
      data: sorted.map(s => s[1])
    };
  }, [filteredOrders]);

  const heatmapData = useMemo(() => {
    const matrix: Record<string, number[]> = {}; 
    let maxVal = 0;
    filteredOrders.forEach(o => {
      const h = new Date(o.created_at).getHours();
      const bIdx = Math.floor(h / 4);
      o.order_items?.forEach((item: any) => {
        const name = item.menu_items?.name || 'Bilinmeyen';
        if (!matrix[name]) matrix[name] = [0,0,0,0,0,0];
        matrix[name][bIdx] += item.quantity;
        if (matrix[name][bIdx] > maxVal) maxVal = matrix[name][bIdx];
      });
    });
    
    const sortedProducts = Object.keys(matrix).sort((a,b) => matrix[b].reduce((x,y)=>x+y) - matrix[a].reduce((x,y)=>x+y)).slice(0, 8); 
    
    return { products: sortedProducts, matrix, maxVal };
  }, [filteredOrders]);

  const insights = useMemo(() => {
    if (filteredOrders.length === 0) return ["Yeterli veri yok."];
    const msgs = [];
    
    const maxHourBlock = hourlyData.data.reduce((maxIdx, val, idx, arr) => val.revenue > arr[maxIdx].revenue ? idx : maxIdx, 0);
    msgs.push(`🚀 En verimli saat: ${hourlyData.blocks[maxHourBlock]} (${hourlyData.data[maxHourBlock].revenue.toFixed(0)} ₺ ciro)`);
    
    if (productSales.labels[0] !== 'Yok') {
      msgs.push(`👑 Yıldız Ürün: ${productSales.labels[0]} (${Math.floor(productSales.data[0])} adet)`);
    }
    
    const totalRev = hourlyData.data.reduce((sum, d) => sum + d.revenue, 0);
    const avgOrderValue = (totalRev / filteredOrders.length) || 0;
    msgs.push(`💰 Sepet Ortalaması: ${avgOrderValue.toFixed(2)} ₺`);
    
    return msgs;
  }, [hourlyData, productSales, filteredOrders]);

  const chartConfigBase = {
    backgroundColor: "#1e293b",
    backgroundGradientFrom: "#1e293b",
    backgroundGradientTo: "#0f172a",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "4", strokeWidth: "2", stroke: "#0f172a" },
    fillShadowGradientOpacity: 0.4
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>İş Zekası (BI)</Text>
          <Text style={styles.subtitle}>Gelişmiş Analitik Paneli</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => navigation.replace('RoleSelection')}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        {(['today', '7days', 'all'] as FilterType[]).map(f => (
          <TouchableOpacity 
            key={f} 
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'today' ? 'Bugün' : f === '7days' ? 'Son 7 Gün' : 'Tüm Zamanlar'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Ciro Yoğunluk Grafiği</Text>
          <Text style={styles.chartSubtitle}>Saatlere göre elde edilen TL ciro</Text>
          <LineChart
            data={{
              labels: hourlyData.blocks,
              datasets: [{ data: hourlyData.data.map(d => d.revenue) }]
            }}
            width={width - 40}
            height={220}
            chartConfig={{
              ...chartConfigBase,
              color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`, // Orange
              fillShadowGradient: "#f59e0b"
            }}
            bezier
            style={styles.chartStyle}
            yAxisLabel="₺"
            yAxisSuffix=""
          />
        </View>

        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Sipariş Trafiği</Text>
          <Text style={styles.chartSubtitle}>Saatlere göre kapanan adisyon sayısı</Text>
          <LineChart
            data={{
              labels: hourlyData.blocks,
              datasets: [{ data: hourlyData.data.map(d => d.count) }]
            }}
            width={width - 40}
            height={220}
            chartConfig={{
              ...chartConfigBase,
              color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`, // Indigo
              fillShadowGradient: "#6366f1"
            }}
            bezier
            style={styles.chartStyle}
            yAxisLabel=""
            yAxisSuffix=""
          />
        </View>

        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Ürün Satış Performansı</Text>
          <Text style={styles.chartSubtitle}>En çok satılan ilk 5 ürün</Text>
          <BarChart
            data={{
              labels: productSales.labels,
              datasets: [{ data: productSales.data }]
            }}
            width={width - 40}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...chartConfigBase,
              color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, // Emerald
              fillShadowGradient: "#10b981",
              barPercentage: 0.5,
            }}
            style={styles.chartStyle}
            showValuesOnTopOfBars
          />
        </View>

        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Ürün x Saat Isı Haritası</Text>
          <Text style={styles.chartSubtitle}>Hangi ürün hangi saatte çok satıyor?</Text>
          <View style={styles.heatmapContainer}>
            <View style={styles.hmRow}>
              <View style={styles.hmColLabel}><Text style={styles.hmTextLabel}></Text></View>
              {hourlyData.blocks.map(b => (
                <View key={b} style={styles.hmColLabel}>
                  <Text style={styles.hmTextLabel}>{b.substring(0,2)}h</Text>
                </View>
              ))}
            </View>
            
            {heatmapData.products.length === 0 ? (
              <Text style={styles.emptyText}>Veri yok</Text>
            ) : (
              heatmapData.products.map(p => (
                <View key={p} style={styles.hmRow}>
                  <View style={styles.hmColLabel}>
                    <Text style={styles.hmTextLabelProduct} numberOfLines={1}>{p}</Text>
                  </View>
                  {heatmapData.matrix[p].map((val, i) => {
                    const intensity = heatmapData.maxVal > 0 ? (val / heatmapData.maxVal) : 0;
                    return (
                      <View key={i} style={[styles.hmCell, { backgroundColor: `rgba(245, 158, 11, ${intensity * 0.8 + 0.1})` }]}>
                        <Text style={[styles.hmCellText, { color: intensity > 0.4 ? '#fff' : '#64748b' }]}>
                          {val > 0 ? val : ''}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Akıllı Özet</Text>
          <View style={styles.insightsContainer}>
            {insights.map((msg, i) => (
              <View key={i} style={styles.insightCard}>
                <Text style={styles.insightText}>{msg}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontSize: 14,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  filterText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  chartSection: {
    marginBottom: 30,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 15,
  },
  chartStyle: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  heatmapContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  hmRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hmColLabel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  hmTextLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  hmTextLabelProduct: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'left',
    width: '100%',
  },
  hmCell: {
    flex: 1,
    aspectRatio: 1,
    marginHorizontal: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hmCellText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    padding: 20,
  },
  insightsContainer: {
    marginTop: 10,
    gap: 10,
  },
  insightCard: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981', // Emerald
  },
  insightText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  }
});
