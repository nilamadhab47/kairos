'use client';

import { useEffect, useState } from 'react';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Desktop with a real pointer — gate for pin/scrub, cursor, magnetism, tilt. */
export function useDesktopPointer(): boolean {
  return useMediaQuery('(min-width: 1024px) and (pointer: fine)');
}
