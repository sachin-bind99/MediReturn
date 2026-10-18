import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    getDashboardStats
} from "../controllers/dashboardController.js";

const router = express.Router();

// ----------------------------------------
// Protect all dashboard routes
// ----------------------------------------
router.use(authMiddleware);

// ----------------------------------------
// GET /api/dashboard
// ----------------------------------------
router.get("/", getDashboardStats);

export default router;