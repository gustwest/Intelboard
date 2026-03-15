/**
 * Seed script: creates diverse demo events with interactions between all users.
 * Run with: npx tsx scripts/seed-events.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Dynamic import so DB connection uses the env vars loaded above
async function main() {
    const { db } = await import("../lib/db");
    const { events, users } = await import("../lib/schema");

    console.log("🗓️  Seeding demo events...\n");

    // ─── Fetch existing users ────────────────────────────────────
    const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
    console.log(`Found ${allUsers.length} users in the database.`);

    if (allUsers.length < 3) {
        console.error("❌ Need at least 3 users. Run seed-demo-accounts.ts first.");
        process.exit(1);
    }

    // Map users by email
    const findUser = (email: string) => allUsers.find(u => u.email === email);
    const gustav = findUser("gustav.westergren.external@autoliv.com");
    const erik = findUser("erik.lindgren@volvocars.com");
    const micke = findUser("micke.lidas@intelboard.io");
    const freddie = findUser("freddie.tour@intelboard.io");
    const peter = findUser("peter.casadei@intelboard.io");
    const anna = findUser("anna.andersson@autoliv.com");
    const sofia = findUser("sofia.bergstrom@volvocars.com");
    const admin = findUser("admin@intelboard.io");

    const userPool = [gustav, erik, micke, freddie, peter, anna, sofia, admin].filter(Boolean) as { id: string; name: string; email: string | null }[];
    console.log(`Using ${userPool.length} users for event seeding.\n`);

    const now = new Date();
    const hours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
    const days = (d: number, h = 10) => {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        date.setHours(h, 0, 0, 0);
        return date;
    };

    // ─── Clear existing events ───────────────────────────────────
    console.log("Clearing existing events...");
    await db.delete(events);
    console.log("  ✓ Cleared\n");

    // ─── Event definitions ───────────────────────────────────────
    const eventDefs = [
        // ═══ LIVE / IN-PROGRESS ═══
        {
            title: "🔴 Cloud Migration Strategy — Live Discussion",
            description: "Open roundtable discussing best practices for enterprise cloud migration. All team members welcome to join and contribute their experiences.",
            startTime: hours(-0.5), endTime: hours(1),
            createdBy: micke?.id || userPool[0].id,
            attendees: [erik, peter, anna].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [erik, peter].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "none", meetingStatus: "in_progress",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-cloud-migration",
            agenda: "1. Current migration challenges\n2. Multi-cloud vs single-cloud\n3. Cost optimization strategies\n4. Security best practices\n5. Q&A",
        },
        {
            title: "🔴 AI Integration Workshop — Hands-On Session",
            description: "Interactive workshop on integrating AI models into existing enterprise applications. Bring your use cases!",
            startTime: hours(-1), endTime: hours(1.5),
            createdBy: freddie?.id || userPool[0].id,
            attendees: [gustav, erik, micke, sofia].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [gustav, erik, micke].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "none", meetingStatus: "in_progress",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-ai-workshop",
            agenda: "1. AI model selection criteria\n2. Integration patterns\n3. RAG pipeline demo\n4. Live coding session\n5. Discussion",
        },

        // ═══ UPCOMING (today/tomorrow) ═══
        {
            title: "Automotive Safety Tech Sync",
            description: "Weekly sync on automotive safety technology developments. Open to everyone interested in ADAS, sensor fusion, and safety standards.",
            startTime: hours(2), endTime: hours(3),
            createdBy: gustav?.id || userPool[0].id,
            attendees: [erik, anna, sofia].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [erik, anna].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "weekly", meetingStatus: "scheduled",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-safety-sync",
            agenda: "1. ADAS updates\n2. Sensor fusion progress\n3. ISO 26262 compliance\n4. Action items review",
        },
        {
            title: "Digital Transformation Roundtable",
            description: "Monthly roundtable for leaders driving digital transformation. Share wins, challenges, and strategies.",
            startTime: hours(4), endTime: hours(5.5),
            createdBy: peter?.id || userPool[0].id,
            attendees: [gustav, erik, freddie, micke].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [gustav, freddie].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "monthly", meetingStatus: "scheduled",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-dt-roundtable",
        },

        // ═══ UPCOMING (next few days) ═══
        {
            title: "DevOps Best Practices Workshop",
            description: "Hands-on workshop covering CI/CD pipelines, infrastructure as code, and monitoring. Open to all skill levels.",
            startTime: days(1, 10), endTime: days(1, 12),
            createdBy: micke?.id || userPool[0].id,
            attendees: [freddie, peter, gustav].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [freddie, peter].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "none", meetingStatus: "scheduled",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-devops-ws",
            agenda: "1. CI/CD Pipeline Design\n2. IaC with Terraform\n3. Monitoring & Alerting\n4. Hands-on Lab",
        },
        {
            title: "Cybersecurity Governance Forum",
            description: "Discussion on cybersecurity frameworks, compliance, and threat landscape for enterprises.",
            startTime: days(1, 14), endTime: days(1, 15.5),
            createdBy: freddie?.id || userPool[0].id,
            attendees: [peter, micke, erik].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [peter, micke, erik].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "biweekly", meetingStatus: "scheduled",
        },
        {
            title: "Q1 Project Review — Autoliv",
            description: "Internal quarterly review of active projects and milestones for Autoliv team.",
            startTime: days(2, 9), endTime: days(2, 11),
            createdBy: gustav?.id || userPool[0].id,
            attendees: [anna, erik].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [anna].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "private", recurring: "none", meetingStatus: "scheduled",
            meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo-q1-review",
            agenda: "1. Project status updates\n2. Budget review\n3. Timeline adjustments\n4. Resource planning",
        },
        {
            title: "EV Battery Technology Talk",
            description: "Open discussion on the latest EV battery advances, solid-state tech, and sustainability.",
            startTime: days(2, 15), endTime: days(2, 16.5),
            createdBy: erik?.id || userPool[0].id,
            attendees: [gustav, sofia, anna].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [gustav, sofia].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "none", meetingStatus: "scheduled",
        },

        // ═══ DEADLINES & MILESTONES ═══
        {
            title: "🎯 Cloud Migration Phase 1 Deadline",
            description: "Initial cloud infrastructure setup and first batch of workloads must be migrated by this date.",
            startTime: days(3, 17), endTime: days(3, 17),
            createdBy: micke?.id || userPool[0].id,
            attendees: [peter, erik, freddie].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [peter, erik, freddie].filter(Boolean).map(u => u!.id),
            type: "deadline", audience: "team", recurring: "none", meetingStatus: "scheduled",
        },
        {
            title: "🏆 Platform v2.0 Launch Milestone",
            description: "Celebrating the launch of IntelBoard v2.0 with new community features and improved performance.",
            startTime: days(5, 10), endTime: days(5, 12),
            createdBy: admin?.id || userPool[0].id,
            attendees: userPool.map(u => u.id),
            acceptedAttendees: userPool.slice(0, 5).map(u => u.id),
            type: "milestone", audience: "open", recurring: "none", meetingStatus: "scheduled",
        },
        {
            title: "Vendor Management Workshop",
            description: "Optimizing vendor relationships, negotiation strategies, and SLA management.",
            startTime: days(4, 13), endTime: days(4, 15),
            createdBy: erik?.id || userPool[0].id,
            attendees: [gustav, peter, sofia].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [gustav, peter].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "none", meetingStatus: "scheduled",
        },
        {
            title: "IT Architecture Review Board",
            description: "Monthly architecture review — system designs, integration patterns, and tech debt remediation.",
            startTime: days(6, 10), endTime: days(6, 12),
            createdBy: peter?.id || userPool[0].id,
            attendees: [micke, freddie, erik, gustav].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [micke, freddie, erik].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "open", recurring: "monthly", meetingStatus: "scheduled",
            agenda: "1. New system proposals\n2. Integration pattern review\n3. Tech debt backlog\n4. Standards alignment",
        },

        // ═══ PAST (completed, with AI summaries) ═══
        {
            title: "Cloud Cost Optimization Review",
            description: "Review of cloud spending, cost-saving opportunities, and reserved instance recommendations.",
            startTime: days(-2, 14), endTime: days(-2, 15.5),
            createdBy: micke?.id || userPool[0].id,
            attendees: [erik, peter, gustav].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [erik, peter, gustav].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "team", recurring: "none", meetingStatus: "completed",
            aiSummary: "The team reviewed current cloud spending across AWS and Azure. Key findings: 23% reduction possible through reserved instances, 15% from right-sizing underutilized VMs. Action items assigned for implementation by end of quarter.",
            aiActionItems: [
                { text: "Purchase reserved instances for production workloads", assignee: "Micke Lidas", done: false },
                { text: "Right-size dev/staging environments", assignee: "Peter Casadei", done: true },
                { text: "Set up cost alerting dashboards", assignee: "Erik Lindgren", done: false },
            ],
            meetingNotes: "Discussed FinOps approach. Agreed to implement tagging standards across all accounts.",
        },
        {
            title: "Kickoff: New Safety System Integration",
            description: "Project kickoff for integrating the new advanced safety system with existing vehicle platforms.",
            startTime: days(-5, 10), endTime: days(-5, 12),
            createdBy: gustav?.id || userPool[0].id,
            attendees: [erik, anna, sofia].filter(Boolean).map(u => u!.id),
            acceptedAttendees: [erik, anna, sofia].filter(Boolean).map(u => u!.id),
            type: "meeting", audience: "private", recurring: "none", meetingStatus: "completed",
            aiSummary: "Successful kickoff. Defined project scope, timeline (16 weeks), and team responsibilities. Key risk: sensor compatibility with legacy platforms.",
            aiActionItems: [
                { text: "Draft detailed project plan", assignee: "Gustav Westergren", done: true },
                { text: "Assess sensor compatibility matrix", assignee: "Anna Andersson", done: true },
                { text: "Set up development environment", assignee: "Erik Lindgren", done: false },
            ],
        },
        {
            title: "Community Networking Mixer",
            description: "Casual networking event for all platform members. Share ideas and discover collaboration opportunities.",
            startTime: days(-1, 16), endTime: days(-1, 18),
            createdBy: admin?.id || userPool[0].id,
            attendees: userPool.map(u => u.id),
            acceptedAttendees: userPool.slice(0, 6).map(u => u.id),
            type: "milestone", audience: "open", recurring: "none", meetingStatus: "completed",
            aiSummary: "Great turnout! Several new collaborations identified between automotive and tech teams. Follow-ups being scheduled.",
        },
    ];

    // ─── Insert ──────────────────────────────────────────────────
    for (const def of eventDefs) {
        await db.insert(events).values({
            title: def.title,
            description: def.description,
            startTime: def.startTime,
            endTime: def.endTime,
            createdBy: def.createdBy,
            attendees: def.attendees,
            acceptedAttendees: def.acceptedAttendees,
            type: def.type,
            audience: def.audience,
            recurring: def.recurring,
            meetingStatus: def.meetingStatus,
            meetingUrl: (def as any).meetingUrl || null,
            agenda: (def as any).agenda || null,
            meetingNotes: (def as any).meetingNotes || null,
            aiSummary: (def as any).aiSummary || null,
            aiActionItems: (def as any).aiActionItems || [],
        }).returning();
        console.log(`  ✓ ${def.type.padEnd(10)} | ${def.audience.padEnd(7)} | ${def.meetingStatus.padEnd(12)} | ${def.title}`);
    }

    console.log(`\n🎉 Seeded ${eventDefs.length} events successfully!`);
    console.log(`  Live: ${eventDefs.filter(e => e.meetingStatus === "in_progress").length}`);
    console.log(`  Upcoming: ${eventDefs.filter(e => e.meetingStatus === "scheduled").length}`);
    console.log(`  Completed: ${eventDefs.filter(e => e.meetingStatus === "completed").length}`);
    console.log(`  Open: ${eventDefs.filter(e => e.audience === "open").length} | Private: ${eventDefs.filter(e => e.audience === "private").length} | Team: ${eventDefs.filter(e => e.audience === "team").length}`);

    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
