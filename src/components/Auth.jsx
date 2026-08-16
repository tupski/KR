import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import { Download, LogIn, Shield, User } from 'lucide-react';

const Auth = () => {
    const { signIn } = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const currentYear = new Date().getFullYear();
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);

    const isIos = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
    }, []);

    const checkInstalled = () => {
        if (typeof window === 'undefined') return false;
        const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
        const iosStandalone = window.navigator?.standalone === true;
        return Boolean(standalone || iosStandalone);
    };

    useEffect(() => {
        setIsInstalled(checkInstalled());

        const onBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        const onAppInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.addEventListener('appinstalled', onAppInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const canShowInstall = !isInstalled && (Boolean(deferredPrompt) || isIos);

    const handleInstallClick = async () => {
        if (isInstalled) return;
        if (!deferredPrompt) {
            if (isIos) {
                toast({
                    title: 'Install di iPhone/iPad',
                    description: 'Buka via Safari → tombol Share → Add to Home Screen.',
                });
            }
            return;
        }
        try {
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice?.outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } catch (_e) {
            // silent
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signIn(email, password);
            toast({ title: "Login Berhasil!" });
        } catch (error) {
            toast({ variant: "destructive", title: "Login Gagal!", description: error.message });
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900 p-4">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm mx-auto bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white">KakaRama Room</h1>
                    <small className="text-gray-300">Masuk menggunakan akun karyawan/admin KakaRama Room</small>
                </div>

                {/* Admin Info */}
                {/* <div className="mb-6 p-4 bg-yellow-500/20 rounded-lg border border-yellow-400/30">
                    <div className="flex items-center gap-2 text-yellow-200 text-sm">
                        <Shield className="h-4 w-4" />
                        <span className="font-semibold">Super Admin Access</span>
                    </div>
                    <p className="text-yellow-100 text-xs mt-1">
                        Gunakan akun admin untuk akses penuh ke semua fitur
                    </p>
                </div> */}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-2">Email</label>
                        <input
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border-2 border-white/20 text-white placeholder-gray-400 focus:ring-4 focus:ring-blue-300 focus:border-blue-400 transition-all outline-none"
                            type="email"
                            placeholder="admin@apartemen.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-2">Password</label>
                        <input
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border-2 border-white/20 text-white placeholder-gray-400 focus:ring-4 focus:ring-blue-300 focus:border-blue-400 transition-all outline-none"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <Button type="submit" className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-bold py-3 text-base rounded-xl shadow-lg" disabled={loading}>
                            {loading ? 'Memuat...' : <><LogIn className="mr-2 h-5 w-5" /> Masuk</>}
                        </Button>
                    </div>
                </form>

                {canShowInstall && (
                    <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4 text-white">
                        <p className="text-sm font-semibold">Install aplikasi ke HP</p>
                        <p className="mt-1 text-xs text-white/80">
                            {deferredPrompt
                                ? 'Klik tombol di bawah untuk memasang aplikasi.'
                                : 'iPhone/iPad: buka via Safari → Share → Add to Home Screen.'}
                        </p>
                        <Button
                            type="button"
                            onClick={handleInstallClick}
                            className="mt-3 w-full bg-white text-blue-800 hover:bg-white/90"
                        >
                            <Download className="mr-2 h-5 w-5" />
                            Install Aplikasi
                        </Button>
                    </div>
                )}

                <div className="mt-6 text-center">
                    <p className="text-gray-400 text-xs">
                        Belum punya akun?
                        <br />
                        Hubungi <b>KR</b> untuk membuat akun.
                    </p>
                    <p className="mt-4 text-[11px] text-white/60">
                        © {currentYear} - Kakarama Room. All rights reserved.
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default Auth;