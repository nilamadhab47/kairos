'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KairosMark } from './KairosMark';

const LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/#features', label: 'Features' },
  { href: '/#how', label: 'How it works' },
] as const;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled ? 'nav-blur' : ''}`}
    >
      <nav className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-paper-900">
          <KairosMark size={26} className="text-brand-300" />
          <span className="font-display text-[15px] font-bold tracking-[0.28em]">KAIROS</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-paper-400 transition-colors hover:text-paper-900"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <Link href="/#download" className="btn-primary !px-5 !py-2.5 !text-[13px]">
          Get the app
        </Link>
      </nav>
    </header>
  );
}
