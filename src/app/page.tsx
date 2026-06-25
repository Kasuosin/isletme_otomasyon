import Link from "next/link";
import { Utensils } from "lucide-react";

export default function Home() {
  const tables = Array.from({ length: 15 }, (_, i) => (i + 1).toString());

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight">
          QR Sipariş & Adisyon Otomasyonu
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Müşteri paneli üzerinden sipariş testlerinizi gerçekleştirebilirsiniz.
        </p>

        {/* Test Links for Tables */}
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl text-left max-w-2xl mx-auto">
          <h3 className="font-bold text-orange-800 mb-2">🧪 Test İçin Müşteri Menüleri (QR Kod Simülasyonu)</h3>
          <div className="flex flex-wrap gap-2">
            {tables.map(tableNo => (
              <Link 
                key={tableNo} 
                href={`/menu?table=${tableNo}`}
                className="bg-white border border-orange-200 text-orange-700 px-3 py-1 rounded-lg text-sm hover:bg-orange-100 transition font-medium"
              >
                Masa {tableNo}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-4">
          {/* Müşteri Menüsü */}
          <Link href="/menu" className="w-full max-w-sm group flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all">
            <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Utensils size={28} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Müşteri Menüsü</h2>
            <p className="text-xs text-gray-500">Karekodsuz genel giriş</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
