export interface PerformanceData {
    pac: number; // Pace / Speed
    sho: number; // Shot / Attack
    pas: number; // Pass / Set
    dri: number; // Dribble / Technique
    def: number; // Defense / Block/Dig
    phy: number; // Physical
    overall: number;
}

// Mapping for UI labels
export const STAT_LABELS: Record<keyof Omit<PerformanceData, 'overall'>, string> = {
    pac: 'SER', // Serve (mapped to PAC for card layout)
    sho: 'ATK', // Attack (mapped to SHO)
    pas: 'SET', // Set (mapped to PAS)
    dri: 'REC', // Receive (mapped to DRI)
    def: 'BLK', // Block (mapped to DEF)
    phy: 'PHY', // Physical (mapped to PHY)
};

export interface UserProfile {
    id: string;
    name: string;
    sport: string;
    position: string;
    team: string;
    nation: string; // Added nation
    stats: PerformanceData;
}

const MOCK_USER: UserProfile = {
    id: '1',
    name: 'Braydon',
    sport: 'Beach Volleyball',
    position: 'DEF', // Defender
    team: 'Beach Kings',
    nation: 'USA',
    stats: {
        pac: 86, // SER
        sho: 92, // ATK
        pas: 96, // SET
        dri: 95, // REC
        def: 81, // BLK
        phy: 88, // PHY
        overall: 97,
    },
};

export const fetchPerformanceData = async (userId: string): Promise<UserProfile> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return mock data regardless of ID for now
    return MOCK_USER;
};

export const submitTeammateFeedback = async (data: any): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    console.log('Feedback submitted:', data);
    return true;
};
