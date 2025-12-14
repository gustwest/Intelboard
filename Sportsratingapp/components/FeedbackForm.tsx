'use client';

import { useState } from 'react';
import { submitTeammateFeedback, STAT_LABELS } from '@/lib/api';

export default function FeedbackForm({ onClose }: { onClose: () => void }) {
    const [ratings, setRatings] = useState({
        pac: 50, // SER
        sho: 50, // ATK
        pas: 50, // SET
        dri: 50, // REC
        def: 50, // BLK
        phy: 50, // PHY
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (attr: string, value: number) => {
        setRatings({ ...ratings, [attr]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await submitTeammateFeedback(ratings);
        setIsSubmitting(false);
        onClose();
        alert('Feedback submitted! Ratings will update shortly.');
    };

    return (
        <div className="glass p-6 w-full max-w-lg mx-auto">
            <h3 className="text-2xl font-bold mb-4 text-gradient">Rate Player</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                {Object.keys(ratings).map((attr) => (
                    <div key={attr}>
                        <div className="flex justify-between mb-1">
                            <label className="capitalize text-gray-300">
                                {STAT_LABELS[attr as keyof typeof STAT_LABELS]} ({attr.toUpperCase()})
                            </label>
                            <span className="text-primary font-bold">{(ratings as any)[attr]}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={(ratings as any)[attr]}
                            onChange={(e) => handleChange(attr, parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                ))}
                <div className="flex gap-4 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2 rounded border border-white/20 hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 btn btn-primary"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Rating'}
                    </button>
                </div>
            </form>
        </div>
    );
}
