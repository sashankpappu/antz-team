"use client";

import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavRailProps {
  /** Count of decision forks waiting — drives the single gold accent. */
  needsCount?: number;
}

/** Desktop left nav. Calm; the only bold note is the gold "needs you" dot. */
export function NavRail({ needsCount = 0 }: NavRailProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex w-60 shrink-0 flex-col gap-1 border-r border-line bg-paper px-3 py-6"
    >
      <Link href="/" className="mb-6 px-3">
        <span className="display text-2xl text-ink">Vidur</span>
        <span className="mt-1 block font-mono text-[11px] uppercase tracking-widest text-muted">
          brain · crew
        </span>
      </Link>

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
              "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-accent-tint text-accent-deep font-medium"
                : "text-muted hover:bg-accent-tint/40 hover:text-ink",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {showNeeds && (
              <span
                className="rounded-full bg-needs px-1.5 py-0.5 text-[11px] font-semibold text-white"
                aria-label={`${needsCount} waiting`}
              >
                {needsCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
