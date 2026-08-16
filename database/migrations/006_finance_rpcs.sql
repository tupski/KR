-- =============================================================
-- Migration 006: Finance RPCs
-- Requires: 002_auth_tables.sql, 003_core_tables.sql, 005_finance_tables.sql
-- Versi FINAL: auth.uid() diganti p_user_id uuid eksplisit
-- =============================================================

-- =============================================================
-- RPC: pay_fee_items
-- Bayar fee marketing untuk sekumpulan transaction_id (atomic)
-- =============================================================
CREATE OR REPLACE FUNCTION public.pay_fee_items(
    p_user_id         uuid,
    p_marketing_name  text,
    p_transaction_ids bigint[],
    p_proof_url       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_items_inserted int         := 0;
    v_total_fee      numeric     := 0;
    v_paid_at        timestamptz := now();
BEGIN
    IF p_marketing_name IS NULL OR btrim(p_marketing_name) = '' THEN
        RAISE EXCEPTION 'Marketing tidak valid.';
    END IF;

    IF p_transaction_ids IS NULL OR array_length(p_transaction_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Tidak ada transaksi yang dibayarkan.';
    END IF;

    -- Hitung total fee dari transaksi yang valid
    SELECT COALESCE(SUM(t.marketing_fee), 0)
    INTO v_total_fee
    FROM public.transactions t
    WHERE t.id = ANY(p_transaction_ids)
      AND t.marketing_name = p_marketing_name
      AND COALESCE(t.marketing_fee, 0) > 0;

    -- Insert items; ON CONFLICT do nothing (idempotent per transaction_id)
    INSERT INTO public.tagihan_fee_lunas_items (
        transaction_id, marketing_name, fee_amount, paid_at, paid_by, proof_url
    )
    SELECT
        t.id,
        p_marketing_name,
        COALESCE(t.marketing_fee, 0),
        v_paid_at,
        p_user_id,
        p_proof_url
    FROM public.transactions t
    WHERE t.id = ANY(p_transaction_ids)
      AND t.marketing_name = p_marketing_name
      AND COALESCE(t.marketing_fee, 0) > 0
    ON CONFLICT (transaction_id) DO NOTHING;

    GET DIAGNOSTICS v_items_inserted = ROW_COUNT;

    -- Catat ke pengeluaran hanya jika ada nominal
    IF v_total_fee > 0 THEN
        INSERT INTO public.pengeluaran (
            nama_pengeluaran, jumlah, tanggal, keterangan, user_id, category
        ) VALUES (
            format('Bayar Fee Marketing %s', p_marketing_name),
            v_total_fee,
            (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
            format('%s customer.', v_items_inserted),
            p_user_id,
            'Fee Marketing'
        );
    END IF;

    -- Rekap ke tagihan_fee_lunas
    INSERT INTO public.tagihan_fee_lunas (
        marketing_name, customer_count, total_fee, transactions_detail,
        proof_url, paid_at, user_id
    ) VALUES (
        p_marketing_name,
        v_items_inserted,
        v_total_fee,
        (
            SELECT COALESCE(
                jsonb_agg(jsonb_build_object(
                    'transaction_id', t.id,
                    'customer',       t.customer_name,
                    'location',       t.apartment_location
                )),
                '[]'::jsonb
            )
            FROM public.transactions t
            WHERE t.id = ANY(p_transaction_ids)
              AND t.marketing_name = p_marketing_name
              AND COALESCE(t.marketing_fee, 0) > 0
        ),
        p_proof_url,
        v_paid_at,
        p_user_id
    );

    RETURN jsonb_build_object(
        'items_inserted', v_items_inserted,
        'total_fee',      v_total_fee,
        'paid_at',        v_paid_at
    );
END;
$$;

-- =============================================================
-- RPC: pay_tagihan_bulanan
-- Tandai tagihan sebagai paid + auto-generate tagihan berikutnya
-- jika is_recurring = TRUE (atomic)
-- =============================================================
CREATE OR REPLACE FUNCTION public.pay_tagihan_bulanan(
    p_user_id    uuid,
    p_tagihan_id bigint,
    p_proof_url  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_paid_at         timestamptz := now();
    v_row             public.tagihan_bulanan%ROWTYPE;
    v_next_due_date   date;
    v_existing_id     bigint;
    v_new_tagihan_id  bigint := NULL;
BEGIN
    SELECT *
    INTO v_row
    FROM public.tagihan_bulanan
    WHERE id = p_tagihan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tagihan tidak ditemukan.';
    END IF;

    IF v_row.status = 'paid' THEN
        RAISE EXCEPTION 'Tagihan sudah lunas.';
    END IF;

    UPDATE public.tagihan_bulanan
    SET
        status    = 'paid',
        paid_at   = v_paid_at,
        proof_url = COALESCE(p_proof_url, proof_url),
        updated_at = now()
    WHERE id = p_tagihan_id;

    -- Catat ke pengeluaran
    INSERT INTO public.pengeluaran (
        nama_pengeluaran, jumlah, tanggal, keterangan, user_id, category
    ) VALUES (
        format('Tagihan Unit %s Kamar %s', v_row.apartment_location, v_row.room_number),
        v_row.amount,
        (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
        format('Due: %s', v_row.due_date),
        p_user_id,
        'Tagihan Unit'
    );

    -- Auto-generate tagihan berikutnya jika recurring
    IF v_row.is_recurring THEN
        v_next_due_date := v_row.due_date + INTERVAL '1 month';

        SELECT id INTO v_existing_id
        FROM public.tagihan_bulanan
        WHERE apartment_location = v_row.apartment_location
          AND room_number        = v_row.room_number
          AND due_date           = v_next_due_date
          AND status             = 'unpaid'
        LIMIT 1;

        IF v_existing_id IS NULL THEN
            INSERT INTO public.tagihan_bulanan (
                apartment_location, room_number, amount, due_date,
                status, is_recurring, recurring_parent_id, user_id
            ) VALUES (
                v_row.apartment_location,
                v_row.room_number,
                v_row.amount,
                v_next_due_date,
                'unpaid',
                TRUE,
                v_row.id,
                p_user_id
            )
            RETURNING id INTO v_new_tagihan_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'tagihan_id',          p_tagihan_id,
        'paid_at',             v_paid_at,
        'next_tagihan_id',     v_new_tagihan_id,
        'next_due_date',       v_next_due_date,
        'next_already_exists', (v_existing_id IS NOT NULL)
    );
END;
$$;
