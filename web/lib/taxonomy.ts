import rawMap from "./topic-categories.json";

export type CategoryKey =
  | "housing"
  | "visa"
  | "money"
  | "health"
  | "academics"
  | "career"
  | "moving"
  | "orientation"
  | "community";

export type Category = { key: CategoryKey; label: string; icon: string; blurb: string };

// Fixed display order.
export const CATEGORIES: Category[] = [
  { key: "housing", label: "Housing & Leases", icon: "🏠", blurb: "Apartments, leases, subleases, roommates" },
  { key: "visa", label: "Visa & Immigration", icon: "🛂", blurb: "Visas, I-20, DS-160, SEVIS, SSN, OPT" },
  { key: "money", label: "Money & Fees", icon: "💵", blurb: "Tuition, loans, scholarships, banking" },
  { key: "health", label: "Health & Insurance", icon: "🏥", blurb: "Insurance, immunizations, medical requirements" },
  { key: "academics", label: "Academics", icon: "🎓", blurb: "Courses, calendar, laptops, study tools" },
  { key: "career", label: "Recruiting & Career", icon: "💼", blurb: "Recruiting, internships, networking" },
  { key: "moving", label: "Moving & Logistics", icon: "📦", blurb: "Flights, travel, shopping, moving in" },
  { key: "orientation", label: "Orientation & Timeline", icon: "📅", blurb: "Launch week, DBD, deadlines, dates" },
  { key: "community", label: "Community & Social", icon: "🎉", blurb: "Clubs, sports, dining, social life" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
const TOPIC_MAP = rawMap as Record<string, string>;

// Tie-break priority for a pair's headline category: specific domains win over
// the generic "money"/"community" buckets, so "health insurance cost" reads as
// Health, not Money, and "housing cost" reads as Housing.
const PRIORITY: CategoryKey[] = [
  "visa",
  "housing",
  "health",
  "academics",
  "career",
  "orientation",
  "moving",
  "money",
  "community",
];

export function categoryOf(topic: string): CategoryKey {
  const k = TOPIC_MAP[topic];
  return (BY_KEY.has(k as CategoryKey) ? k : "community") as CategoryKey;
}

export function categoryMeta(key: string): Category {
  return BY_KEY.get(key as CategoryKey) ?? CATEGORIES[CATEGORIES.length - 1];
}

// A pair's headline category = most common category across its topics,
// tie-broken by the fixed display order.
export function primaryCategory(topics: string[]): CategoryKey {
  if (!topics.length) return "community";
  const counts = new Map<CategoryKey, number>();
  for (const t of topics) {
    const c = categoryOf(t);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: CategoryKey = "community";
  let bestN = -1;
  for (const key of PRIORITY) {
    const n = counts.get(key) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = key;
    }
  }
  return best;
}
