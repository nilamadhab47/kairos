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
    'sports calendar app',
    'match reminders',
    'football fixtures',
    'F1 race schedule',
    'cricket match alerts',
    'sports notifications',
    'Premier League fixtures',
    'La Liga schedule',
    'UEFA Champions League calendar',
    'multi-sport calendar',
    'live scores',
    'never miss a match',
    'sports schedule sync',
    'team match countdown',
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Kairos',
  operatingSystem: 'iOS, Android',
  applicationCategory: 'SportsApplication',
  description:
    'Follow your teams across football, F1 and cricket. Get smart reminders before every match. Sync with your calendar.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  url: SITE_URL,
  aggregateRating: undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans">
        <SmoothScroll>{children}</SmoothScroll>
        <Cursor />
      </body>
    </html>
  );
}
