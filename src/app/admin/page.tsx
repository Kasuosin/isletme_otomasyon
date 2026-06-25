"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { DollarSign, CreditCard, Banknote, ClipboardCheck, Clock } from "lucide-react";

interface Order {
  id: string;
  table_no: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export default function AdminDashboard() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin_dashboard_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['delivered', 'completed'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  };

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const cashRevenue = orders.filter(o => o.payment_method === 'cash').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const cardRevenue = orders.filter(o => o.payment_method === 'credit_card' || o.payment_method === 'card').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalClosedOrders = orders.length;

  const recentOrders = orders.slice(0, 10);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Yönetici Paneli (MIS)</h1>
            <p className="text-slate-400 mt-1">Sistemdeki kapanmış siparişlerin canlı finansal ve operasyonel özetleri.</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 shadow-sm">
            <span className="flex h-3 w-3 relative mr-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium text-slate-300">Sistem Aktif (Canlı)</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Revenue Card */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign size={120} />
            </div>
            <div className="flex items-center space-x-4 mb-4 relative z-10">
              <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <DollarSign size={24} />
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Günlük Toplam Ciro</h3>
            </div>
            <p className="text-4xl font-extrabold text-white relative z-10">₺{totalRevenue.toFixed(2)}</p>
          </div>

          {/* Payment Methods Card */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <CreditCard size={24} />
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Ödeme Dağılımı</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-700/30 p-2 rounded-lg">
                <span className="flex items-center text-slate-400"><Banknote size={16} className="mr-2" /> Nakit</span>
                <span className="font-bold text-emerald-400">₺{cashRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-700/30 p-2 rounded-lg">
                <span className="flex items-center text-slate-400"><CreditCard size={16} className="mr-2" /> Kredi Kartı</span>
                <span className="font-bold text-indigo-400">₺{cardRevenue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Orders Count Card */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg relative overflow-hidden group">
             <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <ClipboardCheck size={120} />
            </div>
            <div className="flex items-center space-x-4 mb-4 relative z-10">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                <ClipboardCheck size={24} />
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Kapanan Siparişler</h3>
            </div>
            <p className="text-4xl font-extrabold text-white relative z-10">{totalClosedOrders}</p>
            <p className="text-sm text-slate-400 mt-2 relative z-10">Toplam tamamlanan işlem</p>
          </div>
        </div>

        {/* Live Logs Table */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
          <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
            <h3 className="text-xl font-bold text-white flex items-center">
              <Clock size={20} className="mr-2 text-indigo-400" /> Son 10 Kapanan Sipariş (Canlı Log)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Masa No</th>
                  <th className="p-4 font-semibold">Tutar</th>
                  <th className="p-4 font-semibold">Ödeme Tipi</th>
                  <th className="p-4 font-semibold">İşlem Saati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                      Henüz tamamlanan sipariş bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => {
                    const isCash = order.payment_method === 'cash';
                    return (
                      <tr key={order.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="p-4">
                          <span className="font-medium text-white">Masa {order.table_no}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-emerald-400">₺{Number(order.total_amount).toFixed(2)}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center w-fit ${
                            isCash ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {isCash ? 'Nakit' : 'Kredi Kartı'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 text-sm font-mono">
                          {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
