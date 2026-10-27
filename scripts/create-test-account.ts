// Creates a verified local test account with a workspace, two clients and a
// few public websites, so the app can be tried without the sign-up flow.
//   npm run account:test -- [email] [password]
// Development only: refuses to run against anything but a localhost database.

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "@/lib/db";
import { createClient } from "@/lib/data/clients";
import { addRecipient } from "@/lib/data/reports";
import { createSite } from "@/lib/data/sites";
import { createWorkspaceForUser } from "@/lib/data/workspace";
import { env } from "@/lib/env";
import { normalizeSiteUrl } from "@/lib/url";

const SITES: { url: string; client: string }[] = [
  { url: "example.com", client: "Harbour Dental Group" },
  { url: "www.iana.org", client: "Harbour Dental Group" },
  { url: "www.wikipedia.org", client: "Northfold Bakery" },
];

async function main() {
  const [email = "teste@clientstatus.local", password = "ClientStatus-teste-2026"] = process.argv.slice(2);
  const url = new URL(env().DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Refusing to run against a non-local database.");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");

  const db = createPrismaClient();
  try {
    if (await db.user.findUnique({ where: { email } })) throw new Error(`${email} already exists.`);

    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        name: "Conta de Teste",
        email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    const { workspaceId } = await createWorkspaceForUser(db, userId, {
      name: "Estúdio Teste",
      timezone: "America/Sao_Paulo",
    });
    const ctx = { userId, workspaceId, role: "owner" as const };

    const clients = new Map<string, string>();
    for (const name of new Set(SITES.map((s) => s.client))) {
      const client = await createClient(db, ctx, { name, contactName: "", contactEmail: "" });
      clients.set(name, client.id);
    }
    for (const site of SITES) {
      const normalized = normalizeSiteUrl(site.url);
      if (!normalized.ok) throw new Error(normalized.error);
      await createSite(db, ctx, { url: normalized.value, clientId: clients.get(site.client) });
    }
    await addRecipient(db, ctx, clients.get("Harbour Dental Group")!, {
      email: "sarah@harbour.example",
      name: "Sarah",
    });

    console.log(`Created ${email} / ${password} in workspace "Estúdio Teste" with ${SITES.length} websites.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
