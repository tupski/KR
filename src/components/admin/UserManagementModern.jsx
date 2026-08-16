import React, { useState, useEffect, useMemo } from 'react';
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

// API modules
import { usersApi } from '../../api/users.api.js';
import { locationsApi } from '../../api/locations.api.js';

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
      
      // Fetch users, locations, and assignments in parallel
      const [usersRes, locsRes] = await Promise.all([
        usersApi.list({ limit: 1000 }),
        locationsApi.list()
      ]);

      // Filter out super_admin from the list
      const profiles = usersRes?.data?.filter(u => u.role !== 'super_admin') || [];
      setUsers(profiles);
      setLocations(locsRes?.data || []);
      
      // Fetch assignments for each user
      // Note: This could be optimized with a single endpoint
      // For now, we'll get assignments from the users data
      const assignments = [];
      profiles.forEach(user => {
        if (user.assigned_locations) {
          user.assigned_locations.forEach(locName => {
            assignments.push({ user_id: user.id, location_name: locName });
          });
        }
      });
      setUserAssignments(assignments);
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
        await usersApi.update(selectedUser.id, {
          full_name: formData.full_name,
          phone: formData.phone,
          gender: formData.gender,
          role: normalizeRole(formData.role),
        });
        toast({ title: "User berhasil diperbarui ✅" });
      } else {
        // Create User
        await usersApi.create({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone: formData.phone,
          gender: formData.gender,
          role: normalizeRole(formData.role),
        });
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
      await usersApi.delete(selectedUser.id);
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
      await usersApi.signOutAll(selectedUser.id);
      toast({ title: `Semua perangkat ${selectedUser.full_name} berhasil logout` });
      setIsSigningOut(false);
      setSelectedUser(null);
    } catch (error) {
      toast({ title: "Gagal logout perangkat", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAssignment = async (locationName) => {
    if (!selectedUser || assignmentBusy) return;
    
    const isCurrentlyAssigned = userAssignments.some(
      a => a.user_id === selectedUser.id && a.location_name === locationName
    );

    try {
      setAssignmentBusy(true);
      await usersApi.toggleLocation(selectedUser.id, { 
        locationName, 
        assigned: !isCurrentlyAssigned 
      });
      
      // Update local state
      if (isCurrentlyAssigned) {
        setUserAssignments(prev => prev.filter(
          a => !(a.user_id === selectedUser.id && a.location_name === locationName)
        ));
      } else {
        setUserAssignments(prev => [...prev, { 
          user_id: selectedUser.id, 
          location_name: locationName 
        }]);
      }
      toast({ title: isCurrentlyAssigned ? 'Lokasi dicabut' : 'Lokasi ditugaskan' });
    } catch (error) {
      toast({ title: "Gagal mengubah penugasan", description: error.message, variant: "destructive" });
    } finally {
      setAssignmentBusy(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch = user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === 'all' || normalizeRole(user.role) === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Role badge color helper
  const getRoleBadge = (role) => {
    const normalized = normalizeRole(role);
    const styles = {
      admin: 'bg-purple-100 text-purple-800 border-purple-300',
      karyawan: 'bg-slate-100 text-slate-800 border-slate-300'
    };
    return styles[normalized] || styles.karyawan;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Manajemen User
          </h2>
          <p className="text-slate-500 text-sm mt-1">Kelola akun karyawan dan admin</p>
        </div>
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

      {/* Users List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredUsers.map((user, index) => {
              const userAssigns = userAssignments.filter(a => a.user_id === user.id);
              
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-xl">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{user.full_name || 'Tanpa Nama'}</h3>
                        <p className="text-sm text-slate-500">{user.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadge(user.role)}`}>
                            {normalizeRole(user.role)}
                          </span>
                          {user.phone && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {user.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleOpenAssignment(user)} className="rounded-lg">
                        <MapPin className="h-4 w-4" />
                        {userAssigns.length > 0 && (
                          <span className="ml-1 bg-emerald-100 text-emerald-800 text-xs px-1.5 rounded-full">
                            {userAssigns.length}
                          </span>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(user)} className="rounded-lg">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleOpenSignOut(user)} className="rounded-lg text-amber-600 hover:text-amber-700">
                        <LogOut className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedUser(user); setIsDeleting(true); }} className="rounded-lg text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Tidak ada user ditemukan</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit User Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {selectedUser ? 'Edit User' : 'Tambah User Baru'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser ? 'Perbarui informasi user.' : 'Isi data untuk membuat akun baru.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Email</label>
              <Input 
                value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="user@email.com"
                className="rounded-xl"
                disabled={!!selectedUser}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Password {selectedUser && <span className="text-slate-400 font-normal">(kosongkan jika tidak diubah)</span>}
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
              <label className="text-sm font-semibold text-slate-700">Nama Lengkap</label>
              <Input 
                value={formData.full_name} 
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                placeholder="Nama User"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Role</label>
              <Select value={formData.role} onValueChange={(v) => setFormData({...formData, role: v})}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="karyawan">Karyawan</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Jenis Kelamin</label>
              <Select value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pria">Pria</SelectItem>
                  <SelectItem value="Wanita">Wanita</SelectItem>
                </SelectContent>
              </Select>
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
          <div className="grid grid-cols-2 gap-2 py-4">
            {locations.map((loc) => {
              const isAssigned = userAssignments.some(
                a => a.user_id === selectedUser?.id && a.location_name === loc.name
              );
              return (
                <button
                  key={loc.name}
                  disabled={assignmentBusy}
                  onClick={() => toggleAssignment(loc.name)}
                  className={`flex items-center justify-between p-3 rounded-2xl border-2 transition-all disabled:opacity-50 disabled:pointer-events-none ${
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
