"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
    value: number;
    onChange?: (value: number) => void;
    readonly?: boolean;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
    count?: number;
    avgScore?: number;
    className?: string;
}

const SKILL_LABELS: Record<number, string> = {
    1: "Beginner",
    2: "Elementary",
    3: "Intermediate",
    4: "Advanced",
    5: "Expert",
};

const SKILL_COLORS: Record<number, string> = {
    1: "text-slate-400",
    2: "text-blue-400",
    3: "text-amber-400",
    4: "text-orange-400",
    5: "text-red-400",
};

const SIZE_MAP = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
};

export function RatingStars({
    value,
    onChange,
    readonly = false,
    size = "md",
    showLabel = false,
    count,
    avgScore,
    className,
}: RatingStarsProps) {
    const [hover, setHover] = useState(0);
    const displayValue = hover || value;

    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        disabled={readonly}
                        onClick={() => onChange?.(star === value ? 0 : star)}
                        onMouseEnter={() => !readonly && setHover(star)}
                        onMouseLeave={() => !readonly && setHover(0)}
                        className={cn(
                            "transition-all duration-150",
                            readonly ? "cursor-default" : "cursor-pointer hover:scale-110",
                        )}
                    >
                        <Star
                            className={cn(
                                SIZE_MAP[size],
                                "transition-colors",
                                star <= displayValue
                                    ? "fill-amber-400 text-amber-400"
                                    : "fill-none text-muted-foreground/30"
                            )}
                        />
                    </button>
                ))}
            </div>
            {showLabel && displayValue > 0 && (
                <span className={cn("text-[10px] font-semibold", SKILL_COLORS[displayValue])}>
                    {SKILL_LABELS[displayValue]}
                </span>
            )}
            {avgScore !== undefined && (
                <span className="text-[10px] text-muted-foreground">
                    {avgScore.toFixed(1)}
                </span>
            )}
            {count !== undefined && count > 0 && (
                <span className="text-[10px] text-muted-foreground">
                    ({count})
                </span>
            )}
        </div>
    );
}
