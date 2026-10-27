"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { UnsavedBar } from "@/components/ui/unsaved-bar";
import { useToast } from "@/components/ui/toast";
import { brandSummary, DEFAULT_BRAND, isHexColor, normalizeHex } from "@/lib/color";
import { saveBrandingAction } from "./actions";

type State = { name: string; color: string; contact: string; footer: string };
const SWATCHES = ["#23395B", "#1F5F4A", "#7A2E39", "#3D3A73", "#161A1C"];
const input = "h-9 border border-border-strong bg-surface px-2.5 text-sm font-normal";

export function BrandingForm({
  canManage,
  initial,
  logoDataUri,
  footerAllowed,
}: {
  canManage: boolean;
  initial: State;
  logoDataUri: string | null;
  /** Starter plans can't set a custom footer (FR-BILL-04); the server enforces it too. */
  footerAllowed: boolean;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [cur, setCur] = useState(initial);
  const [logo, setLogo] = useState(logoDataUri);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const validColor = cur.color === "" || isHexColor(cur.color);
  const brand = brandSummary(validColor && cur.color ? normalizeHex(cur.color) : DEFAULT_BRAND);
  const changes = (Object.keys(cur) as (keyof State)[])
    .filter((k) => cur[k] !== saved[k])
    .map((k) => ({ name: "agency name", color: "brand colour", contact: "contact", footer: "footer" })[k]);

  const save = () =>
    startTransition(async () => {
      const r = await saveBrandingAction(cur);
      if (!r.ok) return setError(r.error);
      setSaved(cur);
      setError(null);
      toast.show("Branding saved — it applies to newly generated reports");
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    if (file.size > 1024 * 1024) return setLogoError(`${file.name} is larger than 1 MB.`);
    if (!["image/png", "image/svg+xml"].includes(file.type))
      return setLogoError(`${file.name} isn’t a PNG or SVG file.`);
    const body = new FormData();
    body.append("logo", file);
    startTransition(async () => {
      const res = await fetch("/api/branding/logo", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: string; dataUri?: string };
      if (!res.ok || !json.dataUri) return setLogoError(json.error ?? "Upload failed. Try again.");
      setLogo(json.dataUri);
      toast.show("Logo uploaded");
    });
  };
  const removeLogo = () =>
    startTransition(async () => {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      if (res.ok) {
        setLogo(null);
        toast.show("Logo removed — reports show your initials");
      }
    });

  const initials = cur.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <fieldset disabled={!canManage} className="m-0 flex flex-wrap items-start gap-5 border-0 p-0">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-4">
        <section aria-labelledby="h-id" className="flex flex-col gap-3 border border-border bg-surface px-4 py-3.5">
          <h2 id="h-id" className="m-0 text-[15px] font-semibold">
            Agency identity
          </h2>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Agency name on reports
            <input
              value={cur.name}
              maxLength={80}
              onChange={(e) => setCur((c) => ({ ...c, name: e.target.value }))}
              className={input}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-semibold">Logo</span>
            <div className="flex flex-wrap items-center gap-2">
              {logo ? (
                <span className="flex h-12 items-center border border-border bg-white px-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URI preview */}
                  <img src={logo} alt="Current logo" className="max-h-9 max-w-[160px]" />
                </span>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={pending}>
                {logo ? "Replace" : "Choose file"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml"
                className="sr-only"
                aria-label="Logo file"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              {logo ? (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="border-0 bg-transparent p-0 text-[13px] text-muted underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {logoError ? (
              <span role="alert" className="text-[12.5px] text-down">
                {logoError}
              </span>
            ) : null}
            <span className="text-[12.5px] text-muted">
              PNG or SVG, at least 300 px wide, under 1 MB. Shown on a white plate so it stays legible on any brand
              colour. Without a logo, reports show your initials.
            </span>
          </div>
        </section>

        <section aria-labelledby="h-col" className="flex flex-col gap-3 border border-border bg-surface px-4 py-3.5">
          <h2 id="h-col" className="m-0 text-[15px] font-semibold">
            Brand colour
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCur((c) => ({ ...c, color: s }))}
                aria-label={`Use ${s}`}
                aria-pressed={normalizeHex(cur.color || DEFAULT_BRAND) === s.toLowerCase()}
                className="size-8 border border-border-strong aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-ink"
                style={{ background: s }}
              />
            ))}
            <label className="ml-2 flex items-center gap-1.5 text-[13px]">
              Hex
              <input
                value={cur.color}
                onChange={(e) => setCur((c) => ({ ...c, color: e.target.value }))}
                placeholder={DEFAULT_BRAND}
                aria-invalid={!validColor}
                className={`${input} h-8 w-28 font-mono ${validColor ? "" : "border-down"}`}
              />
            </label>
          </div>
          {validColor ? (
            <span className="text-[13px] text-up">
              ● Cover text contrast {brand.ratio} : 1 — passes AA ({brand.coverText === "#ffffff" ? "white" : "dark"}{" "}
              text)
            </span>
          ) : (
            <span role="alert" className="text-[13px] text-down">
              Use a hex colour like #23395B.
            </span>
          )}
          <span className="text-[12.5px] text-muted">
            Used for the cover, rules and section numbers only. Warning and error colours never change.
          </span>
        </section>

        <section aria-labelledby="h-ft" className="flex flex-col gap-3 border border-border bg-surface px-4 py-3.5">
          <h2 id="h-ft" className="m-0 text-[15px] font-semibold">
            Contact &amp; footer
          </h2>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            “Questions about this report?” contact
            <input
              value={cur.contact}
              maxLength={120}
              onChange={(e) => setCur((c) => ({ ...c, contact: e.target.value }))}
              placeholder="e.g. Priya Raman, Account Director"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Footer line
            <input
              value={cur.footer}
              maxLength={90}
              disabled={!footerAllowed}
              onChange={(e) => setCur((c) => ({ ...c, footer: e.target.value }))}
              placeholder={footerAllowed ? "hello@agency.com · +44 20 0000 0000" : "Prepared with Client Status"}
              className={input}
            />
            <span className="text-[12.5px] font-normal text-muted">
              {footerAllowed ? (
                `${cur.footer.length} of 90 characters · printed on the report`
              ) : (
                <>
                  Custom footers come with Growth and Pro. On Starter, reports end with “Prepared with Client Status”.{" "}
                  <Link href="/billing#plans">Compare plans</Link>
                </>
              )}
            </span>
          </label>
        </section>
      </div>

      <aside
        aria-label="Cover preview"
        className="sticky top-5 flex w-full max-w-[360px] min-w-0 flex-[1_1_300px] flex-col gap-2"
      >
        <span className="text-xs tracking-[.03em] text-muted">COVER PREVIEW</span>
        <div className="border border-border bg-white p-4">
          <div className="flex flex-col gap-6 px-4 py-4" style={{ background: brand.cover, color: brand.coverText }}>
            <div className="flex items-center gap-2 text-[12px] font-bold">
              {logo ? (
                <span className="flex h-7 items-center bg-white px-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URI preview */}
                  <img src={logo} alt="" className="max-h-5 max-w-[90px]" />
                </span>
              ) : (
                <span
                  className="flex size-7 items-center justify-center border text-[10px]"
                  style={{ borderColor: brand.coverText }}
                >
                  {initials || "?"}
                </span>
              )}
              {cur.name || "Your agency"}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] tracking-[.1em]">WEBSITE HEALTH REPORT</span>
              <span className="text-[22px] leading-tight font-semibold font-stretch-82%">Client name</span>
              <span className="text-[11px]">Month 2026</span>
            </div>
          </div>
          <div className="mt-3 text-[10px] tracking-[.08em]" style={{ color: brand.onWhite }}>
            <b>SUMMARY</b>
          </div>
          <div className="mt-6 text-[9px] text-muted">{cur.footer || "Footer line"}</div>
        </div>
      </aside>
      {error ? (
        <p role="alert" className="m-0 w-full text-[13px] text-down">
          {error}
        </p>
      ) : null}
      <div className="w-full">
        <UnsavedBar
          changes={changes}
          onSave={save}
          onDiscard={() => setCur(saved)}
          pending={pending}
          blocked={validColor ? (cur.name.trim() ? null : "Enter your agency’s name.") : "Fix the brand colour."}
        />
      </div>
    </fieldset>
  );
}
