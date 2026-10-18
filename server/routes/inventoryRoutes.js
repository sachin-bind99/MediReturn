
import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
    createInventory,
    getInventories,
    getInventoryById,
    updateInventory,
    deleteInventory,
    getInventoryActivity,
    getRecentInventoryActivity,
} from "../controllers/inventoryController.js";

const router = express.Router();

// Protect all inventory routes with authentication.
router.use(authMiddleware);

// Create inventory.
router.post("/", createInventory);

// Get all inventories.
router.get("/", getInventories);

// Get recent activity across inventory batches.
// Register before the general inventory ID route.
router.get("/activity/recent", getRecentInventoryActivity);

// Get activity history for a specific inventory batch.
router.get("/:id/activity", getInventoryActivity);

// Get inventory by ID.
router.get("/:id", getInventoryById);

// Update inventory.
router.put("/:id", updateInventory);

// Delete inventory.
router.delete("/:id", deleteInventory);

export default router;
