import { Magnetic } from './Magnetic';

type Props = {
  className?: string;
  /** Wraps each button in a magnetic-hover field (hero / final CTA). */
  magnetic?: boolean;
};

/** App Store / Google Play buttons — intentionally disabled until launch. */
export function StoreButtons({ className, magnetic = false }: Props) {
  const wrap = (node: React.ReactNode, key: string) =>
    magnetic ? (
      <Magnetic key={key} strength={8}>
        {node}
      </Magnetic>
    ) : (
      node
    );

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ''}`}>
      {wrap(
        <span className="btn-store" aria-disabled="true" title="Coming soon">
          <AppleGlyph />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-medium tracking-wide text-paper-300">
              Coming soon on
            </span>
            <span className="mt-0.5 text-[15px] font-semibold">App Store</span>
          </span>
        </span>,
        'apple',
      )}
      {wrap(
        <span className="btn-store" aria-disabled="true" title="Coming soon">
          <PlayGlyph />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-medium tracking-wide text-paper-300">
              Coming soon on
            </span>
            <span className="mt-0.5 text-[15px] font-semibold">Google Play</span>
          </span>
        </span>,
        'play',
      )}
    </div>
  );
}

function AppleGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.54c-.03-2.89 2.36-4.28 2.47-4.35-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.5.96 1.39 2.1 2.95 3.6 2.89 1.44-.06 1.99-.93 3.73-.93 1.74 0 2.23.93 3.76.9 1.56-.03 2.54-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.04-.02-3.02-1.16-3.04-4.59zM14.16 4.06c.79-.96 1.33-2.29 1.18-3.62-1.14.05-2.53.76-3.35 1.72-.73.85-1.38 2.21-1.21 3.51 1.28.1 2.58-.65 3.38-1.61z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M1.571 23.664l10.531-10.501 3.712 3.701-12.519 6.941c-.476.264-1.059.26-1.532-.011l-.192-.13zm9.469-11.56l-10.04 10.011v-20.022l10.04 10.011zm6.274-4.137l4.905 2.719c.482.268.781.77.781 1.314s-.299 1.046-.781 1.314l-4.905 2.719-3.985-3.973 3.985-4.093zm-15.854-7.534c.09-.087.191-.163.303-.227.473-.271 1.056-.275 1.532-.011l12.653 7.015-3.846 3.835-10.642-10.612z" />
    </svg>
  );
}
