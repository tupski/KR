import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Bell, Filter, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { notificationsApi } from '@/api/notifications.api';
import { useAuth } from '@/contexts/AuthContext';
import { formatWibDateTime } from '@/lib/formatWib';
import PaginationControls from '@/components/PaginationControls';

const PAGE_SIZE = 10;

function buildAudienceFilter(userId, userRole) {
  if (!userId) return null;
  if (userRole === 'super_admin') return `audience_user_id.eq.${userId},audience_role.eq.super_admin,audience_role.eq.admin,audience_role.eq.all`;
  if (userRole === 'admin') return `audience_user_id.eq.${userId},audience_role.eq.admin,audience_role.eq.all`;
  return `audience_user_id.eq.${userId},audience_role.eq.all`;
}

function typeToCategory(type) {
  switch (type) {
    case 'announcement':
      return { label: 'Pengumuman', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'checkout_due':
      return { label: 'Checkout', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'checkout_soon':
      return { label: 'Pengingat', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'rooms_low':
      return { label: 'Kamar Hampir Habis', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    case 'rooms_sold_out':
      return { label: 'Kamar Habis', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'new_transaction':
      return { label: 'Transaksi', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'new_checkin':
      return { label: 'Check-in Baru', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'new_request':
      return { label: 'Request Baru', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
    case 'request_response':
      return { label: 'Respon Request', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case 'tagihan_overdue':
      return { label: 'Tagihan Terlambat', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'weekend':
      return { label: 'Weekend', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'weekend_tomorrow':
      return { label: 'Besok Weekend', className: 'bg-teal-100 text-teal-800 border-teal-200' };
    case 'holiday_today':
      return { label: 'Libur Hari Ini', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'holiday_tomorrow':
      return { label: 'Libur Besok', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'long_holiday':
      return { label: 'Libur Panjang', className: 'bg-purple-100 text-purple-800 border-purple-200' };
    default:
      return { label: 'Info', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
}

export default function NotificationsInbox({ open, onOpenChange, onOpenAll }) {
  const { user, userRole } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [unreadSet, setUnreadSet] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const params = {
        page,
        limit: pageSize,
        unread_only: onlyUnread || undefined,
      };

      const response = await notificationsApi.list(params);
      
      // API returns { notifications, total, readStatus, hiddenStatus }
      const notif = response.notifications || response.data || response;
      const count = response.total || response.count || notif.length;
      
      setTotalItems(count);
      setItems(notif);
      
      // Calculate unread set from readStatus
      const readIds = new Set(response.readStatus || []);
      const hiddenIds = new Set(response.hiddenStatus || []);
      
      const filtered = notif.filter((n) => !hiddenIds.has(n.id));
      const unread = new Set(filtered.map((n) => n.id).filter((id) => !readIds.has(id)));
      
      setUnreadSet(unread);
    } catch (error) {
      console.warn('[NotificationsInbox] load failed:', error?.message || error);
      if (error?.message && !error.message.includes('notification')) {
        toast({ title: 'Gagal memuat notifikasi', description: error.message || 'Coba buka lagi.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { setPage(1); setOnlyUnread(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load();
    // Note: Realtime subscriptions removed - polling will be handled by API or WebSocket if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, pageSize, userId, onlyUnread]);

  const displayed = useMemo(() => {
    if (!onlyUnread) return items;
    return items.filter((n) => unreadSet.has(n.id));
  }, [items, onlyUnread, unreadSet]);

  const markRead = async (id) => {
    if (!userId || !id) return;
    try {
      await notificationsApi.markRead([id]);
      setUnreadSet((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (error) {
      toast({ title: 'Gagal menandai notifikasi', description: error.message, variant: 'destructive' });
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    const ids = [...unreadSet];
    if (ids.length === 0) return;
    try {
      await notificationsApi.markRead(ids);
      setUnreadSet(new Set());
    } catch (error) {
      toast({ title: 'Gagal menandai semua', description: error.message, variant: 'destructive' });
    }
  };

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="p-0 overflow-hidden w-[calc(100vw-2rem)] max-w-lg rounded-2xl">
        <DialogTitle className="sr-only">Inbox Notifikasi</DialogTitle>
        <DialogDescription className="sr-only">Daftar notifikasi terbaru</DialogDescription>

        {/* Header gradient */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white">
            <Bell className="h-5 w-5" />
            <span className="font-bold text-lg">Inbox</span>
            {unreadSet.size > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white min-w-[1.25rem]">
                {unreadSet.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { onOpenChange(false); onOpenAll?.(); }}
              className="flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Semua
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition text-white text-sm font-bold"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-white/80">
          <button
            type="button"
            onClick={() => setOnlyUnread((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${onlyUnread ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <Filter className="h-3.5 w-3.5" />
            {onlyUnread ? 'Belum dibaca' : 'Semua'}
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadSet.size === 0}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[50vh] divide-y bg-white">
          {loading && <div className="p-5 text-sm text-slate-500 text-center">Memuat...</div>}
          {!loading && displayed.length === 0 && (
            <div className="p-8 text-center">
              <Bell className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Belum ada notifikasi.</p>
            </div>
          )}
          {displayed.map((n) => {
            const unread = unreadSet.has(n.id);
            const cat = typeToCategory(n.type);
            const isExpanded = expandedIds.has(n.id);
            const isLong = (n.body?.length || 0) > 120;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n.id)}
                className={`w-full px-4 py-3.5 text-left transition ${unread ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cat.className}`}>
                        {cat.label}
                      </span>
                      {unread && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className={`text-sm font-semibold leading-snug ${unread ? 'text-slate-900' : 'text-slate-700'}`}>
                      {n.title}
                    </p>
                    <p className={`mt-1 text-xs text-slate-600 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                      {n.body}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(n.id, e)}
                        className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {isExpanded ? <><ChevronUp className="w-3 h-3" /> Sembunyikan</> : <><ChevronDown className="w-3 h-3" /> Selengkapnya</>}
                      </button>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">{formatWibDateTime(n.created_at)}</p>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    {unread ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2 py-1 text-[10px] font-semibold text-white">
                        <Check className="h-3 w-3" /> Baca
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-300">✓ Dibaca</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t bg-white/80">
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            itemsPerPage={pageSize}
            totalItems={totalItems}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
