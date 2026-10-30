// Facts shared by the legal pages (/terms, /privacy, /refunds). Keep them in step with the product:
// retention comes from the code that enforces it, prices and grace from billing config.

/** Shown as "Last updated" on every legal page. Change it whenever a page's substance changes. */
export const LEGAL_UPDATED = "2026-10-29";

/** Full refund on any charge (first payment and renewals, monthly or yearly) requested within this many days. */
export const REFUND_DAYS = 14;

/** Days in advance that material changes to the terms or privacy policy are announced by email. */
export const CHANGE_NOTICE_DAYS = 15;

/** Service providers that process personal data. Add the database host here if it isn't Hetzner (e.g. Neon). */
export const SUBPROCESSORS = [
  { name: "Hetzner Online GmbH", purpose: "Servers and database hosting", location: "Germany / Finland (EU)" },
  { name: "Resend, Inc.", purpose: "Delivery of alert, account and report emails", location: "United States" },
  {
    name: "Paddle.com Market Ltd",
    purpose: "Checkout, payments, invoicing and tax (Merchant of Record)",
    location: "United Kingdom",
  },
] as const;

export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund Policy" },
] as const;
