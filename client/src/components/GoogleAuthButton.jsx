import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { setAuthToken } from "../lib/authSession";

function GoogleAuthButton({ mode = "signin" }) {
    const navigate = useNavigate();
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleGoogleSuccess = async (response) => {
        setError("");

        if (!response?.credential) {
            setError("Google did not return a valid credential.");
            return;
        }

        setIsSubmitting(true);

        try {
            const { data } = await api.post("/auth/google", {
                credential: response.credential
            });

            setAuthToken(data.token);

            navigate("/dashboard", {
                replace: true
            });
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                    "Google authentication failed. Please try again."
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-6">
            <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium text-slate-400">
                    or continue with
                </span>
                <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="flex justify-center">
                {googleClientId ? (
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() =>
                            setError(
                                "Google sign-in was unsuccessful. Please try again."
                            )
                        }
                        text={
                            mode === "signup"
                                ? "signup_with"
                                : "signin_with"
                        }
                        theme="outline"
                        shape="rectangular"
                        size="large"
                        width="350"
                    />
                ) : (
                    <p className="text-center text-sm text-muted" role="note">
                        Google sign-in is not configured in this environment.
                    </p>
                )}
            </div>

            {isSubmitting && (
                <p className="mt-3 text-center text-sm text-muted">
                    Verifying your Google account...
                </p>
            )}

            {error && (
                <p
                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
                    role="alert"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

export default GoogleAuthButton;
