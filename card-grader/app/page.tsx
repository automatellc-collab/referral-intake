import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center">
        <h1 className="max-w-xl text-4xl font-bold text-zinc-900 dark:text-zinc-50">
          Trading card grading estimator
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Photograph a card, calibrate its centering and border, and get an estimated PSA-style grade —
          right in your browser, with no uploads.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/grade"
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Grade a card
          </Link>
          <Link
            href="/advisory"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          >
            Submission advisor
          </Link>
        </div>
      </main>
    </div>
  );
}
