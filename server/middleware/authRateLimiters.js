
import { rateLimit } from "express-rate-limit";

// Create a reusable rate limiter for authentication endpoints.
const createAuthLimiter = (windowMs, limit, message) => {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            message
        }
    });
};

// Registration: 10 attempts per IP per hour.
export const registerLimiter = createAuthLimiter(
    60 * 60 * 1000,
    10,
    "Too many registration attempts. Please try again later."
);

// Login: 10 attempts per IP every 15 minutes.
export const loginLimiter = createAuthLimiter(
    15 * 60 * 1000,
    10,
    "Too many login attempts. Please try again in 15 minutes."
);

// Google sign-in: 15 attempts per IP every 15 minutes.
export const googleLimiter = createAuthLimiter(
    15 * 60 * 1000,
    15,
    "Too many Google sign-in attempts. Please try again later."
);

// Forgot password: 5 requests per IP every 15 minutes.
export const forgotPasswordLimiter = createAuthLimiter(
    15 * 60 * 1000,
    5,
    "Too many password-reset requests. Please try again later."
);

// Reset password: 10 attempts per IP every 15 minutes.
export const resetPasswordLimiter = createAuthLimiter(
    15 * 60 * 1000,
    10,
    "Too many password-reset attempts. Please try again later."
);
