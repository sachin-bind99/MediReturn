import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Your reset link is missing its token. Request a new link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError("Your password must not exceed 72 bytes.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        password,
      });

      navigate("/login", {
        replace: true,
        state: {
          notice:
            data.message ||
            "Password reset successful. You can now log in.",
        },
      });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to reset your password. Request a new reset link and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-5 py-10">
        <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-7 text-center shadow-sm sm:p-9">
          <h1 className="text-2xl font-semibold text-slate-900">
            Invalid reset link
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            This link does not contain a reset token. Request a new password
            reset email to continue.
          </p>

          <Link
            to="/forgot-password"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-mint-700 px-5 text-sm font-semibold text-white transition hover:bg-mint-800"
          >
            Request a new link
          </Link>
        </section>
      </main>
    );
  }

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
            Set a new password
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            Choose a new password for your MediReturn account. Your reset link
            expires after 15 minutes and can be used only once.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="new-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              New password
            </label>

            <input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100"
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Confirm new password
            </label>

            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Enter the same password again"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              className="h-12 w-full rounded-xl border border-line bg-slate-50/60 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:bg-panel focus:ring-4 focus:ring-mint-100"
              required
            />
          </div>

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
            {isSubmitting ? "Resetting password..." : "Reset password"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default ResetPassword;