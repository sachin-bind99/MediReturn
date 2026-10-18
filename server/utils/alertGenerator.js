
import {
    getExpiryStatus,
    getReturnStatus,
    getDaysUntilExpiry,
    getDaysUntilReturnDeadline,
} from "./inventoryStatus.js";

// ----------------------------------------
// Alert configuration
// ----------------------------------------
const ALERT_CONFIG = {
    RETURN_DUE: {
        title: "Return Deadline Approaching",
        priority: "HIGH",
    },
    RETURN_OVERDUE: {
        title: "Return Deadline Overdue",
        priority: "CRITICAL",
    },
    EXPIRING_SOON: {
        title: "Medicine Expiring Soon",
        priority: "HIGH",
    },
    EXPIRED: {
        title: "Medicine Expired",
        priority: "CRITICAL",
    },
};

// ----------------------------------------
// Get an ID from either a populated reference
// or a MongoDB ObjectId.
// ----------------------------------------
function getReferenceId(value) {
    if (!value) return "";

    if (typeof value === "object" && value._id) {
        return String(value._id);
    }

    return String(value);
}

// ----------------------------------------
// Build one alert payload
// ----------------------------------------
function buildAlert(inventory, userId, type, message) {
    const config = ALERT_CONFIG[type];

    return {
        inventory: inventory._id,
        user: userId,
        type,
        title: config.title,
        message,
        priority: config.priority,
        isRead: false,
    };
}

// ----------------------------------------
// Generate alerts for the authenticated user's
// own inventory batches.
//
// This function returns alert payloads.
// It does not save them to MongoDB.
// ----------------------------------------
export function generateInventoryAlerts(
    inventoryBatches,
    userId
) {
    if (!userId) {
        throw new TypeError(
            "An authenticated user ID is required to generate alerts."
        );
    }

    if (!Array.isArray(inventoryBatches)) {
        throw new TypeError(
            "Inventory batches must be provided as an array."
        );
    }

    const recipientId = String(userId);
    const alerts = [];

    for (const batch of inventoryBatches) {
        if (!batch) continue;

        // Handle regular Mongoose documents or plain objects.
        const inventory =
            typeof batch.toObject === "function"
                ? batch.toObject()
                : batch;

        const inventoryId = getReferenceId(inventory._id);

        // Ignore records without a valid inventory identifier.
        if (!inventoryId) continue;

        // Keep alerts scoped to the authenticated user's inventory.
        // Inventory.createdBy is expected to contain an ObjectId
        // or a populated user reference.
        const ownerId = getReferenceId(inventory.createdBy);

        if (!ownerId || ownerId !== recipientId) {
            continue;
        }

        // Do not generate any alerts for zero or invalid stock.
        const quantity = Number(inventory.quantity);

        if (!Number.isFinite(quantity) || quantity <= 0) {
            continue;
        }

        // ------------------------------------
        // 1. Return deadline alerts
        // ------------------------------------
        const returnStatus = getReturnStatus(
            inventory.expiryDate,
            inventory.returnWindowDays
        );

        const daysUntilReturnDeadline =
            getDaysUntilReturnDeadline(
                inventory.expiryDate,
                inventory.returnWindowDays
            );

        const validReturnDays =
            Number.isFinite(daysUntilReturnDeadline);

        // Overdue returns are independent of expiry status.
        if (
            returnStatus === "RETURN_OVERDUE" ||
            (validReturnDays &&
                daysUntilReturnDeadline < 0)
        ) {
            let message = `The return deadline for batch ${
                inventory.batchNumber || inventoryId
            } has passed.`;

            if (validReturnDays) {
                const overdueDays = Math.abs(
                    daysUntilReturnDeadline
                );

                message += ` It is ${overdueDays} calendar ${
                    overdueDays === 1 ? "day" : "days"
                } overdue.`;
            }

            alerts.push(
                buildAlert(
                    inventory,
                    recipientId,
                    "RETURN_OVERDUE",
                    message
                )
            );
        } else if (
            returnStatus === "RETURN_DUE" ||
            (validReturnDays &&
                daysUntilReturnDeadline >= 0 &&
                daysUntilReturnDeadline <= 7)
        ) {
            const batchNumber =
                inventory.batchNumber || inventoryId;

            let message =
                `The return deadline for batch ${batchNumber}`;

            if (
                validReturnDays &&
                daysUntilReturnDeadline === 0
            ) {
                message += " is today.";
            } else if (validReturnDays) {
                message +=
                    ` is in ${daysUntilReturnDeadline} calendar ` +
                    `${
                        daysUntilReturnDeadline === 1
                            ? "day"
                            : "days"
                    }.`;
            } else {
                message += " is due.";
            }

            alerts.push(
                buildAlert(
                    inventory,
                    recipientId,
                    "RETURN_DUE",
                    message
                )
            );
        }

        // ------------------------------------
        // 2. Expiry alerts
        // ------------------------------------
        const expiryStatus = getExpiryStatus(
            inventory.expiryDate
        );

        const daysUntilExpiry = getDaysUntilExpiry(
            inventory.expiryDate
        );

        const validExpiryDays =
            Number.isFinite(daysUntilExpiry);

        // Expiry is checked separately from return eligibility.
        if (
            expiryStatus === "EXPIRED" ||
            (validExpiryDays && daysUntilExpiry < 0)
        ) {
            const batchNumber =
                inventory.batchNumber || inventoryId;

            alerts.push(
                buildAlert(
                    inventory,
                    recipientId,
                    "EXPIRED",
                    `Medicine in batch ${batchNumber} has expired.`
                )
            );
        } else if (
            expiryStatus === "EXPIRING_SOON" ||
            (validExpiryDays &&
                daysUntilExpiry >= 0 &&
                daysUntilExpiry <= 30)
        ) {
            const batchNumber =
                inventory.batchNumber || inventoryId;

            let message =
                `Medicine in batch ${batchNumber}`;

            if (
                validExpiryDays &&
                daysUntilExpiry === 0
            ) {
                message += " expires today.";
            } else if (validExpiryDays) {
                message +=
                    ` expires in ${daysUntilExpiry} calendar ` +
                    `${
                        daysUntilExpiry === 1 ? "day" : "days"
                    }.`;
            } else {
                message += " is expiring soon.";
            }

            alerts.push(
                buildAlert(
                    inventory,
                    recipientId,
                    "EXPIRING_SOON",
                    message
                )
            );
        }
    }

    return alerts;
}
