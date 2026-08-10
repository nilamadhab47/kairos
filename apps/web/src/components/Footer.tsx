import Link from 'next/link';
import { KairosMark } from './KairosMark';

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06]">
      <div className="mx-auto max-w-wrap px-5 pt-16 sm:px-8 lg:pt-20">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 text-paper-900">
              <KairosMark size={26} className="text-brand-300" />
              <span className="font-display text-sm font-bold tracking-[0.28em]">KAIROS</span>
            </div>
            <p className="display-md mt-6 text-paper-900">
              The right moment, <span className="text-brand-300">every time.</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-paper-300">
              Follow your teams — and never miss what matters.
            </p>
          </div>

          <div className="flex gap-16 lg:gap-24">
            <div className="flex flex-col gap-4">
              <span className="index-label">Product</span>
              <Link
                href="/#features"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                Features
              </Link>
              <Link
                href="/#how"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                How it works
              </Link>
              <Link
                href="/#download"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                Download
              </Link>
            </div>
            <div className="flex flex-col gap-4">
              <span className="index-label">Company</span>
              <Link
                href="/privacy"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                Terms
              </Link>
              <a
                href="mailto:nilamadhab47@gmail.com"
                className="text-[15px] text-paper-400 transition-colors hover:text-paper-900"
              >
                Contact
              </a>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-[13px] text-paper-300 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Nilamadhab Senapati. All rights reserved.</span>
          <span>Made for people who care about the game.</span>
        </div>
      </div>

      {/* Closing beat: the wordmark as a typographic object, sinking into black */}
      <div className="pointer-events-none mt-4 px-2 pb-0" aria-hidden>
        <span className="wordmark-massive translate-y-[18%]">Kairos</span>
      </div>
    </footer>
  );
}
