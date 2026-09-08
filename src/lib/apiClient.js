// Centralized Frontend API Client
// Independent of Supabase runtime

const BASE_URL = '';

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Include HTTP-only cookie
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `HTTP ${response.status} Error`;
    throw new Error(errorMsg);
  }

  return data;
}

export const apiClient = {
  // Auth
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getMe: () => request('/api/auth/me'),

  // Transactions
  getTransactions: (page = 1, limit = 20) => request(`/api/transactions?page=${page}&limit=${limit}`),

  // Master Data
  getLokasi: () => request('/api/lokasi'),
  getKamar: () => request('/api/kamar'),
  getPengeluaran: (limit = 50) => request(`/api/pengeluaran?limit=${limit}`),
  getSystemSettings: () => request('/api/system-settings'),
};
