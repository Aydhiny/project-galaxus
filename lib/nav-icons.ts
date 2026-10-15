// One icon per page, shared by the sidebar, the command palette and page
// headers, so a page looks the same wherever you meet it. Each icon is used for
// exactly one page; group headers in the sidebar get their own (GROUP_ICON).

import {
  Activity, Award, Binoculars, BookHeart, BookMarked, BookOpen, Bot, CalendarRange, Castle, ChartLine,
  ClipboardCheck, Clapperboard, Coins, Disc3, Dumbbell, FileText, Flower2, Gamepad2, Gauge, GraduationCap,
  Grid3x3, Handshake, HeartPulse, Library, Lightbulb, ListTodo, Medal, Mic, Moon, MoonStar, Music2, Newspaper,
  Palette, PersonStanding, Radar, Rss, Send, Shield, StickyNote, Sunrise, Target, Trophy, Users, Wallet,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICON = {
  "/empire": Castle,
  "/overview": Sunrise,
  "/brief": Newspaper,
  "/voice": Mic,
  "/level": Medal,             // was Trophy (clashed with Leaderboard)
  "/productivity": Gauge,
  "/tasks": ListTodo,
  "/pages": FileText,
  "/review": ClipboardCheck,   // was BarChart3 (a review is a check-in, not a chart)
  "/gigs": Radar,
  "/deals": Handshake,
  "/outreach": Send,
  "/opportunities": Award,
  "/scout": Binoculars,        // was Lightbulb (clashed with Insights)
  "/ops": Bot,
  "/community": Users,
  "/money": Wallet,
  "/youtube": Clapperboard,
  "/game": Gamepad2,
  "/creative": Music2,
  "/beats": Disc3,
  "/dashboard": Rss,
  "/yearly": CalendarRange,
  "/insights": Lightbulb,
  "/heatmap": Grid3x3,         // was LayoutDashboard (it's a grid of days)
  "/leaderboard": Trophy,
  "/training": Dumbbell,
  "/workout": HeartPulse,
  "/meditation": Flower2,      // was Sparkles (generic "AI/magic" glyph)
  "/metrics": Activity,
  "/study": GraduationCap,
  "/reading": BookOpen,
  "/notes": StickyNote,
  "/spiritual": Moon,
  "/duas": BookMarked,
  "/diary": BookHeart,
  "/hold": Shield,
} satisfies Record<string, LucideIcon>;

export type NavHref = keyof typeof NAV_ICON;

/** Sidebar group headers: distinct from the pages inside them. */
export const GROUP_ICON = {
  Productivity: Target,        // was Gauge (same as the Productivity page)
  Money: Coins,                // was Wallet (same as the Money page)
  Create: Palette,             // was Clapperboard (same as YouTube)
  Track: ChartLine,            // was Rss (same as Feed)
  "Body & Mind": PersonStanding, // was HeartPulse (same as Home Workout)
  Knowledge: Library,          // was GraduationCap (same as Study)
  Soul: MoonStar,              // was Moon (same as Spiritual)
} satisfies Record<string, LucideIcon>;
