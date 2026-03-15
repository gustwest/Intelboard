import { db } from "../lib/db";
import { intelHubCategories } from "../lib/schema";
import { eq } from "drizzle-orm";

/**
 * Mark curated categories as "Hot Topics" for promoted display.
 */

const HOT_TOPICS: { slug: string; hotRank: number; hotLabel: string }[] = [
    { slug: "generative-ai",           hotRank: 1,  hotLabel: "🔥 Hottest" },
    { slug: "mlops",                   hotRank: 2,  hotLabel: "⚡ Rising" },
    { slug: "cloud-security",          hotRank: 3,  hotLabel: "🛡️ Critical" },
    { slug: "platform-engineering",    hotRank: 4,  hotLabel: "🚀 Emerging" },
    { slug: "containers-kubernetes",   hotRank: 5,  hotLabel: "📦 Essential" },
    { slug: "cybersecurity",           hotRank: 6,  hotLabel: "🔒 Always Hot" },
    { slug: "data-engineering",        hotRank: 7,  hotLabel: "📊 In Demand" },
    { slug: "infrastructure-as-code",  hotRank: 8,  hotLabel: "⚙️ Core Skill" },
];

async function main() {
    console.log("🔥 Seeding hot topics...\n");

    for (const topic of HOT_TOPICS) {
        const [updated] = await db.update(intelHubCategories)
            .set({ isHot: true, hotRank: topic.hotRank, hotLabel: topic.hotLabel })
            .where(eq(intelHubCategories.slug, topic.slug))
            .returning();

        if (updated) {
            console.log(`  ✅ ${topic.hotLabel} → ${updated.title}`);
        } else {
            console.log(`  ⚠️  Not found: ${topic.slug}`);
        }
    }

    console.log("\n🎉 Done! Hot topics seeded.");
    process.exit(0);
}

main().catch(err => { console.error("❌ Failed:", err); process.exit(1); });
