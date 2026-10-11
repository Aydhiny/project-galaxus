import { describe, expect, it } from "vitest";
import { moodOf, onThisDay, parseImport } from "./diary";

describe("diary import", () => {
  it("reads the master file and raw MyDiary entries", () => {
    const master = { format: "galaxus-diary-v1", entries: [{ externalId: "a", date: "2022-05-23T10:00:00Z", title: "The Beginning", content: "Hi", mood: "mood_basic_002", tags: [] }, { date: "bad" }] };
    expect(parseImport(master)).toHaveLength(1);
    const raw = { diaryBodyList: [{ type: "text", content: "Opet ja" }], diaryTitle: { titleText: { content: "Vidi ti ovo" }, moodEntry: { moodName: "mood_basic_002" } }, diaryTime: 1774355237903, folder: "default_diary_1" };
    expect(parseImport(raw)[0]).toMatchObject({ externalId: "default_diary_1", title: "Vidi ti ovo", mood: "mood_basic_002" });
    expect(moodOf("mood_basic_003")?.label).toBe("Happy");
  });
  it("finds entries from this day in earlier years", () => {
    const e = [{ date: "2023-10-11T09:00:00Z" }, { date: "2023-10-12T09:00:00Z" }, { date: "2026-10-11T09:00:00Z" }];
    expect(onThisDay(e, new Date("2026-10-11T12:00:00Z"))).toHaveLength(1);
  });
});
