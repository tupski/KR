-- 003_rpc.sql — fungsi inti (tanpa SECURITY DEFINER, auth.uid() → p_user_id).

-- Ringkasan kategori (get_category_summary asli pakai auth.uid()).
CREATE OR REPLACE FUNCTION get_category_summary(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(category TEXT, total DECIMAL) LANGUAGE sql STABLE AS $$
  SELECT category, SUM(jumlah)::DECIMAL
  FROM pengeluaran
  WHERE ($1 IS NULL OR user_id = $1)
  GROUP BY category
  ORDER BY total DESC;
$$;

-- Log aktivitas (auth.uid() → p_user_id).
CREATE OR REPLACE FUNCTION log_activity(p_action TEXT, p_details TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb, p_user_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_name TEXT; v_role TEXT;
BEGIN
  SELECT full_name, role INTO v_name, v_role
  FROM user_profiles WHERE id = p_user_id;
  INSERT INTO activity_logs (user_id, user_name, role, action, details, metadata)
  VALUES (p_user_id, v_name, v_role, p_action, p_details, p_metadata);
END;
$$;

-- Pay tagihan bulanan (adaptasi: user_id dari p_user_id).
CREATE OR REPLACE FUNCTION pay_tagihan_bulanan(p_tagihan_id INTEGER, p_proof_url TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_row tagihan_bulanan%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM tagihan_bulanan WHERE id = p_tagihan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'tagihan tidak ditemukan'); END IF;
  IF v_row.status = 'paid' THEN RETURN jsonb_build_object('ok', false, 'error', 'sudah lunas'); END IF;
  UPDATE tagihan_bulanan SET status = 'paid', paid_at = NOW(), proof_url = COALESCE(p_proof_url, proof_url)
  WHERE id = p_tagihan_id;
  PERFORM log_activity('bayar_tagihan_bulanan', 'tagihan #' || p_tagihan_id, '{}'::jsonb, p_user_id);
  RETURN jsonb_build_object('ok', true, 'id', p_tagihan_id);
END;
$$;

-- Pay fee items (multi tagihan fee lunas).
CREATE OR REPLACE FUNCTION pay_fee_items(p_items JSONB, p_proof_url TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE it JSONB; v_id INTEGER;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := (it->>'tagihan_id')::INTEGER;
    UPDATE tagihan_bulanan SET status = 'paid', paid_at = NOW(), proof_url = p_proof_url
    WHERE id = v_id;
  END LOOP;
  PERFORM log_activity('pay_fee_items', p_items::text, '{}'::jsonb, p_user_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Delete transaksi + turunan.
CREATE OR REPLACE FUNCTION delete_transaction_cascade(p_transaction_id INTEGER, p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM tagihan_fee_lunas_items WHERE transaction_id = p_transaction_id;
  DELETE FROM transactions WHERE id = p_transaction_id;
  PERFORM log_activity('delete_transaction', 'id ' || p_transaction_id, '{}'::jsonb, p_user_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Admin: create user.
CREATE OR REPLACE FUNCTION admin_create_user(p_email TEXT, p_password TEXT, p_role TEXT DEFAULT 'karyawan',
  p_full_name TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_uid UUID; v_salt TEXT; v_hash TEXT;
BEGIN
  IF p_email IS NULL OR p_password IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email dan password wajib');
  END IF;
  v_salt := gen_salt('bf');
  v_hash := crypt(p_password, v_salt);
  INSERT INTO users (email, password_hash, full_name) VALUES (lower(p_email), v_hash, p_full_name)
  RETURNING id INTO v_uid;
  INSERT INTO user_roles (user_id, role) VALUES (v_uid, COALESCE(p_role, 'karyawan'));
  INSERT INTO user_profiles (id, email, full_name, role) VALUES (v_uid, lower(p_email), p_full_name, COALESCE(p_role, 'karyawan'));
  RETURN jsonb_build_object('ok', true, 'id', v_uid);
END;
$$;

-- Admin: update user.
CREATE OR REPLACE FUNCTION admin_update_user(p_user_id UUID, p_email TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL, p_full_name TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_salt TEXT; v_hash TEXT;
BEGIN
  IF p_password IS NOT NULL THEN
    v_salt := gen_salt('bf'); v_hash := crypt(p_password, v_salt);
    UPDATE users SET password_hash = v_hash WHERE id = p_user_id;
  END IF;
  UPDATE users SET
    email = COALESCE(lower(p_email), email),
    full_name = COALESCE(p_full_name, full_name),
    updated_at = NOW()
  WHERE id = p_user_id;
  IF p_role IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role) VALUES (p_user_id, p_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  UPDATE user_profiles SET
    email = COALESCE(lower(p_email), email),
    full_name = COALESCE(p_full_name, full_name),
    role = COALESCE(p_role, role),
    updated_at = NOW()
  WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Admin: delete user.
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_roles WHERE user_id = p_user_id;
  DELETE FROM user_profiles WHERE id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;