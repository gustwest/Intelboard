import { UserRole } from "@/components/role-provider";
export type { UserRole };

export type Specialist = {
    id: string;
    name: string;
    role: string;
    skills: string[] | { name: string; category: string }[];
    industry: string[];
    bio: string;
    availability: "Available" | "Busy" | "Away";
    rating: number;
};

export type RequestStatus =
    | "New"
    | "Submitted for Review"
    | "Scope Refinement Required"
    | "Scope Approved"
    | "Active Efforts"
    | "Done";

export type RequestType = "Insights" | "Short-term";

export const REQUEST_TYPE_CONFIG: Record<RequestType, { label: string; icon: string; color: string; bg: string; border: string; description: string }> = {
    "Insights": {
        label: "Get Insights",
        icon: "🔍",
        color: "text-violet-600 dark:text-violet-400",
        bg: "bg-violet-500/10",
        border: "border-violet-300 dark:border-violet-700",
        description: "Need guidance, analysis, or expert input on a topic",
    },
    "Short-term": {
        label: "Short-term Resource",
        icon: "⏱️",
        color: "text-cyan-600 dark:text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-cyan-300 dark:border-cyan-700",
        description: "Limited engagement for a specific deliverable or sprint",
    },

};

export type ACStatus = "Draft" | "Proposed" | "Agreed";

export type ConversationType = "direct" | "group" | "request";
export type NotificationType = "message" | "status_change" | "comment" | "assignment" | "opportunity" | "terms" | "info";

export type Conversation = {
    id: string;
    type: ConversationType;
    title: string | null;
    requestId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type Message = {
    id: string;
    conversationId: string;
    senderId: string;
    senderName?: string;
    text: string;
    createdAt: string;
    readBy: string[];
};

export type AppNotification = {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string | null;
    relatedId: string | null;
    isRead: boolean;
    createdAt: string;
};

export type ConversationWithDetails = Conversation & {
    participants: { id: string; name: string; avatar?: string }[];
    lastMessage?: Message;
    unreadCount: number;
    requestTitle?: string;
};

export type Comment = {
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    authorRole: UserRole;
    createdAt: string;
};

export interface Request {
    id: string;
    title: string;
    description: string;
    status: RequestStatus;
    requestType?: RequestType;
    industry: string;
    budget?: string;
    tags: string[];
    createdAt: string;
    creatorId?: string;
    assignedSpecialistId?: string;
    assignedSpecialistIds?: string[];
    requestNumber?: number;
    actionNeeded?: boolean;
    specialistNote?: string;
    linkedProjectId?: string;
    specialistNDASigned?: boolean;
    acceptanceCriteria?: string[];
    acStatus?: ACStatus;
    attachments?: string[];
    urgency?: "Low" | "Medium" | "High" | "Critical";
    category?: "IT" | "CRM" | "Architecture" | "Finance" | "Other";
    attributes?: Record<string, string>;
    comments?: Comment[];
    startDate?: string;
    endDate?: string;
    hourlyRateMin?: string;
    hourlyRateMax?: string;
    salaryMin?: string;
    salaryMax?: string;
    consultantRole?: string;
    requiredSkills?: { name: string; category: string }[];
}

export type User = {
    id: string;
    name: string;
    role: UserRole;
    company?: string; // For customers/agencies
    companyId?: string; // Foreign key to Companies table
    approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
    avatar?: string;
    email?: string;
    // Profile fields for Specialists
    linkedInUrl?: string;
    cvFile?: string; // specific file path or name
    personalLetterFile?: string;
    experience?: string; // Legacy string field
    jobTitle?: string;
    background?: string;
    workExperience?: {
        id: string;
        company: string;
        title: string;
        startDate: string;
        endDate?: string;
        description?: string;
    }[];
    education?: {
        id: string;
        school: string;
        degree: string;
        startDate: string;
        endDate?: string;
    }[];
    skills?: { name: string; category: string }[];
};

// Quick-login account definitions (email + password for each quick-login button)
export const quickLoginAccounts = [
    { label: "Autoliv — Gustav Westergren", email: "gustav.westergren.external@autoliv.com", password: "password123", role: "Customer" as UserRole, icon: "🏢" },
    { label: "Volvo Cars — Erik Lindgren", email: "erik.lindgren@volvocars.com", password: "password123", role: "Customer" as UserRole, icon: "🏢" },
    { label: "Micke Lidas", email: "micke.lidas@intelboard.io", password: "password123", role: "Customer" as UserRole, icon: "🏢" },
    { label: "Freddie Tour", email: "freddie.tour@intelboard.io", password: "password123", role: "Customer" as UserRole, icon: "🏢" },
    { label: "Peter Casadei", email: "peter.casadei@intelboard.io", password: "password123", role: "Customer" as UserRole, icon: "🏢" },
    { label: "Alice Chen — Specialist", email: "alice.chen@intelboard.io", password: "password123", role: "Specialist" as UserRole, icon: "👤" },
    { label: "Bob Smith — Specialist", email: "bob.smith@intelboard.io", password: "password123", role: "Specialist" as UserRole, icon: "👤" },
    { label: "IntelBoard Admin", email: "admin@intelboard.io", password: "admin123", role: "Admin" as UserRole, icon: "🔑" },
];

// Convert a DB user row to the Specialist shape used by the matching engine
export function dbUserToSpecialist(user: any): Specialist {
    const skills = (user.skills || []) as { name: string; category: string }[];
    return {
        id: user.id,
        name: user.name || "Unknown",
        role: user.jobTitle || "Specialist",
        skills,
        industry: (user.industry || []) as string[],
        bio: user.bio || "",
        availability: (user.availability as any) || "Available",
        rating: 4.5, // Default rating for DB-backed specialists
    };
}

export const initialRequests: Request[] = [
    {
        id: "r1",
        title: "Supply Chain Digitalization Strategy",
        description: "We need to know the next steps in our digital transformation within supply chain management. We are looking to integrate IoT sensors for real-time tracking.",
        industry: "Auto",
        tags: ["Supply Chain", "IoT", "Digital Transformation"],
        status: "New",
        creatorId: "c1",
        acceptanceCriteria: [],
        acStatus: "Draft",
        attachments: [],
        createdAt: new Date().toISOString(),
        urgency: "Medium",
        category: "IT"
    },
    {
        id: "r2",
        title: "Cloud Migration Assessment",
        description: "Assess our current on-premise infrastructure and propose a migration plan to AWS.",
        industry: "Finance",
        tags: ["Cloud", "AWS", "Migration"],
        status: "Submitted for Review",
        creatorId: "c1",
        acceptanceCriteria: [
            "Complete inventory of current servers",
            "Cost analysis of AWS vs On-prem",
            "Migration timeline proposal"
        ],
        acStatus: "Agreed",
        attachments: [],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        urgency: "High",
    },
];

// --- Personalized Feed ---

export type FeedItemThread = {
    type: "thread";
    id: string;
    title: string;
    description: string | null;
    boardId: string;
    boardTitle: string;
    postCount: number;
    authorName: string;
    authorAvatar: string | null;
    categoryIcon: string;
    categoryTitle: string;
    categorySlug: string;
    createdAt: string;
};

export type FeedItemRequest = {
    type: "request";
    id: string;
    title: string;
    description: string;
    requestType: string | null;
    urgency: string | null;
    budget: string | null;
    industry: string;
    creatorName: string;
    createdAt: string;
};

export type FeedItemEvent = {
    type: "event";
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string | null;
    location: string | null;
    attendeeCount: number;
    creatorName: string;
    meetingStatus: string | null;
    createdAt: string;
};

export type FeedItemPost = {
    type: "post";
    id: string;
    content: string;
    threadId: string;
    threadTitle: string;
    boardId: string;
    boardTitle: string;
    authorName: string;
    authorAvatar: string | null;
    authorRole: string | null;
    categoryIcon: string;
    categoryTitle: string;
    createdAt: string;
};

export type FeedItem = FeedItemThread | FeedItemRequest | FeedItemEvent | FeedItemPost;

export type PersonalizedFeedResult = {
    feedItems: FeedItem[];
    followedCategories: { id: string; title: string; slug: string; icon: string | null; color: string | null }[];
    suggestedCategories: { id: string; title: string; slug: string; icon: string | null; color: string | null; followerCount: number; description: string | null }[];
};
