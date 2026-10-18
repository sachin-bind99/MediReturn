import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    createMedicine,
    getMedicines,
    getMedicineById,
    updateMedicine,
    deleteMedicine
} from "../controllers/medicineController.js";

const router = express.Router();

// All medicine routes are protected
router.use(authMiddleware);

// Create medicine
router.post("/", createMedicine);

// Get all medicines
router.get("/", getMedicines);

// Get single medicine
router.get("/:id", getMedicineById);

// Update medicine
router.put("/:id", updateMedicine);

// Delete medicine
router.delete("/:id", deleteMedicine);

export default router;