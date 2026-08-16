import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { settingsApi } from '@/api/settings.api';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * ComposeAnnouncement
 * Modal untuk admin/super_admin membuat pengumuman global.
 * Pengumuman disimpan ke tabel `notifications` dengan:
 *   type = 'announcement', audience_role = 'all'
 */
const ComposeAnnouncement = ({ open, onOpenChange }) => {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    if (!body.trim()) {
      toast({ title: 'Pesan tidak boleh kosong', variant: 'destructive' });
      return;
    }
    setLoading(true);

    try {
      await settingsApi.createAnnouncement({
        type: 'announcement',
        title: title.trim() || 'Pengumuman',
        body: body.trim(),
        audience_role: 'all',
        audience_user_id: null,
      });

      toast({ title: '📢 Pengumuman terkirim!', description: 'Semua pengguna akan melihat pengumuman ini.' });
      setTitle('');
      setBody('');
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Gagal mengirim pengumuman', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 pb-24 pt-6 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-4">
          <div className="flex items-center gap-2 text-amber-950">
            <Megaphone className="h-5 w-5" />
            <h2 className="font-bold">Buat Pengumuman</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-full p-1 hover:bg-amber-300/50 transition">
            <X className="h-5 w-5 text-amber-950" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <p className="text-xs text-slate-500">
            Pengumuman akan tampil sebagai banner di atas layar untuk semua pengguna dan masuk ke inbox notifikasi.
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Judul (opsional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Info Penting, Promo Hari Ini..."
              className="w-full rounded-xl border-2 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Pesan *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ketik pesan pengumuman di sini..."
              rows={4}
              className="w-full resize-none rounded-xl border-2 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-400"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{body.length} karakter</p>
          </div>

          <Button
            onClick={handleSend}
            disabled={loading || !body.trim()}
            className="h-12 w-full rounded-2xl bg-amber-400 font-bold text-amber-950 hover:bg-amber-500"
          >
            <Send className="mr-2 h-4 w-4" />
            {loading ? 'Mengirim...' : 'Kirim Pengumuman ke Semua'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default ComposeAnnouncement;
