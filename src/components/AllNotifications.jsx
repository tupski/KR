import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Filter, Trash2, CheckSquare, Square, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatWibDateTime } from '@/lib/formatWib';
import NotificationPreferences from '@/components/NotificationPreferences';
import { notificationsApi } from '@/api/notifications.api';

const PAGE_SIZE = 30;

function typeToCategory(type) {
  switch (type) {
    case 'announcement':
      return { label: 'Pengumuman', variant: 'secondary', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'checkout_due':
      return { label: 'Checkout', variant: 'destructive', className: 'bg-red-100 text-red-800 border-red-200' };
    case 'checkout_soon':
      return { label: 'Pengingat', variant: 'default', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'rooms_low':
      return { label: 'Kamar Hampir Habis', variant: 'secondary', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    case 'rooms_sold_out':
      return { label: 'Kamar Habis', variant: 'destructive', className: 'bg-red-100 text-red-800 border-red-200' };
    default:
      return { label: 'Lainnya', variant: 'outline', className: 'border-slate-200 text-slate-700' };
  }
}

export default function AllNotifications({ open, onOpenChange }) {
  const { user, userRole } = useAuth();
  const userId = user?.id;

  const [items, setItems] = useState([]);
  const [unreadSet, setUnreadSet] = useState(new Set());
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showPrefs, setShowPrefs] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Use REST API to list notifications
      const result = await notificationsApi.list({ page, limit: PAGE_SIZE });
      
      const notifications = result.data || [];
      const totalCount = result.total || 0;
      
      // Get read status for the notifications
      const ids = notifications.map((n) => n.id);
      let readIds = [];
      if (ids.length > 0) {
        try {
          const readStatus = await notificationsApi.getReadStatus(ids);
          readIds = readStatus.read_ids || [];
        } catch (err) {
          console.warn('[AllNotifications] Failed to fetch read status:', err.message);
        }
      }
      
      const readSet = new Set(readIds);
      const unread = new Set(ids.filter((id) => !readSet.has(id)));
      
      setItems(notifications);
      setUnreadSet(unread);
      setTotal(totalCount);
    } catch (error) {
      console.warn('[AllNotifications] load failed:', error?.message || error);
      if (error?.message && !error.message.includes('notification')) {
        toast({
          title: 'Gagal memuat notifikasi',
          description: error.message || 'Coba buka lagi beberapa saat.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    if (open) {
      setPage(1);
      setOnlyUnread(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, page, userId]);

  const displayed = useMemo(() => {
    if (!onlyUnread) return items;
    return items.filter((n) => unreadSet.has(n.id));
  }, [items, onlyUnread, unreadSet]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markIdsRead = async (ids) => {
    if (!userId) return;
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return;
    
    try {
      await notificationsApi.markRead(uniqueIds);
      setUnreadSet((prev) => {
        const next = new Set(prev);
        uniqueIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (error) {
      toast({ title: 'Gagal menandai notifikasi', description: error.message, variant: 'destructive' });
    }
  };

  const hideIds = async (ids) => {
    if (!userId) return;
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return;
    
    try {
      await notificationsApi.hideMany(uniqueIds);
      setItems((prev) => prev.filter((n) => !uniqueIds.includes(n.id)));
      setSelectedIds(new Set());
    } catch (error) {
      toast({ title: 'Gagal menghapus notifikasi', description: error.message, variant: 'destructive' });
    }
  };

  const handleMarkAllRead = async () => {
    await markIdsRead([...unreadSet]);
  };

  const handleHideAll = async () => {
    await hideIds(displayed.map((n) => n.id));
  };

  const selectionIds = [...selectedIds];

  // Calculate if there are more pages
  const hasMore = items.length === PAGE_SIZE && (page * PAGE_SIZE) < total;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Semua Notifikasi
            </DialogTitle>
            <DialogDescription>Daftar notifikasi dari seluruh aplikasi.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectMode((v) => !v)}>
                {selectMode ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
                Pilih
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOnlyUnread((v) => !v)}>
                <Filter className="mr-2 h-4 w-4" />
                {onlyUnread ? 'Belum dibaca' : 'Semua'}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={unreadSet.size === 0}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Sudah Dibaca
              </Button>
              <Button variant="outline" size="sm" onClick={handleHideAll} disabled={displayed.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus Semua
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPrefs(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                Preferensi
              </Button>
            </div>
          </div>

          {selectMode && (
            <div className="rounded-xl border bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700">
                  Dipilih: <span className="font-bold">{selectedIds.size}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => markIdsRead(selectionIds)} disabled={selectedIds.size === 0}>
                    Tandai Sudah Dibaca
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => hideIds(selectionIds)} disabled={selectedIds.size === 0}>
                    Hapus Notifikasi
                  </Button>
                </div>
              </div>
            </div>
          )}

          <ScrollArea className="mt-3 h-[60vh] rounded-lg border">
            <div className="divide-y">
              {loading && <div className="p-4 text-sm text-slate-500">Memuat...</div>}
              {!loading && displayed.length === 0 && <div className="p-4 text-sm text-slate-500">Belum ada notifikasi.</div>}
              {displayed.map((n) => {
                const unread = unreadSet.has(n.id);
                const selected = selectedIds.has(n.id);
                const cat = typeToCategory(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (selectMode) {
                        toggleSelected(n.id);
                        return;
                      }
                      markIdsRead([n.id]);
                    }}
                    className={`w-full p-4 text-left transition ${unread ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant={cat.variant} className={cat.className}>
                            {cat.label}
                          </Badge>
                          {selectMode && (
                            <span className={`text-[10px] font-bold ${selected ? 'text-blue-700' : 'text-slate-400'}`}>
                              {selected ? 'Dipilih' : 'Pilih'}
                            </span>
                          )}
                        </div>
                        <p className={`truncate text-sm font-semibold ${unread ? 'text-slate-900' : 'text-slate-700'}`}>{n.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{n.body}</p>
                        <p className="mt-2 text-[11px] text-slate-500">{formatWibDateTime(n.created_at)}</p>
                      </div>
                      <div className="shrink-0">
                        {unread ? (
                          <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">
                            Baru
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">Dibaca</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="mt-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Sebelumnya
            </Button>
            <p className="text-xs text-slate-500">Halaman {page}</p>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasMore}>
              Berikutnya
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NotificationPreferences open={showPrefs} onOpenChange={setShowPrefs} />
    </>
  );
}
