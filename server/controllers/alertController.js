
import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import Inventory from "../models/Inventory.js";
import { generateInventoryAlerts } from "../utils/alertGenerator.js";

const ALERT_TYPES = [
    "RETURN_DUE",
    "RETURN_OVERDUE",
    "EXPIRING_SOON",
    "EXPIRED",
];

const ALERT_PRIORITIES = ["HIGH", "CRITICAL"];

// Populate the batch and its medicine/supplier for the UI.
const populateAlert = (query) =>
    query.populate({
        path: "inventory",
        select: "batchNumber quantity expiryDate medicine supplier",
        populate: [
            {
                path: "medicine",
                select: "name genericName",
            },
            {
                path: "supplier",
                select: "name companyName",
            },
        ],
    });

const getInventoryId = (value) =>
    value?._id ? String(value._id) : String(value);

// ----------------------------------------
// GET /api/alerts
// Query filters: type, isRead, priority, isActive
// ----------------------------------------
export const getAlerts = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        const { type, isRead, priority, isActive } = req.query;

        if (type && !ALERT_TYPES.includes(type)) {
            return res.status(400).json({
                message: "Invalid alert type",
            });
        }

        if (
            priority &&
            !ALERT_PRIORITIES.includes(priority)
        ) {
            return res.status(400).json({
                message: "Invalid alert priority",
            });
        }

        if (
            isRead !== undefined &&
            !["true", "false"].includes(isRead)
        ) {
            return res.status(400).json({
                message: "isRead must be true or false",
            });
        }

        if (
            isActive !== undefined &&
            !["true", "false"].includes(isActive)
        ) {
            return res.status(400).json({
                message: "isActive must be true or false",
            });
        }

        const filter = {
            user: req.userId,
            // Hide resolved alerts unless explicitly requested.
            isActive:
                isActive === undefined
                    ? true
                    : isActive === "true",
        };

        if (type) filter.type = type;
        if (priority) filter.priority = priority;

        if (isRead !== undefined) {
            filter.isRead = isRead === "true";
        }

        const alerts = await populateAlert(
            Alert.find(filter).sort({
                priority: 1, // CRITICAL before HIGH
                createdAt: -1,
            })
        );

        const unreadCount = await Alert.countDocuments({
            user: req.userId,
            isActive: true,
            isRead: false,
        });

        return res.status(200).json({
            count: alerts.length,
            unreadCount,
            alerts,
        });
    } catch (error) {
        console.error("Get alerts error:", error);

        return res.status(500).json({
            message: "Unable to load alerts",
        });
    }
};

// ----------------------------------------
// GET /api/alerts/unread-count
// ----------------------------------------
export const getUnreadCount = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        const count = await Alert.countDocuments({
            user: req.userId,
            isActive: true,
            isRead: false,
        });

        return res.status(200).json({ count });
    } catch (error) {
        console.error("Get unread alert count error:", error);

        return res.status(500).json({
            message: "Unable to load unread alert count",
        });
    }
};

// ----------------------------------------
// PATCH /api/alerts/:id/read
// ----------------------------------------
export const markAlertRead = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid alert ID",
            });
        }

        // The user filter prevents access to another user's alert.
        const alert = await populateAlert(
            Alert.findOneAndUpdate(
                {
                    _id: id,
                    user: req.userId,
                },
                {
                    $set: { isRead: true },
                },
                { new: true, runValidators: true }
            )
        );

        if (!alert) {
            return res.status(404).json({
                message: "Alert not found",
            });
        }

        return res.status(200).json({
            message: "Alert marked as read",
            alert,
        });
    } catch (error) {
        console.error("Mark alert read error:", error);

        return res.status(500).json({
            message: "Unable to mark alert as read",
        });
    }
};

// ----------------------------------------
// PATCH /api/alerts/read-all
// ----------------------------------------
export const markAllAlertsRead = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        const result = await Alert.updateMany(
            {
                user: req.userId,
                isRead: false,
            },
            {
                $set: { isRead: true },
            }
        );

        return res.status(200).json({
            message: "Alerts marked as read",
            modifiedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error("Mark all alerts read error:", error);

        return res.status(500).json({
            message: "Unable to mark alerts as read",
        });
    }
};

// ----------------------------------------
// POST /api/alerts/generate
// Idempotent alert generation and resolution
// ----------------------------------------
export const generateAlerts = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Authentication required",
            });
        }

        // Only load the authenticated user's inventory.
        // Include zero-stock batches so old alerts can resolve.
        const inventoryBatches = await Inventory.find({
            createdBy: req.userId,
        });

        const alertPayloads = generateInventoryAlerts(
            inventoryBatches,
            req.userId
        );

        const activeKeys = new Set(
            alertPayloads.map(
                (item) =>
                    `${getInventoryId(item.inventory)}|${item.type}`
            )
        );

        let generated = 0;
        let updated = 0;
        let unchanged = 0;
        let resolved = 0;

        // Create a new record or update/reactivate an existing one.
        for (const payload of alertPayloads) {
            const key = {
                user: req.userId,
                inventory: payload.inventory,
                type: payload.type,
            };

            let existing = await Alert.findOne(key);

            if (!existing) {
                try {
                    await Alert.create({
                        ...payload,
                        user: req.userId,
                        isRead: false,
                        isActive: true,
                        resolvedAt: null,
                    });

                    generated++;
                    continue;
                } catch (error) {
                    // A concurrent generation request may have
                    // inserted the same unique alert first.
                    if (error.code !== 11000) {
                        throw error;
                    }

                    existing = await Alert.findOne(key);

                    if (!existing) {
                        throw error;
                    }
                }
            }

            let changed = false;

            // Reactivate the same record if this condition
            // occurs again. Make it unread so it is noticed.
            if (!existing.isActive) {
                existing.isActive = true;
                existing.resolvedAt = null;
                existing.isRead = false;
                changed = true;
            }

            // Update text/priority without resetting the read
            // state every time generation runs.
            if (existing.title !== payload.title) {
                existing.title = payload.title;
                changed = true;
            }

            if (existing.message !== payload.message) {
                existing.message = payload.message;
                changed = true;
            }

            if (existing.priority !== payload.priority) {
                existing.priority = payload.priority;
                changed = true;
            }

            if (changed) {
                await existing.save();
                updated++;
            } else {
                unchanged++;
            }
        }

        // Close old active alerts whose conditions are no longer
        // present. This also resolves alerts for batches whose
        // quantity has fallen to zero.
        const existingActiveAlerts = await Alert.find({
            user: req.userId,
            isActive: true,
        });

        for (const alert of existingActiveAlerts) {
            const key =
                `${getInventoryId(alert.inventory)}|${alert.type}`;

            if (!activeKeys.has(key)) {
                alert.isActive = false;
                alert.resolvedAt = new Date();

                await alert.save();
                resolved++;
            }
        }

        const activeCount = await Alert.countDocuments({
            user: req.userId,
            isActive: true,
        });

        return res.status(200).json({
            message: "Alert generation completed",
            summary: {
                generated,
                updated,
                unchanged,
                resolved,
                active: activeCount,
            },
        });
    } catch (error) {
        console.error("Generate alerts error:", error);

        return res.status(500).json({
            message: "Unable to generate alerts",
        });
    }
};
