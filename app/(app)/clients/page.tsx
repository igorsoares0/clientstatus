import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBody, PanelSkeleton } from "@/components/shell/page";
import { db } from "@/lib/db";
import { countClients, listClients, type ClientTab } from "@/lib/data/clients";
import { formatMonthYear, formatShortDate } from "@/lib/format";
import { first, hrefWith, type Params } from "@/lib/search-params";
import { requireMembership } from "@/lib/session";
import { AddClientButton } from "./add-client-button";
import { ClientSearch } from "./client-search";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage({ searchParams }: PageProps<"/clients">) {
  return (
    <Suspense
      fallback={
        <>
          <header className="px-7 pt-[18px] pb-3.5">
            <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Clients</h1>
          </header>
          <PageBody>
            <PanelSkeleton />
          </PageBody>
        </>
      }
    >
      <Clients searchParams={searchParams} />
    </Suspense>
  );
}

async function Clients({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireMembership();
  const tz = ctx.workspace.timezone;
  const tab: ClientTab = first(params.tab) === "archived" ? "archived" : "active";
  const q = first(params.q) ?? "";
  const [clients, counts] = await Promise.all([listClients(db, ctx, { tab, q }), countClients(db, ctx)]);
  const canManage = ctx.role !== "member";
  const now = new Date();

  const tabs: { value: ClientTab; label: string; n: number }[] = [
    { value: "active", label: "Active", n: counts.active },
    { value: "archived", label: "Archived", n: counts.archived },
  ];

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-7 pt-[18px] pb-3.5">
        <h1 className="m-0 text-[22px] font-semibold font-stretch-85%">Clients</h1>
        <span className="text-[13px] text-muted tabular">
          {counts.active} active · {counts.archived} archived
        </span>
        {canManage ? <AddClientButton /> : null}
      </header>
      <PageBody>
        {counts.active + counts.archived === 0 ? (
          <section className="flex max-w-[760px] flex-col border border-border bg-surface px-6 py-6">
            <h2 className="m-0 text-2xl font-semibold font-stretch-85%">No clients yet</h2>
            <p className="m-0 mt-2 max-w-[600px] leading-normal text-ink-2">
              Group websites by the client they belong to. Each client gets its own monthly report, recipients and
              internal notes. Websites without a client appear as Unassigned.
              {canManage ? "" : " Ask an admin to add clients."}
            </p>
          </section>
        ) : (
          <div className="flex min-w-0 flex-col">
            <div role="search" aria-label="Filter clients" className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
              <ClientSearch q={q} />
              <div role="group" aria-label="Show" className="flex border border-border-strong bg-surface">
                {tabs.map((t) => (
                  <Link
                    key={t.value}
                    href={hrefWith("/clients", params, { tab: t.value === "active" ? null : t.value })}
                    aria-current={tab === t.value ? "true" : undefined}
                    className={`flex h-8 items-center gap-1.5 px-3 text-[13px] no-underline ${
                      tab === t.value ? "bg-ink text-white hover:text-white" : "text-ink"
                    }`}
                  >
                    {t.label} <span className="font-mono text-xs opacity-80">{t.n}</span>
                  </Link>
                ))}
              </div>
              <span aria-live="polite" className="text-[13px] text-muted">
                {q ? `${clients.length} match${clients.length === 1 ? "" : "es"}` : ""}
              </span>
            </div>

            <section aria-label="Client list" className="border border-border bg-surface">
              {clients.length === 0 ? (
                <div className="flex flex-col gap-2 px-4 py-7">
                  <span className="font-semibold">{q ? `No clients match “${q}”` : `No ${tab} clients`}</span>
                  {q ? (
                    <span className="text-[13px] text-muted">
                      Search covers client names, contacts and website hostnames.
                    </span>
                  ) : null}
                </div>
              ) : (
                <>
                  <ul aria-label="Clients" className="m-0 list-none p-0 tbl:hidden">
                    {clients.map((c) => (
                      <li key={c.id} className="flex flex-col gap-0.5 border-b border-rule px-3 py-2.5">
                        <Link href={`/clients/${c.id}`} className="font-semibold">
                          {c.name}
                        </Link>
                        <span className="text-[13px] text-muted">
                          {c.activeSites + c.pausedSites} website{c.activeSites + c.pausedSites === 1 ? "" : "s"}
                          {c.contactName ? ` · ${c.contactName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <table className="hidden w-full border-collapse text-[13.5px] tbl:table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs tracking-[.03em] text-muted">
                        <th scope="col" className="px-4 py-2 font-normal">
                          CLIENT
                        </th>
                        <th scope="col" className="px-4 py-2 font-normal">
                          CONTACT
                        </th>
                        <th scope="col" className="px-4 py-2 font-normal">
                          WEBSITES
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-normal">
                          CLIENT SINCE
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c) => (
                        <tr key={c.id} className="border-b border-rule align-top hover:bg-row-hover">
                          <td className="px-4 py-2.5">
                            <span className="flex flex-col">
                              <Link
                                href={`/clients/${c.id}`}
                                className={`font-semibold ${c.archivedAt ? "text-muted" : ""}`}
                              >
                                {c.name}
                              </Link>
                              {c.archivedAt ? (
                                <span className="text-xs text-muted">
                                  Archived {formatShortDate(c.archivedAt, tz, now)} · history kept
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex flex-col">
                              <span className={c.contactName ? "" : "text-muted"}>{c.contactName || "—"}</span>
                              {c.contactEmail ? (
                                <span className="font-mono text-xs text-muted">{c.contactEmail}</span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular">
                            <span className="flex flex-col">
                              <span>
                                {c.activeSites + c.pausedSites} website{c.activeSites + c.pausedSites === 1 ? "" : "s"}
                              </span>
                              {c.activeSites + c.pausedSites ? (
                                <span className="text-xs text-muted">
                                  {c.activeSites} monitored · {c.pausedSites} paused
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                            {formatMonthYear(c.createdAt, tz)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <div className="flex justify-between px-4 py-2 text-xs text-muted">
                <span>Sorted by name</span>
              </div>
            </section>
          </div>
        )}
      </PageBody>
    </>
  );
}
