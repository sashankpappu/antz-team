"use client";

import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomTabsProps {
  needsCount?: number;
}

/** Mobile bottom tab bar — one-handed reach (§6, mobile-first). */
export function BottomTabs({ needsCount = 0 }: BottomTabsProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-card/95 backdrop-blur"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const showNeeds = item.href === "/decisions" && needsCount > 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center gap-1 py-2.5 text-[11px]",
              active ? "text-accent-deep" : "text-muted",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{item.label}</span>
            {showNeeds && (
              <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-needs" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
