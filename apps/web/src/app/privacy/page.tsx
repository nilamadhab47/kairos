import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Kairos collects, uses and protects your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="10 August 2026">
      <p>
        Kairos (&ldquo;the app&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by{' '}
        <strong>Nilamadhab Senapati</strong>, an individual based in India. This policy explains
        what data Kairos collects, why, and what your choices are. The short version: we collect
        the minimum needed to show you your sports and remind you before they start. We do not
        sell your data, and we never will.
      </p>

      <h2>What we collect</h2>
      <h3>Account information</h3>
      <ul>
        <li>
          <strong>Name and email address</strong> — when you create an account with email, or sign
          in with Google or Apple.
        </li>
        <li>
          <strong>Password</strong> — stored only as a cryptographic hash if you sign up with
          email. We never see or store your plain-text password.
        </li>
        <li>
          <strong>Sign-in provider profile</strong> — if you use Google or Apple sign-in, we
          receive your name and email from that provider. We do not receive your contacts, photos
          or anything else.
        </li>
      </ul>

      <h3>Preferences</h3>
      <ul>
        <li>
          <strong>Your follows</strong> — the sports, competitions, teams and series you choose to
          follow inside the app.
        </li>
        <li>
          <strong>Notification settings</strong> — reminder lead time, quiet-night preferences and
          whether push notifications are enabled.
        </li>
        <li>
          <strong>Timezone</strong> — so event times and reminders are correct where you are.
        </li>
      </ul>

      <h3>Device information</h3>
      <ul>
        <li>
          <strong>Push notification token</strong> — a device identifier issued by Apple or Google
          that lets us deliver reminders to your device. It is deleted when you sign out or delete
          your account.
        </li>
      </ul>

      <h3>Feedback</h3>
      <ul>
        <li>
          <strong>Messages you send us</strong> — if you use &ldquo;Send feedback&rdquo; or
          &ldquo;Report an issue&rdquo; in the app, we store the message and your account email so
          we can respond.
        </li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>No location tracking.</li>
        <li>No contacts, photos or files.</li>
        <li>No advertising identifiers, and no third-party advertising or tracking SDKs.</li>
        <li>No browsing history outside the app.</li>
      </ul>

      <h2>How we use your data</h2>
      <ul>
        <li>To build your personal timeline and calendar of events you follow.</li>
        <li>To send you the reminders you asked for, when you asked for them.</li>
        <li>To keep your account secure and let you sign in.</li>
        <li>To respond to feedback and fix issues you report.</li>
      </ul>
      <p>
        We do not sell or rent your personal data, and we do not use it for advertising. We may
        look at aggregated, de-identified usage patterns to improve the product.
      </p>

      <h2>Who we share data with</h2>
      <p>We share data only with the services required to run Kairos:</p>
      <ul>
        <li>
          <strong>Hosting infrastructure</strong> — our servers and database run on managed cloud
          infrastructure (currently Railway). Your data is stored there.
        </li>
        <li>
          <strong>Push delivery</strong> — reminders are delivered through Expo&apos;s push
          notification service and Apple/Google&apos;s notification systems.
        </li>
        <li>
          <strong>Sign-in providers</strong> — Google and Apple, if you choose to sign in with
          them.
        </li>
      </ul>
      <p>
        Sports schedules and results come from third-party sports data providers. No personal data
        about you is sent to them.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        Your data is kept while your account is active. You can delete your account at any time
        from <strong>Settings → Account</strong> in the app, which permanently removes your
        account, follows, device tokens and notification history. You can also email us at{' '}
        <a href="mailto:nilamadhab47@gmail.com">nilamadhab47@gmail.com</a> and we will delete your
        data within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        You can request a copy of your data, correct it, or ask us to delete it by emailing{' '}
        <a href="mailto:nilamadhab47@gmail.com">nilamadhab47@gmail.com</a>. If you are in a
        jurisdiction with specific data protection rights (such as the GDPR in the EU or the DPDP
        Act in India), we will honour requests consistent with those laws.
      </p>

      <h2>Children</h2>
      <p>
        Kairos is not directed at children under 13, and we do not knowingly collect data from
        them. If you believe a child has created an account, contact us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit (TLS) and stored on access-controlled infrastructure.
        Passwords are hashed with a modern algorithm. No system is perfectly secure, but we keep
        the attack surface small by collecting little in the first place.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we make material changes, we will update the date at the top of this page and notify
        you in the app before the changes take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <a href="mailto:nilamadhab47@gmail.com">nilamadhab47@gmail.com</a>
      </p>
    </LegalPage>
  );
}
