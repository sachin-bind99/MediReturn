
import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
    {
        inventory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inventory",
            required: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        type: {
            type: String,
            enum: [
                "RETURN_DUE",
                "RETURN_OVERDUE",
                "EXPIRING_SOON",
                "EXPIRED",
            ],
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },

        priority: {
            type: String,
            enum: ["HIGH", "CRITICAL"],
            required: true,
        },

        isRead: {
            type: Boolean,
            default: false,
        },

        // False when the alert condition has resolved.
        isActive: {
            type: Boolean,
            default: true,
        },

        // Records when the alert was resolved.
        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// One reusable record per user, batch, and alert type.
// Existing alerts are updated or reactivated.
alertSchema.index(
    {
        user: 1,
        inventory: 1,
        type: 1,
    },
    {
        unique: true,
    }
);

// Helps notification-centre queries.
alertSchema.index({
    user: 1,
    isActive: 1,
    isRead: 1,
    createdAt: -1,
});

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
