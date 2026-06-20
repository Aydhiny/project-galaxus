"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Moon, Heart, Anchor, Wind, Sparkles } from "lucide-react";

/* ─── Content pool ─────────────────────────────────────────────────────────── */

type Category = "Faith" | "Gratitude" | "Ground" | "Words";

interface Anchor {
  text: string;
  source?: string;
  category: Category;
}

const POOL: Anchor[] = [
  /* ── Faith ─────────────────────────────────────────────────────────────── */
  { text: "Your Lord has not abandoned you, nor is He displeased with you.", source: "Quran 93:3", category: "Faith" },
  { text: "Indeed, with hardship comes ease.", source: "Quran 94:6", category: "Faith" },
  { text: "Verily, with hardship comes ease.", source: "Quran 94:5–6", category: "Faith" },
  { text: "Do not despair of the mercy of Allah. Indeed, Allah forgives all sins.", source: "Quran 39:53", category: "Faith" },
  { text: "Allah does not burden a soul beyond what it can bear.", source: "Quran 2:286", category: "Faith" },
  { text: "And He is with you wherever you are.", source: "Quran 57:4", category: "Faith" },
  { text: "He knows what is within your heart. You are never alone in it.", source: "Quran 35:38", category: "Faith" },
  { text: "Allah is enough for me. There is no god but Him. Upon Him I rely.", source: "Quran 9:129", category: "Faith" },
  { text: "And if you count the blessings of Allah, you will not be able to enumerate them.", source: "Quran 14:34", category: "Faith" },
  { text: "So wait with patience, for the command of your Lord — for you are in Our eyes.", source: "Quran 52:48", category: "Faith" },
  { text: "Call upon Me; I will respond to you.", source: "Quran 40:60", category: "Faith" },
  { text: "Whatever afflicted you was not going to miss you. Whatever missed you was not going to afflict you.", source: "Prophet Muhammad ﷺ", category: "Faith" },
  { text: "Amazing is the affair of the believer — every matter is good for him. That is for no one but the believer.", source: "Prophet Muhammad ﷺ", category: "Faith" },
  { text: "Allah is gentle and loves gentleness in all matters.", source: "Prophet Muhammad ﷺ", category: "Faith" },
  { text: "No fatigue, illness, anxiety, grief, or harm befalls a Muslim — not even a thorn — except that Allah expiates sins by it.", source: "Bukhari", category: "Faith" },
  { text: "Your Lord says: 'Do not despair. I am near.'", source: "Quran 2:186", category: "Faith" },

  /* ── Gratitude ──────────────────────────────────────────────────────────── */
  { text: "Someone right now is praying for the health you woke up with this morning.", category: "Gratitude" },
  { text: "Your family is alive. Your parents exist. There will be a day when that is no longer true — today is not that day.", category: "Gratitude" },
  { text: "You have people who would answer if you called them right now. That's not nothing. That's everything.", category: "Gratitude" },
  { text: "Clean water. A bed. Food. You are living better than most kings in history.", category: "Gratitude" },
  { text: "Your eyes are reading these words. Your lungs are breathing. Your heart has been beating without stopping your whole life.", category: "Gratitude" },
  { text: "There are people whose greatest wish is to have the ordinary life you are living right now.", category: "Gratitude" },
  { text: "You have a mind capable of learning, changing, and growing. Most things on Earth can't say that.", category: "Gratitude" },
  { text: "The fact that you want to be better is itself a sign that you are not as lost as the voice in your head says you are.", category: "Gratitude" },
  { text: "Your struggles today are proof you are still in the fight. The alternative is much worse.", category: "Gratitude" },
  { text: "Someone loves you and is grateful you exist. You might not feel it right now, but it is true.", category: "Gratitude" },
  { text: "You have enough to get through today. That is the only day you need right now.", category: "Gratitude" },
  { text: "Think of one person you love. They exist. That is a gift that could be taken at any moment.", category: "Gratitude" },

  /* ── Ground ─────────────────────────────────────────────────────────────── */
  { text: "The thought is not the truth. It is just a thought. You are not your thoughts.", category: "Ground" },
  { text: "Right now, in this exact moment, you are safe. The catastrophe is happening in your mind, not your room.", category: "Ground" },
  { text: "You have survived 100% of your worst days so far. That is your track record.", category: "Ground" },
  { text: "This feeling is a wave. You don't have to fight it or drown in it — just let it pass through you.", category: "Ground" },
  { text: "The voice telling you the worst-case scenario has been wrong many times before. Ask it for evidence.", category: "Ground" },
  { text: "Take one breath. Just one. The rest can wait five seconds.", category: "Ground" },
  { text: "You are not your worst day, your worst thought, or your worst hour.", category: "Ground" },
  { text: "Name one thing you can see. One thing you can hear. One thing you can feel. You are here. This is now.", category: "Ground" },
  { text: "The spiral feels like forever. It is not. It is a weather system passing through.", category: "Ground" },
  { text: "You are not behind. You are not broken. You are a human being having a hard time. These are different things.", category: "Ground" },
  { text: "Rumination is the mind reviewing the past to prevent future pain. It cannot actually do that. You can gently tell it: thank you, but not now.", category: "Ground" },
  { text: "Put your feet on the floor. Feel the ground. It is holding you.", category: "Ground" },
  { text: "The version of you that is worrying is trying to protect you. It's exhausted and needs rest, not more fuel.", category: "Ground" },

  /* ── Words ──────────────────────────────────────────────────────────────── */
  { text: "You would never speak to someone you love the way you speak to yourself. You deserve the same gentleness.", category: "Words" },
  { text: "You don't have to be okay right now. You just have to be here. That's enough.", category: "Words" },
  { text: "Struggling is not the same as failing. Struggling is what effort looks like from the inside.", category: "Words" },
  { text: "Every version of you that made it through a hard season is proof you can make it through this one.", category: "Words" },
  { text: "You are not a burden. You are a person with needs, and having needs is not a character flaw.", category: "Words" },
  { text: "The people who love you see something worth loving. Their vision is clearer than the one in your head right now.", category: "Words" },
  { text: "Rest is not giving up. Rest is how you refill so you can keep going.", category: "Words" },
  { text: "You are allowed to be a work in progress. Everything worth anything was one.", category: "Words" },
  { text: "You have more going for you than the loudest, most convincing voice in your head is willing to admit.", category: "Words" },
  { text: "Being hard on yourself has never once made you better. Kindness might be worth trying.", category: "Words" },
  { text: "You made it to today. That is not a small thing.", category: "Words" },
  { text: "A negative mind is not an accurate mind. It is a mind in pain. Pain deserves care, not punishment.", category: "Words" },
  { text: "Your worth is not measured by your productivity, your mood, or how well you held it together today.", category: "Words" },
];

const CATEGORY_META: { key: Category; label: string; icon: React.FC<{ className?: string }> ; color: string; glow: string }[] = [
  { key: "Faith",      label: "Faith",      icon: Moon,     color: "#10b981", glow: "rgba(16,185,129,0.12)" },
  { key: "Gratitude",  label: "Gratitude",  icon: Heart,    color: "#f59e0b", glow: "rgba(245,158,11,0.12)"  },
  { key: "Ground",     label: "Ground",     icon: Anchor,   color: "#818cf8", glow: "rgba(129,140,248,0.12)" },
  { key: "Words",      label: "Kind words", icon: Sparkles, color: "#ec4899", glow: "rgba(236,72,153,0.12)"  },
];

function pickRandom(arr: Anchor[]): Anchor {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export function SoulAnchorCard() {
  const [category, setCategory] = useState<Category | "All">("All");
  const [entry, setEntry]       = useState<Anchor | null>(null);
  const [fading, setFading]     = useState(false);

  const pick = useCallback((cat: Category | "All") => {
    const pool = cat === "All" ? POOL : POOL.filter(e => e.category === cat);
    return pickRandom(pool);
  }, []);

  useEffect(() => {
    setEntry(pick("All"));
  }, [pick]);

  function changeCategory(cat: Category | "All") {
    setCategory(cat);
    fadeToNew(cat);
  }

  function shuffle() {
    fadeToNew(category);
  }

  function fadeToNew(cat: Category | "All") {
    setFading(true);
    setTimeout(() => {
      setEntry(pick(cat));
      setFading(false);
    }, 200);
  }

  const meta = CATEGORY_META.find(m => m.key === entry?.category);
  const color = meta?.color ?? "#818cf8";
  const glow  = meta?.glow  ?? "rgba(129,140,248,0.10)";

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border"
      style={{ background: "linear-gradient(160deg, oklch(0.13 0.02 260 / 0.95) 0%, oklch(0.10 0.01 260 / 0.98) 100%)" }}>

      {/* Warm inner glow that shifts with category */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-700"
        style={{ background: `radial-gradient(ellipse at 30% 40%, ${glow} 0%, transparent 70%)` }} />

      {/* Category tabs */}
      <div className="relative flex items-center gap-1 px-4 pt-4 pb-0 flex-wrap">
        <button
          onClick={() => changeCategory("All")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
            category === "All"
              ? "bg-white/10 text-white"
              : "text-white/35 hover:text-white/60"
          )}>
          <Wind className="w-3 h-3" /> All
        </button>
        {CATEGORY_META.map(({ key, label, icon: Icon, color: c }) => (
          <button key={key}
            onClick={() => changeCategory(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
              category === key
                ? "text-white"
                : "text-white/35 hover:text-white/60"
            )}
            style={category === key ? { background: `${c}28`, border: `1px solid ${c}50`, color: c } : {}}>
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}

        <button onClick={shuffle}
          className="ml-auto text-white/25 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5"
          title="New message">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message */}
      <div className={cn(
        "relative px-6 py-6 transition-all duration-200",
        fading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
      )}>
        {entry && (
          <>
            <p className="text-base font-medium leading-relaxed text-white/88"
              style={{ fontFamily: "var(--font-heading)" }}>
              {entry.text}
            </p>
            {entry.source && (
              <p className="mt-3 text-xs font-medium" style={{ color: `${color}bb` }}>
                — {entry.source}
              </p>
            )}
            {/* Category badge */}
            <div className="mt-4 flex items-center gap-1.5">
              {meta && (
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: `${color}80` }}>
                  <meta.icon className="w-2.5 h-2.5" /> {entry.category}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
