import { SiteFooter, SiteHeader } from "@/components/landing";

// Public SEO pages (docs/pseo-plan.md): /alternatives, /compare, /templates, /tools, /domain-expiry,
// /for and /errors. proxy.ts lets these prefixes through without a session.

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
