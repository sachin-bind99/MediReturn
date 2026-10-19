import mongoose from "mongoose";

const returnSchema = new mongoose.Schema(
    {
        inventory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inventory",
            required: [true, "Inventory is required"]
        },

        medicine: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Medicine",
            required: [true, "Medicine is required"]
        },

        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: [true, "Supplier is required"]
        },

        batchNumber: {
            type: String,
            required: [true, "Batch number is required"],
            trim: true
        },

        quantity: {
            type: Number,
            required: [true, "Return quantity is required"],
            min: [1, "Return quantity must be at least 1"]
        },

        returnValue: {
            type: Number,
            required: [true, "Return value is required"],
            min: [0, "Return value cannot be negative"]
        },

        reason: {
            type: String,
            required: [true, "Return reason is required"],
            trim: true
        },

        status: {
            type: String,
            enum: [
                "PENDING",
                "APPROVED",
                "REJECTED",
                "RETURNED"
            ],
            default: "PENDING"
        },

        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Requested by user is required"]
        },

        // Tenant owner derived from the validated inventory record.
        // Never accept this value from the client.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Return owner is required"]
        },

        processedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

returnSchema.index({ createdBy: 1, createdAt: -1 });

const Return = mongoose.model("Return", returnSchema);

export default Return;
