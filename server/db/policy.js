/* eslint-env node */
/**
 * server/db/policy.js
 *
 * Declarative authorization policy map for the generic data API.
 * Every rule below is derived from the real RLS policies in:
 *   - supabase/supabase-schema.sql        (cited as "schema.sql:<line>")
 *   - supabase/migrations/*.sql           (cited as "<migration>:<line>")
 *
 * App role names (read from SQL, not invented):
 *   - 'karyawan'    -> default role (schema.sql:452 ALTER COLUMN role SET DEFAULT 'karyawan';
 *                      schema.sql:465 user_profiles.role DEFAULT 'karyawan')
 *   - 'admin'       -> RLS lists: schema.sql:164, 175, 193, 209, 220, 238, 355, 379, 651
 *   - 'super_admin' -> same RLS lists + is_super_admin() (schema.sql:557-568)
 *
 * NOTE on password hashes: the credentials table (`users`, server/db/schema.sql:7-17,
 * column password_hash) is NOT present in this map at all, so it can never be
 * selected/inserted/updated/deleted through the generic API. `user_profiles`
 * (schema.sql:459-469) contains no password column. The repository additionally
 * enforces a global DENY_COLUMNS blocklist (password, password_hash, encrypted_password).
 *
 * Scope rule kinds (interpreted by repository.js):
 *   null                    -> no extra row scoping beyond the role gate
 *   { kind:'owner' }        -> column must equal actor.userId for EVERY role
 *   { kind:'ownerUnlessAdmin', adminRoles } -> owner filter unless actor.role in adminRoles
 *   { kind:'selfOrSuperAdmin' } -> owner filter unless actor.role === 'super_admin'
 *   { kind:'audience' }     -> notifications audience rule (schema.sql:627-642)
 *
 * An empty roles array [] means: no client role may perform this op via the API
 * (matches tables where the RLS has no policy for that command).
 */

const ALL = ['karyawan', 'admin', 'super_admin'];
const ADMINS = ['admin', 'super_admin'];
const SUPER = ['super_admin'];

export const ROLES = { ALL, ADMINS, SUPER };

export const TABLE_POLICIES = {
  // ------------------------------------------------------------------
  // Master data
  // ------------------------------------------------------------------
  lokasi_apartemen: {
    pk: ['id'],
    columns: ['id', 'name', 'total_rooms', 'created_at'],
    readOnlyColumns: [],
    roles: {
      // schema.sql:154-155  SELECT USING (auth.role() = 'authenticated')
      select: ALL,
      // schema.sql:158-166  INSERT ... ur.role IN ('admin','super_admin')
      insert: ADMINS,
      // schema.sql:169-184  UPDATE ... ur.role IN ('admin','super_admin')
      update: ADMINS,
      // schema.sql:187-195  DELETE ... ur.role IN ('admin','super_admin')
      delete: ADMINS,
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  nomor_kamar: {
    pk: ['id'],
    columns: ['id', 'name', 'lokasi', 'status', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:199-200
      insert: ADMINS, // schema.sql:203-211
      update: ADMINS, // schema.sql:214-229
      delete: ADMINS, // schema.sql:232-240
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  karyawan_list: {
    pk: ['id'],
    columns: ['id', 'name', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:243-244
      insert: ALL,    // schema.sql:247-248 (authenticated, no role gate)
      update: ALL,    // schema.sql:251-252
      delete: ALL,    // schema.sql:255-256
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  marketing_list: {
    pk: ['id'],
    columns: ['id', 'name', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:259-260
      insert: ALL,    // schema.sql:263-264
      update: ALL,    // schema.sql:267-268
      delete: ALL,    // schema.sql:271-272
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  pengeluaran_categories: {
    pk: ['id'],
    columns: ['id', 'name', 'is_default', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:712-713
      insert: ALL,    // schema.sql:716-717
      update: ALL,    // schema.sql:720-721
      delete: ALL,    // schema.sql:724-725
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  // ------------------------------------------------------------------
  // Transactions (owner-scoped writes; admin select/update/delete override)
  // ------------------------------------------------------------------
  transactions: {
    pk: ['id'],
    columns: [
      'id', 'customer_name', 'marketing_name', 'rental_duration', 'shift',
      'input_by', 'apartment_location', 'room_number', 'cash_amount',
      'transfer_amount', 'transfer_to', 'marketing_fee', 'ktp_image_url',
      'transfer_proof_url', 'user_id', 'created_at', 'checkout_at',
      // 20260417_add_checkin_at.sql:2
      'checkin_at',
      // 20260416_deposit_and_admin_rls.sql:9-10
      'deposit_cash', 'deposit_transfer',
      // 20260416_deposit_returns.sql:7-8
      'deposit_returned_at', 'deposit_refund_proof_url',
    ],
    readOnlyColumns: [],
    roles: {
      // schema.sql:275-276 SELECT authenticated; tightened by
      // 20260416_deposit_and_admin_rls.sql:24-33 (owner OR admin/super_admin)
      select: ALL,
      // schema.sql:279-280 INSERT WITH CHECK (auth.uid() = user_id)
      insert: ALL,
      // 20260416_deposit_and_admin_rls.sql:36-53 UPDATE owner OR admin/super_admin
      update: ALL,
      // 20260416_deposit_and_admin_rls.sql:56-65 DELETE owner OR admin/super_admin
      delete: ALL,
    },
    scope: {
      select: { kind: 'ownerUnlessAdmin', column: 'user_id', adminRoles: ADMINS }, // 20260416:24-33
      insert: { kind: 'owner', column: 'user_id' },  // schema.sql:280
      update: { kind: 'ownerUnlessAdmin', column: 'user_id', adminRoles: ADMINS }, // 20260416:36-53
      delete: { kind: 'ownerUnlessAdmin', column: 'user_id', adminRoles: ADMINS }, // 20260416:56-65
    },
  },

  pengeluaran: {
    pk: ['id'],
    columns: [
      'id', 'nama_pengeluaran', 'jumlah', 'tanggal', 'keterangan', 'category',
      'apartment_location', 'room_number', 'user_id', 'created_at',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:291-292 SELECT authenticated (no owner filter on read)
      insert: ALL,    // schema.sql:295-296 INSERT auth.uid() = user_id
      update: ALL,    // schema.sql:299-300
      delete: ALL,    // schema.sql:303-304
    },
    scope: {
      select: null,
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  tagihan_bulanan: {
    pk: ['id'],
    columns: [
      'id', 'apartment_location', 'room_number', 'amount', 'due_date',
      'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
      // 20260524_recurring_unit_bills.sql:17-20
      'is_recurring', 'recurring_parent_id',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:307-308
      insert: ALL,    // schema.sql:311-312 (auth.uid() = user_id)
      update: ALL,    // schema.sql:315-316
      delete: ALL,    // schema.sql:319-320
    },
    scope: {
      select: null,
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  tagihan_fee_lunas: {
    pk: ['id'],
    columns: [
      'id', 'marketing_name', 'customer_count', 'total_fee',
      'transactions_detail', 'proof_url', 'paid_at', 'user_id', 'created_at',
      // 20260417_fee_paid_items.sql:12-13 GENERATED ALWAYS (select-only)
      'paid_date',
    ],
    readOnlyColumns: ['paid_date'],
    roles: {
      select: ALL,    // schema.sql:323-324
      insert: ALL,    // schema.sql:327-328 (auth.uid() = user_id)
      update: ALL,    // schema.sql:331-332
      delete: ALL,    // schema.sql:335-336
    },
    scope: {
      select: null,
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  tagihan_fee_lunas_items: {
    pk: ['id'],
    columns: [
      'id', 'transaction_id', 'marketing_name', 'fee_amount', 'paid_at',
      // 20260417_fee_paid_items.sql:26 GENERATED ALWAYS (select-only)
      'paid_date',
      'paid_by', 'proof_url', 'created_at',
    ],
    readOnlyColumns: ['paid_date'],
    roles: {
      select: ALL,    // 20260417_fee_paid_items.sql:44-45
      insert: ALL,    // 20260417_fee_paid_items.sql:48-49 (auth.uid() = paid_by)
      update: ALL,    // 20260417_fee_paid_items.sql:52-54
      delete: ALL,    // 20260417_fee_paid_items.sql:57-58
    },
    scope: {
      select: null,
      insert: { kind: 'owner', column: 'paid_by' },
      update: { kind: 'owner', column: 'paid_by' },
      delete: { kind: 'owner', column: 'paid_by' },
    },
  },

  requests: {
    pk: ['id'],
    columns: [
      'id', 'employee_name', 'apartment_location', 'request_type',
      'description', 'amount', 'desired_date', 'status', 'user_id',
      'created_at', 'updated_at',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:339-340
      insert: ALL,    // schema.sql:343-344 (auth.uid() = user_id)
      update: ALL,    // schema.sql:347-368 (owner OR admin/super_admin)
      delete: ALL,    // schema.sql:371-382 (owner OR admin/super_admin)
    },
    scope: {
      select: null,
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'ownerUnlessAdmin', column: 'user_id', adminRoles: ADMINS },
      delete: { kind: 'ownerUnlessAdmin', column: 'user_id', adminRoles: ADMINS },
    },
  },

  // ------------------------------------------------------------------
  // Identity / roles
  // ------------------------------------------------------------------
  user_roles: {
    pk: ['id'],
    columns: ['id', 'user_id', 'role', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:386-387 (auth.uid() = user_id)
      insert: ALL,    // schema.sql:390-391
      update: ALL,    // schema.sql:394-395
      delete: ALL,    // schema.sql:398-399
    },
    // Every op is self-only per RLS; admins manage roles via admin_update_user RPC.
    scope: {
      select: { kind: 'owner', column: 'user_id' },
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  user_profiles: {
    pk: ['id'],
    // No password column exists on user_profiles (schema.sql:459-469).
    // Credentials live in `users` (server/db/schema.sql:7-17) which is NOT exposed here.
    columns: [
      'id', 'email', 'full_name', 'phone', 'avatar_url', 'role',
      // 20260417_user_management_extensions.sql:6-7
      'gender',
      'last_sign_in_at', 'created_at', 'updated_at',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,      // schema.sql:613-614 (auth.uid() = id OR is_super_admin())
      insert: ALL,      // schema.sql:616-617
      update: ALL,      // schema.sql:619-620
      delete: SUPER,    // schema.sql:622-623 DELETE USING (is_super_admin())
    },
    scope: {
      select: { kind: 'selfOrSuperAdmin', column: 'id' },
      insert: { kind: 'selfOrSuperAdmin', column: 'id' },
      update: { kind: 'selfOrSuperAdmin', column: 'id' },
      delete: null, // super_admin only (role gate above); no owner filter for super_admin
    },
  },

  // ------------------------------------------------------------------
  // Notifications
  // ------------------------------------------------------------------
  notifications: {
    pk: ['id'],
    columns: [
      'id', 'type', 'title', 'body', 'data', 'dedupe_key',
      'audience_role', 'audience_user_id', 'created_at',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,      // schema.sql:627-642 audience-scoped SELECT
      insert: ADMINS,   // schema.sql:645-653 INSERT admin/super_admin
      update: [],       // no UPDATE policy in schema.sql or migrations -> denied
      delete: [],       // no DELETE policy -> denied
    },
    scope: {
      // schema.sql:627-642: audience_user_id = me OR audience_role='all' OR audience_role = my role
      select: { kind: 'audience' },
      insert: null,
      update: null,
      delete: null,
    },
  },

  notification_reads: {
    pk: ['notification_id', 'user_id'], // schema.sql:487-492
    columns: ['notification_id', 'user_id', 'read_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:656-657 (auth.uid() = user_id)
      insert: ALL,    // schema.sql:659-660
      update: ALL,    // schema.sql:662-663
      delete: [],     // no DELETE policy -> denied
    },
    scope: {
      select: { kind: 'owner', column: 'user_id' },
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: null,
    },
  },

  notification_hidden: {
    pk: ['notification_id', 'user_id'], // 20260417_notifications_hidden_and_preferences.sql:6-11
    columns: ['notification_id', 'user_id', 'hidden_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // 20260417_notifications_hidden_and_preferences.sql:19-20
      insert: ALL,    // :23-24
      update: [],     // no UPDATE policy -> denied
      delete: ALL,    // :27-28 (auth.uid() = user_id)
    },
    scope: {
      select: { kind: 'owner', column: 'user_id' },
      insert: { kind: 'owner', column: 'user_id' },
      update: null,
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  notification_preferences: {
    pk: ['user_id'], // 20260417_notifications_hidden_and_preferences.sql:34-39
    columns: ['user_id', 'push_enabled', 'types_enabled', 'updated_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // :44-45 (auth.uid() = user_id)
      insert: ALL,    // :48-49 (upsert policy)
      update: ALL,    // :52-53
      delete: [],     // no DELETE policy -> denied
    },
    scope: {
      select: { kind: 'owner', column: 'user_id' },
      insert: { kind: 'owner', column: 'user_id' },
      update: { kind: 'owner', column: 'user_id' },
      delete: null,
    },
  },

  push_subscriptions: {
    pk: ['id'],
    columns: ['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:666-667 (self OR is_super_admin())
      insert: ALL,    // schema.sql:669-670 (auth.uid() = user_id)
      update: [],     // no UPDATE policy -> denied
      delete: ALL,    // schema.sql:672-673 (auth.uid() = user_id)
    },
    scope: {
      select: { kind: 'selfOrSuperAdmin', column: 'user_id' },
      insert: { kind: 'owner', column: 'user_id' },
      update: null,
      delete: { kind: 'owner', column: 'user_id' },
    },
  },

  // ------------------------------------------------------------------
  // Settings / menu system
  // ------------------------------------------------------------------
  system_settings: {
    pk: ['id'],
    columns: [
      'id', 'key', 'value', 'updated_at',
      // 20260417_system_settings.sql:13 (description column)
      'description',
    ],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:676-677 read authenticated
      insert: SUPER,  // schema.sql:679-680 FOR ALL USING (is_super_admin())
      update: SUPER,  // schema.sql:679-680
      delete: SUPER,  // schema.sql:679-680
      // (20260417_system_settings.sql:46 earlier allowed admin/super_admin;
      //  consolidated supabase-schema.sql:679-680 tightened to super_admin — we follow schema.sql)
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  role_menu_visibility: {
    pk: ['id'],
    columns: ['id', 'role', 'menu_item_id', 'is_visible', 'updated_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:683-684
      insert: SUPER,  // schema.sql:686-687 FOR ALL USING (is_super_admin())
      update: SUPER,
      delete: SUPER,
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  menu_configuration: {
    pk: ['id'],
    columns: ['id', 'menu_item_id', 'label', 'category', 'sort_order', 'is_active', 'metadata', 'updated_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:690-691
      insert: SUPER,  // schema.sql:693-694 FOR ALL USING (is_super_admin())
      update: SUPER,
      delete: SUPER,
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  user_permissions: {
    pk: ['id'],
    columns: ['id', 'user_id', 'permission_key', 'is_allowed', 'created_at', 'updated_at'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // schema.sql:697-698 (self OR is_super_admin())
      insert: SUPER,  // schema.sql:700-701 FOR ALL USING (is_super_admin())
      update: SUPER,
      delete: SUPER,
    },
    scope: {
      select: { kind: 'selfOrSuperAdmin', column: 'user_id' },
      insert: null,
      update: null,
      delete: null,
    },
  },

  menu_access_logs: {
    pk: ['id'],
    columns: ['id', 'user_id', 'role', 'menu_item_id', 'action', 'metadata', 'created_at'],
    readOnlyColumns: [],
    roles: {
      select: SUPER,  // schema.sql:704-705 SELECT USING (is_super_admin())
      insert: ALL,    // schema.sql:707-708 INSERT authenticated
      update: [],     // no UPDATE policy -> denied
      delete: [],     // no DELETE policy -> denied
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  activity_logs: {
    pk: ['id'],
    columns: ['id', 'user_id', 'user_name', 'role', 'action', 'details', 'metadata', 'created_at'],
    readOnlyColumns: [],
    roles: {
      // 20260417_activity_logs.sql:24-31 SELECT ... ur.role IN ('admin','super_admin')
      select: ADMINS,
      // No INSERT/UPDATE/DELETE policy exists; writes happen only through the
      // SECURITY DEFINER log_activity() RPC (20260417_activity_logs.sql:34-55).
      insert: [],
      update: [],
      delete: [],
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  user_location_assignments: {
    pk: ['id'],
    columns: ['id', 'user_id', 'location_name', 'assigned_at', 'assigned_by'],
    readOnlyColumns: [],
    roles: {
      select: ALL,    // 20260417_user_management_extensions.sql:24-25
      insert: ADMINS, // 20260417_user_management_extensions.sql:28-35 FOR ALL admin/super_admin
      update: ADMINS,
      delete: ADMINS,
    },
    scope: { select: null, insert: null, update: null, delete: null },
  },

  // NOTE: `deposit_returns` does NOT exist as a table anywhere in the repo SQL.
  // 20260416_deposit_returns.sql:6-8 only ADDs deposit_returned_at /
  // deposit_refund_proof_url columns to `transactions` (included above).
};

/**
 * RPC whitelist. Signatures read verbatim from the SQL files.
 * `securityDefiner: true` means the function executes with definer rights and
 * performs its OWN internal authorization check (cited per entry) — the API
 * still applies the role gate below as defense in depth.
 */
export const RPC_POLICIES = {
  // 20260420_get_category_summary_rpc.sql:6-32 (redefined with raw_category in
  // 20260520_expense_categories_and_rpc_fix.sql:197-224). LANGUAGE sql STABLE,
  // NOT security definer.
  get_category_summary: {
    params: ['p_lokasi', 'p_kamar', 'p_start_date', 'p_end_date'],
    roles: ALL,
    securityDefiner: false,
  },

  // 20260520_expense_categories_and_rpc_fix.sql:15-22 SECURITY DEFINER; GRANT :122
  pay_fee_items: {
    params: ['p_marketing_name', 'p_transaction_ids', 'p_proof_url'],
    roles: ALL, // internal check: uses auth.uid() as paid_by
    securityDefiner: true,
  },

  // 20260524_recurring_unit_bills.sql:29-35 SECURITY DEFINER; GRANT :133
  pay_tagihan_bulanan: {
    params: ['p_tagihan_id', 'p_proof_url'],
    roles: ALL,
    securityDefiner: true,
  },

  // schema.sql:731-737 SECURITY DEFINER; internal role check schema.sql:754-756
  update_transaction_by_privileged_role: {
    params: ['p_transaction_id', 'p_payload'],
    roles: ADMINS,
    securityDefiner: true,
  },

  // schema.sql:788-791 SECURITY DEFINER; internal owner-or-admin check schema.sql:819-821
  delete_transaction_cascade: {
    params: ['p_transaction_id'],
    roles: ALL,
    securityDefiner: true,
  },

  // 20260417_activity_logs.sql:34-41 SECURITY DEFINER
  log_activity: {
    params: ['p_action', 'p_details', 'p_metadata'],
    roles: ALL,
    securityDefiner: true,
  },

  // 20260417_admin_user_rpc.sql:9-19 (create), :72-75 (delete);
  // redefined 20260419_admin_update_user_upsert_role.sql:6-15 (update).
  // SECURITY DEFINER with internal super_admin checks; GRANTs :136-142 / :41.
  admin_create_user: {
    params: ['p_email', 'p_password', 'p_full_name', 'p_phone', 'p_gender', 'p_role'],
    roles: SUPER,
    securityDefiner: true,
  },
  admin_delete_user: {
    params: ['p_target_user_id'],
    roles: SUPER,
    securityDefiner: true,
  },
  admin_update_user: {
    params: ['p_target_user_id', 'p_full_name', 'p_phone', 'p_gender', 'p_role'],
    roles: SUPER,
    securityDefiner: true,
  },

  // 20260701_logout_all_devices.sql:12-16 (admin, internal is_super_admin check :20-22)
  admin_sign_out_user: {
    params: ['p_target_user_id'],
    roles: SUPER,
    securityDefiner: true,
  },
  // 20260701_logout_all_devices.sql:33-37 (self-service)
  sign_out_own_devices: {
    params: [],
    roles: ALL,
    securityDefiner: true,
  },

  // ---- Analytics dashboard RPCs (all SECURITY DEFINER, GRANT TO authenticated) ----
  // 20260601000000_analytics_dashboard_rpcs.sql
  get_occupancy_per_unit: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :23-39, GRANT :90
  },
  get_profit_per_location: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :96-108, GRANT :134
  },
  get_checkin_heatmap: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :141-152, GRANT :191
  },
  get_guest_source_summary: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :197-212, GRANT :253
  },
  get_repeat_guests: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :261-277, GRANT :337
  },
  get_location_fullness: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :346-360, GRANT :448; v2 redefine 20260606000000:25-39, GRANT :132
  },
  get_stay_duration_summary: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :454-466, GRANT :517; v2 redefine 20260606000000:262-275, GRANT :335
  },
  get_daily_revenue_trend: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :523-538, GRANT :576
  },
  // 20260606000000_analytics_dashboard_v2.sql
  get_occupancy_per_location: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :143-157, GRANT :241
  },
  // 20260607000000_analytics_dashboard_v3_finance_ops.sql
  get_net_profit_per_location: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :31-45, GRANT :90
  },
  get_expense_breakdown_summary: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :116-124
  },
  get_payment_method_summary: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :171-181
  },
  get_performance_by_shift: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :229-239
  },
  get_performance_by_employee: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :283-295
  },
  get_marketing_performance: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :346-358
  },
  get_underperforming_rooms: {
    params: ['p_start_date', 'p_end_date', 'p_location', 'p_threshold_pct', 'p_limit', 'p_offset'],
    roles: ALL, securityDefiner: true, // :412-426
  },
  // 20260608000000_analytics_dashboard_v4_trend_kpi.sql
  get_monthly_revenue_trend: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :22-35, GRANT :66
  },
  get_revenue_yoy_comparison: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :75-91, GRANT :143
  },
  get_outstanding_bills_summary: {
    params: ['p_location'],
    roles: ALL, securityDefiner: true, // :158-168, GRANT :222
  },
  get_dashboard_kpis: {
    params: ['p_start_date', 'p_end_date', 'p_location'],
    roles: ALL, securityDefiner: true, // :239-265, GRANT :391
  },
};

export function getTablePolicy(table) {
  return Object.prototype.hasOwnProperty.call(TABLE_POLICIES, table)
    ? TABLE_POLICIES[table]
    : null;
}

export function getRpcPolicy(fn) {
  return Object.prototype.hasOwnProperty.call(RPC_POLICIES, fn)
    ? RPC_POLICIES[fn]
    : null;
}
