export default function HomePage() {
  return (
    <main className="min-h-screen bg-kairo-bg px-6 py-24 text-kairo-text">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-kairo-muted">Kairo</p>
        <h1 className="mt-4 text-5xl font-bold leading-tight md:text-6xl">
          The right moment,
          <br />
          not just the right time.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-kairo-muted">
          One smart timeline across sports, calendar, and live streams. Three or four
          notifications a day, written like a friend who knows what you actually care about.
        </p>

        <div className="mt-10 flex gap-3">
          <a
            href="#"
            className="rounded-2xl bg-kairo-accent px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            Get on iOS
          </a>
          <a
            href="#"
            className="rounded-2xl border border-kairo-border bg-kairo-surface px-6 py-3 font-semibold transition hover:border-kairo-accent"
          >
            Get on Android
          </a>
        </div>

        <p className="mt-16 text-xs text-kairo-muted">
          Marketing site only. The app is iOS + Android (Expo). Web app retired in favor of
          native push and proper background sync.
        </p>
      </div>
    </main>
  );
}
