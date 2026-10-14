// The .xlsx writer: a valid zip (signatures, CRCs, sizes) holding the sheet XML,
// with text kept exactly (Bosnian letters, XML characters) and never as formulas.

import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { crc32, xlsxFromRows, zipStore } from "@/lib/xlsx";

/** Read a stored zip back: name → text (checks every CRC on the way). */
function unzip(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let at = 0;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const method = dv.getUint16(at + 8, true), crc = dv.getUint32(at + 14, true), size = dv.getUint32(at + 18, true), nameLen = dv.getUint16(at + 26, true), extra = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLen));
    const raw = bytes.slice(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    const data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
    expect(crc32(data)).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + extra + size;
  }
  expect(dv.getUint32(bytes.length - 22, true)).toBe(0x06054b50); // end of central directory
  return out;
}

describe("xlsx", () => {
  it("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("zips files that read back exactly", () => {
    const z = unzip(zipStore([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "b/č.txt", data: new TextEncoder().encode("ćevapi") }]));
    expect(z).toEqual({ "a.txt": "hello", "b/č.txt": "ćevapi" });
  });

  it("writes a workbook with a bold, frozen header and text-only cells", () => {
    const files = unzip(xlsxFromRows([["Name", "Phone", "Note"], ["Stomatologija Ćiro & Co", "+38761234567", "=HYPERLINK(\"x\")"], ["<b>Tag</b>", "", ""]], "Dentists: Sarajevo"));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = files["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>');
    expect(sheet).toContain("Stomatologija Ćiro &amp; Co");
    expect(sheet).toContain("&lt;b&gt;Tag&lt;/b&gt;");
    expect(sheet).toContain("=HYPERLINK(&quot;x&quot;)</t>"); // an inline string, so Excel never runs it as a formula
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('state="frozen"');
    expect(files["xl/workbook.xml"]).toContain('name="Dentists  Sarajevo"'); // ":" isn't allowed in sheet names
  });
});
