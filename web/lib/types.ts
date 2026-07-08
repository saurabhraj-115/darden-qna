import type { CategoryKey } from "./taxonomy";

export type QAPair = {
  id: number;
  group: string;
  question: string;
  answer: string;
  confidence: number;
  topics: string[];
  category: CategoryKey;
  sourceCount: number;
  relatedCount: number;
  similarity?: number;
  date: string | null;
};

export type CategoryCard = {
  key: CategoryKey;
  label: string;
  icon: string;
  blurb: string;
  count: number;
  sample: string | null;
};

export type Stats = {
  pairs: number;
  messages: number;
  groups: number;
  categories: number;
};
