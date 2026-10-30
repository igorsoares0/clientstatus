import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalPage } from "@/components/legal-page";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/config";
import { CHANGE_NOTICE_DAYS, REFUND_DAYS } from "@/lib/legal";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Client Status.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" path="/terms">
      {({ name, email }) => (
        <>
          <Clause title="1. Who we are">
            <p>
              Client Status is operated by {name}, an individual based in Brazil (&quot;we&quot;, &quot;us&quot;). These
              terms are an agreement between us and you, the person or business that creates an account
              (&quot;you&quot;). By creating an account or using the service you accept them. Questions: {email}.
            </p>
          </Clause>

          <Clause title="2. The service">
            <p>
              Client Status monitors websites (uptime, SSL certificates and domain expiry), runs technical audits
              (broken links and basic SEO checks), sends alerts to your team and produces monthly reports with your
              branding for your clients. It is a business tool: you confirm that you use it for your trade, business or
              profession.
            </p>
          </Clause>

          <Clause title="3. Your account">
            <ul>
              <li>Give accurate information and keep your password secret.</li>
              <li>
                You are responsible for what happens in your workspace, including the actions of anyone you give access
                to it.
              </li>
              <li>Tell us promptly if you believe your account has been accessed without permission.</li>
            </ul>
          </Clause>

          <Clause title="4. Websites and recipients you add">
            <ul>
              <li>
                Only add websites you own or are authorised to monitor, for example by the client whose site it is.
              </li>
              <li>
                Only add report recipients who expect your reports, such as your clients&apos; contacts. Reports are not
                a channel for unsolicited email.
              </li>
              <li>
                If a website owner objects to being monitored, we may pause monitoring of that website and will tell you
                why.
              </li>
            </ul>
          </Clause>

          <Clause title="5. Acceptable use">
            <p>You must not:</p>
            <ul>
              <li>use the service to overload, attack or probe websites, servers or networks;</li>
              <li>try to get around plan limits, rate limits or security controls, or access other workspaces;</li>
              <li>upload unlawful content or content you have no right to use, such as logos in your branding;</li>
              <li>resell or sublicense the service as your own without our written permission.</li>
            </ul>
          </Clause>

          <Clause title="6. Free trial">
            <p>
              New workspaces get a {TRIAL_DAYS}-day trial with {PLANS[TRIAL_PLAN].name} features. No card is needed.
              When the trial ends without a subscription, monitoring, audits, alerts and new reports stop until you
              choose a plan. Your existing data stays available to you.
            </p>
          </Clause>

          <Clause title="7. Plans, billing and payment">
            <ul>
              <li>
                Plans and prices are shown in US dollars on the Billing page. Subscriptions are billed in advance,
                monthly or yearly, and renew automatically until cancelled.
              </li>
              <li>
                Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record
                for all our orders. Paddle provides all customer service inquiries and handles returns. Paddle adds
                sales tax or VAT where it applies.
              </li>
              <li>
                Plan limits (websites, check frequency, team members, audit size, report branding) are part of each
                plan. Plan changes apply straight away and are prorated: an upgrade charges the difference for the rest
                of the period, and a downgrade leaves a credit with Paddle that pays towards later charges.
              </li>
              <li>
                If a payment fails, the service keeps running for {PAST_DUE_GRACE_DAYS} days while Paddle retries. After
                that, monitoring stops until the payment succeeds. Your data is kept.
              </li>
            </ul>
          </Clause>

          <Clause title="8. Cancellation and refunds">
            <p>
              You can cancel at any time from the Billing page. Your plan stays active until the end of the period you
              have paid for, and you are not charged again. Every charge can be refunded in full within {REFUND_DAYS}{" "}
              days, as set out in our <Link href="/refunds">Refund Policy</Link>.
            </p>
          </Clause>

          <Clause title="9. Your data">
            <p>
              You own the content you put into Client Status: client details, website addresses, branding and reports.
              You allow us to store and process it only to provide the service to you. How we handle personal data is
              described in our <Link href="/privacy">Privacy Policy</Link>. You can ask us to delete your account and
              data at any time.
            </p>
          </Clause>

          <Clause title="10. Accuracy and availability">
            <p>
              Monitoring depends on networks and on websites we don&apos;t control. Some checks are inconclusive (for
              example when a site blocks bots or times out), audits can be partial, and reports disclose such gaps
              rather than estimate them. We work to keep the service running and accurate, but we don&apos;t promise
              that it will be uninterrupted or that it will detect every outage or problem. There is no service level
              agreement unless we sign one with you separately.
            </p>
          </Clause>

          <Clause title="11. Limitation of liability">
            <p>
              To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, lost
              revenue or lost data arising from your use of the service, and our total liability for any claim is
              limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits
              liability that cannot be limited by law.
            </p>
          </Clause>

          <Clause title="12. Suspension and termination">
            <p>
              We may suspend or close an account that breaks these terms, puts the service or others at risk, or stays
              unpaid, and we will tell you why unless the law or an ongoing abuse prevents it. You may stop using the
              service at any time and ask us to delete your data.
            </p>
          </Clause>

          <Clause title="13. Changes to these terms">
            <p>
              We may update these terms as the service changes. For material changes we will email the workspace owner
              at least {CHANGE_NOTICE_DAYS} days before they take effect. If you don&apos;t agree, you can cancel before
              then.
            </p>
          </Clause>

          <Clause title="14. Governing law">
            <p>
              These terms are governed by the laws of Brazil. This does not take away any mandatory protection you have
              under the law of the country where you live or do business.
            </p>
          </Clause>

          <Clause title="15. Contact">
            <p>Write to {email} with any question about these terms.</p>
          </Clause>
        </>
      )}
    </LegalPage>
  );
}
