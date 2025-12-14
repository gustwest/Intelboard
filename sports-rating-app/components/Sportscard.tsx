'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Rating } from '@/lib/mock-api';
import { Trophy, TrendingUp, Users, Zap } from 'lucide-react';

interface SportscardProps {
    user: {
        name: string;
        sport: string;
        position: string;
        avatar: string;
    };
    rating: Rating;
}

export default function Sportscard({ user, rating }: SportscardProps) {
    const stats = Object.entries(rating.stats);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative w-full max-w-4xl mx-auto"
        >
            {/* Main Card */}
            <div className="glass rounded-3xl p-8 neon-glow relative overflow-hidden">
                {/* Animated background gradient */}
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-0 left-0 w-96 h-96 bg-neon-blue rounded-full filter blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-0 right-0 w-96 h-96 bg-electric-purple rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
                </div>

                {/* Content */}
                <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-8">
                        <div className="flex items-center gap-6">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-neon-blue to-electric-purple flex items-center justify-center text-5xl neon-glow">
                                {user.avatar}
                            </div>
                            <div>
                                <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-blue via-electric-purple to-neon-pink bg-clip-text text-transparent">
                                    {user.name}
                                </h1>
                                <p className="text-xl text-gray-300 mt-1">{user.position}</p>
                                <p className="text-lg text-gray-400">{user.sport}</p>
                            </div>
                        </div>

                        {/* Overall Rating */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.3, type: 'spring' }}
                            className="glass rounded-2xl p-6 neon-glow-purple text-center"
                        >
                            <Trophy className="w-8 h-8 text-neon-pink mx-auto mb-2" />
                            <div className="text-5xl font-bold bg-gradient-to-r from-neon-pink to-electric-purple bg-clip-text text-transparent">
                                {rating.overall}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">OVERALL</div>
                        </motion.div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        {stats.map(([key, value], index) => (
                            <motion.div
                                key={key}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.1 * index }}
                                className="glass rounded-xl p-4 hover:neon-glow transition-all duration-300 cursor-pointer"
                            >
                                <div className="text-sm text-gray-400 uppercase mb-2">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-2xl font-bold text-neon-blue">{value}</div>
                                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${value}%` }}
                                            transition={{ delay: 0.2 * index, duration: 0.8 }}
                                            className="h-full bg-gradient-to-r from-neon-blue to-electric-purple"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Recent Games */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-5 h-5 text-cyber-green" />
                            <h2 className="text-2xl font-bold text-white">Recent Games</h2>
                        </div>
                        <div className="grid gap-3">
                            {rating.recentGames.map((game, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 * index }}
                                    className="glass rounded-lg p-4 flex items-center justify-between hover:neon-glow transition-all duration-300"
                                >
                                    <div className="flex items-center gap-4">
                                        <Zap className="w-5 h-5 text-neon-pink" />
                                        <div>
                                            <div className="font-semibold text-white">vs {game.opponent}</div>
                                            <div className="text-sm text-gray-400">{game.date}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-neon-blue">{game.score}</div>
                                        <div className="text-sm">
                                            <span className="text-cyber-green font-semibold">{game.performance}</span>
                                            <span className="text-gray-400"> rating</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Teammate Ratings */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-neon-pink" />
                            <h2 className="text-2xl font-bold text-white">Teammate Reviews</h2>
                        </div>
                        <div className="grid gap-3">
                            {rating.teammates.map((teammate, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 * index }}
                                    className="glass rounded-lg p-4 hover:neon-glow-purple transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="font-semibold text-white">{teammate.name}</div>
                                        <div className="flex items-center gap-1">
                                            {[...Array(10)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-2 h-2 rounded-full ${i < teammate.rating
                                                            ? 'bg-gradient-to-r from-neon-pink to-electric-purple'
                                                            : 'bg-gray-600'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-300 italic">&quot;{teammate.comment}&quot;</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
