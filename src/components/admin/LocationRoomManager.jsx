import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, DoorOpen, Plus, Search, Edit2, Trash2, 
  MapPin, Check, X, ChevronRight, LayoutGrid, ArrowLeft,
  Users, Home
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
import { Badge } from '@/components/ui/badge';

// API modules
import { locationsApi } from '../../api/locations.api.js';
import { api } from '../../api/client.js';

const LocationRoomManager = () => {
  const [currentView, setCurrentView] = useState('apartments'); // 'apartments' | 'rooms'
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeTransactions, setActiveTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialogs
  const [isLocDialogOpen, setIsLocDialogOpen] = useState(false);
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [locForm, setLocForm] = useState({ id: null, name: '' });
  const [roomForm, setRoomForm] = useState({ id: null, name: '', lokasi: '' });

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch locations and rooms with occupancy data
      const [locRes, roomsRes] = await Promise.all([
        locationsApi.list(),
        locationsApi.listRoomsWithOccupancy({})
      ]);

      setLocations(locRes || []);
      
      // Flatten rooms from all locations
      const allRooms = roomsRes?.rooms || [];
      setRooms(allRooms);
      
      // Calculate active transactions from room occupancy data
      const transactions = [];
      allRooms.forEach(room => {
        if (room.current_transaction) {
          transactions.push({
            nomor_kamar: room.name,
            apartment_location: room.location,
            status: room.current_transaction.status,
            check_in: room.current_transaction.check_in,
            check_out: room.current_transaction.check_out
          });
        }
      });
      setActiveTransactions(transactions);
    } catch (error) {
      toast({ title: "Gagal memuat data", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const apartmentStats = useMemo(() => {
    return locations.map(loc => {
      const locRooms = rooms.filter(r => r.lokasi === loc.name || r.location === loc.name);
      const total = locRooms.length;
      
      const filledRooms = activeTransactions.filter(t => 
        t.apartment_location === loc.name && 
        (t.status === 'Checked-In' || t.status === 'Booked')
      ).map(t => t.nomor_kamar);
      
      const uniqueFilled = new Set(filledRooms).size;
      const remaining = Math.max(0, total - uniqueFilled);

      return {
        ...loc,
        total,
        filled: uniqueFilled,
        remaining
      };
    });
  }, [locations, rooms, activeTransactions]);

  const handleSaveLocation = async () => {
    if (!locForm.name) return;
    try {
      if (locForm.id) {
        // Update location via PUT endpoint (needs to be added to backend)
        await api.put(`/api/locations/${encodeURIComponent(locForm.name)}`, { 
          id: locForm.id,
          name: locForm.name 
        });
      } else {
        await locationsApi.create(locForm.name);
      }
      toast({ title: "Apartemen berhasil disimpan ✅" });
      setIsLocDialogOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveRoom = async () => {
    if (!roomForm.name || !roomForm.lokasi) return;
    try {
      if (roomForm.id) {
        // Update room via PUT endpoint
        await api.put(`/api/locations/rooms/${roomForm.id}`, {
          name: roomForm.name,
          lokasi: roomForm.lokasi
        });
      } else {
        // Create new room
        await locationsApi.createRoom({
          name: roomForm.name,
          lokasi: roomForm.lokasi
        });
      }
      toast({ title: "Kamar berhasil disimpan ✅" });
      setIsRoomDialogOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'location') {
        await locationsApi.delete(deleteTarget.name);
      } else {
        await locationsApi.deleteRoom(deleteTarget.id);
      }
      toast({ title: "Berhasil dihapus" });
      setIsDeleting(false);
      if (deleteTarget.type === 'location' && selectedLocation?.id === deleteTarget.id) {
        setCurrentView('apartments');
      }
      fetchData();
    } catch (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    }
  };

  const filteredApartments = apartmentStats.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredRooms = rooms.filter(r => 
    (r.lokasi === selectedLocation?.name || r.location === selectedLocation?.name) && 
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {currentView === 'apartments' ? (
          <motion.div 
            key="apartments"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Cari apartemen..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-2xl border-slate-200"
                />
              </div>
              <Button onClick={() => { setLocForm({ id: null, name: '' }); setIsLocDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-100 px-6">
                <Plus className="h-4 w-4 mr-2" /> Tambah Lokasi
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApartments.map(apt => (
                <motion.div 
                  key={apt.id || apt.name}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all cursor-pointer"
                  onClick={() => { setSelectedLocation(apt); setCurrentView('rooms'); setSearchTerm(''); }}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="h-14 w-14 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Building2 className="h-7 w-7" />
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-10 w-10 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={(e) => { e.stopPropagation(); setLocForm(apt); setIsLocDialogOpen(true); }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <h3 className="text-xl font-black text-slate-900 mb-4">{apt.name}</h3>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 p-3 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
                        <p className="text-lg font-black text-slate-900">{apt.total}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase">Terisi</p>
                        <p className="text-lg font-black text-emerald-700">{apt.filled}</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-blue-400 uppercase">Sisa</p>
                        <p className="text-lg font-black text-blue-700">{apt.remaining}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-50 flex items-center justify-between group-hover:bg-blue-600 transition-colors">
                    <span className="text-xs font-bold text-slate-500 group-hover:text-white transition-colors">Lihat Daftar Kamar</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-white transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
            
            {filteredApartments.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada apartemen ditemukan</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="rooms"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => setCurrentView('apartments')} className="rounded-xl h-10 w-10 p-0 hover:bg-slate-100">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{selectedLocation?.name}</h2>
                  <p className="text-sm text-slate-500">Kelola nomor kamar untuk lokasi ini.</p>
                </div>
              </div>
              <div className="flex gap-2">
                 <Button 
                  variant="outline"
                  onClick={() => { setLocForm(selectedLocation); setIsLocDialogOpen(true); }}
                  className="rounded-2xl border-slate-200"
                >
                  <Edit2 className="h-4 w-4 mr-2" /> Edit Apartemen
                </Button>
                <Button onClick={() => { setRoomForm({ id: null, name: '', lokasi: selectedLocation.name }); setIsRoomDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-6">
                  <Plus className="h-4 w-4 mr-2" /> Tambah Kamar
                </Button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Cari nomor kamar..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-xl border-slate-100 bg-slate-50/50"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {filteredRooms.map(room => (
                  <motion.div 
                    key={room.id} 
                    className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group relative flex flex-col items-center justify-between gap-3 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <div className="text-center py-1">
                      <span className="text-xl font-black text-slate-900">{room.name}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 w-full pt-2 border-t border-slate-200/50">
                      <Button size="icon" variant="ghost" onClick={() => { setRoomForm(room); setIsRoomDialogOpen(true); }} className="h-8 w-8 text-blue-600 rounded-lg hover:bg-blue-50">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setDeleteTarget({ type: 'room', id: room.id, name: room.name }); setIsDeleting(true); }} className="h-8 w-8 text-red-600 rounded-lg hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              {filteredRooms.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Tidak ada kamar ditemukan</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Dialog */}
      <Dialog open={isLocDialogOpen} onOpenChange={setIsLocDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {locForm.id ? 'Edit Apartemen' : 'Tambah Apartemen Baru'}
            </DialogTitle>
            <DialogDescription>
              {locForm.id ? 'Perbarui nama apartemen.' : 'Masukkan nama apartemen baru.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-semibold text-slate-700">Nama Apartemen</label>
            <Input 
              value={locForm.name} 
              onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
              placeholder="Contoh: Tower A"
              className="mt-2 rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsLocDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleSaveLocation} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog open={isRoomDialogOpen} onOpenChange={setIsRoomDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {roomForm.id ? 'Edit Kamar' : 'Tambah Kamar Baru'}
            </DialogTitle>
            <DialogDescription>
              {roomForm.id ? 'Perbarui nomor kamar.' : 'Masukkan nomor kamar baru.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Nomor Kamar</label>
              <Input 
                value={roomForm.name} 
                onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                placeholder="Contoh: 101"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Lokasi</label>
              <Select value={roomForm.lokasi} onValueChange={(v) => setRoomForm({ ...roomForm, lokasi: v })}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Pilih lokasi" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id || loc.name} value={loc.name}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsRoomDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleSaveRoom} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent className="bg-white rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteTarget?.type === 'location' ? 'Apartemen' : 'Kamar'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{deleteTarget?.name}</strong>? 
              {deleteTarget?.type === 'location' && " Tindakan ini akan menghapus semua data kamar di dalamnya secara permanen."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-red-600 text-white rounded-xl">Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LocationRoomManager;
