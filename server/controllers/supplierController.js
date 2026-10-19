import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";


// ========================================
// CREATE SUPPLIER
// ========================================
export const createSupplier = async (req, res) => {
    try {
        // Authentication check
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return res.status(400).json({
                message: "Request body must be a JSON object"
            });
        }

        const stringFields = [
            "name",
            "companyName",
            "phone",
            "email",
            "address",
            "returnPolicy",
            "defaultInventoryLocation"
        ];
        if (stringFields.some((field) =>
            body[field] !== undefined &&
            body[field] !== null &&
            typeof body[field] !== "string"
        )) {
            return res.status(400).json({
                message: "Supplier details must be text values"
            });
        }

        let {
            name,
            companyName,
            phone,
            email,
            address,
            returnPolicy,
            defaultReturnWindowDays,
            defaultInventoryLocation
        } = body;

        if (
            defaultReturnWindowDays !== undefined &&
            defaultReturnWindowDays !== null &&
            defaultReturnWindowDays !== "" &&
            (typeof defaultReturnWindowDays !== "number" ||
                !Number.isFinite(defaultReturnWindowDays) ||
                defaultReturnWindowDays < 0)
        ) {
            return res.status(400).json({
                message: "Default return window must be a valid non-negative number"
            });
        }

        if (
            defaultInventoryLocation !== undefined &&
            defaultInventoryLocation !== null &&
            typeof defaultInventoryLocation !== "string"
        ) {
            return res.status(400).json({
                message: "Default inventory location must be text"
            });
        }

        // Trim values
        name = name?.trim();
        companyName = companyName?.trim();
        phone = phone?.trim();
        email = email?.trim().toLowerCase();
        address = address?.trim();
        returnPolicy = returnPolicy?.trim();
        defaultInventoryLocation = defaultInventoryLocation?.trim();

        // Required field validation
        if (!name) {
            return res.status(400).json({
                message: "Supplier name is required"
            });
        }

        if (!companyName) {
            return res.status(400).json({
                message: "Company name is required"
            });
        }

        if (!phone) {
            return res.status(400).json({
                message: "Phone number is required"
            });
        }

        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        if (!address) {
            return res.status(400).json({
                message: "Address is required"
            });
        }

        if (!returnPolicy) {
            return res.status(400).json({
                message: "Return policy is required"
            });
        }

        // Basic email validation
        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email address"
            });
        }

        // Basic phone validation
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                message: "Phone number must contain 10 digits"
            });
        }

        // Create supplier
        const supplier = await Supplier.create({
            name,
            companyName,
            phone,
            email,
            address,
            returnPolicy,
            ...(defaultReturnWindowDays !== undefined &&
            defaultReturnWindowDays !== null &&
            defaultReturnWindowDays !== ""
                ? { defaultReturnWindowDays }
                : {}),
            ...(defaultInventoryLocation
                ? { defaultInventoryLocation }
                : {}),
            createdBy: req.userId
        });

        // Populate creator
        const createdSupplier = await Supplier.findById(
            supplier._id
        ).populate(
            "createdBy",
            "name email role"
        );

        return res.status(201).json({
            message: "Supplier created successfully",
            supplier: createdSupplier
        });

    } catch (error) {
        console.error(
            "Create supplier error:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ========================================
// GET ALL SUPPLIERS
// ========================================
export const getSuppliers = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const suppliers = await Supplier.find({ createdBy: req.userId })
            .populate(
                "createdBy",
                "name email role"
            )
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: suppliers.length,
            suppliers
        });

    } catch (error) {
        console.error(
            "Get suppliers error:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ========================================
// GET SUPPLIER BY ID
// ========================================
export const getSupplierById = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const { id } = req.params;

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid supplier ID"
            });
        }

        const supplier = await Supplier.findOne({
            _id: id,
            createdBy: req.userId
        })
            .populate(
                "createdBy",
                "name email role"
            );

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        return res.status(200).json({
            supplier
        });

    } catch (error) {
        console.error(
            "Get supplier by ID error:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ========================================
// UPDATE SUPPLIER
// ========================================
export const updateSupplier = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid supplier ID"
            });
        }

        const supplier = await Supplier.findById(id);

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        // Ownership check
        if (
            supplier.createdBy.toString() !==
            req.userId.toString()
        ) {
            return res.status(403).json({
                message:
                    "You are not authorized to update this supplier"
            });
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return res.status(400).json({
                message: "Request body must be a JSON object"
            });
        }

        const stringFields = [
            "name",
            "companyName",
            "phone",
            "email",
            "address",
            "returnPolicy",
            "defaultInventoryLocation"
        ];
        if (stringFields.some((field) =>
            body[field] !== undefined &&
            body[field] !== null &&
            typeof body[field] !== "string"
        )) {
            return res.status(400).json({
                message: "Supplier details must be text values"
            });
        }

        let {
            name,
            companyName,
            phone,
            email,
            address,
            returnPolicy,
            defaultReturnWindowDays,
            defaultInventoryLocation
        } = body;

        if (
            defaultReturnWindowDays !== undefined &&
            defaultReturnWindowDays !== null &&
            defaultReturnWindowDays !== "" &&
            (typeof defaultReturnWindowDays !== "number" ||
                !Number.isFinite(defaultReturnWindowDays) ||
                defaultReturnWindowDays < 0)
        ) {
            return res.status(400).json({
                message: "Default return window must be a valid non-negative number"
            });
        }

        if (
            defaultInventoryLocation !== undefined &&
            defaultInventoryLocation !== null &&
            typeof defaultInventoryLocation !== "string"
        ) {
            return res.status(400).json({
                message: "Default inventory location must be text"
            });
        }

        // -----------------------------
        // Name
        // -----------------------------
        if (name !== undefined) {
            name = name.trim();

            if (!name) {
                return res.status(400).json({
                    message:
                        "Supplier name cannot be empty"
                });
            }

            supplier.name = name;
        }

        // -----------------------------
        // Company Name
        // -----------------------------
        if (companyName !== undefined) {
            companyName = companyName.trim();

            if (!companyName) {
                return res.status(400).json({
                    message:
                        "Company name cannot be empty"
                });
            }

            supplier.companyName = companyName;
        }

        // -----------------------------
        // Phone
        // -----------------------------
        if (phone !== undefined) {
            phone = phone.trim();

            if (!/^\d{10}$/.test(phone)) {
                return res.status(400).json({
                    message:
                        "Phone number must contain 10 digits"
                });
            }

            supplier.phone = phone;
        }

        // -----------------------------
        // Email
        // -----------------------------
        if (email !== undefined) {
            email = email.trim().toLowerCase();

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    message:
                        "Invalid email address"
                });
            }

            supplier.email = email;
        }

        // -----------------------------
        // Address
        // -----------------------------
        if (address !== undefined) {
            address = address.trim();

            if (!address) {
                return res.status(400).json({
                    message:
                        "Address cannot be empty"
                });
            }

            supplier.address = address;
        }

        // -----------------------------
        // Return Policy
        // -----------------------------
        if (returnPolicy !== undefined) {
            returnPolicy = returnPolicy.trim();

            if (!returnPolicy) {
                return res.status(400).json({
                    message:
                        "Return policy cannot be empty"
                });
            }

            supplier.returnPolicy =
                returnPolicy;
        }

        if (defaultReturnWindowDays !== undefined) {
            supplier.defaultReturnWindowDays =
                defaultReturnWindowDays === null || defaultReturnWindowDays === ""
                    ? undefined
                    : defaultReturnWindowDays;
        }

        if (defaultInventoryLocation !== undefined) {
            supplier.defaultInventoryLocation =
                defaultInventoryLocation === null || !defaultInventoryLocation.trim()
                    ? undefined
                    : defaultInventoryLocation.trim();
        }

        await supplier.save();

        const updatedSupplier =
            await Supplier.findById(id)
                .populate(
                    "createdBy",
                    "name email role"
                );

        return res.status(200).json({
            message: "Supplier updated successfully",
            supplier: updatedSupplier
        });

    } catch (error) {
        console.error(
            "Update supplier error:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ========================================
// DELETE SUPPLIER
// ========================================
export const deleteSupplier = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid supplier ID"
            });
        }

        const supplier = await Supplier.findById(id);

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        // Ownership check
        if (
            supplier.createdBy.toString() !==
            req.userId.toString()
        ) {
            return res.status(403).json({
                message:
                    "You are not authorized to delete this supplier"
            });
        }

        await Supplier.findByIdAndDelete(id);

        return res.status(200).json({
            message: "Supplier deleted successfully"
        });

    } catch (error) {
        console.error(
            "Delete supplier error:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};
