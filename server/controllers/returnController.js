import mongoose from "mongoose";
import Return from "../models/Return.js";
import Inventory from "../models/Inventory.js";
import User from "../models/User.js";
import { getReturnStatus } from "../utils/inventoryStatus.js";

// ----------------------------------------
// Populate return consistently
// ----------------------------------------
const populatedReturn = (query) =>
    query
        .select("-createdBy")
        .populate(
            "inventory",
            "batchNumber quantity purchasePrice expiryDate returnWindowDays location"
        )
        .populate(
            "medicine",
            "name genericName manufacturer category barcode"
        )
        .populate(
            "supplier",
            "name companyName phone email"
        )
        .populate(
            "requestedBy",
            "name email role"
        );

// ----------------------------------------
// Role helpers
// ----------------------------------------
const getUserRole = async (userId) => {
    const user = await User.findById(userId).select("role");

    if (!user) {
        return null;
    }

    return String(user.role || "PHARMACIST").toUpperCase();
};

const canManageReturns = (role) =>
    ["STAFF", "ADMIN"].includes(role);

// In this application, each account owns its own workspace. Staff/admin
// accounts can manage all returns in that workspace, but there is no shop
// membership model that would authorize access to a different account's data.
const getReturnScope = (userId, role) => {
    const clauses = [
        {
            $or: [
                { createdBy: userId },
                // Existing returns predate createdBy. Their requester was
                // always assigned from the authenticated user on creation.
                { createdBy: { $exists: false }, requestedBy: userId }
            ]
        }
    ];

    if (!canManageReturns(role)) {
        clauses.push({ requestedBy: userId });
    }

    return { $and: clauses };
};

// ----------------------------------------
// Common error handler
// ----------------------------------------
const handleReturnError = (res, error, operation) => {
    console.error(`${operation} return error:`, error);

    if (error.statusCode) {
        return res.status(error.statusCode).json({
            message: error.message,
        });
    }

    if (
        error.name === "ValidationError" ||
        error.name === "CastError"
    ) {
        return res.status(400).json({
            message: error.message,
        });
    }

    return res.status(500).json({
        message: "Server error",
    });
};

// ----------------------------------------
// CREATE RETURN
// POST /api/returns
// ----------------------------------------
export const createReturn = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }

        const { inventory, quantity, reason } = req.body || {};

        if (!inventory) {
            return res.status(400).json({
                message: "Inventory ID is required",
            });
        }

        if (!mongoose.isValidObjectId(inventory)) {
            return res.status(400).json({
                message: "Invalid inventory ID",
            });
        }

        if (
            typeof quantity !== "number" ||
            !Number.isFinite(quantity) ||
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                message: "Quantity must be a positive integer",
            });
        }

        if (
            typeof reason !== "string" ||
            !reason.trim()
        ) {
            return res.status(400).json({
                message: "Return reason is required",
            });
        }

        if (reason.trim().length > 500) {
            return res.status(400).json({
                message:
                    "Return reason cannot exceed 500 characters",
            });
        }

        // Users may create requests only for inventory
        // associated with their own account.
        const inventoryRecord = await Inventory.findOne({
            _id: inventory,
            createdBy: req.userId,
        })
            .populate(
                "medicine",
                "name genericName manufacturer category barcode"
            )
            .populate(
                "supplier",
                "name companyName phone email"
            );

        if (!inventoryRecord) {
            return res.status(404).json({
                message: "Inventory not found",
            });
        }

        if (!inventoryRecord.medicine) {
            return res.status(400).json({
                message:
                    "Medicine information is missing from this inventory batch",
            });
        }

        if (!inventoryRecord.supplier) {
            return res.status(400).json({
                message:
                    "Supplier information is missing from this inventory batch",
            });
        }

        const availableQuantity = Number(
            inventoryRecord.quantity
        );

        if (
            !Number.isFinite(availableQuantity) ||
            availableQuantity < 0
        ) {
            return res.status(400).json({
                message:
                    "Available inventory quantity is invalid",
            });
        }

        if (quantity > availableQuantity) {
            return res.status(400).json({
                message:
                    "Return quantity cannot exceed available inventory quantity",
                availableQuantity,
            });
        }

        // A return can be requested only when due or overdue.
        const returnStatus = getReturnStatus(
            inventoryRecord.expiryDate,
            inventoryRecord.returnWindowDays
        );

        if (
            !["RETURN_DUE", "RETURN_OVERDUE"].includes(
                returnStatus
            )
        ) {
            return res.status(400).json({
                message:
                    "This inventory batch is not eligible for return. Returns are allowed only when the return deadline is due or overdue.",
                returnStatus,
            });
        }

        const purchasePrice = Number(
            inventoryRecord.purchasePrice
        );

        if (
            !Number.isFinite(purchasePrice) ||
            purchasePrice < 0
        ) {
            return res.status(400).json({
                message: "Inventory purchase price is invalid",
            });
        }

        const returnValue = quantity * purchasePrice;

        // Do not deduct inventory at creation time.
        const returnRequest = await Return.create({
            inventory: inventoryRecord._id,
            medicine: inventoryRecord.medicine._id,
            supplier: inventoryRecord.supplier._id,
            batchNumber: inventoryRecord.batchNumber,
            quantity,
            returnValue,
            reason: reason.trim(),
            status: "PENDING",
            requestedBy: req.userId,
            createdBy: req.userId,
            processedAt: null,
        });

        const createdReturn = await populatedReturn(
            Return.findById(returnRequest._id)
        );

        return res.status(201).json({
            message: "Return request created successfully",
            return: createdReturn,
        });
    } catch (error) {
        return handleReturnError(res, error, "Create");
    }
};

// ----------------------------------------
// GET ALL RETURNS
// GET /api/returns
// PHARMACIST: own requests
// STAFF / ADMIN: all requests in their own account workspace
// ----------------------------------------
export const getReturns = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }

        const role = await getUserRole(req.userId);

        if (!role) {
            return res.status(401).json({
                message: "User account not found",
            });
        }

        const filter = getReturnScope(req.userId, role);

        const returns = await populatedReturn(
            Return.find(filter).sort({
                createdAt: -1,
            })
        );

        return res.status(200).json({
            count: returns.length,
            returns,
        });
    } catch (error) {
        return handleReturnError(res, error, "Get");
    }
};

// ----------------------------------------
// GET RETURN BY ID
// GET /api/returns/:id
// PHARMACIST: own request
// STAFF / ADMIN: any request in their own account workspace
// ----------------------------------------
export const getReturnById = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }

        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid return ID",
            });
        }

        const role = await getUserRole(req.userId);

        if (!role) {
            return res.status(401).json({
                message: "User account not found",
            });
        }

        const returnRequest = await populatedReturn(
            Return.findOne({
                $and: [{ _id: id }, getReturnScope(req.userId, role)]
            })
        );

        if (!returnRequest) {
            return res.status(404).json({
                message: "Return request not found",
            });
        }

        return res.status(200).json({
            return: returnRequest,
        });
    } catch (error) {
        return handleReturnError(res, error, "Get by ID");
    }
};

// ----------------------------------------
// UPDATE RETURN STATUS
// PATCH /api/returns/:id/status
// Only STAFF / ADMIN can change status.
// ----------------------------------------
export const updateReturnStatus = async (req, res) => {
    let session;

    const allowedTransitions = {
        PENDING: ["APPROVED", "REJECTED"],
        APPROVED: ["RETURNED"],
        REJECTED: [],
        RETURNED: [],
    };

    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }

        // Get the trusted role from the database.
        const role = await getUserRole(req.userId);

        if (!role) {
            return res.status(401).json({
                message: "User account not found",
            });
        }

        // Pharmacists can create and view their requests,
        // but cannot approve, reject, or complete them.
        if (!canManageReturns(role)) {
            return res.status(403).json({
                message:
                    "Permission denied. Only staff or administrators can update return status.",
            });
        }

        const { id } = req.params;
        const { status } = req.body || {};

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid return ID",
            });
        }

        const validTargetStatuses = [
            "APPROVED",
            "REJECTED",
            "RETURNED",
        ];

        if (!validTargetStatuses.includes(status)) {
            return res.status(400).json({
                message:
                    "Invalid target status. Allowed values: APPROVED, REJECTED, RETURNED",
            });
        }

        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            const returnRequest = await Return.findOne({
                $and: [
                    { _id: id },
                    getReturnScope(req.userId, role)
                ]
            })
                .session(session);

            if (!returnRequest) {
                const error = new Error(
                    "Return request not found"
                );

                error.statusCode = 404;
                throw error;
            }

            const ownedInventory = await Inventory.findOne({
                _id: returnRequest.inventory,
                createdBy: req.userId
            })
                .select("_id")
                .session(session);

            if (!ownedInventory) {
                const error = new Error("Return request not found");
                error.statusCode = 404;
                throw error;
            }

            const currentStatus = returnRequest.status;

            if (
                !allowedTransitions[currentStatus]?.includes(status)
            ) {
                const error = new Error(
                    `Status cannot change from ${currentStatus} to ${status}.`
                );

                error.statusCode = 400;
                throw error;
            }

            // Deduct stock only when APPROVED becomes RETURNED.
            if (
                currentStatus === "APPROVED" &&
                status === "RETURNED"
            ) {
                const inventoryUpdate =
                    await Inventory.updateOne(
                        {
                            _id: returnRequest.inventory,
                            createdBy: req.userId,
                            quantity: {
                                $gte: returnRequest.quantity,
                            },
                        },
                        {
                            $inc: {
                                quantity: -returnRequest.quantity,
                            },
                        },
                        {
                            session,
                        }
                    );

                const modifiedCount =
                    inventoryUpdate.modifiedCount ??
                    inventoryUpdate.nModified ??
                    0;

                if (modifiedCount !== 1) {
                    const error = new Error(
                        "Inventory could not be updated. The batch may be missing or may not have sufficient stock."
                    );

                    error.statusCode = 409;
                    throw error;
                }
            }

            // Update status in the same transaction.
            // If saving fails, inventory deduction rolls back.
            returnRequest.status = status;
            returnRequest.processedAt = new Date();
            // Backfill legacy records once their requester/owner scope and
            // inventory ownership have both been verified.
            returnRequest.createdBy = req.userId;

            await returnRequest.save({ session });
        });

        const updatedReturn = await populatedReturn(
            Return.findOne({
                $and: [
                    { _id: id },
                    getReturnScope(req.userId, role)
                ]
            })
        );

        return res.status(200).json({
            message: "Return status updated successfully",
            return: updatedReturn,
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message,
            });
        }

        return handleReturnError(
            res,
            error,
            "Update status"
        );
    } finally {
        if (session) {
            await session.endSession();
        }
    }
};
