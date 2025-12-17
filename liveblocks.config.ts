import { createClient } from "@liveblocks/client";

export const API_KEY = "pk_dev_t94HHDVA1uBZWUJ7u6glPN8-cFC0YLH-jO5QDAY9KovG3mwy5CHlgx9i1kLcCRpN";

export const client = createClient({
    publicApiKey: API_KEY,
});

declare global {
    interface Liveblocks {
        // Each user's presence, for example their cursor position
        Presence: {
            cursor: { x: number; y: number } | null;
            userInfo?: {
                name: string;
                color: string;
                picture?: string;
            };
        };

        // The storage for the room, for example the list of systems
        Storage: {
            systems: any[];
            integrations: any[];
            projects: any[];
            // We store the serialized versions or raw objects
        };

        // Custom user info set when authenticating with a secret key
        UserMeta: {
            id: string;
            info: {
                name?: string;
                color?: string;
                picture?: string;
                role?: string;
            };
        };

        // Custom events
        RoomEvent: {};

        // Custom metadata set on threads
        ThreadMetadata: {};
    }
}
