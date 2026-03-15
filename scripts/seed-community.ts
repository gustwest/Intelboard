import { db } from "../lib/db";
import { intelboards, intelboardThreads, intelboardPosts, events, requests, intelHubCategories } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

// Use existing specialist IDs from seed-specialists.ts
const USERS = {
    alice:  "sp-1",   // Digital Transformation Consultant
    bob:    "sp-2",   // Cloud Architect
    carol:  "sp-3",   // Data Scientist
    david:  "sp-4",   // Agile Coach
    eve:    "sp-5",   // Cybersecurity Analyst
    frank:  "sp-6",   // DevOps Engineer
    grace:  "sp-7",   // UX/UI Designer
    hank:   "sp-8",   // Systems Analyst
    ivy:    "sp-9",   // AI/ML Engineer
    jack:   "sp-10",  // Business Analyst
    kara:   "sp-11",  // Blockchain Developer
    leo:    "sp-12",  // Project Manager
};

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);
    return d;
}

function daysFromNow(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);
    return d;
}

function hoursLater(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 3600_000);
}

async function getCategoryId(slug: string): Promise<string | undefined> {
    const cat = await db.query.intelHubCategories.findFirst({
        where: eq(intelHubCategories.slug, slug),
    });
    return cat?.id;
}

async function main() {
    console.log("🌱 Seeding community content...\n");

    // --- 1. Get category IDs ---
    const catCloud = await getCategoryId("cloud-architecture");
    const catAI = await getCategoryId("ai-machine-learning");
    const catCyber = await getCategoryId("cybersecurity");
    const catDevOps = await getCategoryId("devops-ci-cd");
    const catData = await getCategoryId("data-engineering");
    const catSoftware = await getCategoryId("software-development");
    const catInfra = await getCategoryId("infrastructure");
    const catGov = await getCategoryId("it-governance");

    console.log("  📁 Category IDs resolved\n");

    // --- 2. Create Forums (Intelboards) linked to categories ---
    const forumData = [
        { id: "board-cloud", title: "Cloud Architecture Forum", description: "Discuss cloud strategies, migrations, cost optimization, and multi-cloud architecture patterns.", category: "Cloud", categoryId: catCloud, createdBy: USERS.bob },
        { id: "board-ai", title: "AI & Machine Learning Forum", description: "Share ML research, discuss model architectures, data pipelines, and responsible AI practices.", category: "AI/ML", categoryId: catAI, createdBy: USERS.ivy },
        { id: "board-security", title: "Cybersecurity Forum", description: "Security best practices, threat intel, compliance frameworks, and incident response strategies.", category: "Security", categoryId: catCyber, createdBy: USERS.eve },
        { id: "board-devops", title: "DevOps & CI/CD Forum", description: "CI/CD pipelines, infrastructure as code, container orchestration, and platform engineering.", category: "DevOps", categoryId: catDevOps, createdBy: USERS.frank },
        { id: "board-data", title: "Data Engineering Forum", description: "Data pipelines, warehousing, lake architectures, and real-time streaming solutions.", category: "Data", categoryId: catData, createdBy: USERS.carol },
        { id: "board-general", title: "General IT Discussion", description: "Cross-cutting IT topics, career advice, industry trends, and community announcements.", category: "General", categoryId: catGov, createdBy: USERS.alice },
    ];

    for (const f of forumData) {
        const existing = await db.query.intelboards.findFirst({ where: eq(intelboards.id, f.id) });
        if (!existing) {
            await db.insert(intelboards).values({
                id: f.id,
                title: f.title,
                description: f.description,
                category: f.category,
                categoryId: f.categoryId,
                createdBy: f.createdBy,
                visibility: "open",
                status: "active",
            });
            console.log(`  📋 Created forum: ${f.title}`);
        } else {
            console.log(`  📋 Forum exists: ${f.title}`);
        }
    }

    // --- 3. Create Threads with Posts ---
    const threadData = [
        // Cloud Architecture Forum
        {
            id: "thread-cloud-1",
            boardId: "board-cloud",
            title: "AWS vs Azure for Enterprise Workloads in 2026",
            description: "Let's compare the latest offerings from AWS and Azure for large-scale enterprise deployments.",
            createdBy: USERS.bob,
            createdAt: daysAgo(5),
            posts: [
                { author: USERS.bob,   content: "We're seeing a strong shift towards Azure for enterprise customers in Sweden, primarily due to EU data residency compliance. Azure's Sweden Central region has been a game-changer. But AWS still leads in breadth of services. What are your experiences?", offset: 0 },
                { author: USERS.frank, content: "Agreed on Azure for compliance-heavy workloads. However, we use AWS for anything that requires cutting-edge ML infrastructure — SageMaker and Bedrock are unmatched. Our approach is multi-cloud with Terraform.", offset: 2 },
                { author: USERS.alice, content: "From a cost perspective, Azure's reserved instances with hybrid benefit make it 30-40% cheaper for organizations already invested in Microsoft licensing. We've seen this play out across multiple clients.", offset: 5 },
                { author: USERS.hank,  content: "The integration story matters too. For SAP-heavy enterprises, Azure has native HANA support that's been battle-tested. We migrated 3 SAP landscapes to Azure last year with zero issues.", offset: 8 },
            ]
        },
        {
            id: "thread-cloud-2",
            boardId: "board-cloud",
            title: "Best Practices for Kubernetes Cost Optimization",
            description: "Share your strategies for reducing K8s infrastructure spend without sacrificing reliability.",
            createdBy: USERS.frank,
            createdAt: daysAgo(3),
            posts: [
                { author: USERS.frank, content: "We've been running Karpenter on EKS and it's reduced our compute costs by 45%. The key was setting proper resource requests and using spot instances for non-critical workloads. Here's our setup:\n\n1. Karpenter for node provisioning\n2. VPA for right-sizing pods\n3. Goldilocks for recommendations\n4. Kubecost for visibility\n\nWhat tools are you using?", offset: 0 },
                { author: USERS.bob,   content: "Great list! I'd add the importance of namespace-level resource quotas. We had teams over-provisioning by 3x before we implemented hard limits. Also, consider using Fargate for batch jobs — no idle compute waste.", offset: 4 },
                { author: USERS.ivy,   content: "For ML workloads on K8s, we schedule GPU nodes only during training windows. Saves about 60% on GPU costs. We use KEDA for auto-scaling based on queue length rather than CPU.", offset: 7 },
            ]
        },
        // AI & Machine Learning Forum
        {
            id: "thread-ai-1",
            boardId: "board-ai",
            title: "RAG Architecture Patterns for Enterprise Knowledge Bases",
            description: "Discussing production RAG implementations — chunking strategies, embedding models, and retrieval optimization.",
            createdBy: USERS.ivy,
            createdAt: daysAgo(4),
            posts: [
                { author: USERS.ivy,   content: "We've been iterating on our RAG pipeline for internal documentation. Key learnings:\n\n1. **Chunking**: Semantic chunking with overlap works better than fixed-size. We use ~512 tokens with 20% overlap.\n2. **Embeddings**: text-embedding-3-large from OpenAI is our current best for Swedish+English mixed content.\n3. **Retrieval**: Hybrid search (vector + BM25) with reciprocal rank fusion consistently beats pure vector search.\n4. **Reranking**: Cohere Rerank v3 as a second-stage filter improved precision by 25%.\n\nWhat patterns are you seeing in production?", offset: 0 },
                { author: USERS.carol, content: "Great breakdown! We found that metadata filtering is crucial for enterprise use cases. We tag every chunk with document type, date, department, and security classification. This lets us build role-based RAG without complex permissioning in the vector DB.\n\nAlso: don't underestimate the importance of a good evaluation framework. We use RAGAS for automated eval and do weekly human evaluations with domain experts.", offset: 3 },
                { author: USERS.jack,  content: "From a business analyst perspective — the ROI on RAG is huge when you get it right. Our customer service team reduced ticket resolution time by 35% with a RAG-powered assistant. The key was training on historical ticket resolutions, not just documentation.", offset: 6 },
                { author: USERS.alice, content: "Has anyone tackled the challenge of keeping the knowledge base fresh? We're exploring automated pipelines that detect document changes and re-index affected chunks. The staleness problem is real in enterprise deployments.", offset: 10 },
            ]
        },
        {
            id: "thread-ai-2",
            boardId: "board-ai",
            title: "Local LLMs vs Cloud APIs — When to Use Each?",
            description: "Comparing on-premise LLM deployment with cloud-hosted APIs for different enterprise use cases.",
            createdBy: USERS.carol,
            createdAt: daysAgo(2),
            posts: [
                { author: USERS.carol, content: "We're evaluating whether to deploy Llama 3.1 70B locally vs. using GPT-4 / Claude via API. The tradeoffs are interesting:\n\n**Local**: Data sovereignty, predictable costs at scale, customization via fine-tuning\n**Cloud**: Better quality (for now), no infrastructure overhead, faster time to production\n\nFor our healthcare NLP work, we're leaning local due to patient data regulations. Curious about others' decision frameworks.", offset: 0 },
                { author: USERS.ivy,   content: "We run a hybrid approach at Zenseact. Sensitive perception pipeline data stays local with fine-tuned Llama models. But for internal tools (code review, documentation gen), we use Claude API. The quality difference is still significant for complex reasoning tasks.", offset: 3 },
                { author: USERS.frank, content: "Infrastructure perspective: running 70B models locally requires significant GPU investment. We're talking 4x A100 80GB for decent throughput. With vLLM and PagedAttention you can get reasonable latency, but it's not trivial to operate 24/7.", offset: 5 },
                { author: USERS.eve,   content: "Security consideration: even with cloud APIs, you can now get private endpoints and data processing agreements. The regulatory gap between local and cloud is narrowing. But for classified/defense work, local is still the only option.", offset: 8 },
            ]
        },
        // Cybersecurity Forum
        {
            id: "thread-sec-1",
            boardId: "board-security",
            title: "Zero Trust Architecture — Implementation Roadmap",
            description: "Share your zero trust implementation experiences and lessons learned.",
            createdBy: USERS.eve,
            createdAt: daysAgo(6),
            posts: [
                { author: USERS.eve,   content: "We implemented zero trust at Vattenfall over 18 months. Here's our phased roadmap that might help others:\n\n**Phase 1 (Months 1-3)**: Identity foundation — Azure AD, MFA everywhere, conditional access policies\n**Phase 2 (Months 4-8)**: Network segmentation — microsegmentation with Zscaler, removed VPN dependency\n**Phase 3 (Months 9-14)**: Device compliance — Intune for endpoints, certificate-based auth\n**Phase 4 (Months 15-18)**: Data classification and DLP — Microsoft Purview for sensitive data tracking\n\nThe hardest part? Change management. Engineers hated losing their VPN. Leadership buy-in was critical.", offset: 0 },
                { author: USERS.hank,  content: "Excellent roadmap. We're in Phase 2 at ABB. One thing I'd add: legacy OT systems are the biggest blocker. You can't just put Zscaler in front of a 15-year-old PLC. We ended up creating isolated trust zones for legacy systems with heavy monitoring.", offset: 5 },
                { author: USERS.frank, content: "The developer experience impact is real. We moved to BeyondCorp-style access at Klarna and initially saw a 20% increase in developer onboarding time. Solved it by automating certificate provisioning and building a CLI tool for service access.", offset: 8 },
            ]
        },
        // DevOps Forum
        {
            id: "thread-devops-1",
            boardId: "board-devops",
            title: "Platform Engineering — Building Your Internal Developer Platform",
            description: "How are you building IDPs? Share your tech stack, team structure, and adoption strategies.",
            createdBy: USERS.frank,
            createdAt: daysAgo(1),
            posts: [
                { author: USERS.frank, content: "We've built our IDP at Klarna using:\n\n- **Backstage** for the developer portal (service catalog, scaffolding, docs)\n- **ArgoCD + Argo Workflows** for GitOps deployments\n- **Crossplane** for self-service cloud resources\n- **Signadot** for preview environments\n\nAdoption was 75% after 6 months. Key: we made the platform the path of least resistance, not a mandate.\n\nWhat does your IDP stack look like?", offset: 0 },
                { author: USERS.bob,  content: "Similar stack but we use Terraform Cloud instead of Crossplane. The reasoning: our teams already know Terraform, and the learning curve for Crossplane was steep. Also added Port.io as an alternative to Backstage — it's faster to get started with.", offset: 3 },
                { author: USERS.david, content: "From the coaching perspective, the biggest mistake I see is building the platform in isolation. You need embedded platform engineers in product teams during the first 3 months. We call them 'platform champions' — they gather real feedback and build trust.", offset: 6 },
            ]
        },
        // Data Engineering Forum
        {
            id: "thread-data-1",
            boardId: "board-data",
            title: "Medallion Architecture — Is It Still Relevant?",
            description: "The Bronze/Silver/Gold pattern has been the default for data lakehouses. Is it still the best approach?",
            createdBy: USERS.carol,
            createdAt: daysAgo(7),
            posts: [
                { author: USERS.carol, content: "Databricks popularized the Medallion architecture (Bronze → Silver → Gold) but I'm seeing more teams move towards a simplified 2-layer approach:\n\n1. **Raw** (landing zone, immutable)\n2. **Curated** (cleaned, business-ready)\n\nThe Silver layer often becomes a dumping ground with unclear ownership. Thoughts?", offset: 0 },
                { author: USERS.jack,  content: "As a consumer of data products, I agree the Silver layer confusion is real. We often find 3 versions of 'cleaned customer data' with no clear lineage. The 2-layer approach with strong data contracts is cleaner for business teams.", offset: 4 },
                { author: USERS.hank,  content: "Counterpoint: in manufacturing, the Bronze→Silver→Gold path makes sense because the raw data (sensor telemetry) is genuinely messy. Silver is where we handle device calibration, unit standardization, and filtering. Removing it would push complexity downstream.", offset: 7 },
                { author: USERS.ivy,   content: "For ML use cases, we actually need a 4th layer — a 'Feature Store' layer. Features are neither raw nor business-curated, they're ML-specific transformations. We use Feast on top of our Gold layer.", offset: 10 },
            ]
        },
        // General IT Discussion
        {
            id: "thread-gen-1",
            boardId: "board-general",
            title: "How Do You Stay Updated With the Pace of Change in Tech?",
            description: "Share your learning routines, favorite resources, and strategies for continuous professional development.",
            createdBy: USERS.alice,
            createdAt: daysAgo(8),
            posts: [
                { author: USERS.alice, content: "The pace of change is relentless. My routine:\n\n📰 **Daily**: Hacker News top 5, The Pragmatic Engineer newsletter\n📚 **Weekly**: One deep-dive paper or blog post in my specialty area\n🎧 **Commute**: Podcast rotation (Software Engineering Daily, a]6coresignal, Lenny's)\n💻 **Monthly**: Build a small project with a new tool/framework\n🤝 **Quarterly**: Attend or speak at a conference\n\nWhat works for you?", offset: 0 },
                { author: USERS.grace, content: "For design, I follow a different cadence:\n\n- **Daily**: Dribbble, Layers.to for visual inspiration\n- **Weekly**: Nielsen Norman Group articles on UX research\n- **Monthly**: Redesign a real product as a creative exercise\n- **Quarterly**: Run a workshop or teach something new\n\nThe teaching part is key — it forces deep understanding.", offset: 4 },
                { author: USERS.david, content: "I find that community participation is the most effective way to learn. Being active on forums like this one, attending meetups, and mentoring junior colleagues keeps me sharp. Reading is passive — building and discussing is active learning.", offset: 7 },
                { author: USERS.kara,  content: "In blockchain, things move even faster. I subscribe to specific GitHub repos for major protocols and read their changelogs weekly. Also, participating in hackathons — even virtually — forces you to learn new tools fast.", offset: 10 },
                { author: USERS.leo,   content: "For project managers, the challenge is different. I focus on cross-domain knowledge:\n\n- **Tech literacy**: Understand enough to ask the right questions\n- **Industry trends**: McKinsey Insights, Gartner Magic Quadrants\n- **Soft skills**: One book per month on leadership, negotiation, or communication\n\nBreadth > depth for PMs.", offset: 12 },
            ]
        },
    ];

    for (const t of threadData) {
        const existing = await db.query.intelboardThreads.findFirst({ where: eq(intelboardThreads.id, t.id) });
        if (!existing) {
            await db.insert(intelboardThreads).values({
                id: t.id,
                intelboardId: t.boardId,
                title: t.title,
                description: t.description,
                createdBy: t.createdBy,
                createdAt: t.createdAt,
                lastActivityAt: hoursLater(t.createdAt, t.posts[t.posts.length - 1].offset),
                status: "open",
                isPinned: false,
            });

            for (let i = 0; i < t.posts.length; i++) {
                const p = t.posts[i];
                await db.insert(intelboardPosts).values({
                    id: `${t.id}-post-${i + 1}`,
                    threadId: t.id,
                    authorId: p.author,
                    content: p.content,
                    createdAt: hoursLater(t.createdAt, p.offset),
                    updatedAt: hoursLater(t.createdAt, p.offset),
                });
            }
            console.log(`  💬 Created thread: ${t.title} (${t.posts.length} posts)`);
        } else {
            console.log(`  💬 Thread exists: ${t.title}`);
        }
    }

    // --- 4. Create Events ---
    const eventData = [
        {
            id: "evt-1",
            title: "Cloud Architecture Community Meetup",
            description: "Monthly community meetup to discuss cloud architecture patterns, share war stories, and network. This month: Multi-cloud strategies for Nordic enterprises.\n\nAgenda:\n- 14:00 Welcome & intros\n- 14:15 Talk: 'Multi-cloud at Scale' by Bob Smith\n- 15:00 Panel discussion\n- 15:30 Networking & fika",
            startTime: daysFromNow(5),
            endTime: hoursLater(daysFromNow(5), 2),
            createdBy: USERS.bob,
            attendees: [USERS.bob, USERS.frank, USERS.alice, USERS.hank],
            location: "Virtual — Google Meet",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-2",
            title: "AI Ethics & Responsible ML Workshop",
            description: "Hands-on workshop exploring bias detection, fairness metrics, and responsible AI deployment in enterprise settings. Bring your laptop — we'll work through real examples using AIF360 and Fairlearn.",
            startTime: daysFromNow(8),
            endTime: hoursLater(daysFromNow(8), 3),
            createdBy: USERS.carol,
            attendees: [USERS.carol, USERS.ivy, USERS.alice, USERS.jack],
            location: "Virtual — Teams",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-3",
            title: "Cybersecurity Threat Briefing Q1 2026",
            description: "Quarterly threat landscape update covering emerging attack vectors, recent vulnerabilities, and defensive strategies relevant to Nordic enterprises. NDA required for detailed IOC sharing.",
            startTime: daysFromNow(12),
            endTime: hoursLater(daysFromNow(12), 1.5),
            createdBy: USERS.eve,
            attendees: [USERS.eve, USERS.frank, USERS.hank],
            location: "Virtual — Secure Meeting Room",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-4",
            title: "Platform Engineering Deep Dive",
            description: "Join Frank as he walks through Klarna's internal developer platform architecture. Live demo of Backstage, ArgoCD workflows, and self-service infrastructure provisioning.\n\nPerfect for DevOps engineers, platform teams, and engineering managers considering building their own IDP.",
            startTime: daysFromNow(3),
            endTime: hoursLater(daysFromNow(3), 2),
            createdBy: USERS.frank,
            attendees: [USERS.frank, USERS.bob, USERS.david, USERS.alice, USERS.leo],
            location: "Virtual — Google Meet",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-5",
            title: "Data Engineering Office Hours",
            description: "Open office hours for data engineering questions. Bring your pipeline challenges, architecture decisions, or tooling dilemmas. No agenda — just collaborative problem solving.",
            startTime: daysFromNow(1),
            endTime: hoursLater(daysFromNow(1), 1),
            createdBy: USERS.carol,
            attendees: [USERS.carol, USERS.jack, USERS.ivy],
            location: "Virtual — Discord",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-6",
            title: "Agile Leadership Roundtable",
            description: "A facilitated discussion for engineering leaders on scaling agile practices. Topics:\n- Balancing autonomy and alignment\n- Measuring team health beyond velocity\n- Navigating org restructures while maintaining culture",
            startTime: daysFromNow(15),
            endTime: hoursLater(daysFromNow(15), 1.5),
            createdBy: USERS.david,
            attendees: [USERS.david, USERS.leo, USERS.alice],
            location: "Virtual — Zoom",
            type: "meeting" as const,
            audience: "open" as const,
        },
        {
            id: "evt-7",
            title: "UX Review Workshop — Open Source Projects",
            description: "Grace will review UX of community-submitted open source projects. Submit your project beforehand! Focus on accessibility, information architecture, and mobile experience.\n\nSubmit projects in the Design & UX forum thread.",
            startTime: daysFromNow(10),
            endTime: hoursLater(daysFromNow(10), 2),
            createdBy: USERS.grace,
            attendees: [USERS.grace, USERS.alice, USERS.kara],
            location: "Virtual — Figma + Google Meet",
            type: "meeting" as const,
            audience: "open" as const,
        },
    ];

    for (const e of eventData) {
        const existing = await db.query.events.findFirst({ where: eq(events.id, e.id) });
        if (!existing) {
            await db.insert(events).values({
                id: e.id,
                title: e.title,
                description: e.description,
                startTime: e.startTime,
                endTime: e.endTime,
                createdBy: e.createdBy,
                attendees: e.attendees,
                location: e.location,
                type: e.type,
                audience: e.audience,
                recurring: "none",
            });
            console.log(`  📅 Created event: ${e.title}`);
        } else {
            console.log(`  📅 Event exists: ${e.title}`);
        }
    }

    // --- 5. Create Requests (Micro-gigs) ---
    const requestData = [
        {
            id: "req-seed-1",
            title: "Cloud Cost Optimization Audit",
            description: "Looking for an experienced cloud architect to review our AWS infrastructure and identify cost optimization opportunities. We're spending ~$85k/month and believe there's 30-40% savings potential. Need someone who can analyze our usage patterns, right-size instances, and recommend reserved/savings plan strategies.\n\nScope: 2-3 week engagement, async work with 2 sync check-ins per week.",
            status: "New Request",
            industry: "Tech",
            budget: "SEK 50,000 – 80,000",
            tags: ["AWS", "Cost Optimization", "Cloud Architecture", "FinOps"],
            createdAt: daysAgo(3),
            creatorId: USERS.alice,
            requestType: "insights",
            category: "Cloud",
        },
        {
            id: "req-seed-2",
            title: "ML Pipeline Code Review & Architecture Assessment",
            description: "We've built an ML pipeline for customer churn prediction but performance is degrading over time. Need a senior ML engineer to:\n\n1. Review our feature engineering pipeline (Python/PySpark)\n2. Assess model monitoring and drift detection setup\n3. Recommend improvements to our retraining strategy\n4. Evaluate if our current architecture (SageMaker) is still the right choice\n\nEstimated effort: 40 hours over 2 weeks.",
            status: "New Request",
            industry: "Finance",
            budget: "SEK 60,000 – 100,000",
            tags: ["Machine Learning", "MLOps", "Python", "SageMaker", "Code Review"],
            createdAt: daysAgo(2),
            creatorId: USERS.jack,
            requestType: "insights",
            category: "AI/ML",
        },
        {
            id: "req-seed-3",
            title: "Kubernetes Migration — Legacy Java App",
            description: "We need to containerize and migrate a monolithic Java application (Spring Boot, PostgreSQL) to Kubernetes. The app currently runs on bare metal and serves ~10k requests/minute.\n\nLooking for a DevOps/K8s specialist for a 4-6 week engagement to:\n- Create Dockerfiles and Helm charts\n- Set up CI/CD with GitHub Actions\n- Configure auto-scaling and monitoring\n- Knowledge transfer to our team",
            status: "In Review",
            industry: "Manufacturing",
            budget: "SEK 120,000 – 180,000",
            tags: ["Kubernetes", "Docker", "Java", "Spring Boot", "DevOps"],
            createdAt: daysAgo(5),
            creatorId: USERS.hank,
            requestType: "short_term",
            category: "DevOps",
        },
        {
            id: "req-seed-4",
            title: "Security Audit — SaaS Platform",
            description: "Annual security assessment for our B2B SaaS platform. Scope includes:\n\n- Penetration testing (web app + API endpoints)\n- Source code review (Node.js/React)\n- Infrastructure security review (AWS)\n- Compliance gap analysis (SOC 2 Type II readiness)\n- Executive summary and remediation roadmap\n\nMust have CISSP or equivalent certification.",
            status: "New Request",
            industry: "Tech",
            budget: "SEK 80,000 – 120,000",
            tags: ["Penetration Testing", "Security Audit", "SOC 2", "Compliance"],
            createdAt: daysAgo(1),
            creatorId: USERS.leo,
            requestType: "insights",
            category: "Security",
        },
        {
            id: "req-seed-5",
            title: "Data Warehouse Modernization — Strategy Consulting",
            description: "Our legacy Oracle data warehouse is becoming a bottleneck. Looking for a data engineering consultant to help us:\n\n1. Evaluate modern alternatives (Snowflake, Databricks, BigQuery)\n2. Design a migration strategy that minimizes disruption\n3. Create a proof of concept with our top 3 use cases\n4. Build a business case for leadership (TCO comparison)\n\n3-4 week engagement, hybrid work in Stockholm preferred.",
            status: "Approved",
            industry: "Finance",
            budget: "SEK 100,000 – 150,000",
            tags: ["Data Warehouse", "Snowflake", "Databricks", "Migration", "Strategy"],
            createdAt: daysAgo(8),
            creatorId: USERS.jack,
            requestType: "insights",
            category: "Data",
        },
        {
            id: "req-seed-6",
            title: "Design System Sprint — Component Library",
            description: "We need a senior product designer to help establish a design system for our internal tools. The sprint should deliver:\n\n- Figma component library (buttons, forms, tables, navigation)\n- Design tokens (color, typography, spacing)\n- Accessibility guidelines (WCAG 2.1 AA)\n- Documentation for handoff to engineering\n\n2-week focused sprint. Remote OK.",
            status: "Active",
            industry: "Tech",
            budget: "SEK 70,000 – 90,000",
            tags: ["Design System", "Figma", "UI/UX", "Accessibility", "Component Library"],
            createdAt: daysAgo(10),
            creatorId: USERS.alice,
            assignedSpecialistId: USERS.grace,
            requestType: "short_term",
            category: "Design",
        },
    ];

    for (const r of requestData) {
        const existing = await db.query.requests.findFirst({ where: eq(requests.id, r.id) });
        if (!existing) {
            await db.insert(requests).values({
                id: r.id,
                title: r.title,
                description: r.description,
                status: r.status,
                industry: r.industry,
                budget: r.budget,
                tags: r.tags,
                createdAt: r.createdAt,
                creatorId: r.creatorId,
                requestType: r.requestType,
                category: r.category,
                assignedSpecialistId: r.assignedSpecialistId,
            });
            console.log(`  🎯 Created request: ${r.title} (${r.status})`);
        } else {
            console.log(`  🎯 Request exists: ${r.title}`);
        }
    }

    console.log("\n🎉 Community content seeded successfully!");
    console.log(`   📋 ${forumData.length} forums`);
    console.log(`   💬 ${threadData.length} threads with ${threadData.reduce((sum, t) => sum + t.posts.length, 0)} posts`);
    console.log(`   📅 ${eventData.length} events`);
    console.log(`   🎯 ${requestData.length} requests (micro-gigs)`);
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
