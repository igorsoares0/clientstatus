import { describe, expect, it } from "vitest";
import { formatShortDate, plural, shortPersonName } from "@/lib/format";
import { emailSchema, isValidTimezone, passwordHint, passwordSchema, slugify } from "@/lib/validation";

describe("password rules", () => {
  it("requires 12 to 128 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("gives the Onboarding design's live hints", () => {
    expect(passwordHint("", false)).toEqual({ text: "At least 12 characters.", tone: "muted" });
    expect(passwordHint("", true)).toEqual({ text: "Choose a password.", tone: "error" });
    expect(passwordHint("a".repeat(11), false).text).toBe("1 more character needed.");
    expect(passwordHint("a".repeat(9), true)).toEqual({ text: "3 more characters needed.", tone: "error" });
    expect(passwordHint("a".repeat(12), true)).toEqual({ text: "✓ Long enough", tone: "ok" });
  });
});

describe("emailSchema", () => {
  it("normalises case and whitespace", () => {
    expect(emailSchema.parse("  Priya@Northfold.Studio ")).toBe("priya@northfold.studio");
  });
  it("rejects malformed addresses", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA zones, UTC and aliases", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Asia/Calcutta")).toBe(true);
  });
  it("rejects unknown zones", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Northfold Studio")).toBe("northfold-studio");
    expect(slugify("  Agência São Paulo! ")).toBe("agencia-sao-paulo");
    expect(slugify("!!!")).toBe("workspace");
  });
});

describe("formatting helpers", () => {
  it("formats dates in the workspace timezone", () => {
    const now = new Date("2026-10-25T09:48:00Z");
    expect(formatShortDate(new Date("2026-10-24T23:30:00Z"), "Europe/London", now)).toBe("25 Oct");
    expect(formatShortDate(new Date("2025-03-01T12:00:00Z"), "UTC", now)).toBe("1 Mar 2025");
  });
  it("shortens names and pluralises", () => {
    expect(shortPersonName("Priya Raman")).toBe("Priya R.");
    expect(shortPersonName("Cher")).toBe("Cher");
    expect(plural(1, "website")).toBe("1 website");
    expect(plural(3, "website")).toBe("3 websites");
  });
});
