import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Supplier name is required"],
            trim: true
        },

        companyName: {
            type: String,
            required: [true, "Company name is required"],
            trim: true
        },

        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true
        },

        address: {
            type: String,
            required: [true, "Address is required"],
            trim: true
        },

        returnPolicy: {
            type: String,
            required: [true, "Return policy is required"],
            trim: true
        },

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

const Supplier = mongoose.model("Supplier", supplierSchema);

export default Supplier;