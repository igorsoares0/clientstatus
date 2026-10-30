import type { Metadata } from "next";
import { Clause, LegalPage } from "@/components/legal-page";
import { REFUND_DAYS } from "@/lib/legal";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `Every Client Status charge can be refunded in full within ${REFUND_DAYS} days.`,
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" path="/refunds">
      {({ email }) => (
        <>
          <Clause title={`${REFUND_DAYS}-day money-back guarantee`}>
            <p>
              Every charge can be refunded in full if you ask within {REFUND_DAYS} days of the payment, with no
              questions asked. This covers the first payment and every renewal, on monthly and yearly plans.
            </p>
          </Clause>

          <Clause title="How to ask for a refund">
            <ul>
              <li>Email {email} from your account&apos;s address, or include your Paddle receipt or order number.</li>
              <li>
                Or contact Paddle directly through the link in your receipt email, or at{" "}
                <a href="https://paddle.net" rel="noopener">
                  paddle.net
                </a>
                .
              </li>
            </ul>
            <p>
              Our order process is conducted by our online reseller Paddle.com, the Merchant of Record for all our
              orders, so the refund is issued by Paddle to the original payment method. Your bank may take a few
              business days to show it.
            </p>
          </Clause>

          <Clause title="What happens after a refund">
            <p>
              We cancel the subscription the refunded payment belongs to, so it doesn&apos;t renew. Once it ends,
              monitoring, audits, alerts and new reports stop, but your workspace and data stay available, and you can
              subscribe again at any time.
            </p>
          </Clause>

          <Clause title={`After ${REFUND_DAYS} days`}>
            <p>
              Charges older than {REFUND_DAYS} days are not refunded. You can still cancel at any time from the Billing
              page: your plan stays active until the end of the period you paid for and you are not charged again. Where
              the law where you live gives you more rights, those apply.
            </p>
          </Clause>

          <Clause title="Try it first">
            <p>
              Every new workspace starts with a free {TRIAL_DAYS}-day trial that needs no card, so you can check that
              Client Status fits before paying anything.
            </p>
          </Clause>
        </>
      )}
    </LegalPage>
  );
}
