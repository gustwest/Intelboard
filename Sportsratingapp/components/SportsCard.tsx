'use client';

import { UserProfile, STAT_LABELS } from '@/lib/api';

export default function SportsCard({ profile }: { profile: UserProfile }) {
    return (
        <div className="relative w-[320px] h-[480px] mx-auto transition-transform duration-300 hover:scale-105 hover:rotate-1">
            {/* Card Shape & Background */}
            <div
                className="absolute inset-0 w-full h-full bg-gradient-to-b from-[#eecda3] via-[#dbb678] to-[#bf953f] shadow-2xl"
                style={{
                    clipPath: 'path("M 0 20 Q 0 0 20 0 L 140 0 Q 160 15 180 0 L 300 0 Q 320 0 320 20 L 320 380 Q 320 480 160 480 Q 0 480 0 380 Z")',
                    boxShadow: 'inset 0 0 20px rgba(255,255,255,0.5), 0 10px 20px rgba(0,0,0,0.5)'
                }}
            >
                {/* Inner Border/Texture Effect */}
                <div className="absolute inset-1 border-2 border-[#b8860b]/30 rounded-[inherit]" style={{ clipPath: 'inherit' }}></div>

                {/* Top Section: Rating & Info */}
                <div className="absolute top-8 left-6 flex flex-col items-center z-20">
                    <span className="text-5xl font-black text-[#3d3d3d] tracking-tighter leading-none">
                        {profile.stats.overall}
                    </span>
                    <span className="text-xl font-bold text-[#3d3d3d] uppercase tracking-wide mb-1">
                        {profile.position}
                    </span>

                    {/* Nation Flag Placeholder */}
                    <div className="w-8 h-5 bg-white border border-gray-300 mb-1 flex items-center justify-center overflow-hidden">
                        {/* Simple flag representation or text */}
                        <span className="text-[8px] font-bold">{profile.nation}</span>
                    </div>

                    {/* Club/Team Logo Placeholder */}
                    <div className="w-8 h-8 bg-white rounded-full border border-gray-300 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-center leading-none">{profile.team.substring(0, 3)}</span>
                    </div>
                </div>

                {/* Player Image */}
                <div className="absolute top-12 right-4 w-48 h-48 z-10">
                    {/* Placeholder for player image - using a generic avatar if no image provided */}
                    <div className="w-full h-full bg-[url('https://placehold.co/200x200/png?text=Player')] bg-contain bg-no-repeat bg-center mix-blend-multiply opacity-90"></div>
                </div>

                {/* Bottom Section: Name & Stats */}
                <div className="absolute bottom-6 left-0 right-0 px-6 z-20">
                    <div className="text-center mb-3">
                        <h2 className="text-3xl font-black text-[#3d3d3d] uppercase tracking-tight border-b-2 border-[#b8860b]/20 pb-1 inline-block min-w-[80%]">
                            {profile.name}
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[#3d3d3d]">
                        {Object.entries(profile.stats).map(([key, value]) => {
                            if (key === 'overall') return null;
                            const label = STAT_LABELS[key as keyof typeof STAT_LABELS];
                            return (
                                <div key={key} className="flex items-center justify-center gap-2">
                                    <span className="font-black text-lg">{value}</span>
                                    <span className="font-bold text-sm uppercase tracking-wide opacity-80">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Shine Effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ clipPath: 'inherit' }}></div>
            </div>
        </div>
    );
}
