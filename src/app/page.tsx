export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16"
    >
      <p className="mb-6 text-sm font-semibold tracking-widest text-teal-800">
        LEDGERONE / FOUNDATION
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        A clear view of your money starts with trustworthy records.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700">
        The development platform is being established. Accounts, transactions
        and reports are not available yet.
      </p>
      <aside
        aria-label="Implementation status"
        className="mt-10 rounded-xl border border-slate-300 bg-white p-6"
      >
        <h2 className="font-semibold">P1-S01 · Platform foundation</h2>
        <p className="mt-2 text-slate-700">
          This page contains no personal financial data. Authentication and
          accounting require subsequent reviewed stories.
        </p>
      </aside>
    </main>
  );
}
