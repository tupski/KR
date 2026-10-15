import {
  Home,
  Plus,
  Edit,
  BarChart3,
  TrendingUp,
  Users,
  Settings,
  Shield,
  FileText,
  Calendar,
  DollarSign,
  Building,
  Key,
  Bell,
  Database,
  Lock,
  Globe,
  Smartphone,
  Zap,
  Activity,
  PieChart
} from 'lucide-react';

// Kategori Menu
export const MENU_CATEGORIES = {
  OPERATIONS: 'operations',
  ANALYTICS: 'analytics',
  MANAGEMENT: 'management',
  SETTINGS: 'settings'
};

// Konfigurasi Item Menu
export const MENU_ITEMS = [
  // Kategori Operasi
  {
    id: 'dashboard',
    name: 'Dasbor',
    icon: Home,
    path: '/dashboard',
    category: MENU_CATEGORIES.OPERATIONS,
    priority: 1,
    roles: ['karyawan', 'admin', 'super_admin'],
    description: 'Ringkasan dasbor utama'
  },
  {
    id: 'add-transaction',
    name: 'Tambah Transaksi',
    icon: Plus,
    path: '/add-transaction',
    category: MENU_CATEGORIES.OPERATIONS,
    priority: 2,
    roles: ['karyawan', 'admin', 'super_admin'],
    description: 'Buat transaksi sewa baru'
  },
  {
    id: 'edit-transaction',
    name: 'Edit Transaksi',
    icon: Edit,
    path: '/edit-transaction',
    category: MENU_CATEGORIES.OPERATIONS,
    priority: 3,
    roles: ['admin', 'super_admin'],
    description: 'Modifikasi transaksi yang ada'
  },
  {
    id: 'room-availability',
    name: 'Ketersediaan Kamar',
    icon: Building,
    path: '/room-availability',
    category: MENU_CATEGORIES.OPERATIONS,
    priority: 4,
    roles: ['karyawan', 'admin', 'super_admin'],
    description: 'Periksa ketersediaan kamar'
  },
  {
    id: 'calendar',
    name: 'Kalender',
    icon: Calendar,
    path: '/calendar',
    category: MENU_CATEGORIES.OPERATIONS,
    priority: 5,
    roles: ['karyawan', 'admin', 'super_admin'],
    description: 'Tampilan kalender pemesanan'
  },

  // Kategori Analitik
  {
    id: 'income-dashboard',
    name: 'Dasbor Pendapatan',
    icon: DollarSign,
    path: '/income-dashboard',
    category: MENU_CATEGORIES.ANALYTICS,
    priority: 1,
    roles: ['admin', 'super_admin'],
    description: 'Analitik dan laporan pendapatan'
  },
  {
    id: 'revenue-chart',
    name: 'Grafik Pendapatan',
    icon: BarChart3,
    path: '/revenue-chart',
    category: MENU_CATEGORIES.ANALYTICS,
    priority: 2,
    roles: ['admin', 'super_admin'],
    description: 'Grafik pendapatan detail'
  },
  {
    id: 'marketing-ranking',
    name: 'Peringkat Marketing',
    icon: TrendingUp,
    path: '/marketing-ranking',
    category: MENU_CATEGORIES.ANALYTICS,
    priority: 3,
    roles: ['admin', 'super_admin'],
    description: 'Peringkat performa marketing'
  },
  {
    id: 'occupancy-report',
    name: 'Laporan Hunian',
    icon: PieChart,
    path: '/occupancy-report',
    category: MENU_CATEGORIES.ANALYTICS,
    priority: 4,
    roles: ['admin', 'super_admin'],
    description: 'Analitik hunian kamar'
  },

  // Kategori Manajemen
  {
    id: 'user-management',
    name: 'Manajemen Karyawan',
    icon: Users,
    path: '/user-management',
    category: MENU_CATEGORIES.MANAGEMENT,
    priority: 1,
    roles: ['super_admin'],
    description: 'Kelola karyawan sistem'
  },
  {
    id: 'menu-controls',
    name: 'Kontrol Menu',
    icon: Settings,
    path: '/menu-controls',
    category: MENU_CATEGORIES.MANAGEMENT,
    priority: 2,
    roles: ['super_admin'],
    description: 'Kendalikan akses dan izin menu'
  },
  {
    id: 'billing-requests',
    name: 'Permintaan Tagihan',
    icon: FileText,
    path: '/billing-requests',
    category: MENU_CATEGORIES.MANAGEMENT,
    priority: 3,
    roles: ['admin', 'super_admin'],
    description: 'Tangani permintaan tagihan'
  },
  {
    id: 'room-management',
    name: 'Manajemen Kamar',
    icon: Key,
    path: '/room-management',
    category: MENU_CATEGORIES.MANAGEMENT,
    priority: 4,
    roles: ['admin', 'super_admin'],
    description: 'Kelola inventaris kamar'
  },
  {
    id: 'activity-logs',
    name: 'Log Aktivitas',
    icon: Activity,
    path: '/activity-logs',
    category: MENU_CATEGORIES.MANAGEMENT,
    priority: 5,
    roles: ['admin', 'super_admin'],
    description: 'Pemantauan aktivitas sistem'
  },

  // Kategori Pengaturan
  {
    id: 'system-settings',
    name: 'Pengaturan Sistem',
    icon: Settings,
    path: '/system-settings',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 1,
    roles: ['super_admin'],
    description: 'Konfigurasi sistem global'
  },
  {
    id: 'security-settings',
    name: 'Pengaturan Keamanan',
    icon: Shield,
    path: '/security-settings',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 2,
    roles: ['admin', 'super_admin'],
    description: 'Kendali keamanan dan akses'
  },
  // Notifikasi dinonaktifkan sementara; pertahankan implementasi untuk aktivasi berikutnya.
  // {
  //   id: 'notification-settings',
  //   name: 'Notifikasi',
  //   icon: Bell,
  //   path: '/notification-settings',
  //   category: MENU_CATEGORIES.SETTINGS,
  //   priority: 3,
  //   roles: ['karyawan', 'admin', 'super_admin'],
  //   description: 'Preferensi notifikasi'
  // },
  {
    id: 'backup-restore',
    name: 'Backup & Restore',
    icon: Database,
    path: '/backup-restore',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 4,
    roles: ['super_admin'],
    description: 'Backup dan restore data'
  },
  {
    id: 'pwa-settings',
    name: 'Pengaturan PWA',
    icon: Smartphone,
    path: '/pwa-settings',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 5,
    roles: ['super_admin'],
    description: 'Konfigurasi Progressive Web App'
  },
  {
    id: 'api-settings',
    name: 'Pengaturan API',
    icon: Globe,
    path: '/api-settings',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 6,
    roles: ['super_admin'],
    description: 'Konfigurasi API dan kunci'
  },
  {
    id: 'performance-monitor',
    name: 'Performa',
    icon: Zap,
    path: '/performance-monitor',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 7,
    roles: ['admin', 'super_admin'],
    description: 'Pemantauan performa sistem'
  },
  {
    id: 'audit-logs',
    name: 'Log Audit',
    icon: Lock,
    path: '/audit-logs',
    category: MENU_CATEGORIES.SETTINGS,
    priority: 8,
    roles: ['super_admin'],
    description: 'Log audit keamanan'
  }
];

// Fungsi Helper
export const getMenuItemsByRole = (role) => {
  return MENU_ITEMS.filter(item => item.roles.includes(role));
};

export const getOrganizedMenuByRole = (role) => {
  const userItems = getMenuItemsByRole(role);
  const organized = {};

  Object.values(MENU_CATEGORIES).forEach(category => {
    organized[category] = userItems
      .filter(item => item.category === category)
      .sort((a, b) => a.priority - b.priority);
  });

  return organized;
};

export const hasAccessToMenuItem = (menuItemId, userRole) => {
  const item = MENU_ITEMS.find(item => item.id === menuItemId);
  return item && item.roles.includes(userRole);
};

export const canAccessCategory = (category, userRole) => {
  return getMenuItemsByRole(userRole).some(item => item.category === category);
};

export const getSpecialMenuItems = (userRole) => {
  return getMenuItemsByRole(userRole).filter(item =>
    item.id.includes('management') || item.id.includes('settings')
  );
};

export const getItemsByCategory = (category) => {
  return MENU_ITEMS.filter(item => item.category === category)
    .sort((a, b) => a.priority - b.priority);
};

export const getMenuItemsSortedByPriority = (userRole) => {
  return getMenuItemsByRole(userRole).sort((a, b) => a.priority - b.priority);
};

export const searchMenuItems = (query, userRole) => {
  const userItems = getMenuItemsByRole(userRole);
  const lowerQuery = query.toLowerCase();
  return userItems.filter(item =>
    item.name.toLowerCase().includes(lowerQuery) ||
    item.description.toLowerCase().includes(lowerQuery)
  );
};

export const getMenuItemById = (id) => {
  return MENU_ITEMS.find(item => item.id === id);
};

export const getMenuItemWithStyles = (id, userRole) => {
  const item = getMenuItemById(id);
  if (!item || !hasAccessToMenuItem(id, userRole)) return null;

  return {
    ...item,
    styles: getCategoryColorScheme(item.category)
  };
};

export const getCategoryColorScheme = (category) => {
  const schemes = {
    [MENU_CATEGORIES.OPERATIONS]: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      icon: 'text-blue-600'
    },
    [MENU_CATEGORIES.ANALYTICS]: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      icon: 'text-green-600'
    },
    [MENU_CATEGORIES.MANAGEMENT]: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      icon: 'text-purple-600'
    },
    [MENU_CATEGORIES.SETTINGS]: {
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      border: 'border-gray-200',
      icon: 'text-gray-600'
    }
  };

  return schemes[category] || schemes[MENU_CATEGORIES.OPERATIONS];
};

export const countMenuItemsByRole = (userRole) => {
  return getMenuItemsByRole(userRole).length;
};

export const getCategoryStats = (userRole) => {
  const organized = getOrganizedMenuByRole(userRole);
  const stats = {};

  Object.keys(organized).forEach(category => {
    stats[category] = organized[category].length;
  });

  return stats;
};

export const hasPermission = (permission, userRole) => {
  // Dapat dikembangkan untuk mengecek izin yang lebih spesifik
  return getMenuItemsByRole(userRole).some(item => item.id === permission);
};

export const getPermissionsForRole = (userRole) => {
  return getMenuItemsByRole(userRole).map(item => item.id);
};

export const getBreadcrumbPath = (menuItemId) => {
  const item = getMenuItemById(menuItemId);
  if (!item) return [];

  return [
    { name: 'Beranda', path: '/dashboard' },
    { name: getCategoryDisplayName(item.category), path: null },
    { name: item.name, path: item.path }
  ];
};

export const isCategoryEmpty = (category, userRole) => {
  return getOrganizedMenuByRole(userRole)[category]?.length === 0;
};

export const getAvailableCategoriesForRole = (userRole) => {
  const organized = getOrganizedMenuByRole(userRole);
  return Object.keys(organized).filter(category => organized[category].length > 0);
};

export const getMenuCountByCategory = (category, userRole) => {
  return getOrganizedMenuByRole(userRole)[category]?.length || 0;
};

export const getHighestPriorityInCategory = (category, userRole) => {
  const items = getOrganizedMenuByRole(userRole)[category] || [];
  return items.length > 0 ? items[0] : null;
};

export const getMenuItemsByPermission = (permissions, userRole) => {
  const userItems = getMenuItemsByRole(userRole);
  return userItems.filter(item => permissions.includes(item.id));
};

export const getRoleHierarchyLevel = (role) => {
  const levels = {
    karyawan: 1,
    admin: 2,
    super_admin: 3
  };
  return levels[role] || 0;
};

export const hasMorePrivileges = (userRole, requiredRole) => {
  return getRoleHierarchyLevel(userRole) >= getRoleHierarchyLevel(requiredRole);
};

// Fungsi utilitas untuk mendapatkan nama tampilan kategori
export const getCategoryDisplayName = (category) => {
  const names = {
    [MENU_CATEGORIES.OPERATIONS]: 'Operasi',
    [MENU_CATEGORIES.ANALYTICS]: 'Analitik',
    [MENU_CATEGORIES.MANAGEMENT]: 'Manajemen',
    [MENU_CATEGORIES.SETTINGS]: 'Pengaturan'
  };
  return names[category] || 'Tidak Diketahui';
};

// Export default
export default {
  MENU_CATEGORIES,
  MENU_ITEMS,
  getMenuItemsByRole,
  getOrganizedMenuByRole,
  hasAccessToMenuItem,
  canAccessCategory,
  getSpecialMenuItems,
  getItemsByCategory,
  getMenuItemsSortedByPriority,
  searchMenuItems,
  getMenuItemById,
  getMenuItemWithStyles,
  getCategoryColorScheme,
  countMenuItemsByRole,
  getCategoryStats,
  hasPermission,
  getPermissionsForRole,
  getBreadcrumbPath,
  isCategoryEmpty,
  getAvailableCategoriesForRole,
  getMenuCountByCategory,
  getHighestPriorityInCategory,
  getMenuItemsByPermission,
  getRoleHierarchyLevel,
  hasMorePrivileges,
  getCategoryDisplayName
};