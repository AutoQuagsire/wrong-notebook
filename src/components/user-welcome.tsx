"use client";

import { useState, useEffect } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export function UserWelcome() {
    const { t, language } = useLanguage();
    const { data: session } = useSession();
    const [mounted, setMounted] = useState(false);

    // one-time client mount guard to show real user name after hydration
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    // Server always renders 'User' (no session). Client matches this initially.
    // After mount, we show the real name.
    const userName = mounted && session?.user ? (session.user.name || session.user.email) : 'User';

    return (
        <div className="flex items-center gap-2 bg-card p-2.5 md:p-4 rounded-lg border shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
            <User className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <span className="font-medium text-sm md:text-base whitespace-nowrap min-w-0 truncate">
                {t.common.welcome || 'Welcome back, '}
                {userName}
            </span>
        </div>
    );
}
