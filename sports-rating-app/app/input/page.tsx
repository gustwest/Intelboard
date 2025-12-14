'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { submitPerformanceData, submitTeammateRating } from '@/lib/mock-api';
import { ArrowLeft, Send, TrendingUp, Users, CheckCircle } from 'lucide-react';

export default function InputPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'performance' | 'teammate'>('performance');
    const [submitted, setSubmitted] = useState(false);

    const [performanceData, setPerformanceData] = useState({
        speed: 85,
        agility: 85,
        strength: 85,
        endurance: 85,
        technique: 85,
        gameIQ: 85,
        teamwork: 85,
        leadership: 85,
    });

    const [teammateData, setTeammateData] = useState({
        name: '',
        rating: 5,
        comment: '',
    });

    React.useEffect(() => {
        if (!user) {
            router.push('/');
        }
    }, [user, router]);

    const handlePerformanceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitPerformanceData(performanceData);
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            router.push('/dashboard');
        }, 1500);
    };

    const handleTeammateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitTeammateRating(teammateData.name, teammateData.rating, teammateData.comment);
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            setTeammateData({ name: '', rating: 5, comment: '' });
        }, 1500);
    };

    if (!user) return null;

    return (
        <div className="min-h-screen p-4 md:p-8">
            {/* Header */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto mb-8"
            >
                <button
                    onClick={() => router.push('/dashboard')}
                    className="flex items-center gap-2 text-gray-400 hover:text-neon-blue transition-colors mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Dashboard
                </button>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-blue to-electric-purple bg-clip-text text-transparent">
                    Add New Data
                </h1>
                <p className="text-gray-400 mt-1">Update your performance stats or rate your teammates</p>
            </motion.header>

            {/* Tabs */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="max-w-3xl mx-auto mb-6"
            >
                <div className="glass rounded-2xl p-2 flex gap-2">
                    <button
                        onClick={() => setActiveTab('performance')}
                        className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'performance'
                                ? 'bg-gradient-to-r from-neon-blue to-electric-purple text-white neon-glow'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <TrendingUp className="w-5 h-5" />
                        Performance Data
                    </button>
                    <button
                        onClick={() => setActiveTab('teammate')}
                        className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'teammate'
                                ? 'bg-gradient-to-r from-electric-purple to-neon-pink text-white neon-glow-purple'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <Users className="w-5 h-5" />
                        Rate Teammate
                    </button>
                </div>
            </motion.div>

            {/* Forms */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="max-w-3xl mx-auto"
            >
                {activeTab === 'performance' ? (
                    <form onSubmit={handlePerformanceSubmit} className="glass rounded-3xl p-8 neon-glow">
                        <h2 className="text-2xl font-bold text-white mb-6">Update Performance Stats</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            {Object.entries(performanceData).map(([key, value]) => (
                                <div key={key}>
                                    <label className="block text-sm font-medium text-gray-300 mb-2 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={value}
                                            onChange={(e) =>
                                                setPerformanceData({ ...performanceData, [key]: parseInt(e.target.value) })
                                            }
                                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-neon-blue"
                                        />
                                        <div className="w-12 text-center font-bold text-neon-blue">{value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={submitted}
                            className="w-full mt-8 py-4 px-6 bg-gradient-to-r from-neon-blue via-electric-purple to-neon-pink rounded-xl font-bold text-white neon-glow hover:neon-glow-purple transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {submitted ? (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Submitted!
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    Submit Performance Data
                                </>
                            )}
                        </motion.button>
                    </form>
                ) : (
                    <form onSubmit={handleTeammateSubmit} className="glass rounded-3xl p-8 neon-glow-purple">
                        <h2 className="text-2xl font-bold text-white mb-6">Rate a Teammate</h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Teammate Name</label>
                                <input
                                    type="text"
                                    value={teammateData.name}
                                    onChange={(e) => setTeammateData({ ...teammateData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-neon-pink transition-colors"
                                    placeholder="Mike Chen"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Rating: {teammateData.rating}/10
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={teammateData.rating}
                                    onChange={(e) =>
                                        setTeammateData({ ...teammateData, rating: parseInt(e.target.value) })
                                    }
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-neon-pink"
                                />
                                <div className="flex justify-between mt-2 text-xs text-gray-400">
                                    <span>Needs Work</span>
                                    <span>Outstanding</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Comment</label>
                                <textarea
                                    value={teammateData.comment}
                                    onChange={(e) => setTeammateData({ ...teammateData, comment: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-neon-pink transition-colors min-h-[120px] resize-none"
                                    placeholder="Share your thoughts on their performance..."
                                    required
                                />
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={submitted}
                            className="w-full mt-8 py-4 px-6 bg-gradient-to-r from-electric-purple via-neon-pink to-neon-blue rounded-xl font-bold text-white neon-glow-purple hover:neon-glow transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {submitted ? (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Submitted!
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    Submit Rating
                                </>
                            )}
                        </motion.button>
                    </form>
                )}
            </motion.div>

            {/* Info */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="max-w-3xl mx-auto mt-8 text-center text-gray-400 text-sm"
            >
                <p>All data is processed instantly and your sportscard updates in real-time</p>
            </motion.div>
        </div>
    );
}
