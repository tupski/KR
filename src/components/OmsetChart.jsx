import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PieChart, BarChart, Target, Edit } from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from '@/components/ui/use-toast';
import { transactionsApi } from '@/api/transactions.api.js';
import { format, startOfMonth, addMonths } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943'];

const OmsetChart = () => {
  const [omsetPerLokasi, setOmsetPerLokasi] = useState([]);
  const [totalOmset, setTotalOmset] = useState(0);
  const [target, setTarget] = useState(0);
  const [newTarget, setNewTarget] = useState('');
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const getTargetFromLocal = () => {
    const localTarget = localStorage.getItem('omset_target');
    return localTarget ? Number(localTarget) : 0;
  };

  const fetchData = async () => {
    const monthStart = startOfMonth(new Date(`${selectedMonth}-01`));
    const monthEndExclusive = addMonths(monthStart, 1);
    
    try {
      // Fetch transactions via REST API with date filtering
      const transactions = await transactionsApi.list({
        startDate: monthStart.toISOString(),
        endDate: monthEndExclusive.toISOString(),
      });
      
      const lokasiStats = (transactions || []).reduce((acc, t) => {
        const omset = (t.cash_amount || 0) + (t.transfer_amount || 0);
        if (t.apartment_location) {
          if (!acc[t.apartment_location]) acc[t.apartment_location] = 0;
          acc[t.apartment_location] += omset;
        }
        return acc;
      }, {});

      const chartData = Object.keys(lokasiStats).map(lokasi => ({ name: lokasi, value: lokasiStats[lokasi] })).sort((a, b) => b.value - a.value);
      setOmsetPerLokasi(chartData);
      setTotalOmset(Object.values(lokasiStats).reduce((sum, val) => sum + val, 0));

      const savedTarget = getTargetFromLocal();
      setTarget(savedTarget);
      setNewTarget(savedTarget.toString());
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };
  
  useEffect(() => {
    fetchData();
    // Note: Realtime subscription removed - REST API doesn't support realtime
    // Data will refresh when selectedMonth changes or component remounts
  }, [selectedMonth]);

  const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
  const formatAngka = (angka) => new Intl.NumberFormat('id-ID').format(angka);

  const handleTargetSave = async () => {
    const numericTarget = Number(newTarget);
    if (isNaN(numericTarget)) {
        toast({ title: "Target tidak valid", variant: "destructive" });
        return;
    }
    localStorage.setItem('omset_target', String(numericTarget));

    setTarget(numericTarget);
    setIsTargetDialogOpen(false);
    toast({ title: "🎯 Target Diperbarui!" });
  };

  const progress = target > 0 ? (totalOmset / target) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 p-4 pt-6 pb-28">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-teal-500 text-white px-6 py-3 rounded-full shadow-lg">
            <PieChart className="w-5 h-5" />
            <h1 className="text-xl font-bold">Analisis Omset</h1>
          </div>
        </div>

        <motion.div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl p-5 text-center space-y-2">
          <h2 className="font-bold text-lg text-gray-600">Total Omset</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Periode</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
            />
          </div>
          <p className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-blue-600 my-2">{formatRupiah(totalOmset)}</p>
        </motion.div>

        <motion.div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><Target className="w-5 h-5 text-red-500" /> Target Bulanan</h2>
            <Dialog open={isTargetDialogOpen} onOpenChange={setIsTargetDialogOpen}>
              <DialogTrigger asChild><Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Target Omset</DialogTitle>
                  <DialogDescription>Atur target omset bulanan yang ingin dicapai.</DialogDescription>
                </DialogHeader>
                <input type="number" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2" />
                <DialogFooter><Button onClick={handleTargetSave}>Simpan</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-2xl font-bold text-gray-700">{formatRupiah(target)}</p>
          <div className="w-full bg-gray-200 rounded-full h-4 mt-2 overflow-hidden">
            <motion.div className="bg-gradient-to-r from-yellow-400 to-orange-500 h-4 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <p className="text-right text-sm font-bold mt-1 text-orange-600">{progress.toFixed(1)}% tercapai</p>
        </motion.div>

        <motion.div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl p-5">
          <h2 className="font-bold text-gray-800 mb-4">Omset per Lokasi</h2>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <RechartsPieChart>
                <Pie data={omsetPerLokasi} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {omsetPerLokasi.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatRupiah(value)} />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl p-5">
          <h2 className="font-bold text-gray-800 mb-4">Grafik Penjualan</h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <RechartsBarChart data={omsetPerLokasi} layout="vertical" margin={{ left: 50 }}>
                <XAxis type="number" tickFormatter={formatAngka} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatRupiah(value)} />
                <Bar dataKey="value" barSize={20}>
                  {omsetPerLokasi.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default OmsetChart;