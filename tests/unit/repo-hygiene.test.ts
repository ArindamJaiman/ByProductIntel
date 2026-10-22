import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe(".env.example", () => {
  it("holds only placeholders, never a real key", () => {
    const live = readFileSync(".env.example", "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return { key: k.trim(), value: v.join("=").trim() };
      })
      .filter(({ value }) => value && !/x{6,}|your-project-ref|^(demo|supabase)$/.test(value));
    // Report names only, so a failure never prints the secret itself.
    expect(live.map((l) => l.key)).toEqual([]);
  });
});
