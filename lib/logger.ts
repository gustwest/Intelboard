// Structured JSON logger for Cloud Run + local development

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
    action?: string;
    userId?: string;
    requestId?: string;
    projectId?: string;
    conversationId?: string;
    durationMs?: number;
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
    error?: {
        message: string;
        code?: string;
        stack?: string;
    };
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const MIN_LEVEL: LogLevel = process.env.LOG_LEVEL as LogLevel || (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatError(error: unknown): LogEntry["error"] | undefined {
    if (!error) return undefined;
    if (error instanceof Error) {
        return {
            message: error.message,
            code: (error as any).code,
            stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
        };
    }
    return { message: String(error) };
}

function emit(entry: LogEntry) {
    const json = JSON.stringify(entry);
    switch (entry.level) {
        case "error":
            console.error(json);
            break;
        case "warn":
            console.warn(json);
            break;
        default:
            console.log(json);
    }
}

function createEntry(level: LogLevel, message: string, context?: LogContext, error?: unknown): LogEntry {
    return {
        timestamp: new Date().toISOString(),
        level,
        message,
        context: context && Object.keys(context).length > 0 ? context : undefined,
        error: formatError(error),
    };
}

// --- Public API ---

export const log = {
    debug(message: string, context?: LogContext) {
        if (shouldLog("debug")) emit(createEntry("debug", message, context));
    },

    info(message: string, context?: LogContext) {
        if (shouldLog("info")) emit(createEntry("info", message, context));
    },

    warn(message: string, context?: LogContext, error?: unknown) {
        if (shouldLog("warn")) emit(createEntry("warn", message, context, error));
    },

    error(message: string, context?: LogContext, error?: unknown) {
        if (shouldLog("error")) emit(createEntry("error", message, context, error));
    },
};

/**
 * Measure the duration of an async operation and log it.
 * Usage: const result = await log.timed("fetchSystems", { userId }, async () => db.query(...));
 */
export async function logTimed<T>(
    action: string,
    context: LogContext,
    fn: () => Promise<T>
): Promise<T> {
    const start = performance.now();
    try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        log.info(`${action} completed`, { ...context, action, durationMs });
        return result;
    } catch (error) {
        const durationMs = Math.round(performance.now() - start);
        log.error(`${action} failed`, { ...context, action, durationMs }, error);
        throw error;
    }
}
