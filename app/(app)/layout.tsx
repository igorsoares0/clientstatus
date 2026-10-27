import { Suspense } from "react";
import { BillingNotice } from "@/components/shell/billing-notice";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { Sidebar, SidebarFallback } from "@/components/shell/sidebar";
import { StatusBar, StatusBarFallback } from "@/components/shell/status-bar";
import { ToastProvider } from "@/components/ui/toast";

// Session-dependent parts stream behind Suspense so the frame itself is part
// of the static shell (Cache Components).

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only-focusable bg-surface px-3 py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col nav:flex-row">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={null}>
            <BillingNotice />
          </Suspense>
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
          <Suspense fallback={<StatusBarFallback />}>
            <StatusBar />
          </Suspense>
        </div>
      </div>
      <KeyboardShortcuts />
    </ToastProvider>
  );
}
