import {
    useMyPresence,
    useOthers,
} from "@liveblocks/react/suspense";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Helper for random color if not set
const COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];

function Cursor({ x, y, name, color }: { x: number; y: number; name: string; color: string }) {
    return (
        <div
            className="pointer-events-none fixed left-0 top-0 z-[9999] transition-transform duration-100 ease-linear"
            style={{
                transform: `translateX(${x}px) translateY(${y}px)`,
            }}
        >
            <svg
                className="relative"
                width="24"
                height="36"
                viewBox="0 0 24 36"
                fill="none"
                stroke="white"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                    fill={color}
                    stroke={color}
                />
            </svg>
            <div
                className="relative left-5 top-5 rounded-md px-2 py-1 text-xs font-bold text-white shadow-md"
                style={{ backgroundColor: color }}
            >
                {name}
            </div>
        </div>
    );
}

export function LiveCursor() {
    const [presence, updateMyPresence] = useMyPresence();

    // Track mouse movement
    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            // Limit updates or just standard
            updateMyPresence({
                cursor: {
                    x: Math.round(e.clientX),
                    y: Math.round(e.clientY),
                }
            });
        };

        const handlePointerLeave = () => {
            updateMyPresence({ cursor: null });
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerleave", handlePointerLeave);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerleave", handlePointerLeave);
        };
    }, [updateMyPresence]);


    const others = useOthers();

    return (
        <>
            {others.map(({ connectionId, presence, info }) => {
                if (!presence.cursor) {
                    return null;
                }

                const { x, y } = presence.cursor;
                // Default values if user info isn't synced yet
                const name = info?.name || presence.userInfo?.name || `User ${connectionId}`;
                const color = info?.color || presence.userInfo?.color || COLORS[connectionId % COLORS.length];

                return (
                    <Cursor
                        key={connectionId}
                        x={x}
                        y={y}
                        name={name}
                        color={color}
                    />
                );
            })}
        </>
    );
}
