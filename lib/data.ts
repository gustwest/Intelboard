import { UserRole } from "@/components/role-provider";
export type { UserRole };

export type Specialist = {
    id: string;
    name: string;
    role: string;
    skills: string[];
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

export type ACStatus = "Draft" | "Proposed" | "Agreed";

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
    industry: string;
    budget?: string;
    tags: string[];
    createdAt: string;
    creatorId?: string; // ID of the user who created the request
    assignedSpecialistId?: string; // ID of the specialist assigned
    actionNeeded?: boolean; // If true, requires attention (e.g. from Customer)
    specialistNote?: string; // Last note from specialist
    linkedProjectId?: string; // ID of the linked IT Planner project
    specialistNDASigned?: boolean; // Whether the specialist has signed the NDA
    acceptanceCriteria?: string[];
    acStatus?: ACStatus;
    attachments?: string[];
    urgency?: "Low" | "Medium" | "High" | "Critical";
    category?: "IT" | "CRM" | "Architecture" | "Finance" | "Other";
    attributes?: Record<string, string>; // Dynamic attributes for freeform categories
    comments?: Comment[];
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
    experience?: string;
    skills?: string; // comma separated string as used in form
    background?: string;
};

export const mockUsers: User[] = [
    // Specialists (mapped to specialists array)
    { id: "s1", name: "Alice Chen", role: "Specialist", email: "s1@specialist.com" },
    { id: "s2", name: "Bob Smith", role: "Specialist", email: "s2@specialist.com" },
    { id: "s3", name: "Carol Davis", role: "Specialist", email: "s3@specialist.com" },
    { id: "s4", name: "David Wilson", role: "Specialist", email: "s4@specialist.com" },

    // Admin
    { id: "admin1", name: "IntelBoard Admin", role: "Admin", email: "admin@intelboard.com" },

    // Guest
    { id: "guest1", name: "Guest User", role: "Guest", email: "guest@intelboard.com" },
];

// Helper to generate mock specialists
const roles = [
    "Digital Transformation Consultant", "Cloud Architect", "Data Scientist", "Agile Coach",
    "Cybersecurity Analyst", "DevOps Engineer", "Project Manager", "UX/UI Designer",
    "Systems Analyst", "Blockchain Developer", "AI/ML Engineer", "Business Analyst"
];
const skillsPool = [
    "Supply Chain", "IoT", "Process Optimization", "Agile", "AWS", "Azure", "Migration", "DevOps",
    "Machine Learning", "Python", "React", "Node.js", "Kubernetes", "Docker", "Scrum", "Kanban",
    "Cybersecurity", "Network Security", "Compliance", "Figma", "User Research", "Prototyping",
    "Blockchain", "Smart Contracts", "Solidity", "TensorFlow", "PyTorch", "NLP", "Big Data",
    "SQL", "NoSQL", "Java", "C#", "Go", "Rust", "Project Management", "Risk Management"
];
const industries = ["Auto", "Manufacturing", "Finance", "Tech", "Retail", "Healthcare", "Energy", "Logistics"];
const firstNames = ["Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack", "Kara", "Leo", "Mia", "Nina", "Oscar", "Paul", "Quinn", "Rita", "Sam", "Tina"];
const lastNames = ["Chen", "Smith", "Davis", "Wilson", "Johnson", "Brown", "Taylor", "Miller", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez"];

function generateSpecialists(count: number): Specialist[] {
    return Array.from({ length: count }, (_, i) => {
        const role = roles[Math.floor(Math.random() * roles.length)];
        // Pick 3-6 random skills
        const numSkills = Math.floor(Math.random() * 4) + 3;
        const shuffledSkills = [...skillsPool].sort(() => 0.5 - Math.random());
        const mySkills = shuffledSkills.slice(0, numSkills);

        // Pick 1-2 industries
        const numInd = Math.floor(Math.random() * 2) + 1;
        const shuffledInd = [...industries].sort(() => 0.5 - Math.random());
        const myInd = shuffledInd.slice(0, numInd);

        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

        return {
            id: `s${i + 1}`,
            name: `${firstName} ${lastName}`,
            role: role,
            skills: mySkills,
            industry: myInd,
            bio: `Experienced ${role} specializing in ${myInd.join(" and ")} industries.`,
            availability: Math.random() > 0.3 ? "Available" : "Busy",
            rating: parseFloat((4 + Math.random()).toFixed(1)),
        };
    });
}

export const specialists: Specialist[] = generateSpecialists(50);

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
