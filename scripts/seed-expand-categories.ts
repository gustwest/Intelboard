import { db } from "../lib/db";
import { intelHubCategories } from "../lib/schema";
import { eq } from "drizzle-orm";

/**
 * Expand the IT category taxonomy to ~60 comprehensive categories.
 * Safe to run multiple times — only inserts categories that don't exist yet.
 */

interface CategoryDef {
    title: string;
    slug: string;
    description: string;
    icon: string;
    color: string;
    parentSlug?: string;
}

const EXPANDED_CATEGORIES: CategoryDef[] = [
    // ─── L1: New top-level categories under IT & Technology ───

    { title: "Blockchain & Web3", slug: "blockchain-web3", description: "Distributed ledger technology, smart contracts, and decentralized applications", icon: "⛓️", color: "amber", parentSlug: "it-technology" },
    { title: "UX & Product Design", slug: "ux-product-design", description: "User experience, product design, research methods, and design systems", icon: "🎨", color: "pink", parentSlug: "it-technology" },

    // ─── L2: Cloud Architecture subs ───

    { title: "Multi-Cloud", slug: "multi-cloud", description: "Multi-cloud strategies, portability, and vendor-neutral architectures", icon: "🔀", color: "sky", parentSlug: "cloud-architecture" },
    { title: "Serverless", slug: "serverless", description: "FaaS, event-driven architecture, and serverless frameworks", icon: "⚡", color: "yellow", parentSlug: "cloud-architecture" },
    { title: "Cloud Security", slug: "cloud-security", description: "Cloud security posture management, encryption, and compliance", icon: "🔐", color: "red", parentSlug: "cloud-architecture" },

    // ─── L2: Data Engineering subs ───

    { title: "Stream Processing", slug: "stream-processing", description: "Real-time data processing — Kafka, Flink, Spark Streaming", icon: "🌊", color: "blue", parentSlug: "data-engineering" },
    { title: "Data Quality", slug: "data-quality", description: "Data validation, profiling, observability, and governance", icon: "✅", color: "green", parentSlug: "data-engineering" },
    { title: "Data Modeling", slug: "data-modeling", description: "Dimensional modeling, star schemas, and data vault", icon: "📐", color: "violet", parentSlug: "data-engineering" },

    // ─── L2: Cybersecurity subs ───

    { title: "Application Security", slug: "application-security", description: "OWASP, SAST/DAST, secure coding practices, and security testing", icon: "🔒", color: "orange", parentSlug: "cybersecurity" },
    { title: "Compliance & Privacy", slug: "compliance-privacy", description: "GDPR, SOC 2, ISO 27001, HIPAA, and data privacy frameworks", icon: "📜", color: "amber", parentSlug: "cybersecurity" },
    { title: "Network Security", slug: "network-security", description: "Firewalls, IDS/IPS, VPNs, and network segmentation", icon: "🛡️", color: "blue", parentSlug: "cybersecurity" },

    // ─── L2: DevOps subs ───

    { title: "Containers & Kubernetes", slug: "containers-kubernetes", description: "Docker, Kubernetes, Helm, and container orchestration", icon: "📦", color: "blue", parentSlug: "devops-cicd" },
    { title: "Infrastructure as Code", slug: "infrastructure-as-code", description: "Terraform, Pulumi, CloudFormation, and Ansible", icon: "📝", color: "green", parentSlug: "devops-cicd" },
    { title: "Observability", slug: "observability", description: "Monitoring, logging, tracing — Prometheus, Grafana, Datadog, OpenTelemetry", icon: "👁️", color: "purple", parentSlug: "devops-cicd" },
    { title: "Platform Engineering", slug: "platform-engineering", description: "Internal developer platforms, Backstage, self-service infrastructure", icon: "🏗️", color: "indigo", parentSlug: "devops-cicd" },

    // ─── L2: Software Development subs ───

    { title: "APIs & Microservices", slug: "apis-microservices", description: "REST, GraphQL, gRPC, API design, and microservice patterns", icon: "🔌", color: "teal", parentSlug: "software-development" },
    { title: "Testing & QA", slug: "testing-qa", description: "Unit testing, integration testing, E2E, TDD, and test automation", icon: "🧪", color: "emerald", parentSlug: "software-development" },
    { title: "Programming Languages", slug: "programming-languages", description: "Python, TypeScript, Go, Rust, Java, and language comparisons", icon: "💡", color: "amber", parentSlug: "software-development" },

    // ─── L2: AI & Machine Learning subs ───

    { title: "Generative AI", slug: "generative-ai", description: "Text, image, and code generation — GPT, Stable Diffusion, Midjourney", icon: "✨", color: "fuchsia", parentSlug: "ai-machine-learning" },
    { title: "MLOps", slug: "mlops", description: "ML model deployment, monitoring, retraining, and lifecycle management", icon: "🔄", color: "orange", parentSlug: "ai-machine-learning" },
    { title: "Reinforcement Learning", slug: "reinforcement-learning", description: "RL algorithms, reward functions, and game-playing agents", icon: "🎮", color: "emerald", parentSlug: "ai-machine-learning" },

    // ─── L2: Business Intelligence subs ───

    { title: "Data Visualization", slug: "data-visualization", description: "Tableau, Power BI, D3.js, and storytelling with data", icon: "📈", color: "blue", parentSlug: "business-intelligence" },
    { title: "Self-Service Analytics", slug: "self-service-analytics", description: "Empowering business users with no-code/low-code analytics tools", icon: "🧩", color: "green", parentSlug: "business-intelligence" },
    { title: "KPI & Metrics", slug: "kpi-metrics", description: "OKRs, business metrics, dashboarding best practices", icon: "🎯", color: "red", parentSlug: "business-intelligence" },

    // ─── L2: IT Governance subs ───

    { title: "ITSM & Service Management", slug: "itsm-service-management", description: "ITIL, ServiceNow, incident management, and service desk operations", icon: "🎫", color: "blue", parentSlug: "it-governance" },
    { title: "Risk Management", slug: "risk-management", description: "IT risk assessment, business continuity, and disaster preparedness", icon: "⚠️", color: "orange", parentSlug: "it-governance" },
    { title: "Enterprise Architecture", slug: "enterprise-architecture", description: "TOGAF, Zachman, architecture decision records, and technology radar", icon: "🏛️", color: "violet", parentSlug: "it-governance" },

    // ─── L2: Networking subs ───

    { title: "SDN & Network Automation", slug: "sdn-network-automation", description: "Software-defined networking, network programmability, and NetOps", icon: "🔀", color: "teal", parentSlug: "networking" },
    { title: "Wireless & 5G", slug: "wireless-5g", description: "Wi-Fi 7, 5G/6G, IoT connectivity, and mesh networks", icon: "📡", color: "cyan", parentSlug: "networking" },
    { title: "Edge Computing", slug: "edge-computing", description: "Edge infrastructure, CDNs, fog computing, and low-latency architectures", icon: "⚡", color: "amber", parentSlug: "networking" },

    // ─── L2: Infrastructure subs ───

    { title: "Servers & Storage", slug: "servers-storage", description: "Physical servers, SAN/NAS, storage tiering, and hardware lifecycle", icon: "💾", color: "slate", parentSlug: "infrastructure" },
    { title: "Virtualization", slug: "virtualization", description: "VMware, Hyper-V, KVM, and desktop virtualization (VDI)", icon: "🖥️", color: "indigo", parentSlug: "infrastructure" },
    { title: "Disaster Recovery", slug: "disaster-recovery", description: "Backup strategies, RTO/RPO, failover, and DR testing", icon: "🔄", color: "red", parentSlug: "infrastructure" },

    // ─── L2: Blockchain & Web3 subs ───

    { title: "Smart Contracts", slug: "smart-contracts", description: "Solidity, Vyper, contract auditing, and formal verification", icon: "📜", color: "purple", parentSlug: "blockchain-web3" },
    { title: "DeFi", slug: "defi", description: "Decentralized finance, lending, DEXs, and yield protocols", icon: "💰", color: "green", parentSlug: "blockchain-web3" },
    { title: "NFTs & Digital Assets", slug: "nfts-digital-assets", description: "Token standards, marketplaces, and digital ownership", icon: "🎨", color: "pink", parentSlug: "blockchain-web3" },

    // ─── L2: UX & Product Design subs ───

    { title: "Design Systems", slug: "design-systems", description: "Component libraries, design tokens, and scalable UI architecture", icon: "🧱", color: "blue", parentSlug: "ux-product-design" },
    { title: "User Research", slug: "user-research", description: "Interviews, usability testing, A/B testing, and behavioral analytics", icon: "🔍", color: "emerald", parentSlug: "ux-product-design" },
    { title: "Accessibility", slug: "accessibility", description: "WCAG compliance, assistive technologies, and inclusive design", icon: "♿", color: "indigo", parentSlug: "ux-product-design" },
];

async function main() {
    console.log("🌱 Expanding IT category taxonomy...\n");

    // Build a slug→id map from existing categories
    const allExisting = await db.select().from(intelHubCategories);
    const slugToId: Record<string, string> = {};
    const slugToDepth: Record<string, number> = {};

    for (const cat of allExisting) {
        slugToId[cat.slug] = cat.id;
        slugToDepth[cat.slug] = cat.depth;
    }
    console.log(`  Found ${allExisting.length} existing categories\n`);

    let created = 0;
    let skipped = 0;

    for (const cat of EXPANDED_CATEGORIES) {
        // Skip if slug already exists
        if (slugToId[cat.slug]) {
            console.log(`  ⏭️  Skipped (exists): ${cat.title}`);
            skipped++;
            continue;
        }

        // Resolve parent
        const parentId = cat.parentSlug ? slugToId[cat.parentSlug] : null;
        if (cat.parentSlug && !parentId) {
            console.log(`  ⚠️  Skipped (parent "${cat.parentSlug}" not found): ${cat.title}`);
            skipped++;
            continue;
        }

        const depth = parentId ? (slugToDepth[cat.parentSlug!] ?? 0) + 1 : 0;

        const [inserted] = await db.insert(intelHubCategories).values({
            title: cat.title,
            slug: cat.slug,
            description: cat.description,
            icon: cat.icon,
            color: cat.color,
            parentId,
            depth,
        }).returning();

        slugToId[cat.slug] = inserted.id;
        slugToDepth[cat.slug] = depth;
        created++;
        console.log(`  ✅ Created: ${cat.icon} ${cat.title} (depth ${depth})`);
    }

    console.log(`\n🎉 Done! Created ${created} new categories, skipped ${skipped} existing.`);
    console.log(`   Total categories: ${allExisting.length + created}`);
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
