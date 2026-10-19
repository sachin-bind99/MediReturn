import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import { medicineVisionLimiter } from "../middleware/authRateLimiters.js";
import {
    analyzeMedicineImage,
    handleMedicineVisionUploadError,
} from "../controllers/medicineVisionController.js";

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

// Images are parsed into an in-memory Buffer and are never written to disk.
router.post(
    "/vision-analysis",
    medicineVisionLimiter,
    express.raw({ type: "*/*", limit: "8mb" }),
    handleMedicineVisionUploadError,
    analyzeMedicineImage
);

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
