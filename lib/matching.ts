import { Request, Specialist } from "./data";

export type ScoredSpecialist = Specialist & { score: number; matchReasons: string[] };

export function findMatches(request: Request, specialists: Specialist[]): ScoredSpecialist[] {
    const MAX_SCORE = 25; // 10 (industry) + 5 (skills) + 3 (role) + extra buffer

    return specialists
        .map((specialist) => {
            let points = 0;
            const matchReasons: string[] = [];

            // Industry Match (High Weight)
            if (specialist.industry.some((ind) => ind.toLowerCase() === request.industry.toLowerCase())) {
                points += 10;
                matchReasons.push(`Industry match: ${request.industry}`);
            }

            // Tag/Skill Match
            const requestText = `${request.title} ${request.description} ${request.tags ? request.tags.join(" ") : ""}`.toLowerCase();

            let skillMatches = 0;
            // Handle both string arrays (legacy) and object arrays (new)
            const userSkills = specialist.skills.map((s: any) =>
                typeof s === 'string' ? s : s.name
            );

            userSkills.forEach((skill) => {
                if (skill && requestText.includes(skill.toLowerCase())) {
                    skillMatches++;
                    if (skillMatches <= 3) { // Cap skill points to avoid inflation
                        points += 5;
                        matchReasons.push(`Skill match: ${skill}`);
                    }
                }
            });

            // Role match (simple keyword check in description)
            if (requestText.includes(specialist.role.toLowerCase())) {
                points += 5;
                matchReasons.push(`Role match: ${specialist.role}`);
            }

            // Calculate percentage
            // If points > MAX_SCORE, cap at 100% (rare but possible with many skills)
            // Otherwise, simple ratio.
            // Let's make it a bit more lenient: if you have industry + 1 skill, that's decent.
            // Industry (10) + Role (5) + 2 Skills (10) = 25 = 100%

            const score = Math.min(Math.round((points / MAX_SCORE) * 100), 100);

            return { ...specialist, score, matchReasons };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
}
