import { Link } from "react-router-dom";

function BrandMark({ light = false }) {
  return (
    <span
      className={`grid size-10 place-items-center rounded-2xl ${light ? "bg-panel/10 text-white ring-1 ring-white/15" : "bg-mint-100 text-mint-700"}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M19.5 4.5 21 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const previewMedicines = [
  { name: "Paracetamol 500 mg", meta: "Strip · Cipla", color: "bg-mint-100 text-mint-800" },
  { name: "Vitamin C tablets", meta: "Bottle · HealthKart", color: "bg-amber-100 text-amber-700" },
  { name: "Cetirizine 10 mg", meta: "Strip · Dr. Reddy’s", color: "bg-sage-light/50 text-mint-900" },
];

function Landing() {
  return (
      <div className="min-h-screen overflow-hidden bg-canvas text-slate-800">
      <nav className="relative z-10 border-b border-navbar-ink/20 bg-navbar text-navbar-ink shadow-sm" aria-label="Main navigation">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:h-[76px] sm:min-h-0 sm:flex-nowrap sm:px-8 sm:py-0 lg:px-12">
          <Link className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-navbar-ink sm:gap-3" to="/">
            <BrandMark />
            <span className="text-base sm:text-lg">Medi<span className="text-navbar-ink">Return</span></span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-7">
            <Link className="whitespace-nowrap text-sm font-semibold text-navbar-ink transition hover:underline" to="/login">
              Sign in
            </Link>
            <Link className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-mint-700 px-3 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:-translate-y-0.5 hover:bg-mint-800 sm:h-11 sm:px-5" to="/register">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative isolate mx-auto grid min-h-[calc(100svh-64px)] w-full max-w-7xl items-center gap-14 px-5 py-12 sm:min-h-[calc(100svh-76px)] sm:px-8 sm:py-16 md:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-12 lg:py-24">
          <div className="pointer-events-none absolute -left-40 top-16 size-96 rounded-full bg-sidebar/20 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-mint-200 bg-panel px-3.5 py-2 text-xs font-semibold tracking-wide text-mint-800 shadow-sm shadow-mint-900/5">
              <span className="size-2 rounded-full bg-mint-600 ring-4 ring-sidebar/30" />
              A clearer way to manage your pharmacy
            </div>
            <h1 className="max-w-2xl font-sans text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-slate-900 sm:text-6xl lg:text-[4.35rem]">
              Your medicine catalog, <span className="text-mint-700">under control.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
              Keep medicine names, manufacturers, categories and barcodes in one calm, searchable workspace built for busy pharmacy teams.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-mint-700 px-6 text-sm font-semibold text-white shadow-xl shadow-mint-900/15 transition hover:-translate-y-0.5 hover:bg-mint-800" to="/register">
                Create your account
                <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
              <Link className="inline-flex h-13 items-center justify-center rounded-xl border border-line bg-panel px-6 text-sm font-semibold text-slate-700 transition hover:border-mint-300 hover:bg-mint-50" to="/login">
                I already have an account
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><svg viewBox="0 0 20 20" className="size-4 text-mint-600" fill="none" aria-hidden="true"><path d="m5 10 3.1 3.1L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Simple to get started</span>
              <span className="inline-flex items-center gap-2"><svg viewBox="0 0 20 20" className="size-4 text-mint-600" fill="none" aria-hidden="true"><path d="m5 10 3.1 3.1L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Made for pharmacy workflows</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[600px] lg:ml-auto" aria-hidden="true">
            <div className="absolute -right-8 -top-10 size-44 rounded-full bg-mint-200/70 blur-3xl sm:-right-12 sm:-top-14 sm:size-64" />
            <div className="absolute -bottom-12 -left-8 size-48 rounded-full bg-sage/40 blur-3xl" />
            <div className="absolute -inset-4 rotate-[-3deg] rounded-[2rem] bg-panel shadow-2xl shadow-mint-900/10 sm:-inset-6 sm:rounded-[2.5rem]" />
            <div className="relative rounded-[1.7rem] border border-line/80 bg-panel/90 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur sm:rounded-[2rem] sm:p-7">
              <div className="flex flex-col items-start gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <BrandMark />
                  <div><p className="text-sm font-semibold text-slate-900">Medicine catalog</p><p className="mt-0.5 text-xs text-muted">Your pharmacy at a glance</p></div>
                </div>
                <span className="rounded-full bg-mint-50 px-3 py-1.5 text-xs font-semibold text-mint-700">Catalog preview</span>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 sm:p-5"><p className="text-xs font-medium text-muted">Catalog items</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">248</p><p className="mt-1 text-xs text-muted">organized in one place</p></div>
                <div className="rounded-2xl bg-mint-50 p-4 sm:p-5"><p className="text-xs font-medium text-mint-700">Categories</p><p className="mt-2 text-3xl font-semibold tracking-tight text-mint-900">12</p><p className="mt-1 text-xs text-mint-700/75">easy to browse</p></div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Recently added</p>
                <span className="text-xs font-medium text-slate-400">VIEW ALL</span>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {previewMedicines.map((medicine, index) => (
                  <div className="flex items-center gap-3 py-3.5" key={medicine.name}>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${medicine.color}`}>
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true"><path d="M8.2 5.1a4.4 4.4 0 0 1 6.2 0l4.5 4.5a4.4 4.4 0 0 1-6.2 6.2l-4.5-4.5a4.4 4.4 0 0 1 0-6.2Z" stroke="currentColor" strokeWidth="1.7"/><path d="m9.2 13.1 6.2-6.2" stroke="currentColor" strokeWidth="1.7"/></svg>
                    </span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{medicine.name}</p><p className="mt-0.5 truncate text-xs text-muted">{medicine.meta}</p></div>
                    <span className="size-2 rounded-full bg-mint-500" aria-label={`Item ${index + 1}`} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-mint-100 bg-mint-50/70 px-3.5 py-3 text-xs font-medium text-mint-800">
                <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" aria-hidden="true"><path d="M10 2.5 3.8 5v4.2c0 3.8 2.6 6.6 6.2 8.3 3.6-1.7 6.2-4.5 6.2-8.3V5L10 2.5Z" stroke="currentColor" strokeWidth="1.5"/><path d="m7.5 9.8 1.7 1.7 3.4-3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Clear records. Less time searching.
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line/70 bg-panel/70">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 sm:grid-cols-3 sm:px-8 lg:px-12">
            {["Find medicines faster", "Keep details together", "Stay ready to grow"].map((item, index) => (
              <div className="flex items-center gap-3 text-sm font-medium text-slate-600" key={item}>
                <span className="grid size-9 place-items-center rounded-xl bg-mint-50 text-mint-700">
                  {index === 0 ? <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3" stroke="currentColor" strokeWidth="1.7"/><path d="m12.7 12.7 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> : index === 1 ? <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><rect x="3.2" y="3.2" width="13.6" height="13.6" rx="3" stroke="currentColor" strokeWidth="1.6"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> : <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M3.5 15.8V11m6.5 4.8V6.9m6.5 8.9V3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                </span>
                {item}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Landing;
