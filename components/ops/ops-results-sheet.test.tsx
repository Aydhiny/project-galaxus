import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ResultsSheet, PAGE_SIZE } from "./ops-results-sheet";

const HEADER = ["Name", "Category", "Address", "Phone", "WhatsApp", "Email", "Website", "Website status", "Source"];
const SHEET = [
  HEADER,
  ["Zubar Ćosić", "Dentists", "Ferhadija 12, Sarajevo", "061 123 456", "yes", "info@cosic.ba", "", "No website", "https://www.openstreetmap.org/node/1"],
  ["Salon Lana", "Hair salons", "Kralja Petra 3, Banja Luka", "051 222 333", "no", "", "https://facebook.com/salonlana", "Facebook only", "javascript:alert(1)"],
  ["Dental Plus", "Dentists", "Titova 5, Sarajevo", "033 444 555", "no", "kontakt@dentalplus.ba", "http://dentalplus.ba", "Broken (site down)", ""],
];
const bodyNames = () => within(screen.getByRole("region", { name: "Sheet rows" })).getAllByRole("row").slice(1).map((r) => r.querySelector("td")?.textContent);

describe("ResultsSheet", () => {
  it("filters with chips and search, and says how many are shown", () => {
    render(<ResultsSheet sheet={SHEET} title="Dentists" />);
    expect(screen.getByText("3 rows")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Has WhatsApp" }));
    expect(screen.getByRole("button", { name: "Has WhatsApp" }).getAttribute("aria-pressed")).toBe("true");
    expect(bodyNames()).toEqual(["Zubar Ćosić"]);
    expect(screen.getByText("1 of 3 rows")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    fireEvent.click(screen.getByRole("button", { name: "Facebook only" }));
    expect(bodyNames()).toEqual(["Salon Lana"]);
    fireEvent.click(screen.getByRole("button", { name: "Facebook only" }));

    fireEvent.click(within(screen.getByRole("group", { name: "City" })).getByRole("button", { name: /Sarajevo/ }));
    expect(bodyNames()).toEqual(["Zubar Ćosić", "Dental Plus"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the sheet" }), { target: { value: "cosic" } });
    expect(bodyNames()).toEqual(["Zubar Ćosić"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the sheet" }), { target: { value: "zzz" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it("sorts by a column header, both ways", () => {
    render(<ResultsSheet sheet={SHEET} title="Dentists" />);
    const nameHeader = screen.getByRole("columnheader", { name: /^Name/ });
    fireEvent.click(within(nameHeader).getByRole("button"));
    expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(bodyNames()).toEqual(["Dental Plus", "Salon Lana", "Zubar Ćosić"]);
    fireEvent.click(within(nameHeader).getByRole("button"));
    expect(bodyNames()).toEqual(["Zubar Ćosić", "Salon Lana", "Dental Plus"]);
  });

  it("links only what's safe: WhatsApp for the mobile, mailto, http(s) sources", () => {
    render(<ResultsSheet sheet={SHEET} title="Dentists" />);
    expect(screen.getByRole("link", { name: "WhatsApp Zubar Ćosić" }).getAttribute("href")).toBe("https://wa.me/38761123456?text=");
    expect(screen.queryByRole("link", { name: "WhatsApp Dental Plus" })).toBeNull(); // a landline
    expect(screen.getByRole("link", { name: /info@cosic\.ba/ }).getAttribute("href")).toBe("mailto:info@cosic.ba");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.every((h) => /^(https?:|mailto:)/.test(h))).toBe(true);
    expect(document.body.textContent).toContain("javascript:alert(1)"); // shown as text, never a link
  });

  it("pages a long sheet and exports what's shown", () => {
    const big = [HEADER, ...Array.from({ length: 250 }, (_, i) => [`Biz ${i + 1}`, "Dentists", "Sarajevo", "", "", "", "", "", ""])];
    const created = vi.fn((b: Blob) => { void b; return "blob:x"; });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ResultsSheet sheet={big} title="Big" />);
    expect(bodyNames()).toHaveLength(PAGE_SIZE);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(bodyNames()[0]).toBe("Biz 101");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the sheet" }), { target: { value: "Biz 25" } });
    expect(bodyNames()).toEqual(["Biz 25", "Biz 125", "Biz 225", "Biz 250"]); // every word matches anywhere; back on page 1
    fireEvent.click(screen.getByRole("button", { name: "Export 4 shown" }));
    expect(created).toHaveBeenCalledTimes(1);
    expect((created.mock.calls[0][0] as Blob).size).toBeGreaterThan(500);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
