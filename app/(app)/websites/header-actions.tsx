"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, UploadIcon } from "@/components/ui/icons";
import { AddSiteDialog } from "./add-site-dialog";
import { ImportDialog } from "./import-dialog";

type Option = { id: string; name: string };

/**
 * "Import CSV" and "Add website". Other pages link to `/websites?add=1`
 * (or `?add=<clientId>` to preselect a client) to open the add dialog directly.
 */
export function HeaderActions({
  clients,
  slotsFree,
  maxSites,
}: {
  clients: Option[];
  slotsFree: number;
  maxSites: number;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addParam = params.get("add");
  const [addOpen, setAddOpen] = useState(addParam !== null);
  const [importOpen, setImportOpen] = useState(false);
  const preselected = addParam && clients.some((c) => c.id === addParam) ? addParam : "";

  const closeAdd = () => {
    setAddOpen(false);
    if (addParam !== null) {
      const next = new URLSearchParams(params.toString());
      next.delete("add");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  return (
    <div className="flex gap-2 self-center">
      <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
        <UploadIcon />
        Import CSV
      </Button>
      <Button size="sm" onClick={() => setAddOpen(true)}>
        <PlusIcon />
        Add website
      </Button>
      <AddSiteDialog
        open={addOpen}
        onClose={closeAdd}
        clients={clients}
        slotsFree={slotsFree}
        maxSites={maxSites}
        defaultClientId={preselected}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} slotsFree={slotsFree} />
    </div>
  );
}
