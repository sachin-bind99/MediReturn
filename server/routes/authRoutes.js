
import express from "express";
import User from "../models/User.js";

import {
    register,
    login,
    forgotPassword,
    resetPassword,
    googleAuth,
    logout
} from "../controllers/authController.js";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    registerLimiter,
    loginLimiter,
    googleLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter
} from "../middleware/authRateLimiters.js";

const router = express.Router();

router.post("/logout", authMiddleware, logout);

// Register with email and password
router.post(
    "/register",
    registerLimiter,
    register
);

// Login with email and password
router.post(
    "/login",
    loginLimiter,
    login
);

// Login or sign up with Google
router.post(
    "/google",
    googleLimiter,
    googleAuth
);

// Request a password-reset email
router.post(
    "/forgot-password",
    forgotPasswordLimiter,
    forgotPassword
);

// Reset password using a valid reset token
router.post(
    "/reset-password",
    resetPasswordLimiter,
    resetPassword
);

// Get the currently authenticated user's profile
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select("name email role authProvider");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.status(200).json({
            user
        });
    } catch (error) {
        console.error("Get current user error:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
});

export default router;
