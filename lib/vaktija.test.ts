import { describe, expect, it } from "vitest";
import { currentVakat, nextVakat, parseVaktija } from "./vaktija";

const sample = { id: 77, lokacija: "Sarajevo", vakat: ["5:20", "6:49", "12:34", "15:38", "18:16", "19:35"] };
const at = (h: number, m: number) => new Date(2026, 9, 11, h, m);

describe("vaktija", () => {
  it("parses and pads times", () => {
    expect(parseVaktija(sample)?.times).toEqual(["05:20", "06:49", "12:34", "15:38", "18:16", "19:35"]);
    expect(parseVaktija({ vakat: ["x"] })).toBeNull();
  });
  it("finds the next prayer, skipping sunrise, wrapping after jacija", () => {
    const v = parseVaktija(sample)!;
    expect(nextVakat(v, at(6, 0))).toMatchObject({ key: "dhuhr", bs: "Podne" });
    expect(nextVakat(v, at(17, 0))).toMatchObject({ key: "maghrib", minutesLeft: 76 });
    expect(nextVakat(v, at(22, 0))).toMatchObject({ key: "fajr", minutesLeft: 440 });
  });
  it("knows when a prayer has just begun", () => {
    const v = parseVaktija(sample)!;
    expect(currentVakat(v, at(18, 20))?.key).toBe("maghrib");
    expect(currentVakat(v, at(18, 40))).toBeNull();
    expect(currentVakat(v, at(6, 50))).toBeNull(); // sunrise has no azan
  });
});
