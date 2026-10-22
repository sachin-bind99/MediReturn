import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { issueAccessToken } from "../utils/authSession.js";

// Validate basic email structure.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password rules compatible with bcrypt.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

// Reset links expire after 15 minutes.
const PASSWORD_RESET_EXPIRY_MS = 15 * 60 * 1000;
const PASSWORD_RESET_EMAIL_TIMEOUT_MS = 10 * 1000;

// Generic response prevents revealing whether an account exists.
const RESET_REQUEST_MESSAGE =
    "If an eligible account exists for this email, a password reset link will be sent.";

function getSafeEmailErrorDetails(error) {
    const statusCode = error?.statusCode;

    return {
        ...(Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
            ? { statusCode }
            : {}),
    };
}

// ----------------------------------------
// Common user-write error handler
// ----------------------------------------
function handleUserWriteError(res, error) {
    if (error.code === 11000) {
        return res.status(409).json({
            message: "An account with this email already exists",
        });
    }

    if (error.name === "ValidationError") {
        return res.status(400).json({
            message: "Please check the account details",
        });
    }

    console.error("Authentication error:", error);

    return res.status(500).json({
        message: "Server error",
    });
}

// ----------------------------------------
// REGISTER
// POST /api/auth/register
// ----------------------------------------
export const register = async (req, res) => {
    const name =
        typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
    const password = req.body?.password;

    if (!name || !email || typeof password !== "string") {
        return res.status(400).json({
            message: "Name, email, and password are required",
        });
    }

    if (
        name.length > 120 ||
        email.length > 254 ||
        !emailPattern.test(email)
    ) {
        return res.status(400).json({
            message: "Please provide a valid name and email",
        });
    }

    if (
        password.length < MIN_PASSWORD_LENGTH ||
        Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
    ) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and no more than 72 bytes",
        });
    }

    try {
        const existingUser = await User.findOne({ email }).select("_id");

        if (existingUser) {
            return res.status(409).json({
                message: "An account with this email already exists",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Never accept a role from a public registration request.
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            authProvider: "local",
            role: "PHARMACIST",
        });

        return res.status(201).json({
            message: "Registration successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        return handleUserWriteError(res, error);
    }
};

// ----------------------------------------
// LOGIN
// POST /api/auth/login
// ----------------------------------------
export const login = async (req, res) => {
    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
    const password = req.body?.password;

    if (!email || typeof password !== "string") {
        return res.status(400).json({
            message: "Email and password are required",
        });
    }

    try {
        const user = await User.findOne({ email }).select(
            "+password +tokenVersion"
        );

        // Google-only accounts do not have a password and use Google sign-in.
        if (!user || !user.password) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        const token = await issueAccessToken(user);

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};

// ----------------------------------------
// GOOGLE SIGN-IN / SIGN-UP
// POST /api/auth/google
// Body: { "credential": "Google ID token" }
// ----------------------------------------
export const googleAuth = async (req, res) => {
    const credential = req.body?.credential;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (typeof credential !== "string" || !credential || credential.length > 10000) {
        return res.status(400).json({
            message: "A valid Google credential is required",
        });
    }

    if (!clientId) {
        console.error("GOOGLE_CLIENT_ID is not configured.");
        return res.status(503).json({
            message: "Google authentication is not configured",
        });
    }

    let payload;

    try {
        const googleClient = new OAuth2Client(clientId);
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: clientId,
        });
        payload = ticket.getPayload();
    } catch (error) {
        // Do not log or return the credential/token.
        console.warn("Google ID token verification failed.");
        return res.status(401).json({
            message: "Google sign-in could not be verified. Please try again.",
        });
    }

    if (
        !payload?.sub ||
        typeof payload.email !== "string" ||
        payload.email_verified !== true
    ) {
        return res.status(401).json({
            message: "A verified Google account is required",
        });
    }

    const googleId = payload.sub;
    const email = payload.email.trim().toLowerCase();
    const suppliedName =
        typeof payload.name === "string" ? payload.name.trim() : "";
    const name = (suppliedName || email.split("@")[0]).slice(0, 120);

    if (!email || email.length > 254 || !emailPattern.test(email)) {
        return res.status(401).json({
            message: "Google returned an invalid email address",
        });
    }

    try {
        // If this Google identity has been used before, sign in that account.
        let user = await User.findOne({ googleId }).select("+tokenVersion");

        if (!user) {
            // Do not silently link an existing local account based only on email.
            const existingUser = await User.findOne({ email }).select("_id");

            if (existingUser) {
                return res.status(409).json({
                    message:
                        "An account with this email already exists. Sign in using your existing method first.",
                });
            }

            // Create a new Google-only account. The role is assigned server-side.
            user = await User.create({
                name,
                email,
                googleId,
                authProvider: "google",
                role: "PHARMACIST",
            });
        }

        const token = await issueAccessToken(user);

        return res.status(200).json({
            message: "Google authentication successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    "This account already exists. Please try signing in again.",
            });
        }

        if (error.name === "ValidationError") {
            console.error("Google account validation failed:", error.message);
            return res.status(400).json({
                message: "Google account details could not be saved",
            });
        }

        console.error("Google authentication error:", error);
        return res.status(500).json({
            message: "Unable to authenticate with Google right now",
        });
    }
};

// ----------------------------------------
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// Body: { "email": "user@example.com" }
// ----------------------------------------
export const forgotPassword = async (req, res) => {
    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

    if (!email || email.length > 254 || !emailPattern.test(email)) {
        return res.status(400).json({
            message: "Please provide a valid email address",
        });
    }

    // Check configuration before looking up the account.
    const appsScriptUrlValue = process.env.APPS_SCRIPT_URL?.trim();
    const mailSecret = process.env.MEDIRETURN_MAIL_SECRET?.trim();
    const frontendUrlValue = process.env.FRONTEND_URL?.trim();

    if (!appsScriptUrlValue || !mailSecret || !frontendUrlValue) {
        console.error("Password reset email configuration is incomplete.");
        return res.status(503).json({
            message: "Password reset email service is not configured",
        });
    }

    let appsScriptUrl;
    let frontendUrl;

    try {
        appsScriptUrl = new URL(appsScriptUrlValue);
        frontendUrl = new URL(frontendUrlValue);
        if (
            !["http:", "https:"].includes(appsScriptUrl.protocol) ||
            !appsScriptUrl.pathname.endsWith("/exec") ||
            !["http:", "https:"].includes(frontendUrl.protocol)
        ) {
            throw new Error("Invalid password reset URL configuration");
        }
    } catch {
        console.error("Invalid password reset URL configuration.");
        return res.status(503).json({
            message: "Password reset email service is not configured",
        });
    }

    // Use a normalized origin so a configured trailing slash cannot produce a
    // double slash or a URL that disagrees with the Apps Script frontend URL.
    const normalizedFrontendUrl = frontendUrl.origin;

    try {
        const user = await User.findOne({ email }).select("+password");

        // Google-only accounts use Google sign-in rather than password reset.
        if (!user || !user.password || user.authProvider === "google") {
            return res.status(200).json({
                message: RESET_REQUEST_MESSAGE,
            });
        }

        // Generate a cryptographically random, single-use token.
        const resetToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.passwordResetTokenHash = tokenHash;
        user.passwordResetExpires = new Date(
            Date.now() + PASSWORD_RESET_EXPIRY_MS
        );
        await user.save();

        const resetUrl = new URL("/reset-password", `${normalizedFrontendUrl}/`);
        resetUrl.searchParams.set("token", resetToken);

        let emailFailure;
        const abortController = new AbortController();
        const timeout = setTimeout(() => {
            abortController.abort(
                new DOMException(
                    "Password reset email request timed out",
                    "TimeoutError"
                )
            );
        }, PASSWORD_RESET_EMAIL_TIMEOUT_MS);

        try {
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    secret: mailSecret,
                    to: user.email,
                    resetUrl: resetUrl.toString(),
                }),
                signal: abortController.signal,
            });

            let serviceResult;
            try {
                serviceResult = await response.json();
            } catch {
                emailFailure = {
                    kind: "invalid_response",
                    ...getSafeEmailErrorDetails({ statusCode: response.status }),
                };
            }

            if (
                !emailFailure &&
                (response.ok !== true || serviceResult?.ok !== true)
            ) {
                emailFailure = {
                    kind: "service_rejected",
                    ...getSafeEmailErrorDetails({ statusCode: response.status }),
                };
            }
        } catch (sendError) {
            emailFailure = {
                kind:
                    sendError?.name === "TimeoutError" ||
                    sendError?.name === "AbortError"
                        ? "timeout"
                        : "network_error",
            };
        } finally {
            clearTimeout(timeout);
        }

        if (emailFailure) {
            console.error("Password reset email could not be sent.", emailFailure);

            // Invalidate the token if the email could not be sent.
            user.passwordResetTokenHash = undefined;
            user.passwordResetExpires = undefined;

            try {
                await user.save();
            } catch (cleanupError) {
                console.error("Could not clear an unsent reset token.", {
                    kind: "database_error",
                    ...getSafeEmailErrorDetails(cleanupError),
                });
            }

            // Keep the public response generic to avoid account enumeration.
        }

        return res.status(200).json({
            message: RESET_REQUEST_MESSAGE,
        });
    } catch (error) {
        console.error("Forgot password error.", {
            kind: "processing_error",
            ...getSafeEmailErrorDetails(error),
        });
        return res.status(500).json({
            message: "Unable to process the password reset request",
        });
    }
};

// ----------------------------------------
// RESET PASSWORD
// POST /api/auth/reset-password
// Body: { "token": "...", "password": "..." }
// ----------------------------------------
export const resetPassword = async (req, res) => {
    const { token, password } = req.body || {};

    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({
            message: "Invalid or expired password reset link",
        });
    }

    if (typeof password !== "string") {
        return res.status(400).json({
            message: "A new password is required",
        });
    }

    if (
        password.length < MIN_PASSWORD_LENGTH ||
        Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
    ) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and no more than 72 bytes",
        });
    }

    try {
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: { $gt: new Date() },
        }).select(
            "+passwordResetTokenHash +passwordResetExpires +tokenVersion"
        );

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired password reset link",
            });
        }

        user.password = await bcrypt.hash(password, 10);

        // A reset link can be used only once.
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpires = undefined;
        user.tokenVersion = Number(user.tokenVersion || 0) + 1;

        await user.save();

        return res.status(200).json({
            message: "Password reset successful. You can now log in.",
        });
    } catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({
            message: "Unable to reset password right now",
        });
    }
};

// ----------------------------------------
// LOG OUT
// POST /api/auth/logout
// ----------------------------------------
export const logout = async (req, res) => {
    try {
        await Session.updateOne(
            {
                _id: req.authSessionId,
                user: req.userId,
                revokedAt: null
            },
            { $set: { revokedAt: new Date() } }
        );

        return res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error("Logout error:", error.message);
        return res.status(503).json({
            message: "Unable to invalidate this session right now"
        });
    }
};
