import { describe, expect, it } from "vitest";
import { brandSummary, brandTextOnWhite, contrast, coverTextColor, isHexColor } from "@/lib/color";
import { localParts, monthPeriod, previousMonth, zonedTimeToUtc } from "@/lib/reports/period";
import { hashReportToken, isWellFormedToken, newReportToken } from "@/lib/reports/token";

describe("report periods", () => {
  it("uses local midnight in the workspace timezone, across DST", () => {
    const sep = monthPeriod(2026, 9, "Europe/London"); // BST
    expect(sep.start.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(sep.end.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(sep).toMatchObject({ label: "September 2026", days: 30 });
    const oct = monthPeriod(2026, 10, "Europe/London"); // BST → GMT on 25 Oct
    expect(oct.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(monthPeriod(2026, 2, "America/Sao_Paulo").start.toISOString()).toBe("2026-02-01T03:00:00.000Z");
    expect(monthPeriod(2026, 12, "UTC").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("finds the previous month from local time", () => {
    expect(previousMonth(new Date("2026-11-01T00:30:00Z"), "Europe/London").label).toBe("October 2026");
    expect(previousMonth(new Date("2026-01-01T05:00:00Z"), "America/New_York").label).toBe("December 2025"); // local midnight, 1 Jan
    expect(previousMonth(new Date("2026-01-01T04:00:00Z"), "America/New_York").label).toBe("November 2025"); // still 31 Dec locally
    expect(localParts(new Date("2026-10-25T09:48:00Z"), "Europe/London")).toMatchObject({ day: 25, hour: 9 });
    expect(zonedTimeToUtc(2026, 11, 1, 6, "Europe/London").toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
});

describe("brand colour", () => {
  it("keeps cover text and brand-on-white text at AA contrast", () => {
    expect(coverTextColor("#23395B")).toBe("#ffffff");
    expect(coverTextColor("#F5D547")).toBe("#161A1C");
    for (const brand of ["#23395B", "#F5D547", "#7FDBFF", "#E8E8E8", "#FF4136"]) {
      expect(contrast(brandTextOnWhite(brand), "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(coverTextColor(brand), brand)).toBeGreaterThanOrEqual(4.5);
    }
    expect(brandSummary("#23395B").ratio).toBeGreaterThan(11);
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("blue")).toBe(false);
  });
});

describe("report tokens", () => {
  it("are long, random, and only stored hashed", () => {
    const a = newReportToken();
    const b = newReportToken();
    expect(a.token).not.toBe(b.token);
    expect(isWellFormedToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashReportToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(isWellFormedToken("short")).toBe(false);
  });
});
