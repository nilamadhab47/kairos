import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Cursor } from '@/components/Cursor';
import { SmoothScroll } from '@/components/SmoothScroll';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const SITE_URL = 'https://kaiiros.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Kairos — Never miss the moments that matter',
    template: '%s · Kairos',
  },
  description:
    'Kairos follows your teams, leagues and races — and nudges you right before the moments you care about. No feeds. No noise. Just your sports, right on time.',
  keywords: [
    'sports calendar',
    'match reminders',
    'football fixtures',
    'F1 schedule',
    'cricket fixtures',
    'sports notifications',
  ],
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Kairos',
    title: 'Kairos — Never miss the moments that matter',
    description:
      'Follow your teams, leagues and races. Get nudged right before kickoff. No feeds, no noise.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kairos — Never miss the moments that matter',
    description:
      'Follow your teams, leagues and races. Get nudged right before kickoff. No feeds, no noise.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#05070A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
        <SmoothScroll>{children}</SmoothScroll>
        <Cursor />
      </body>
    </html>
  );
}
