// Backward compatibility shim - re-export from AuthContext
// This file exists because several components import from '@/contexts/SupabaseAuthContext'
// The actual implementation moved to AuthContext.jsx
export { AuthProvider, useAuth } from './AuthContext.jsx';
