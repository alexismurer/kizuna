import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";

type Tree = { [k: string]: string | Tree };

const load = (locale: string): Tree =>
  JSON.parse(readFileSync(join(__dirname, "../../messages", `${locale}.json`), "utf8"));

// every leaf with its ICU placeholders ({name}, {count, plural, …} and <tags>)
function leaves(t: Tree, prefix = ""): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      // `WINTER {Winter}` is a select branch, not a placeholder
      const args = [...v.matchAll(/(?<!(?:=\d+|zero|one|two|few|many|other|[A-Z_]{2,})\s)\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]);
      const tags = [...v.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
      out.set(key, [...new Set([...args, ...tags])].sort());
    } else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

const en = leaves(load("en"));

describe.each(routing.locales.filter((l) => l !== "en"))("messages/%s.json", (locale) => {
  const other = leaves(load(locale));

  it("has exactly the English keys", () => {
    expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
  });

  // in ICU a straight apostrophe before { or < escapes it, so the tag prints as text
  it("has no apostrophe right before a placeholder or tag", () => {
    for (const [key] of other) {
      const text = key.split(".").reduce<Tree | string>((t, k) => (t as Tree)[k], load(locale)) as string;
      expect(text, key).not.toMatch(/'[{<]/);
    }
  });

  it("keeps every placeholder and tag", () => {
    for (const [key, args] of en) expect(other.get(key), key).toEqual(args);
  });
});
