import { describe, expect, it } from "vitest";
import { DEFAULT_PLACE, UNKNOWN_SKY, cleanPlace, parseOpenMeteo, skyFromCode } from "@/lib/weather";

describe("skyFromCode (WMO codes)", () => {
  it("clear and mostly clear are sun — not rain", () => {
    expect(skyFromCode(0).kind).toBe("sun");
    expect(skyFromCode(1).kind).toBe("sun");
    expect(skyFromCode(2).kind).toBe("partly");
    expect(skyFromCode(3).kind).toBe("clouds");
  });
  it("rain gets stronger with the code, and drizzle is light", () => {
    expect(skyFromCode(51)).toMatchObject({ kind: "rain", label: "Drizzle" });
    expect(skyFromCode(51).intensity).toBeLessThan(skyFromCode(61).intensity);
    expect(skyFromCode(61).intensity).toBeLessThan(skyFromCode(65).intensity);
    expect(skyFromCode(82)).toMatchObject({ kind: "rain", label: "Showers" });
  });
  it("snow, fog and storms are their own kinds", () => {
    expect(skyFromCode(73).kind).toBe("snow");
    expect(skyFromCode(86).kind).toBe("snow");
    expect(skyFromCode(45).kind).toBe("fog");
    expect(skyFromCode(95).kind).toBe("storm");
    expect(skyFromCode(99).label).toContain("hail");
  });
  it("unknown codes are a calm 'cloudy', never rain", () => {
    expect(skyFromCode(42).kind).toBe("clouds");
  });
});

describe("parseOpenMeteo", () => {
  it("reads the real Open-Meteo `current` block", () => {
    // Shape of a real reply for Sarajevo (2026-10-14, clear, 14.4 °C).
    const json = { latitude: 43.87, current: { time: "2026-10-14T14:45", interval: 900, temperature_2m: 14.4, weather_code: 0, is_day: 1 } };
    expect(parseOpenMeteo(json, "Sarajevo")).toEqual({ kind: "sun", intensity: 0, label: "Clear", tempC: 14, place: "Sarajevo", isDay: true, live: true });
  });
  it("returns null for anything else", () => {
    expect(parseOpenMeteo(null, "x")).toBeNull();
    expect(parseOpenMeteo({ error: true, reason: "bad" }, "x")).toBeNull();
    expect(parseOpenMeteo({ current: { temperature_2m: 3 } }, "x")).toBeNull();
  });
  it("the fallback is calm and says it's a guess", () => {
    expect(UNKNOWN_SKY("Sarajevo")).toMatchObject({ kind: "partly", live: false, label: "Weather unavailable" });
  });
});

describe("cleanPlace", () => {
  it("keeps valid coordinates, rounded to ~1 km", () => {
    expect(cleanPlace({ lat: 43.85631, lon: 18.41312, name: "Sarajevo" })).toEqual({ lat: 43.86, lon: 18.41, name: "Sarajevo" });
  });
  it("rejects nonsense and strips markup from names", () => {
    expect(cleanPlace({ lat: 120, lon: 0 })).toBeNull();
    expect(cleanPlace({ lat: "x", lon: 1 })).toBeNull();
    expect(cleanPlace({ lat: 1, lon: 1, name: "<b>Home</b>" })?.name).toBe("bHome/b");
    expect(cleanPlace({ lat: 1, lon: 1 })?.name).toBe("My location");
  });
  it("defaults to Sarajevo", () => {
    expect(DEFAULT_PLACE.name).toBe("Sarajevo");
  });
});
