import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    createSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier
} from "../controllers/supplierController.js";

const router = express.Router();

// Protect all supplier routes
router.use(authMiddleware);

// Create supplier
router.post("/", createSupplier);

// Get all suppliers
router.get("/", getSuppliers);

// Get supplier by ID
router.get("/:id", getSupplierById);

// Update supplier
router.put("/:id", updateSupplier);

// Delete supplier
router.delete("/:id", deleteSupplier);

export default router;