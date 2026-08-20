export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-400">
          Trailhead
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
          Shift scheduling for the whole crew
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          See your shifts, request a swap, and keep the schedule straight — without a group chat.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <a
            className="flex h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            href="/shifts"
          >
            View shifts
          </a>
          <a
            className="flex h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            href="/me"
          >
            My profile
          </a>
        </div>
      </main>
    </div>
  );
}
