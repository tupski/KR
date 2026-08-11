import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Filter, Trash2, CheckSquare, Square, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatWibDateTime } from '@/lib/formatWib';
import NotificationPreferences from '@/components/NotificationPreferences';

const PAGE_SIZE = 30;

function buildAudienceFilter(userId, userRole) {
  if (!userId) return null;
  if (userRole === 'super_admin') return `audience_user_id.eq.${userId},audience_role.eq.super_admin,audience_role.eq.all`;
  if (userRole === 'admin') return `audience_user_id.eq.${userId},audience_role.eq.admin,audience_role.eq.all`;
  return `audience_user_id.eq.${userId},audience_role.eq.all`;
}

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
  const [hiddenSet, setHiddenSet] = useState(new Set());
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showPrefs, setShowPrefs] = useState(false);

  const audienceFilter = useMemo(() => buildAudienceFilter(userId, userRole), [userId, userRole]);

  /**
   * Helper: chunk array dan fetch reads/hidden secara bertahap.
   * Menggunakan Promise.allSettled agar partial failure tidak menghancurkan semua data.
   */
  const fetchReadsAndHiddenChunked = async (uids, nIds, chunkSize = 20) => {
    const readSet = new Set();
    const hiddenSet = new Set();
    const uniqueIds = [...new Set(nIds)];

    const chunkArr = (arr, sz) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += sz) chunks.push(arr.slice(i, i + sz));
      return chunks;
    };

    const readChunks = chunkArr(uniqueIds, chunkSize);
    const hiddenChunks = chunkArr(uniqueIds, chunkSize);

    const readResults = await Promise.allSettled(
      readChunks.map((chunk) =>
        supabase.from('notification_reads').select('notification_id').eq('user_id', uids)
          .in('notification_id', chunk.length ? chunk : ['00000000-0000-0000-0000-000000000000'])
      )
    );
    for (const r of readResults) {
      if (r.status === 'fulfilled' && r.value?.data) {
        for (const row of r.value.data) readSet.add(row.notification_id);
      } else if (r.status === 'rejected') {
        console.warn('[AllNotifications] notification_reads chunk failed:', r.reason?.message);
      }
    }

    const hiddenResults = await Promise.allSettled(
      hiddenChunks.map((chunk) =>
        supabase.from('notification_hidden').select('notification_id').eq('user_id', uids)
          .in('notification_id', chunk.length ? chunk : ['00000000-0000-0000-0000-000000000000'])
      )
    );
    for (const r of hiddenResults) {
      if (r.status === 'fulfilled' && r.value?.data) {
        for (const row of r.value.data) hiddenSet.add(row.notification_id);
      } else if (r.status === 'rejected') {
        console.warn('[AllNotifications] notification_hidden chunk failed:', r.reason?.message);
      }
    }

    return { readSet, hiddenSet };
  };

  const load = async () => {
    if (!userId || !audienceFilter) return;
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: notif, error: notifErr } = await supabase
        .from('notifications')
        .select('id,type,title,body,data,created_at,audience_role,audience_user_id')
        .or(audienceFilter)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (notifErr) throw notifErr;

      const ids = (notif || []).map((n) => n.id);

      const { readSet: readIds, hiddenSet: hiddenIds } = await fetchReadsAndHiddenChunked(userId, ids, 20);

      const filtered = (notif || []).filter((n) => !hiddenIds.has(n.id));
      const unread = new Set(filtered.map((n) => n.id).filter((id) => !readIds.has(id)));

      setItems(filtered);
      setUnreadSet(unread);
      setHiddenSet(hiddenIds);
    } catch (error) {
      console.warn('[AllNotifications] load failed:', error?.message || error);
      // Jangan tampilkan toast destructive untuk error non-fatal notifikasi
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
  };

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
    const channel = supabase
      .channel(`all_notif_${userId || 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_hidden' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, userId, audienceFilter, onlyUnread]);

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
    const payload = uniqueIds.map((id) => ({ notification_id: id, user_id: userId, read_at: new Date().toISOString() }));
    const { error } = await supabase.from('notification_reads').upsert(payload, { onConflict: 'notification_id,user_id' });
    if (error) {
      toast({ title: 'Gagal menandai notifikasi', description: error.message, variant: 'destructive' });
      return;
    }
    setUnreadSet((prev) => {
      const next = new Set(prev);
      uniqueIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const hideIds = async (ids) => {
    if (!userId) return;
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return;
    const payload = uniqueIds.map((id) => ({ notification_id: id, user_id: userId, hidden_at: new Date().toISOString() }));
    const { error } = await supabase.from('notification_hidden').upsert(payload, { onConflict: 'notification_id,user_id' });
    if (error) {
      toast({ title: 'Gagal menghapus notifikasi', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => prev.filter((n) => !uniqueIds.includes(n.id)));
    setSelectedIds(new Set());
  };

  const handleMarkAllRead = async () => {
    await markIdsRead([...unreadSet]);
  };

  const handleHideAll = async () => {
    await hideIds(displayed.map((n) => n.id));
  };

  const selectionIds = [...selectedIds];

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
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={items.length < PAGE_SIZE}>
              Berikutnya
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NotificationPreferences open={showPrefs} onOpenChange={setShowPrefs} />
    </>
  );
}

