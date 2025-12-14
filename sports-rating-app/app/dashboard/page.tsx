'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import Sportscard from '@/components/Sportscard';
import { fetchPerformanceData, Rating } from '@/lib/mock-api';
import { LogOut, PlusCircle, Loader } from 'lucide-react';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [rating, setRating] = useState<Rating | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            router.push('/');
            return;
        }

        // Fetch performance data
        fetchPerformanceData().then((data) => {
            setRating(data);
            setLoading(false);
        });
    }, [user, router]);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader className="w-12 h-12 text-neon-blue animate-spin" />
            </div>
        );
    }

    if (!user || !rating) {
        return null;
    }

    return (
        <div className="min-h-screen p-4 md:p-8">
            {/* Header */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto mb-8 flex items-center justify-between"
            >
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-blue to-electric-purple bg-clip-text text-transparent">
                        Your Dashboard
                    </h1>
                    <p className="text-gray-400 mt-1">Welcome back, {user.name}!</p>
                </div>

                <div className="flex gap-3">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => router.push('/input')}
                        className="px-6 py-3 bg-gradient-to-r from-neon-blue to-electric-purple rounded-xl font-semibold text-white neon-glow hover:neon-glow-purple transition-all duration-300 flex items-center gap-2"
                    >
                        <PlusCircle className="w-5 h-5" />
                        Add Data
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleLogout}
                        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold text-white border border-gray-700 transition-all duration-300 flex items-center gap-2"
                    >
                        <LogOut className="w-5 h-5" />
                        Logout
                    </motion.button>
                </div>
            </motion.header>

            {/* Sportscard */}
            <Sportscard user={user} rating={rating} />

            {/* Footer */}
            <motion.footer
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="max-w-4xl mx-auto mt-12 text-center text-gray-400 text-sm"
            >
                <p>Your stats update in real-time as you and your teammates add new data</p>
            </motion.footer>
        </div>
    );
}
