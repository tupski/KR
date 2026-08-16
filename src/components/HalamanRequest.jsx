import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, PlusCircle, ChevronDown, Check, X, History, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { requestsApi } from '@/api/requests.api';
import { locationsApi } from '@/api/locations.api';

const HalamanRequest = () => {
    const { user, userRole } = useAuth();
    const [requests, setRequests] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [newRequest, setNewRequest] = useState({
        employee_name: '',
        apartment_location: '',
        request_type: '',
        description: '',
        amount: '',
        desired_date: '',
    });
    const [lokasiOptions, setLokasiOptions] = useState([]);
    const [karyawanOptions, setKaryawanOptions] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    const requestTypes = [
        'Request Perlengkapan Unit',
        'Kebutuhan Unit',
        'Request Kasbon',
        'Request Cuti',
        'Lainnya...',
    ];
    const isAdminUser = userRole === 'admin' || userRole === 'super_admin';

    const fetchOptions = async () => {
        try {
            const lokasiData = await locationsApi.list();
            if (lokasiData?.data) setLokasiOptions(lokasiData.data.map(l => l.name));
            // Note: karyawan_list is deprecated; employee names come from user_profiles
            // Keeping the state for backward compatibility if needed
        } catch (err) {
            console.error("Error fetching location options:", err);
        }
    };

    const loadRequests = useCallback(async () => {
        try {
            const result = await requestsApi.list();
            // API returns { data, total, page, limit } - extract data array
            setRequests(result.data || []);
        } catch (err) {
            console.error("Error fetching requests:", err);
            toast({ title: "Error", description: "Gagal memuat data request", variant: "destructive" });
        }
    }, []);

    useEffect(() => {
        fetchOptions();
        loadRequests();
        // Realtime subscription removed - now using REST API polling or manual refresh
        // If realtime is needed, implement WebSocket separately
    }, [loadRequests]);

    useEffect(() => {
        if (userRole === 'karyawan') {
            const name = user?.user_metadata?.full_name || user?.email || '';
            if (name) setNewRequest((prev) => ({ ...prev, employee_name: name }));
        }
    }, [user, userRole]);

    const handleInputChange = (field, value) => {
        setNewRequest(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmitRequest = async () => {
        const { employee_name, apartment_location, request_type, description, desired_date, amount } = newRequest;
        if (!employee_name || !apartment_location || !request_type || !desired_date) {
            toast({ title: "Data tidak lengkap!", description: "Pastikan semua kolom yang wajib diisi telah terisi.", variant: "destructive" });
            return;
        }

        try {
            await requestsApi.create({
                employee_name,
                apartment_location,
                request_type,
                notes: description,
                desired_date,
                amount: request_type === 'Request Kasbon' ? amount || null : null,
            });
            // Activity logging handled by backend

            toast({ title: "✅ Request berhasil dikirim!" });
            setIsFormOpen(false);
            setNewRequest({ employee_name: '', apartment_location: '', request_type: '', description: '', amount: '', desired_date: '' });
            loadRequests();
        } catch (err) {
            toast({ title: "Gagal mengirim request", description: err.message, variant: "destructive" });
        }
    };

    const handleUpdateRequestStatus = async (id, status) => {
        if (!isAdminUser) return;
        try {
            await requestsApi.updateStatus(id, { status });
            // Activity logging handled by backend
            toast({ title: `✅ Request ${status === 'Approved' ? 'disetujui' : 'ditolak'}!` });
            loadRequests();
        } catch (err) {
            toast({ title: "Gagal update status", description: err.message, variant: "destructive" });
        }
    };

    const handleSendRequestToAdmin = (req) => {
        const text = `Halo Admin, saya ingin follow-up request.\n\nJenis: ${req.request_type}\nLokasi: ${req.apartment_location}\nTanggal: ${formatDate(req.desired_date)}\nStatus: ${req.status}\nDeskripsi: ${req.description || '-'}`;
        window.open(`https://wa.me/6289613413636?text=${encodeURIComponent(text)}`, '_blank');
    };

    const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const filteredRequests = useMemo(() => {
        if (userRole === 'karyawan') {
            return requests.filter((r) => r.user_id === user?.id);
        }
        return requests;
    }, [requests, userRole, user]);

    const pendingRequests = filteredRequests.filter((r) => r.status === 'Pending');
    const handledRequests = filteredRequests.filter((r) => r.status !== 'Pending');

    const getStatusColor = (status) => {
        if (status === 'Approved') return 'bg-green-100 text-green-800';
        if (status === 'Rejected') return 'bg-red-100 text-red-800';
        return 'bg-yellow-100 text-yellow-800';
    };

    return (
        <div className="min-h-screen p-4 pt-6 pb-28">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto space-y-5">
                <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-xl font-black tracking-tight uppercase">Request & Permintaan</h1>
                        <p className="text-blue-100 text-xs mt-1">Kirim permintaan kebutuhan unit atau kasbon di sini.</p>
                    </div>
                </div>

                <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                    <DialogTrigger asChild>
                        <Button className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-bold py-6 text-base rounded-2xl shadow-lg">
                            <PlusCircle className="mr-2 h-5 w-5" /> Buat Request Baru
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white">
                        <DialogHeader>
                            <DialogTitle>Form Request Karyawan</DialogTitle>
                            <DialogDescription>Isi data permintaan karyawan lalu kirim untuk ditinjau.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                            <select value={newRequest.request_type} onChange={(e) => handleInputChange('request_type', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900">
                                <option value="">Pilih Jenis Request</option>
                                {requestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                            {userRole === 'karyawan' ? (
                                <input value={newRequest.employee_name} disabled className="w-full px-3 py-2.5 rounded-xl border-2 bg-slate-100 text-gray-900" />
                            ) : (
                                <select value={newRequest.employee_name} onChange={(e) => handleInputChange('employee_name', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900">
                                    <option value="">Pilih Karyawan</option>
                                    {karyawanOptions.map((k, i) => <option key={i} value={k}>{k}</option>)}
                                </select>
                            )}
                             <select value={newRequest.apartment_location} onChange={(e) => handleInputChange('apartment_location', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 text-gray-900">
                                <option value="">Pilih Lokasi</option>
                                {lokasiOptions.map((lok, i) => <option key={i} value={lok}>{lok}</option>)}
                            </select>
                            <AnimatePresence>
                                {newRequest.request_type === 'Request Kasbon' && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                        <input type="number" placeholder="Nominal Kasbon (Rp)" value={newRequest.amount} onChange={(e) => handleInputChange('amount', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <textarea placeholder="Jelaskan detail permintaan Anda..." value={newRequest.description} onChange={(e) => handleInputChange('description', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900 h-24" />
                            <div className="relative">
                                <label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-600">Tanggal yang diinginkan</label>
                                <input type="date" value={newRequest.desired_date} onChange={(e) => handleInputChange('desired_date', e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 text-gray-900" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleSubmitRequest} className="w-full bg-cyan-500 hover:bg-cyan-600">Kirim Request</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="glassmorphic-card p-5 space-y-4">
                    <h2 className="font-bold text-lg text-gray-800">Request Aktif</h2>
                    {pendingRequests.length === 0 ? (<p className="text-center text-gray-500 py-8">Tidak ada request aktif. 👍</p>) : (
                        pendingRequests.map(req => (
                            <motion.div key={req.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/50 p-4 rounded-2xl shadow-sm border border-gray-200">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-800 text-md">{req.request_type}</h3>
                                    <div className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusColor(req.status)} inline-block`}>{req.status}</div>
                                </div>
                                <p className="text-sm text-gray-600 font-semibold">{req.employee_name} - {req.apartment_location}</p>
                                {req.request_type === 'Request Kasbon' && <p className="text-lg font-bold text-blue-600">{formatRupiah(req.amount)}</p>}
                                <p className="text-sm text-gray-700 mt-2 border-t border-gray-200 pt-2">{req.description || "Tidak ada deskripsi."}</p>
                                <p className="text-xs text-gray-500 mt-1">Tanggal: {formatDate(req.desired_date)}</p>
                                {isAdminUser ? (
                                    <div className="flex gap-2 mt-3">
                                        <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600" onClick={() => handleUpdateRequestStatus(req.id, 'Approved')}><Check className="w-4 h-4 mr-1"/> ACC</Button>
                                        <Button size="sm" className="flex-1 bg-red-500 hover:bg-red-600" onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')}><X className="w-4 h-4 mr-1"/> Reject</Button>
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs font-semibold text-amber-700">Menunggu Konfirmasi Admin</p>
                                        <Button
                                            size="sm"
                                            className="w-full bg-green-600 hover:bg-green-700"
                                            onClick={() => handleSendRequestToAdmin(req)}
                                        >
                                            <MessageCircle className="mr-2 h-4 w-4" />
                                            Kirim WA request Anda ke admin
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        ))
                    )}
                </div>

                <div className="glassmorphic-card p-5 space-y-4">
                    <button onClick={() => setShowHistory(!showHistory)} className="w-full flex justify-between items-center p-1">
                        <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2"><History className="w-5 h-5"/>Riwayat Request</h2>
                        <ChevronDown className={`w-5 h-5 transition-transform text-gray-800 ${showHistory ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {showHistory && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 space-y-3 overflow-hidden">
                                {handledRequests.length > 0 ? handledRequests.map(req => (
                                    <motion.div key={req.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/50 p-4 rounded-2xl opacity-80 border">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-semibold text-gray-700 text-sm">{req.request_type}</h3>
                                            <div className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusColor(req.status)}`}>{req.status}</div>
                                        </div>
                                        <p className="text-xs text-gray-500">{req.employee_name} - {req.apartment_location}</p>
                                        {req.request_type === 'Request Kasbon' && <p className="font-bold text-blue-500">{formatRupiah(req.amount)}</p>}
                                        <p className="text-xs text-gray-500 mt-1">Tgl Request: {formatDate(req.desired_date)}</p>
                                    </motion.div>
                                )) : <p className="text-center text-gray-500 py-4">Belum ada riwayat.</p>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

export default HalamanRequest;