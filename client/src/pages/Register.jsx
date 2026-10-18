import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import GoogleAuthButton from "../components/GoogleAuthButton";
import api from "../lib/api";

function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      navigate("/login", {
        replace: true,
        state: { notice: data.message || "Account created. You can now sign in." },
      });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to create your account. Check that the server is running and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-panel lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-mint-900 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-36 -top-36 size-[28rem] rounded-full border border-white/10" />
        <div className="absolute -right-20 -top-20 size-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-48 -left-20 size-[32rem] rounded-full bg-mint-800/70 blur-2xl" />
        <Link className="relative z-10 inline-flex w-fit items-center gap-3 font-semibold tracking-tight" to="/">
          <span className="grid size-10 place-items-center rounded-2xl bg-panel/10 ring-1 ring-white/15" aria-hidden="true"><svg viewBox="0 0 24 24" className="size-5" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></span>
          <span className="text-lg">MediReturn</span>
        </Link>
        <div className="relative z-10 max-w-lg py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-panel/5 px-3 py-1.5 text-xs font-semibold text-mint-100"><span className="size-1.5 rounded-full bg-mint-200" />Your pharmacy, more organized</span>
          <h2 className="mt-7 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Make room for the work that matters.</h2>
          <p className="mt-5 max-w-md leading-7 text-mint-100/75">Start with a cleaner medicine catalog and a workspace designed around your team.</p>
          <div className="mt-10 space-y-4 text-sm text-mint-50/90">
            {["Keep medicine details close at hand", "Find items without searching shelf by shelf", "Build a calmer workflow for your team"].map((item) => (
              <div className="flex items-center gap-3" key={item}><span className="grid size-6 place-items-center rounded-full bg-panel/10 text-mint-100"><svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true"><path d="m3.3 8.2 3 3L12.8 4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>{item}</div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-mint-100/50">A more thoughtful workspace for pharmacy teams.</p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[440px]">
          <Link className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-mint-700 lg:mb-12" to="/">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to home
          </Link>
          <div className="mb-8 lg:hidden">
            <Link className="inline-flex items-center gap-3 font-semibold tracking-tight text-slate-900" to="/">
              <span className="grid size-10 place-items-center rounded-2xl bg-mint-100 text-mint-700" aria-hidden="true"><svg viewBox="0 0 24 24" className="size-5" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></span>
              <span className="text-lg">Medi<span className="text-mint-700">Return</span></span>
            </Link>
          </div>
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-mint-700">Get started</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Create your account</h1>
            <p className="mt-3 leading-6 text-muted">Set up your pharmacy workspace in just a moment.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-name">Your name</label>
              <input className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100" id="register-name" name="name" type="text" autoComplete="name" placeholder="e.g. Priya Sharma" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-email">Email address</label>
              <input className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100" id="register-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-password">Create a password</label>
              <input className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100" id="register-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required />
              <p className="mt-2 text-xs text-slate-400">Use at least 8 characters.</p>
            </div>

            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">{error}</p>}

            <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mint-700 px-5 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:bg-mint-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint-200 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
              {!isSubmitting && <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          </form>

          <GoogleAuthButton mode="signup" />

          <p className="mt-7 text-center text-sm text-muted">Already have an account? <Link className="font-semibold text-mint-700 hover:text-mint-800" to="/login">Sign in</Link></p>
          <p className="mt-12 text-center text-xs leading-5 text-slate-400">By creating an account, you agree to use MediReturn for your pharmacy team.</p>
        </div>
      </section>
    </main>
  );
}

export default Register;
