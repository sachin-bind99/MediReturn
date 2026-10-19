import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";
import Inventory from "../models/Inventory.js";
import { buildMedicineInventorySummaries } from "../utils/medicineInventorySummary.js";


// ----------------------------------------
// CREATE MEDICINE
// ----------------------------------------
export const createMedicine = async (req, res) => {
    try {
        // Authentication safety check
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
            "genericName",
            "manufacturer",
            "category",
            "barcode",
            "description"
        ];
        if (stringFields.some((field) =>
            body[field] !== undefined && typeof body[field] !== "string"
        )) {
            return res.status(400).json({
                message: "Medicine details must be text values"
            });
        }

        let {
            name,
            genericName,
            manufacturer,
            category,
            barcode,
            description
        } = body;

        // Trim strings
        name = name?.trim();
        genericName = genericName?.trim();
        manufacturer = manufacturer?.trim();
        category = category?.trim();
        barcode = barcode?.trim();
        description = description?.trim();

        // Required field validation
        if (!name) {
            return res.status(400).json({
                message: "Medicine name is required"
            });
        }

        if (!genericName) {
            return res.status(400).json({
                message: "Generic name is required"
            });
        }

        if (!manufacturer) {
            return res.status(400).json({
                message: "Manufacturer is required"
            });
        }

        if (!category) {
            return res.status(400).json({
                message: "Category is required"
            });
        }

        if (!barcode) {
            return res.status(400).json({
                message: "Barcode is required"
            });
        }

        // Barcode validation
        if (!/^\d+$/.test(barcode)) {
            return res.status(400).json({
                message: "Barcode must contain only numbers"
            });
        }

        // Check duplicate barcode
        const existingMedicine = await Medicine.findOne({
            barcode,
            createdBy: req.userId
        });

        if (existingMedicine) {
            return res.status(400).json({
                message: "Medicine with this barcode already exists"
            });
        }

        // Create medicine
        const medicine = await Medicine.create({
            name,
            genericName,
            manufacturer,
            category,
            barcode,
            description: description || "",
            createdBy: req.userId
        });

        return res.status(201).json({
            message: "Medicine created successfully",
            medicine
        });

    } catch (error) {
        console.error("Create medicine error:", error);

        // MongoDB duplicate-key safety
        if (error.code === 11000) {
            return res.status(400).json({
                message: "Medicine with this barcode already exists"
            });
        }

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ----------------------------------------
// GET ALL MEDICINES
// ----------------------------------------
export const getMedicines = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const medicines = await Medicine.find({ createdBy: req.userId })
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        const medicineIds = medicines.map((medicine) => medicine._id);
        const inventoryRecords = medicineIds.length > 0
            ? await Inventory.find({
                createdBy: req.userId,
                medicine: { $in: medicineIds },
            })
                .select("medicine batchNumber purchasePrice expiryDate createdAt")
                .sort({ createdAt: -1, _id: -1 })
                .lean()
            : [];
        const inventorySummaries = buildMedicineInventorySummaries(
            medicines,
            inventoryRecords
        );
        const medicinesWithInventorySummaries = medicines.map((medicine) => ({
            ...medicine.toObject(),
            inventorySummary: inventorySummaries.get(String(medicine._id)),
        }));

        return res.status(200).json({
            count: medicinesWithInventorySummaries.length,
            medicines: medicinesWithInventorySummaries
        });

    } catch (error) {
        console.error("Get medicines error:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ----------------------------------------
// GET MEDICINE BY ID
// ----------------------------------------
export const getMedicineById = async (req, res) => {
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
                message: "Invalid medicine ID"
            });
        }

        const medicine = await Medicine.findOne({
            _id: id,
            createdBy: req.userId
        })
            .populate("createdBy", "name email role");

        if (!medicine) {
            return res.status(404).json({
                message: "Medicine not found"
            });
        }

        return res.status(200).json({
            medicine
        });

    } catch (error) {
        console.error("Get medicine by ID error:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ----------------------------------------
// UPDATE MEDICINE
// ----------------------------------------
export const updateMedicine = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const { id } = req.params;

        // Validate ID first
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid medicine ID"
            });
        }

        const medicine = await Medicine.findById(id);

        if (!medicine) {
            return res.status(404).json({
                message: "Medicine not found"
            });
        }

        // Ownership check
        if (medicine.createdBy.toString() !== req.userId.toString()) {
            return res.status(403).json({
                message: "You are not authorized to update this medicine"
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
            "genericName",
            "manufacturer",
            "category",
            "barcode",
            "description"
        ];
        if (stringFields.some((field) =>
            body[field] !== undefined && typeof body[field] !== "string"
        )) {
            return res.status(400).json({
                message: "Medicine details must be text values"
            });
        }

        let {
            name,
            genericName,
            manufacturer,
            category,
            barcode,
            description
        } = body;

        // Trim only fields that were provided
        if (name !== undefined) name = name.trim();
        if (genericName !== undefined) genericName = genericName.trim();
        if (manufacturer !== undefined) manufacturer = manufacturer.trim();
        if (category !== undefined) category = category.trim();
        if (barcode !== undefined) barcode = barcode.trim();
        if (description !== undefined) description = description.trim();

        // Validation for provided fields
        if (name !== undefined && !name) {
            return res.status(400).json({
                message: "Medicine name cannot be empty"
            });
        }

        if (genericName !== undefined && !genericName) {
            return res.status(400).json({
                message: "Generic name cannot be empty"
            });
        }

        if (manufacturer !== undefined && !manufacturer) {
            return res.status(400).json({
                message: "Manufacturer cannot be empty"
            });
        }

        if (category !== undefined && !category) {
            return res.status(400).json({
                message: "Category cannot be empty"
            });
        }

        if (barcode !== undefined) {
            if (!barcode) {
                return res.status(400).json({
                    message: "Barcode cannot be empty"
                });
            }

            if (!/^\d+$/.test(barcode)) {
                return res.status(400).json({
                    message: "Barcode must contain only numbers"
                });
            }

            // Check duplicate barcode excluding current medicine
            const duplicateBarcode = await Medicine.findOne({
                barcode,
                createdBy: req.userId,
                _id: { $ne: id }
            });

            if (duplicateBarcode) {
                return res.status(400).json({
                    message: "Medicine with this barcode already exists"
                });
            }
        }

        // Update only provided fields
        if (name !== undefined) medicine.name = name;
        if (genericName !== undefined) medicine.genericName = genericName;
        if (manufacturer !== undefined) medicine.manufacturer = manufacturer;
        if (category !== undefined) medicine.category = category;
        if (barcode !== undefined) medicine.barcode = barcode;
        if (description !== undefined) medicine.description = description;

        await medicine.save();

        const updatedMedicine = await Medicine.findById(id)
            .populate("createdBy", "name email role");

        return res.status(200).json({
            message: "Medicine updated successfully",
            medicine: updatedMedicine
        });

    } catch (error) {
        console.error("Update medicine error:", error);

        if (error.code === 11000) {
            return res.status(400).json({
                message: "Medicine with this barcode already exists"
            });
        }

        return res.status(500).json({
            message: "Server error"
        });
    }
};


// ----------------------------------------
// DELETE MEDICINE
// ----------------------------------------
export const deleteMedicine = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid medicine ID"
            });
        }

        const medicine = await Medicine.findById(id);

        if (!medicine) {
            return res.status(404).json({
                message: "Medicine not found"
            });
        }

        // Ownership check
        if (medicine.createdBy.toString() !== req.userId.toString()) {
            return res.status(403).json({
                message: "You are not authorized to delete this medicine"
            });
        }

        await Medicine.findByIdAndDelete(id);

        return res.status(200).json({
            message: "Medicine deleted successfully"
        });

    } catch (error) {
        console.error("Delete medicine error:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
};
