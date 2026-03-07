import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { level = "error", message, context } = body;

        if (!message || typeof message !== "string") {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        const validLevels = ["debug", "info", "warn", "error"] as const;
        const logLevel = validLevels.includes(level) ? level : "error";

        log[logLevel as keyof typeof log](`[CLIENT] ${message}`, {
            source: "client",
            ...context,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        log.error("[CLIENT] Failed to process client log", {}, error);
        return NextResponse.json({ error: "Failed to log" }, { status: 500 });
    }
}
