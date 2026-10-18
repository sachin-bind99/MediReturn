import Medicine from "../models/Medicine.js";
import Inventory from "../models/Inventory.js";

import {
    calculateReturnDeadline,
    getExpiryStatus,
    getReturnStatus,
    getDaysUntilExpiry,
    getDaysUntilReturnDeadline
} from "../utils/inventoryStatus.js";

// ----------------------------------------
// GET DASHBOARD STATS
// ----------------------------------------
export const getDashboardStats = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request"
            });
        }

        // --------------------------------
        // Total medicines
        // --------------------------------
        const totalMedicines =
            await Medicine.countDocuments({
                createdBy: req.userId
            });

        // --------------------------------
        // Get user's inventory
        //
        // We populate medicine and supplier
        // because dashboard sections need
        // their names.
        // --------------------------------
        const inventories =
            await Inventory.find({
                createdBy: req.userId
            })
                .select(
                    "medicine supplier batchNumber quantity purchasePrice expiryDate returnWindowDays location createdAt"
                )
                .populate(
                    "medicine",
                    "name genericName"
                )
                .populate(
                    "supplier",
                    "name companyName"
                )
                .sort({
                    createdAt: -1
                });

        // --------------------------------
        // Total batches
        // --------------------------------
        const totalBatches =
            inventories.length;

        // --------------------------------
        // Dashboard counters
        // --------------------------------
        let totalUnits = 0;
        let inventoryValue = 0;

        let expiringSoon = 0;
        let returnDue = 0;
        let returnOverdue = 0;
        let expired = 0;

        let potentialLoss = 0;

        // --------------------------------
        // Actionable dashboard sections
        // --------------------------------
        const urgentAttention = [];
        const upcomingReturns = [];

        // --------------------------------
        // Process every inventory batch
        // --------------------------------
        inventories.forEach((inventory) => {
            const quantity =
                Number(inventory.quantity) || 0;

            const purchasePrice =
                Number(inventory.purchasePrice) || 0;

            const value =
                quantity * purchasePrice;

            // -----------------------------
            // Basic totals
            // -----------------------------
            totalUnits += quantity;
            inventoryValue += value;

            // -----------------------------
            // Calculated statuses
            // -----------------------------
            const expiryStatus =
                getExpiryStatus(
                    inventory.expiryDate
                );

            const returnStatus =
                getReturnStatus(
                    inventory.expiryDate,
                    inventory.returnWindowDays
                );

            const daysUntilExpiry =
                getDaysUntilExpiry(
                    inventory.expiryDate
                );

            const returnDeadline =
                calculateReturnDeadline(
                    inventory.expiryDate,
                    inventory.returnWindowDays
                );

            const daysUntilReturnDeadline =
                getDaysUntilReturnDeadline(
                    inventory.expiryDate,
                    inventory.returnWindowDays
                );

            // -----------------------------
            // Expiry counters
            // -----------------------------
            if (
                expiryStatus ===
                "EXPIRING_SOON"
            ) {
                expiringSoon++;
            }

            if (
                expiryStatus ===
                "EXPIRED"
            ) {
                expired++;

                // Expired inventory contributes
                // to potential loss.
                potentialLoss += value;
            }

            // -----------------------------
            // Return counters
            // -----------------------------
            if (
                returnStatus ===
                "RETURN_DUE"
            ) {
                returnDue++;
            }

            if (
                returnStatus ===
                "RETURN_OVERDUE"
            ) {
                returnOverdue++;
            }

            // -----------------------------
            // Dashboard inventory object
            // -----------------------------
            const dashboardInventory = {
                _id: inventory._id,

                medicine: inventory.medicine
                    ? {
                          _id:
                              inventory.medicine._id,
                          name:
                              inventory.medicine.name,
                          genericName:
                              inventory.medicine
                                  .genericName || ""
                      }
                    : null,

                supplier: inventory.supplier
                    ? {
                          _id:
                              inventory.supplier._id,
                          name:
                              inventory.supplier.name,
                          companyName:
                              inventory.supplier
                                  .companyName
                      }
                    : null,

                batchNumber:
                    inventory.batchNumber,

                quantity,

                purchasePrice,

                inventoryValue: value,

                expiryDate:
                    inventory.expiryDate,

                returnWindowDays:
                    inventory.returnWindowDays,

                returnDeadline,

                daysUntilExpiry,

                daysUntilReturnDeadline,

                expiryStatus,

                returnStatus,

                location:
                    inventory.location,

                createdAt:
                    inventory.createdAt
            };

            // -----------------------------
            // URGENT ATTENTION
            //
            // Priority:
            // 1. EXPIRED
            // 2. RETURN_OVERDUE
            // 3. RETURN_DUE
            // 4. EXPIRING_SOON
            // -----------------------------
            let issue = null;
            let priority = 0;

            if (
                expiryStatus ===
                "EXPIRED"
            ) {
                issue = "Expired";
                priority = 1;
            } else if (
                returnStatus ===
                "RETURN_OVERDUE"
            ) {
                issue = "Return Overdue";
                priority = 2;
            } else if (
                returnStatus ===
                "RETURN_DUE"
            ) {
                issue = "Return Due";
                priority = 3;
            } else if (
                expiryStatus ===
                "EXPIRING_SOON"
            ) {
                issue = "Expiring Soon";
                priority = 4;
            }

            if (issue) {
                urgentAttention.push({
                    ...dashboardInventory,
                    issue,
                    priority
                });
            }

            // -----------------------------
            // UPCOMING RETURNS
            //
            // Only future return deadlines.
            // -----------------------------
            if (
                returnStatus === "NORMAL" &&
                daysUntilReturnDeadline !== null &&
                daysUntilReturnDeadline > 0
            ) {
                upcomingReturns.push(
                    dashboardInventory
                );
            }
        });

        // --------------------------------
        // Sort urgent attention
        //
        // Higher priority first.
        // For same priority, nearest
        // relevant date first.
        // --------------------------------
        urgentAttention.sort(
            (a, b) => {
                if (
                    a.priority !==
                    b.priority
                ) {
                    return (
                        a.priority -
                        b.priority
                    );
                }

                const aDate =
                    a.returnDeadline
                        ? new Date(
                              a.returnDeadline
                          ).getTime()
                        : Infinity;

                const bDate =
                    b.returnDeadline
                        ? new Date(
                              b.returnDeadline
                          ).getTime()
                        : Infinity;

                return aDate - bDate;
            }
        );

        // Keep dashboard manageable
        const limitedUrgentAttention =
            urgentAttention
                .slice(0, 10)
                .map(
                    ({
                        priority,
                        ...item
                    }) => item
                );

        // --------------------------------
        // Sort upcoming returns
        //
        // Nearest deadline first.
        // --------------------------------
        upcomingReturns.sort(
            (a, b) => {
                const aDate =
                    new Date(
                        a.returnDeadline
                    ).getTime();

                const bDate =
                    new Date(
                        b.returnDeadline
                    ).getTime();

                return aDate - bDate;
            }
        );

        // Show only nearest 5 upcoming returns
        const limitedUpcomingReturns =
            upcomingReturns.slice(0, 5);

        // --------------------------------
        // Recently added inventory
        //
        // Already sorted by createdAt
        // descending from MongoDB.
        // --------------------------------
        const recentInventory =
            inventories
                .slice(0, 5)
                .map((inventory) => {
                    const quantity =
                        Number(
                            inventory.quantity
                        ) || 0;

                    const purchasePrice =
                        Number(
                            inventory.purchasePrice
                        ) || 0;

                    return {
                        _id: inventory._id,

                        medicine:
                            inventory.medicine
                                ? {
                                      _id:
                                          inventory
                                              .medicine
                                              ._id,
                                      name:
                                          inventory
                                              .medicine
                                              .name,
                                      genericName:
                                          inventory
                                              .medicine
                                              .genericName ||
                                          ""
                                  }
                                : null,

                        supplier:
                            inventory.supplier
                                ? {
                                      _id:
                                          inventory
                                              .supplier
                                              ._id,
                                      name:
                                          inventory
                                              .supplier
                                              .name,
                                      companyName:
                                          inventory
                                              .supplier
                                              .companyName
                                  }
                                : null,

                        batchNumber:
                            inventory.batchNumber,

                        quantity,

                        purchasePrice,

                        inventoryValue:
                            quantity *
                            purchasePrice,

                        expiryDate:
                            inventory.expiryDate,

                        createdAt:
                            inventory.createdAt,

                        location:
                            inventory.location
                    };
                });

        // --------------------------------
        // Response
        // --------------------------------
        return res.status(200).json({
            success: true,

            stats: {
                totalMedicines,
                totalBatches,
                totalUnits,
                inventoryValue,
                expiringSoon,
                returnDue,
                returnOverdue,
                expired,
                potentialLoss
            },

            urgentAttention:
                limitedUrgentAttention,

            upcomingReturns:
                limitedUpcomingReturns,

            recentInventory
        });
    } catch (error) {
        console.error(
            "Get dashboard stats error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to load dashboard statistics"
        });
    }
};