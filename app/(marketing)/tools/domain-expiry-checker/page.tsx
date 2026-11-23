import type { Metadata } from "next";
import { DomainChecker } from "@/components/tools/domain-checker";
import { ToolPage } from "@/components/tools/tool-page";
import { getTool } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";

const tool = getTool("domain-expiry-checker");

export const metadata: Metadata = pageMetadata(tool.seo);

export default function Page() {
  return (
    <ToolPage tool={tool}>
      <DomainChecker />
    </ToolPage>
  );
}
