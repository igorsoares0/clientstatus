import type { Metadata } from "next";
import { HealthReportForm } from "@/components/tools/health-report-form";
import { ToolPage } from "@/components/tools/tool-page";
import { getTool } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";

const tool = getTool("website-health-report");

export const metadata: Metadata = pageMetadata(tool.seo);

export default function Page() {
  return (
    <ToolPage tool={tool}>
      <HealthReportForm />
    </ToolPage>
  );
}
