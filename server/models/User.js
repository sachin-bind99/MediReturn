
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        // User's display name
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },

        // Email address must be unique
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254
        },

        // Password is required for email/password accounts.
        // Google-only accounts can register without a password.
        password: {
            type: String,
            required: function () {
                return this.authProvider !== "google";
            },
            select: false
        },

        // Google's unique user identifier.
        // Required for Google-authenticated accounts.
        googleId: {
            type: String,
            trim: true,
            required: function () {
                return this.authProvider === "google";
            },
            unique: true,
            sparse: true,
            select: false
        },

        // Authentication method used by the account
        authProvider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
            required: true
        },

        // Hashed password-reset token.
        // Never store the raw reset token here.
        passwordResetTokenHash: {
            type: String,
            select: false
        },

        // Expiration time for the password-reset token
        passwordResetExpires: {
            type: Date,
            select: false
        },

        // Existing MediReturn role system
        role: {
            type: String,
            enum: ["PHARMACIST", "STAFF", "ADMIN"],
            default: "PHARMACIST",
            required: true
        }
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

export default User;
