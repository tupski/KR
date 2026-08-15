import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Users, UserPlus, Search, Edit2, Trash2, Shield, User,
  Phone, Mail, Check, X, MoreVertical, ChevronDown, Filter,
  MapPin, CheckSquare, Square, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UserManagementModern = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [locations, setLocations] = useState([]);
  const [userAssignments, setUserAssignments] = useState([]);
  /** Hindari race double-klik; state agar UI (disabled) ikut update */
  const [assignmentBusy, setAssignmentBusy] = useState(false);

  const normalizeRole = (r) => {
    if (!r || r === 'user') return 'karyawan';
    if (r === 'admin' || r === 'karyawan' || r === 'super_admin') return r;
    return 'karyawan';
  };

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    gender: 'Pria',
    role: 'karyawan'
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .neq('role', 'super_admin') // Hanya karyawan & admin
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(profiles || []);

      const { data: locs } = await supabase.from('lokasi_apartemen').select('*').order('name');
      setLocations(locs || []);
      
      const { data: assigns } = await supabase.from('user_location_assignments').select('*');
      setUserAssignments(assigns || []);
    } catch (error) {
      toast({ title: "Gagal memuat data", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAdd = () => {
    setSelectedUser(null);
    setFormData({
      email: '',
      password: '',
      full_name: '',
      phone: '',
      gender: 'Pria',
      role: 'karyawan'
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '', // Kosongkan password saat edit
      full_name: user.full_name || '',
      phone: user.phone || '',
      gender: user.gender || 'Pria',
      role: normalizeRole(user.role),
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.full_name || (!selectedUser && !formData.password)) {
      toast({ title: "Data tidak lengkap", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      if (selectedUser) {
        // Update User
        const { error } = await supabase.rpc('admin_update_user', {
          p_target_user_id: selectedUser.id,
          p_full_name: formData.full_name,
          p_phone: formData.phone,
          p_gender: formData.gender,
          p_role: normalizeRole(formData.role),
        });
        if (error) throw error;
        toast({ title: "User berhasil diperbarui ✅" });
      } else {
        // Create User
        const { error } = await supabase.rpc('admin_create_user', {
          p_email: formData.email,
          p_password: formData.password,
          p_full_name: formData.full_name,
          p_phone: formData.phone,
          p_gender: formData.gender,
          p_role: normalizeRole(formData.role),
        });
        if (error) throw error;
        toast({ title: "User berhasil ditambahkan ✅" });
      }
      setIsFormOpen(false);
      fetchUsers();
    } catch (error) {
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      setIsSubmitting(true);
      const { error } = await supabase.rpc('admin_delete_user', {
        p_target_user_id: selectedUser.id
      });
      if (error) throw error;
      toast({ title: "User berhasil dihapus" });
      setIsDeleting(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAssignment = (user) => {
    setSelectedUser(user);
    setIsAssignmentOpen(true);
  };

  const handleOpenSignOut = (user) => {
    setSelectedUser(user);
    setIsSigningOut(true);
  };

  const handleSignOutUser = async () => {
    if (!selectedUser) return;
    try {
      setIsSubmitting(true);
      const { error } = await supabase.rpc('admin_sign_out_user', {
        p_target_user_id: selectedUser.id
      });
      if (error) throw error;
      toast({ title: `Semua perangkat ${selectedUser.full_name} berhasil logout` });
      setIsSigningOut(false);
      setSelectedUser(null);
    } catch (error) {
      toast({ title: "Gagal logout perangkat", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshAllAssignments = async () => {
    const { data, error } = await supabase.from('user_location_assignments').select('*').order('id', { ascending: true });
    if (error) throw error;
    setUserAssignments(data || []);
  };

  const handleToggleAssignment = async (locationName) => {
    if (!selectedUser || assignmentBusy) return;
    setAssignmentBusy(true);
    const isAssigned = userAssignments.some(
      (a) => a.user_id === selectedUser.id && a.location_name === locationName
    );
    try {
      if (isAssigned) {
        const { error } = await supabase
          .from('user_location_assignments')
          .delete()
          .eq('user_id', selectedUser.id)
          .eq('location_name', locationName);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_location_assignments')
          .insert({ user_id: selectedUser.id, location_name: locationName });
        if (error) throw error;
      }
      await refreshAllAssignments();
    } catch (error) {
      toast({ title: 'Gagal mengubah assignment', description: error.message, variant: 'destructive' });
      try {
        await refreshAllAssignments();
      } catch {
        /* abaikan */
      }
    } finally {
      setAssignmentBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" /> Manajemen User
        </h2>
        <Button onClick={handleOpenAdd} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md">
          <UserPlus className="h-4 w-4 mr-2" /> Tambah User
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Cari nama atau email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl border-slate-200"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px] rounded-xl border-slate-200 bg-white">
            <Filter className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Semua Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Role</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="karyawan">Karyawan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-2xl" />
          ))
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            Tidak ada user ditemukan.
          </div>
        ) : (
          filteredUsers.map((user) => (
            <motion.div 
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold ${
                    user.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {user.full_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 truncate max-w-[150px]">{user.full_name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        user.role === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {user.role}
                      </span>
                      <span className="text-[10px] text-slate-400">• {user.gender}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleOpenAssignment(user)} title="Assign Lokasi" className="h-8 w-8 text-slate-400 hover:text-emerald-600">
                    <MapPin className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(user)} className="h-8 w-8 text-slate-400 hover:text-blue-600">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleOpenSignOut(user)} title="Logout Semua Device" className="h-8 w-8 text-slate-400 hover:text-amber-600">
                    <LogOut className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setSelectedUser(user); setIsDeleting(true); }} className="h-8 w-8 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center text-xs text-slate-500 gap-2">
                  <Mail className="h-3.5 w-3.5" /> {user.email}
                </div>
                <div className="flex items-center text-xs text-slate-500 gap-2">
                  <Phone className="h-3.5 w-3.5" /> {user.phone || '-'}
                </div>
              </div>

              {/* Assignment Tags */}
              <div className="mt-4 pt-4 border-t border-slate-50">
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const assigned = userAssignments.filter(a => a.user_id === user.id);
                    if (assigned.length === 0) {
                      return <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-medium">Semua Lokasi</span>;
                    }
                    const visible = assigned.slice(0, 2);
                    const remaining = assigned.length - visible.length;
                    return (
                      <>
                        {visible.map(a => (
                          <span key={a.id} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100 font-medium">
                            {a.location_name}
                          </span>
                        ))}
                        {remaining > 0 && (
                          <button onClick={() => handleOpenAssignment(user)} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-100 font-bold hover:bg-blue-100">
                            +{remaining}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{selectedUser ? 'Edit User' : 'Tambah User Baru'}</DialogTitle>
            <DialogDescription>
              {selectedUser ? 'Perbarui informasi akun karyawan/admin.' : 'Buat akun baru untuk karyawan atau admin.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Nama Lengkap</label>
              <Input 
                value={formData.full_name} 
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                placeholder="Contoh: Budi Santoso"
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Jenis Kelamin</label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pria">Pria</SelectItem>
                    <SelectItem value="Wanita">Wanita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Role</label>
                <Select value={formData.role} onValueChange={(v) => setFormData({...formData, role: v})}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="karyawan">Karyawan</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Email</label>
              <Input 
                type="email" 
                value={formData.email} 
                disabled={!!selectedUser}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="email@kakarama.com"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                {selectedUser ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}
              </label>
              <Input 
                type="password" 
                value={formData.password} 
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Nomor Telepon</label>
              <Input 
                value={formData.phone} 
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="08123456789"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {isSubmitting ? 'Menyimpan...' : 'Simpan User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout All Devices Confirmation */}
      <AlertDialog open={isSigningOut} onOpenChange={setIsSigningOut}>
        <AlertDialogContent className="bg-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Logout Semua Device?</AlertDialogTitle>
            <AlertDialogDescription>
              Logout semua perangkat <strong>{selectedUser?.full_name}</strong>? Semua sesi aktif akan ditutup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOutUser} disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isSubmitting ? 'Logging out...' : 'Ya, Logout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent className="bg-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus User?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus akun <strong>{selectedUser?.full_name}</strong> secara permanen dari sistem dan autentikasi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700 text-white">
              {isSubmitting ? 'Menghapus...' : 'Ya, Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Dialog */}
      <Dialog open={isAssignmentOpen} onOpenChange={setIsAssignmentOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Assign Lokasi</DialogTitle>
            <DialogDescription>
              Tugaskan <strong>{selectedUser?.full_name}</strong> ke lokasi tertentu. 
              <br />
              <span className="text-emerald-600 font-bold">💡 Tips: Jika tidak ada yang dipilih, akun karyawan tidak bisa input transaksi/lihat kamar.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-between items-center mb-2 px-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daftar Apartemen</p>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              disabled={assignmentBusy}
              onClick={async () => {
                if (!selectedUser || assignmentBusy) return;
                setAssignmentBusy(true);
                const allLocationNames = locations.map((l) => l.name);
                const currentAssigned = userAssignments
                  .filter((a) => a.user_id === selectedUser.id)
                  .map((a) => a.location_name);
                try {
                  if (currentAssigned.length === allLocationNames.length) {
                    const { error } = await supabase.from('user_location_assignments').delete().eq('user_id', selectedUser.id);
                    if (error) throw error;
                  } else {
                    const toInsert = allLocationNames
                      .filter((name) => !currentAssigned.includes(name))
                      .map((name) => ({ user_id: selectedUser.id, location_name: name }));
                    if (toInsert.length > 0) {
                      const { error } = await supabase.from('user_location_assignments').insert(toInsert);
                      if (error) throw error;
                    }
                  }
                  await refreshAllAssignments();
                } catch (error) {
                  toast({ title: 'Gagal memperbarui penempatan', description: error.message, variant: 'destructive' });
                  try {
                    await refreshAllAssignments();
                  } catch {
                    /* abaikan */
                  }
                } finally {
                  setAssignmentBusy(false);
                }
              }}
            >
              {userAssignments.filter(a => a.user_id === selectedUser?.id).length === locations.length ? 'Hapus Semua' : 'Pilih Semua'}
            </Button>
          </div>
          <div className="py-2 space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {locations.map(loc => {
              const isAssigned = userAssignments.some(a => a.user_id === selectedUser?.id && a.location_name === loc.name);
              return (
                <button
                  key={loc.id}
                  type="button"
                  disabled={assignmentBusy}
                  onClick={() => handleToggleAssignment(loc.name)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 transition-all disabled:opacity-50 disabled:pointer-events-none ${
                    isAssigned 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900' 
                      : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <span className="font-bold">{loc.name}</span>
                  {isAssigned ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                </button>
              );
            })}
            {locations.length === 0 && <p className="text-center text-slate-400 py-4">Belum ada lokasi terdaftar.</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsAssignmentOpen(false)} className="bg-slate-900 text-white rounded-xl w-full">Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagementModern;
