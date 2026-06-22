import {
  Inbox,
  Brain,
  GitBranch,
  GitFork,
  Sunrise,
  ShieldCheck,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

/**
 * The six surfaces (§4) + an in-app Guide. The six are the v1 feature set;
 * Guide is the "how to use Vidur" reference, not an engine.
 */
export interface NavItem {
  href: string;
  label: string;
  /** One-line job of the surface (each screen does one thing). */
  blurb: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Capture", blurb: "Hand it to Vidur", icon: Inbox },
  { href: "/brain", label: "Brain", blurb: "Ask what we know", icon: Brain },
  { href: "/execute", label: "Execute", blurb: "Sprints in motion", icon: GitBranch },
  { href: "/decisions", label: "Decisions", blurb: "Forks that need you", icon: GitFork },
  { href: "/briefing", label: "Briefing", blurb: "Dream & morning brief", icon: Sunrise },
  { href: "/govern", label: "Govern", blurb: "Team, audit & config", icon: ShieldCheck },
  { href: "/guide", label: "Guide", blurb: "How to use Vidur", icon: BookOpen },
];

/** Active when the path equals the item or is nested beneath it. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
