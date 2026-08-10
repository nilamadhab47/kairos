import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Nav } from './Nav';

type Props = {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalPage({ eyebrow, title, updated, children }: Props) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-36 sm:px-8">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="display-lg mt-4 text-paper-900">{title}</h1>
        <p className="mt-4 text-sm text-paper-300">Last updated: {updated}</p>
        <div className="hairline mt-10" />
        <div className="prose-legal mt-4">{children}</div>
      </main>
      <Footer />
    </>
  );
}
