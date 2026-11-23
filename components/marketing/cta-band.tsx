import Link from "next/link";
import { Container } from "@/components/landing";
import { TRIAL_DAYS } from "@/lib/plans";

/** Dark closing call to action: start the free trial. Used by the landing page and marketing pages. */
export function CtaBand({
  title = "Add your first client website today.",
  text = `${TRIAL_DAYS} days free, no card. Your first report can go out on the 1st.`,
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="bg-ink text-white">
      <Container className="flex flex-col gap-5 py-14 tbl:flex-row tbl:items-center">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[30px] leading-[1.12] font-semibold font-stretch-85%">{title}</h2>
          <p className="m-0 text-[15px] text-[#D5D8D4]">{text}</p>
        </div>
        <Link
          href="/sign-up"
          className="inline-flex h-[42px] items-center justify-center bg-surface px-4 text-sm font-semibold whitespace-nowrap text-ink no-underline hover:bg-nav-hover hover:text-ink tbl:ml-auto"
        >
          Start {TRIAL_DAYS}-day free trial
        </Link>
      </Container>
    </section>
  );
}
