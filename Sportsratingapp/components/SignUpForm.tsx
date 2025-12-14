'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignUpForm() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: '',
        sport: '',
        position: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // In a real app, we would save this data.
        // For now, just redirect to dashboard.
        console.log('Sign Up Data:', formData);
        router.push('/dashboard');
    };

    return (
        <div className="glass p-8 max-w-md w-full mx-auto mt-20">
            <h2 className="text-3xl font-bold mb-6 text-center text-gradient">
                Join the League
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">
                        Full Name
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full p-3 rounded bg-black/30 border border-white/10 text-white focus:border-primary focus:outline-none transition-colors"
                        placeholder="e.g. Alex Johnson"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">
                        Sport
                    </label>
                    <select
                        required
                        className="w-full p-3 rounded bg-black/30 border border-white/10 text-white focus:border-primary focus:outline-none transition-colors"
                        value={formData.sport}
                        onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                    >
                        <option value="" disabled>Select your sport</option>
                        <option value="Soccer">Soccer</option>
                        <option value="Basketball">Basketball</option>
                        <option value="Tennis">Tennis</option>
                        <option value="Football">Football</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">
                        Position
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full p-3 rounded bg-black/30 border border-white/10 text-white focus:border-primary focus:outline-none transition-colors"
                        placeholder="e.g. Striker"
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    />
                </div>

                <button
                    type="submit"
                    className="w-full btn btn-primary mt-4"
                >
                    Get Rated
                </button>
            </form>
        </div>
    );
}
