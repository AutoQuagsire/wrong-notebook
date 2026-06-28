/**
 * Server-side AI permission guard.
 *
 * Checks whether the current user is allowed to consume system-level AI
 * (i.e. the global API key configured in app-config.json / env vars).
 *
 * Rules:
 *  - Not authenticated        → denied
 *  - Role is "admin"          → allowed
 *  - Role is "user" or unset  → denied (must use client LLM instead)
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth";

export interface SystemAIPermissionResult {
    allowed: boolean;
    /** User-readable reason when denied. */
    reason?: string;
}

/**
 * Call this *before* `getAIService()` in any server-side route that uses
 * the global AI provider.
 */
export async function checkSystemAIPermission(): Promise<SystemAIPermissionResult> {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return {
            allowed: false,
            reason: "Authentication required",
        };
    }

    const role = (session.user as { role?: string }).role;

    if (role === "admin") {
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: "系统级 AI 不对普通用户开放。请在设置页配置本机 LLM。",
    };
}
