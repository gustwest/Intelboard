'use client';

import { useEffect, useState } from 'react';
import SportsCard from '@/components/SportsCard';
import FeedbackForm from '@/components/FeedbackForm';
import { fetchPerformanceData, UserProfile } from '@/lib/api';

export default function Dashboard() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [showFeedback, setShowFeedback] = useState(false);

    useEffect(() => {
        // Fetch mock data
        fetchPerformanceData('1').then(setProfile);
    }, []);

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-pulse text-primary text-xl font-bold">Loading Stats...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 md:p-8 pb-20">
            <header className="flex justify-between items-center mb-12 container mx-auto">
                <h1 className="text-2xl font-black text-gradient tracking-tight">SPORTS RATING</h1>
                <div className="flex gap-4">
                    <button className="text-sm text-gray-400 hover:text-white transition-colors">Profile</button>
                    <button className="text-sm text-gray-400 hover:text-white transition-colors">Team</button>
                    <button className="text-sm text-gray-400 hover:text-white transition-colors">Settings</button>
                </div>
            </header>

            <main className="container mx-auto grid md:grid-cols-2 gap-12 items-start">
                {/* Left Column: Card */}
                <div className="flex flex-col items-center">
                    <SportsCard profile={profile} />
                    <div className="mt-8 text-center">
                        <p className="text-gray-400 text-sm mb-2">Share your card</p>
                        <div className="flex gap-2 justify-center">
                            <button className="p-2 glass rounded hover:bg-white/10">Copy Link</button>
                            <button className="p-2 glass rounded hover:bg-white/10">Instagram</button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Actions & Stats Detail */}
                <div className="space-y-8">
                    <div className="glass p-6">
                        <h2 className="text-xl font-bold mb-4">Performance Actions</h2>
                        <div className="grid grid-cols-1 gap-4">
                            <button
                                onClick={() => setShowFeedback(true)}
                                className="btn btn-primary w-full text-center"
                            >
                                Input Teammate Feedback
                            </button>
                            <button className="p-3 rounded border border-white/10 hover:bg-white/5 transition-colors text-left">
                                Request Coach Review
                            </button>
                            <button className="p-3 rounded border border-white/10 hover:bg-white/5 transition-colors text-left">
                                Update Match Stats
                            </button>
                        </div>
                    </div>

                    <div className="glass p-6">
                        <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
                        <ul className="space-y-3 text-sm text-gray-300">
                            <li className="flex justify-between">
                                <span>Tournament Final</span>
                                <span className="text-green-400">+1 SER</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Sand Training</span>
                                <span className="text-green-400">+2 PHY</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Teammate Review</span>
                                <span className="text-yellow-400">Pending</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </main>

            {/* Feedback Modal Overlay */}
            {showFeedback && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <FeedbackForm onClose={() => setShowFeedback(false)} />
                </div>
            )}
        </div>
    );
}
