import React, { useState, useEffect } from 'react';
import { activityLogsApi } from '@/api/activityLogs.api';
import {
  History, Search, Filter, Calendar, User,
  Activity, ArrowRight, Shield, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const ActivityLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await activityLogsApi.list({ limit: 100 });
      setLogs(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action) => {
    const act = action.toLowerCase();
    if (act.includes('tambah') || act.includes('create')) return 'text-emerald-600 bg-emerald-50';
    if (act.includes('hapus') || act.includes('delete')) return 'text-red-600 bg-red-50';
    if (act.includes('edit') || act.includes('update')) return 'text-blue-600 bg-blue-50';
    if (act.includes('checkout')) return 'text-orange-600 bg-orange-50';
    return 'text-slate-600 bg-slate-50';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <History className="h-5 w-5 text-purple-600" /> Log Aktivitas
        </h2>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="rounded-xl border-slate-200">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Cari nama, aksi, atau detail..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 rounded-xl border-slate-200"
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 font-bold text-slate-600">Waktu</th>
                <th className="px-4 py-3 font-bold text-slate-600">User</th>
                <th className="px-4 py-3 font-bold text-slate-600">Aksi</th>
                <th className="px-4 py-3 font-bold text-slate-600">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-4 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-400 italic">Tidak ada log aktivitas.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-medium">
                      {format(new Date(log.created_at), 'dd MMM, HH:mm', { locale: id })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                          {log.user_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-none">{log.user_name}</p>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{log.role}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {log.details || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogViewer;
