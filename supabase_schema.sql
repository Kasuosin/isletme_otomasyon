-- 1. Tabloların Oluşturulması

-- Kategoriler Tablosu (Menü kategorileri)
CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Menü Öğeleri Tablosu
CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url text,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Siparişler Tablosu
CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_no text, -- Restoran içi QR siparişleri için masa numarası
    status text NOT NULL DEFAULT 'pending', -- pending, preparing, ready, on_way, delivered, cancelled
    total_amount numeric(10,2) NOT NULL DEFAULT 0,
    payment_method text NOT NULL DEFAULT 'cash', -- cash, credit_card, qr
    is_paid boolean DEFAULT false, -- Ödemesi alınmış mı?
    pos_transaction_id text, -- POS Cihazı referans/onay kodu
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sipariş Detayları (Ürünler) Tablosu
CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
    quantity integer NOT NULL DEFAULT 1,
    price_at_time numeric(10,2) NOT NULL, -- Sipariş anındaki fiyatı sabitlemek için
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Kullanıcı Profilleri (Admin ve Kurye yönetimi için)
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    role text NOT NULL DEFAULT 'user', -- admin, courier
    full_name text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 2. Supabase Realtime Aktivasyonu (Mutfak paneli ve Kurye canlı takibi için)
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;


-- 3. Row Level Security (RLS) Politikaları

-- Varsayılan olarak tüm tablolarda RLS'yi açıyoruz
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Müşteriler (Anonim kullanıcılar) kategorileri ve menüyü okuyabilir
CREATE POLICY "Menü herkes tarafından okunabilir" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Menü ürünleri herkes tarafından okunabilir" ON public.menu_items FOR SELECT USING (true);

-- Müşteriler sipariş oluşturabilir (insert)
CREATE POLICY "Herkes sipariş oluşturabilir" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Herkes sipariş detayı ekleyebilir" ON public.order_items FOR INSERT WITH CHECK (true);

-- Admin ve Kurye politikaları (Basit tutulmuştur, geliştirilebilir)
-- Not: Gerçek bir projede auth.jwt() ->> 'role' kontrolü yapılmalıdır, şimdilik public testler için açık bırakıldı.
CREATE POLICY "Siparişleri herkes görebilir ve güncelleyebilir (Geçici test kuralı)" ON public.orders FOR ALL USING (true);
CREATE POLICY "Sipariş detaylarını herkes görebilir (Geçici test kuralı)" ON public.order_items FOR ALL USING (true);
CREATE POLICY "Profilleri herkes görebilir (Geçici test kuralı)" ON public.profiles FOR ALL USING (true);


-- 4. Auth (Kayıt) tetikleyicisi: Yeni üye olunca profiles tablosuna otomatik ekle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'courier'); -- Varsayılan courier olarak ayarlandı, panelden değiştirilebilir
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
