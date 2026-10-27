import { describe, expect, it } from "vitest";
import { canEditMaterial } from "@/server/context";

const actor = { id: "u1", label: "User", organisationId: "org-a" };

describe("Who may change a material", () => {
  it("allows anything in demo mode", () => {
    expect(canEditMaterial({ mode: "demo", actor }, { organisationId: "org-b" })).toBe(true);
  });

  it("allows only the owning organisation in persistent mode", () => {
    expect(canEditMaterial({ mode: "supabase", actor }, { organisationId: "org-a" })).toBe(true);
    expect(canEditMaterial({ mode: "supabase", actor }, { organisationId: "org-b" })).toBe(false);
    expect(canEditMaterial({ mode: "supabase", actor: null }, { organisationId: "org-a" })).toBe(false);
  });
});
