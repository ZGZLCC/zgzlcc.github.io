export const TAGS = [
  { value: "work", label: "工作", color: "blue" },
  { value: "leisure", label: "休闲", color: "orange" },
  { value: "sleep", label: "睡眠", color: "purple" },
  { value: "other", label: "其他", color: "gray" },
] as const;

export type EntryTag = (typeof TAGS)[number]["value"];

export function tagLabel(value: EntryTag): string {
  return TAGS.find((tag) => tag.value === value)?.label ?? "其他";
}

export function tagColor(value: EntryTag): string {
  return TAGS.find((tag) => tag.value === value)?.color ?? "gray";
}
