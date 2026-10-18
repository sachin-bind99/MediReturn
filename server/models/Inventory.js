import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
    {
        // Medicine reference
        medicine: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Medicine",
            required: [true, "Medicine is required"]
        },

        // Supplier reference
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: [true, "Supplier is required"]
        },

        // Batch information
        batchNumber: {
            type: String,
            required: [true, "Batch number is required"],
            trim: true
        },

        // Current stock quantity
        quantity: {
            type: Number,
            required: [true, "Quantity is required"],
            min: [0, "Quantity cannot be negative"]
        },

        // Purchase price per unit
        purchasePrice: {
            type: Number,
            required: [true, "Purchase price is required"],
            min: [0, "Purchase price cannot be negative"]
        },

        // Batch expiry date
        expiryDate: {
            type: Date,
            required: [true, "Expiry date is required"]
        },

        // Supplier return window
        returnWindowDays: {
            type: Number,
            required: [true, "Return window is required"],
            min: [0, "Return window cannot be negative"]
        },

        // Physical storage location
        location: {
            type: String,
            required: [true, "Location is required"],
            trim: true
        },

        // User who created this inventory batch
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Created by user is required"]
        }
    },
    {
        timestamps: true
    }
);

// The same batch number can exist for different medicines,
// but the same medicine cannot have the same batch number twice.
inventorySchema.index(
    {
        medicine: 1,
        batchNumber: 1
    },
    {
        unique: true
    }
);

const Inventory = mongoose.model("Inventory", inventorySchema);

export default Inventory;