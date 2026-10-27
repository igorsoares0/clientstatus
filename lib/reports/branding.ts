import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Branding } from "@/lib/reports/render";
import { getObject } from "@/lib/storage";

/** Branding snapshot for a report; the logo is embedded so sent reports never change. */
export async function loadBranding(db: PrismaClient, workspaceId: string): Promise<Branding> {
  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { name: true, brandPrimaryColor: true, logoStorageKey: true, reportContact: true, reportFooter: true },
  });
  let logoDataUri: string | null = null;
  if (ws.logoStorageKey) {
    try {
      const bytes = await getObject(ws.logoStorageKey);
      const type = ws.logoStorageKey.endsWith(".svg") ? "image/svg+xml" : "image/png";
      logoDataUri = `data:${type};base64,${bytes.toString("base64")}`;
    } catch {
      logoDataUri = null; // a missing file falls back to initials
    }
  }
  return {
    agencyName: ws.name,
    color: ws.brandPrimaryColor,
    logoDataUri,
    contact: ws.reportContact,
    footer: ws.reportFooter,
  };
}
