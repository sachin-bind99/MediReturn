import mongoose from "mongoose";

const inventoryActivityChangeSchema = new mongoose.Schema(
    {
        field: {
            type: String,
            required: true,
            trim: true,
        },
        previousValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        newValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        _id: false,
    }
);

const inventoryActivitySchema = new mongoose.Schema(
    {
        inventoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inventory",
            required: true,
            index: true,
        },
        action: {
            type: String,
            enum: ["CREATED", "UPDATED", "DELETED"],
            required: true,
        },
        batchNumber: {
            type: String,
            required: true,
            trim: true,
        },
        medicineName: {
            type: String,
            required: true,
            trim: true,
        },
        changes: {
            type: [inventoryActivityChangeSchema],
            default: [],
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        versionKey: false,
    }
);

inventoryActivitySchema.index({ inventoryId: 1, createdAt: -1 });
inventoryActivitySchema.index({ performedBy: 1, inventoryId: 1 });
inventoryActivitySchema.index({ createdAt: -1 });

const InventoryActivity = mongoose.models.InventoryActivity ||
    mongoose.model("InventoryActivity", inventoryActivitySchema);

export default InventoryActivity;
