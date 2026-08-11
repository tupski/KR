-- 002_schema.sql — tabel inti (PostgreSQL murni, tanpa RLS/auth.*, NOW()).
-- Referensi: supabase/supabase-schema.sql + migrasi.

CREATE TABLE IF NOT EXISTS lokasi_apartemen (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS nomor_kamar (
  id SERIAL PRIMARY KEY,
  apartment_location VARCHAR(255) REFERENCES lokasi_apartemen(name),
  room_number VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'tersedia',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS karyawan_list (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'karyawan',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_list (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  marketing_name VARCHAR(255) NOT NULL,
  rental_duration INTEGER NOT NULL,
  shift VARCHAR(50),
  input_by VARCHAR(255) NOT NULL,
  apartment_location VARCHAR(255) NOT NULL REFERENCES lokasi_apartemen(name),
  room_number VARCHAR(255) NOT NULL,
  cash_amount DECIMAL(15,2) DEFAULT 0,
  transfer_amount DECIMAL(15,2) DEFAULT 0,
  transfer_to VARCHAR(255),
  marketing_fee DECIMAL(15,2) DEFAULT 0,
  ktp_image_url TEXT,
  transfer_proof_url TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  checkout_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pengeluaran (
  id SERIAL PRIMARY KEY,
  nama_pengeluaran VARCHAR(255) NOT NULL,
  jumlah DECIMAL(15,2) NOT NULL,
  tanggal DATE NOT NULL,
  keterangan TEXT,
  category VARCHAR(100),
  apartment_location VARCHAR(255),
  room_number VARCHAR(255),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS pengeluaran_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO pengeluaran_categories (name, is_default) VALUES
  ('Listrik', true), ('Air', true), ('IPL', true)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS tagihan_bulanan (
  id SERIAL PRIMARY KEY,
  apartment_location VARCHAR(255) NOT NULL REFERENCES lokasi_apartemen(name),
  room_number VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'unpaid',
  paid_at TIMESTAMPTZ,
  proof_url TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tagihan_fee_lunas (
  id SERIAL PRIMARY KEY,
  marketing_name VARCHAR(255) NOT NULL,
  customer_count INTEGER NOT NULL,
  total_fee DECIMAL(15,2) NOT NULL,
  transactions_detail JSONB,
  proof_url TEXT,
  paid_at TIMESTAMPTZ NOT NULL,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tagihan_fee_lunas_items (
  id SERIAL PRIMARY KEY,
  tagihan_id INTEGER NOT NULL REFERENCES tagihan_fee_lunas(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL,
  marketing_fee DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  employee_name VARCHAR(255) NOT NULL,
  apartment_location VARCHAR(255) NOT NULL REFERENCES lokasi_apartemen(name),
  request_type VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(15,2),
  desired_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(50),
  avatar_url TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'karyawan',
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT UNIQUE,
  audience_role TEXT,
  audience_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_hidden (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('app_name', '"Kakarama Room"'::jsonb, 'Nama Aplikasi'),
  ('maintenance_mode', 'false'::jsonb, 'Status Maintenance Mode'),
  ('global_announcement', '""'::jsonb, 'Pengumuman global')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  role VARCHAR(50),
  action VARCHAR(255) NOT NULL,
  details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS role_menu_visibility (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  menu_item_id VARCHAR(100) NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(role, menu_item_id)
);

CREATE TABLE IF NOT EXISTS user_location_assignments (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, location_name)
);

CREATE TABLE IF NOT EXISTS recurring_unit_bills (
  id SERIAL PRIMARY KEY,
  apartment_location VARCHAR(255) NOT NULL,
  room_number VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  due_day INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_name ON transactions(customer_name);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);