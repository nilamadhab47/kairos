import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Kairos.',
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated="10 August 2026">
      <p>
        These terms govern your use of the Kairos mobile application and the website at{' '}
        <a href="https://kaiiros.app">kaiiros.app</a> (together, &ldquo;the Service&rdquo;). The
        Service is operated by <strong>Nilamadhab Senapati</strong>, an individual based in India
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the Service, you
        agree to these terms.
      </p>

      <h2>1. The service</h2>
      <p>
        Kairos lets you follow sports, competitions, teams and series, see upcoming events on a
        personal timeline and calendar, and receive reminders before events start. The Service is
        provided free of charge during its current phase. We may introduce paid features in the
        future; if we do, they will be clearly marked and never applied retroactively.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must provide accurate information when creating an account.</li>
        <li>You are responsible for keeping your credentials secure.</li>
        <li>You must be at least 13 years old to use the Service.</li>
        <li>
          You may delete your account at any time from Settings → Account, or by emailing{' '}
          <a href="mailto:nilamadhab47@gmail.com">nilamadhab47@gmail.com</a>.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for anything unlawful.</li>
        <li>
          Attempt to probe, scrape, overload, reverse-engineer or disrupt the Service or its
          infrastructure.
        </li>
        <li>Access another person&apos;s account without permission.</li>
        <li>Resell or redistribute data from the Service without our written consent.</li>
      </ul>
      <p>We may suspend or terminate accounts that violate these terms.</p>

      <h2>4. Sports data</h2>
      <p>
        Event schedules, results, team names and logos are sourced from third-party providers and
        belong to their respective owners. We work to keep this data accurate and timely, but we
        do not guarantee it. Kickoff times change, matches get postponed, and providers make
        mistakes. Do not rely on the Service where an error would cause you loss —
        double-check anything important with an official source.
      </p>

      <h2>5. Notifications</h2>
      <p>
        Reminders depend on your device settings, network conditions and Apple/Google delivery
        systems, which are outside our control. We aim for reliable delivery but cannot guarantee
        that every notification arrives on time or at all.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Kairos name, mark, design and software are our property. Team and competition names,
        crests and logos belong to their respective owners and are used for identification only.
        No affiliation with or endorsement by any league, team or governing body is implied.
      </p>

      <h2>7. Disclaimer of warranties</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
        warranties of any kind, express or implied. We do not warrant that the Service will be
        uninterrupted, error-free or that data will be accurate.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for any indirect, incidental,
        special or consequential damages arising from your use of the Service — including missed
        events, incorrect schedules or failed notifications. Our total liability for any claim is
        limited to the amount you paid us in the twelve months before the claim (currently zero).
      </p>

      <h2>9. Changes to the service and these terms</h2>
      <p>
        We may modify or discontinue features at any time. If we make material changes to these
        terms, we will update the date above and notify you in the app. Continuing to use the
        Service after changes take effect means you accept the new terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of <strong>India</strong>. Any disputes will be
        subject to the exclusive jurisdiction of the courts of India.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms:{' '}
        <a href="mailto:nilamadhab47@gmail.com">nilamadhab47@gmail.com</a>
      </p>
    </LegalPage>
  );
}
