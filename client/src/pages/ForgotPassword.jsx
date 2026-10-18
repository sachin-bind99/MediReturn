import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/forgot-password", {
        email: email.trim(),
      });

      setMessage(
        data.message ||
          "If an eligible account exists for this email, a password reset link will be sent.",
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to process your request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-7 shadow-sm sm:p-9">
        <Link
          to="/login"
          className="text-sm font-medium text-muted transition hover:text-mint-700"
        >
          ← Back to sign in
        </Link>

        <div className="mt-8">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-mint-700">
            Account recovery
          </span>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Forgot your password?
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            Enter the email address associated with your MediReturn account.
            We will send you a password-reset link if an eligible account exists.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="forgot-email"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Email address
            </label>

            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100"
              required
            />
          </div>

          {message && (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800"
              role="status"
            >
              {message}
            </p>
          )}

          {error && (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-mint-700 px-5 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:bg-mint-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint-200 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? "Sending request..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted">
          Remember your password?{" "}
          <Link
            to="/login"
            className="font-semibold text-mint-700 hover:text-mint-800"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

export default ForgotPassword;