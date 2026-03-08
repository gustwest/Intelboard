"use server";

/**
 * Teams Graph API client with mock fallback.
 * When TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET / TEAMS_TENANT_ID env vars are
 * absent, all calls return realistic mock data so the UI works end-to-end
 * without a Microsoft 365 subscription.
 */

const TEAMS_CLIENT_ID = process.env.TEAMS_CLIENT_ID;
const TEAMS_CLIENT_SECRET = process.env.TEAMS_CLIENT_SECRET;
const TEAMS_TENANT_ID = process.env.TEAMS_TENANT_ID;

const USE_MOCK = !TEAMS_CLIENT_ID || !TEAMS_CLIENT_SECRET || !TEAMS_TENANT_ID;

// ─── Helpers ──────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
    if (USE_MOCK) return "mock-token";

    const res = await fetch(
        `https://login.microsoftonline.com/${TEAMS_TENANT_ID}/oauth2/v2.0/token`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: TEAMS_CLIENT_ID!,
                client_secret: TEAMS_CLIENT_SECRET!,
                scope: "https://graph.microsoft.com/.default",
                grant_type: "client_credentials",
            }),
        }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Token error: ${data.error_description || data.error}`);
    return data.access_token;
}

// ─── Public API ───────────────────────────────────────────

export interface TeamsMeeting {
    joinUrl: string;
    meetingId: string;
}

/**
 * Create an online Teams meeting.
 * In mock mode, returns a simulated join URL.
 */
export async function createTeamsMeeting(
    title: string,
    startTime: string,
    endTime: string,
    attendeeEmails: string[] = []
): Promise<TeamsMeeting> {
    if (USE_MOCK) {
        const id = crypto.randomUUID().slice(0, 8);
        return {
            joinUrl: `https://intelboard.app/meeting/${id}`,
            meetingId: `mock-meeting-${id}`,
        };
    }

    const token = await getAccessToken();

    const body = {
        subject: title,
        startDateTime: new Date(startTime).toISOString(),
        endDateTime: new Date(endTime).toISOString(),
        participants: {
            attendees: attendeeEmails.map((email) => ({
                identity: { user: null },
                upn: email,
                role: "attendee",
            })),
        },
    };

    const res = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Graph error: ${JSON.stringify(data.error)}`);

    return {
        joinUrl: data.joinWebUrl || data.joinUrl,
        meetingId: data.id,
    };
}

/**
 * Fetch the transcript for a completed meeting.
 * In mock mode, returns a placeholder transcript.
 */
export async function getMeetingTranscript(meetingId: string): Promise<string | null> {
    if (USE_MOCK) {
        return [
            "[Mock Transcript]",
            "",
            "00:00 — Host: Welcome everyone. Let's go over the agenda.",
            "00:45 — Participant A: Here's the update on the project timeline.",
            "02:15 — Participant B: I've completed the initial analysis.",
            "03:30 — Host: Great. Let's discuss next steps.",
            "05:00 — Participant A: We should schedule a follow-up for next week.",
            "06:20 — Host: Agreed. I'll create the action items. Meeting adjourned.",
        ].join("\n");
    }

    const token = await getAccessToken();

    // List transcripts for the meeting
    const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.value || data.value.length === 0) return null;

    // Get the latest transcript content
    const transcriptId = data.value[0].id;
    const contentRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "text/vtt",
            },
        }
    );

    if (!contentRes.ok) return null;
    return await contentRes.text();
}

/**
 * Check if a recording exists for a meeting.
 */
export async function getMeetingRecordingStatus(meetingId: string): Promise<boolean> {
    if (USE_MOCK) return true;

    const token = await getAccessToken();
    const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/recordings`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return false;
    const data = await res.json();
    return data.value && data.value.length > 0;
}

/**
 * Whether we're running in mock mode (no Teams credentials configured).
 */
export async function isTeamsMockMode(): Promise<boolean> {
    return USE_MOCK;
}
