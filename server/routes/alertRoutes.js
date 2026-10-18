
import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    getAlerts,
    getUnreadCount,
    markAlertRead,
    markAllAlertsRead,
    generateAlerts,
} from "../controllers/alertController.js";

const router = express.Router();

// POST /api/alerts/generate
router.post(
    "/generate",
    authMiddleware,
    generateAlerts
);

// GET /api/alerts/unread-count
router.get(
    "/unread-count",
    authMiddleware,
    getUnreadCount
);

// PATCH /api/alerts/read-all
router.patch(
    "/read-all",
    authMiddleware,
    markAllAlertsRead
);

// PATCH /api/alerts/:id/read
router.patch(
    "/:id/read",
    authMiddleware,
    markAlertRead
);

// GET /api/alerts
router.get(
    "/",
    authMiddleware,
    getAlerts
);

export default router;
