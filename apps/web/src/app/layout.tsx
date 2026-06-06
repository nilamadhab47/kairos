import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kairo — The right moment, not just the right time.',
  description:
    'Smart event aggregator with AI-powered contextual notifications across sports, calendar, and live streams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
