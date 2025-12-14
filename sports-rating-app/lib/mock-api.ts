export interface PerformanceStats {
    speed: number;
    agility: number;
    strength: number;
    endurance: number;
    technique: number;
    gameIQ: number;
    teamwork: number;
    leadership: number;
}

export interface Rating {
    overall: number;
    stats: PerformanceStats;
    recentGames: {
        date: string;
        opponent: string;
        score: string;
        performance: number;
    }[];
    teammates: {
        name: string;
        rating: number;
        comment: string;
    }[];
}

// Mock API to fetch performance data
export async function fetchPerformanceData(): Promise<Rating> {
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        overall: 87,
        stats: {
            speed: 92,
            agility: 88,
            strength: 75,
            endurance: 85,
            technique: 90,
            gameIQ: 87,
            teamwork: 93,
            leadership: 84
        },
        recentGames: [
            { date: '2025-11-28', opponent: 'Thunder', score: '112-108', performance: 94 },
            { date: '2025-11-25', opponent: 'Lakers', score: '98-105', performance: 82 },
            { date: '2025-11-22', opponent: 'Warriors', score: '115-110', performance: 88 },
        ],
        teammates: [
            { name: 'Mike Chen', rating: 9, comment: 'Always brings energy and makes smart plays!' },
            { name: 'Sarah Williams', rating: 8, comment: 'Great court vision and passing.' },
            { name: 'James Rodriguez', rating: 9, comment: 'Defensive anchor, amazing leadership.' },
        ]
    };
}

// Mock API to submit performance data
export async function submitPerformanceData(data: Partial<PerformanceStats>): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Performance data submitted:', data);
}

// Mock API to submit teammate ratings
export async function submitTeammateRating(name: string, rating: number, comment: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Teammate rating submitted:', { name, rating, comment });
}
