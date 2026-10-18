import mongoose from "mongoose";
import Inventory from "../models/Inventory.js";
import Medicine from "../models/Medicine.js";
import Supplier from "../models/Supplier.js";
import InventoryActivity from "../models/InventoryActivity.js";
import {
    calculateReturnDeadline,
    getExpiryStatus,
    getReturnStatus,
    getDaysUntilExpiry,
    getDaysUntilReturnDeadline
} from "../utils/inventoryStatus.js";

// ----------------------------------------
// Populate inventory consistently
// ----------------------------------------
// Allowed inventory status filters.

const INVENTORY_FILTER_STATUSES = new Set([
    "LOW_STOCK",
    "EXPIRING_SOON",
    "EXPIRED",
    "RETURN_DUE",
    "RETURN_OVERDUE",
    "NORMAL",
]);

// Allowed fields for inventory sorting.

const INVENTORY_SORT_FIELDS = new Set([
    "expiryDate",
    "quantity",
    "purchasePrice",
    "createdAt",
    "batchNumber",
]);

// Configurable low-stock threshold.
// A batch with 10 or fewer units is considered low stock.

const LOW_STOCK_THRESHOLD = 10;

// Prevent user input from changing regex meaning.

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const populatedInventory = (query) =>
    query
        .populate(
            "medicine",
            "name genericName manufacturer category barcode"
        )
        .populate(
            "supplier",
            "name companyName phone email"
        )
        .populate(
            "createdBy",
            "name email role"
        );

// ----------------------------------------
// Calculate all derived inventory values
//
// IMPORTANT:
// These values are NOT stored in MongoDB.
// They are calculated every time the API
// returns inventory data.
// ----------------------------------------

const addInventoryStatus = (inventory) => {
    if (!inventory) {
        return inventory;
    }
    const item =
        typeof inventory.toObject === "function"
            ? inventory.toObject()
            : inventory;
    // -----------------------------
    // Basic calculated values
    // -----------------------------
    const quantity = Number(item.quantity) || 0;
    const purchasePrice =
        Number(item.purchasePrice) || 0;
    const inventoryValue =
        quantity * purchasePrice;
    // -----------------------------
    // Date calculations
    // -----------------------------
    const returnDeadline =
        calculateReturnDeadline(
            item.expiryDate,
            item.returnWindowDays
        );
    const daysUntilExpiry =
        getDaysUntilExpiry(
            item.expiryDate
        );
    const daysUntilReturnDeadline =
        getDaysUntilReturnDeadline(
            item.expiryDate,
            item.returnWindowDays
        );
    // -----------------------------
    // Status calculations
    // -----------------------------
    const expiryStatus =
        getExpiryStatus(
            item.expiryDate
        );
    const returnStatus =
        getReturnStatus(
            item.expiryDate,
            item.returnWindowDays
        );
    // -----------------------------
    // Potential loss
    //
    // Only expired inventory is
    // currently considered potential loss.
    // -----------------------------
    const potentialLoss =
        expiryStatus === "EXPIRED"
            ? inventoryValue
            : 0;
    return {
        ...item,
        // -----------------------------
        // Calculated values
        // -----------------------------
        returnDeadline,
        inventoryValue,
        potentialLoss,
        daysUntilExpiry,
        daysUntilReturnDeadline,
        expiryStatus,
        returnStatus
    };
};

// ----------------------------------------
// Add calculated values to multiple records
// ----------------------------------------

const addInventoryStatuses = (inventories) =>
    inventories.map((inventory) =>
        addInventoryStatus(inventory)
    );

// ----------------------------------------
// Inventory activity-log helpers
// ----------------------------------------

const getInventoryActivityValues = (inventory) => ({
    quantity: inventory.quantity ?? null,
    purchasePrice: inventory.purchasePrice ?? null,
    expiryDate: inventory.expiryDate
        ? new Date(inventory.expiryDate)
        : null,
    returnWindowDays: inventory.returnWindowDays ?? null,
    location: inventory.location ?? null,
});

const areActivityValuesEqual = (previousValue, newValue) => {
    if (previousValue == null && newValue == null) {
        return true;
    }
    if (previousValue == null || newValue == null) {
        return false;
    }
    if (previousValue instanceof Date || newValue instanceof Date) {
        const previousTime = new Date(previousValue).getTime();
        const newTime = new Date(newValue).getTime();
        return previousTime === newTime;
    }
    return previousValue === newValue;
};

const buildInventoryActivityChanges = (previousValues, newValues) =>
    Object.entries(newValues).flatMap(([field, newValue]) => {
        const previousValue = previousValues[field];
        if (areActivityValuesEqual(previousValue, newValue)) {
            return [];
        }
        return [{
            field,
            previousValue: previousValue ?? null,
            newValue: newValue ?? null,
        }];
    });

const getReferenceId = (value) => {
    if (value == null) {
        return null;
    }
    if (value._id) {
        return value._id.toString();
    }
    return typeof value.toString === "function"
        ? value.toString()
        : value;
};

// Keep a field snapshot for creation/deletion so useful batch details
// remain in the activity log after the Inventory document is removed.

const buildInventorySnapshotChanges = (inventory, action) => {
    const values = {
        medicine: getReferenceId(inventory.medicine),
        supplier: getReferenceId(inventory.supplier),
        batchNumber: inventory.batchNumber ?? null,
        quantity: inventory.quantity ?? null,
        purchasePrice: inventory.purchasePrice ?? null,
        expiryDate: inventory.expiryDate
            ? new Date(inventory.expiryDate)
            : null,
        returnWindowDays: inventory.returnWindowDays ?? null,
        location: inventory.location ?? null,
    };
    return Object.entries(values).map(([field, value]) => ({
        field,
        previousValue: action === "DELETED" ? value : null,
        newValue: action === "CREATED" ? value : null,
    }));
};

const getMedicineName = async (medicineId, userId, session = null) => {
    let query = Medicine.findOne({
        _id: medicineId,
        createdBy: userId,
    })
        .select("name")
        .lean();
    if (session) {
        query = query.session(session);
    }
    const medicine = await query;
    return medicine?.name || "Unknown medicine";
};

// ----------------------------------------
// Read JSON body
// ----------------------------------------

const readJsonBody = (req, res) => {
    if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
    ) {
        res.status(400).json({
            message:
                "Request body must be a JSON object"
        });
        return null;
    }
    return req.body;
};

// ----------------------------------------
// Validate non-negative number
// ----------------------------------------

const isNonNegativeNumber = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0;

// ----------------------------------------
// Parse expiry date safely
// ----------------------------------------

const parseExpiryDate = (value) => {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return null;
    }
    const normalizedValue =
        value.trim();
    const datePart =
        normalizedValue.match(
            /^(\d{4}-\d{2}-\d{2})(?:$|T)/
        )?.[1];
    if (!datePart) {
        return null;
    }
    const calendarDate = new Date(
        `${datePart}T00:00:00.000Z`
    );
    if (
        Number.isNaN(calendarDate.getTime()) ||
        calendarDate
            .toISOString()
            .slice(0, 10) !== datePart
    ) {
        return null;
    }
    const date =
        new Date(normalizedValue);
    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date;
};

// ----------------------------------------
// Common inventory error handler
// ----------------------------------------

const handleInventoryError = (
    res,
    error,
    operation
) => {
    console.error(
        `${operation} inventory error:`,
        error
    );
    // Duplicate medicine + batch
    if (error.code === 11000) {
        return res.status(409).json({
            message:
                "This batch number already exists for this medicine"
        });
    }
    // Mongoose validation / cast error
    if (
        error.name === "ValidationError" ||
        error.name === "CastError"
    ) {
        return res.status(400).json({
            message: error.message
        });
    }
    return res.status(500).json({
        message: "Server error"
    });
};

/*
|--------------------------------------------------------------------------
| CREATE INVENTORY
|--------------------------------------------------------------------------
*/

export const createInventory = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message:
                    "Unauthorized request"
            });
        }
        const body =
            readJsonBody(req, res);
        if (!body) {
            return;
        }
        let {
            medicine,
            supplier,
            batchNumber,
            quantity,
            purchasePrice,
            expiryDate,
            returnWindowDays,
            location
        } = body;
        // -----------------------------
        // Medicine validation
        // -----------------------------
        if (
            typeof medicine !== "string" ||
            !medicine
        ) {
            return res.status(400).json({
                message:
                    "Medicine ID is required"
            });
        }
        if (
            !mongoose.isValidObjectId(
                medicine
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid medicine ID"
            });
        }
        const existingMedicine =
            await Medicine.findOne({
                _id: medicine,
                createdBy: req.userId
            });
        if (!existingMedicine) {
            return res.status(404).json({
                message:
                    "Medicine not found"
            });
        }
        // -----------------------------
        // Supplier validation
        // -----------------------------
        if (!supplier) {
            return res.status(400).json({
                message:
                    "Supplier is required"
            });
        }
        if (
            !mongoose.isValidObjectId(
                supplier
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid supplier ID"
            });
        }
        const supplierExists =
            await Supplier.exists({
                _id: supplier,
                createdBy: req.userId
            });
        if (!supplierExists) {
            return res.status(404).json({
                message:
                    "Supplier not found"
            });
        }
        // -----------------------------
        // Batch number validation
        // -----------------------------
        if (
            typeof batchNumber !==
                "string" ||
            !batchNumber.trim()
        ) {
            return res.status(400).json({
                message:
                    "Batch number is required"
            });
        }
        batchNumber =
            batchNumber.trim();
        // -----------------------------
        // Quantity validation
        // -----------------------------
        if (
            quantity === undefined ||
            quantity === null
        ) {
            return res.status(400).json({
                message:
                    "Quantity is required"
            });
        }
        if (
            !isNonNegativeNumber(quantity)
        ) {
            return res.status(400).json({
                message:
                    "Quantity must be a valid non-negative number"
            });
        }
        // -----------------------------
        // Purchase price validation
        // -----------------------------
        if (
            purchasePrice === undefined ||
            purchasePrice === null
        ) {
            return res.status(400).json({
                message:
                    "Purchase price is required"
            });
        }
        if (
            !isNonNegativeNumber(
                purchasePrice
            )
        ) {
            return res.status(400).json({
                message:
                    "Purchase price must be a valid non-negative number"
            });
        }
        // -----------------------------
        // Expiry date validation
        // -----------------------------
        if (
            expiryDate === undefined ||
            expiryDate === null ||
            expiryDate === ""
        ) {
            return res.status(400).json({
                message:
                    "Expiry date is required"
            });
        }
        const parsedExpiryDate =
            parseExpiryDate(
                expiryDate
            );
        if (!parsedExpiryDate) {
            return res.status(400).json({
                message:
                    "Invalid expiry date"
            });
        }
        // -----------------------------
        // Return window validation
        // -----------------------------
        if (
            returnWindowDays ===
                undefined ||
            returnWindowDays === null
        ) {
            return res.status(400).json({
                message:
                    "Return window days is required"
            });
        }
        if (
            !isNonNegativeNumber(
                returnWindowDays
            )
        ) {
            return res.status(400).json({
                message:
                    "Return window days must be a valid non-negative number"
            });
        }
        // -----------------------------
        // Location validation
        // -----------------------------
        if (
            typeof location !== "string" ||
            !location.trim()
        ) {
            return res.status(400).json({
                message:
                    "Location is required"
            });
        }
        location =
            location.trim();
        // -----------------------------
        // Duplicate batch check
        // -----------------------------
        const existingBatch =
            await Inventory.findOne({
                medicine,
                batchNumber
            });
        if (existingBatch) {
            return res.status(409).json({
                message:
                    "This batch number already exists for this medicine"
            });
        }
        // -----------------------------
        // Create inventory
        // -----------------------------
        let inventory;
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            [inventory] = await Inventory.create([{
                medicine,
                supplier,
                batchNumber,
                quantity,
                purchasePrice,
                expiryDate: parsedExpiryDate,
                returnWindowDays,
                location,
                createdBy: req.userId,
            }], { session });
            await InventoryActivity.create([{
                inventoryId: inventory._id,
                action: "CREATED",
                batchNumber: inventory.batchNumber,
                medicineName: existingMedicine.name || "Unknown medicine",
                changes: buildInventorySnapshotChanges(inventory, "CREATED"),
                performedBy: req.userId,
            }], { session });
            await session.commitTransaction();
        } catch (transactionError) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw transactionError;
        } finally {
            await session.endSession();
        }
        // -----------------------------
        // Populate response
        // -----------------------------
        const createdInventory =
            await populatedInventory(
                Inventory.findById(
                    inventory._id
                )
            );
        // -----------------------------
        // Add calculated values
        // -----------------------------
        const inventoryWithStatus =
            addInventoryStatus(
                createdInventory
            );
        return res.status(201).json({
            message:
                "Inventory created successfully",
            inventory:
                inventoryWithStatus
        });
    } catch (error) {
        return handleInventoryError(
            res,
            error,
            "Create"
        );
    }
};

/*
|--------------------------------------------------------------------------
| GET ALL INVENTORIES
|--------------------------------------------------------------------------
*/

export const getInventories = async (req, res) => {
    try {
        // 1. Authentication
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }
        // 2. Read and validate search and status filters.
        if (
            req.query.search !== undefined &&
            typeof req.query.search !== "string"
        ) {
            return res.status(400).json({
                message: "Search must be a single text value.",
            });
        }
        if (
            req.query.status !== undefined &&
            typeof req.query.status !== "string"
        ) {
            return res.status(400).json({
                message: "Status must be a single text value.",
            });
        }
        const search = (req.query.search || "").trim().slice(0, 100);
        const status = (req.query.status || "ALL")
            .trim()
            .toUpperCase();
        if (
            status !== "ALL" &&
            !INVENTORY_FILTER_STATUSES.has(status)
        ) {
            return res.status(400).json({
                message: "Invalid inventory status filter.",
                acceptedStatuses: [
                    "ALL",
                    ...INVENTORY_FILTER_STATUSES,
                ],
            });
        }
        // 3. Validate sorting.
        const sortBy =
            typeof req.query.sortBy === "string"
                ? req.query.sortBy
                : "createdAt";
        const order =
            typeof req.query.order === "string"
                ? req.query.order.toLowerCase()
                : "desc";
        if (!INVENTORY_SORT_FIELDS.has(sortBy)) {
            return res.status(400).json({
                message: "Invalid sorting field.",
                acceptedSortFields: [
                    ...INVENTORY_SORT_FIELDS,
                ],
            });
        }
        if (!["asc", "desc"].includes(order)) {
            return res.status(400).json({
                message: "Order must be asc or desc.",
            });
        }
        // 4. Validate pagination. Pagination remains optional so
        // existing Dashboard and Returns requests keep working.
        const paginationRequested =
            req.query.page !== undefined ||
            req.query.limit !== undefined;
        const parsePositiveInteger = (value, fallback) => {
            if (value === undefined) return fallback;
            const parsed = Number(value);
            return Number.isInteger(parsed) && parsed > 0
                ? parsed
                : null;
        };
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = parsePositiveInteger(req.query.limit, 10);
        if (page === null) {
            return res.status(400).json({
                message: "Page must be a positive integer.",
            });
        }
        if (limit === null || limit > 100) {
            return res.status(400).json({
                message: "Limit must be between 1 and 100.",
            });
        }
        // 5. Always scope inventory to the logged-in user.
        const inventoryFilter = {
            createdBy: req.userId,
        };
        // Preserve the medicine-specific URL filter.
        if (req.query.medicineId !== undefined) {
            const medicineId = req.query.medicineId;
            if (
                typeof medicineId !== "string" ||
                !mongoose.isValidObjectId(medicineId)
            ) {
                return res.status(400).json({
                    message: "Invalid medicine ID.",
                });
            }
            inventoryFilter.medicine = medicineId;
        }
        // 6. Search medicine, generic name, batch, supplier,
        // and location. Search input is escaped before regex use.
        if (search) {
            const searchRegex = new RegExp(
                escapeRegex(search),
                "i"
            );
            const [matchingMedicines, matchingSuppliers] =
                await Promise.all([
                    Medicine.find({
                        createdBy: req.userId,
                        $or: [
                            { name: searchRegex },
                            { genericName: searchRegex },
                        ],
                    })
                        .select("_id")
                        .lean(),
                    Supplier.find({
                        createdBy: req.userId,
                        $or: [
                            { name: searchRegex },
                            { companyName: searchRegex },
                        ],
                    })
                        .select("_id")
                        .lean(),
                ]);
            const searchConditions = [
                { batchNumber: searchRegex },
                { location: searchRegex },
            ];
            if (matchingMedicines.length > 0) {
                searchConditions.push({
                    medicine: {
                        $in: matchingMedicines.map(
                            (item) => item._id
                        ),
                    },
                });
            }
            if (matchingSuppliers.length > 0) {
                searchConditions.push({
                    supplier: {
                        $in: matchingSuppliers.map(
                            (item) => item._id
                        ),
                    },
                });
            }
            inventoryFilter.$or = searchConditions;
        }
        // 7. Fetch authorized inventory, then calculate shared statuses.
        const inventoryRecords = await populatedInventory(
            Inventory.find(inventoryFilter).sort({
                createdAt: -1,
            })
        );
        let results = addInventoryStatuses(inventoryRecords);
        // 8. Apply status filtering before sorting and pagination.
        results = results.filter((item) => {
            switch (status) {
                case "LOW_STOCK":
                    return (
                        Number(item.quantity) <=
                        LOW_STOCK_THRESHOLD
                    );
                case "EXPIRING_SOON":
                    return item.expiryStatus === "EXPIRING_SOON";
                case "EXPIRED":
                    return item.expiryStatus === "EXPIRED";
                case "RETURN_DUE":
                    return item.returnStatus === "RETURN_DUE";
                case "RETURN_OVERDUE":
                    return item.returnStatus === "RETURN_OVERDUE";
                case "NORMAL":
                    return (
                        item.expiryStatus === "NORMAL" &&
                        item.returnStatus === "NORMAL"
                    );
                case "ALL":
                default:
                    return true;
            }
        });
        // 9. Sort by an allowlisted field.
        const dateFields = new Set([
            "expiryDate",
            "createdAt",
        ]);
        results.sort((left, right) => {
            const a = left[sortBy];
            const b = right[sortBy];
            // Keep missing values last in either sort direction.
            if (a == null && b == null) return 0;
            if (a == null) return 1;
            if (b == null) return -1;
            let comparison;
            if (dateFields.has(sortBy)) {
                comparison =
                    new Date(a).getTime() -
                    new Date(b).getTime();
            } else if (
                ["quantity", "purchasePrice"].includes(sortBy)
            ) {
                comparison = Number(a) - Number(b);
            } else {
                comparison = String(a).localeCompare(
                    String(b),
                    undefined,
                    {
                        numeric: true,
                        sensitivity: "base",
                    }
                );
            }
            return order === "asc"
                ? comparison
                : -comparison;
        });
        // 10. Calculate metadata, then paginate if requested.
        const totalItems = results.length;
        let totalPages = 0;
        let responsePage = 1;
        let responseLimit = totalItems;
        let data = results;
        if (paginationRequested) {
            responsePage = page;
            responseLimit = limit;
            totalPages = Math.ceil(totalItems / limit);
            const startIndex = (page - 1) * limit;
            data = results.slice(startIndex, startIndex + limit);
        } else {
            // Backward compatibility: without pagination parameters,
            // return all matches to existing application pages.
            totalPages = totalItems > 0 ? 1 : 0;
        }
        // 11. Return the new response format and legacy inventories alias.
        return res.status(200).json({
            success: true,
            data,
            inventories: data,
            count: totalItems,
            pagination: {
                page: responsePage,
                limit: responseLimit,
                totalItems,
                totalPages,
            },
        });
    } catch (error) {
        return handleInventoryError(res, error, "Get");
    }
};

/*
|--------------------------------------------------------------------------
| GET INVENTORY BY ID
|--------------------------------------------------------------------------
*/

export const getInventoryById = async (
    req,
    res
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message:
                    "Unauthorized request"
            });
        }
        const { id } =
            req.params;
        if (
            !mongoose.isValidObjectId(
                id
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid inventory ID"
            });
        }
        const inventory =
            await populatedInventory(
                Inventory.findOne({
                    _id: id,
                    createdBy:
                        req.userId
                })
            );
        if (!inventory) {
            return res.status(404).json({
                message:
                    "Inventory not found"
            });
        }
        // -----------------------------
        // Add calculated values
        // -----------------------------
        const inventoryWithStatus =
            addInventoryStatus(
                inventory
            );
        return res.status(200).json({
            inventory:
                inventoryWithStatus
        });
    } catch (error) {
        return handleInventoryError(
            res,
            error,
            "Get by ID"
        );
    }
};

/*
|--------------------------------------------------------------------------
| GET INVENTORY ACTIVITY HISTORY
|--------------------------------------------------------------------------
*/

export const getInventoryActivity = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized request",
            });
        }
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                message: "Invalid inventory ID",
            });
        }
        // A current batch must belong to the user. For a deleted batch,
        // allow access only when this user has an existing activity record.
        const [ownedInventory, userActivity] = await Promise.all([
            Inventory.exists({
                _id: id,
                createdBy: req.userId,
            }),
            InventoryActivity.exists({
                inventoryId: id,
                performedBy: req.userId,
            }),
        ]);
        if (!ownedInventory && !userActivity) {
            return res.status(404).json({
                message: "Inventory activity history not found",
            });
        }
        const activities = await InventoryActivity.find({
            inventoryId: id,
        })
            .sort({ createdAt: -1, _id: -1 })
            .populate("performedBy", "name email role")
            .lean();
        return res.status(200).json({
            success: true,
            count: activities.length,
            activities,
        });
    } catch (error) {
        return handleInventoryError(res, error, "Get activity history");
    }
};

/*
|--------------------------------------------------------------------------
| UPDATE INVENTORY
|--------------------------------------------------------------------------
|
| Medicine, Supplier and Batch Number
| are intentionally read-only after
| batch creation.
|
| Editable:
| - quantity
| - purchasePrice
| - expiryDate
| - returnWindowDays
| - location
|
|--------------------------------------------------------------------------
*/

export const updateInventory = async (
    req,
    res
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message:
                    "Unauthorized request"
            });
        }
        const { id } =
            req.params;
        if (
            !mongoose.isValidObjectId(
                id
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid inventory ID"
            });
        }
        const inventory =
            await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                message:
                    "Inventory not found"
            });
        }
        if (
            inventory.createdBy?.toString() !==
            req.userId.toString()
        ) {
            return res.status(403).json({
                message:
                    "You are not authorized to update this inventory"
            });
        }
        const body =
            readJsonBody(req, res);
        if (!body) {
            return;
        }
        // Capture the persisted values before applying any requested updates.
        const previousValues = getInventoryActivityValues(inventory);
        let {
            quantity,
            purchasePrice,
            expiryDate,
            returnWindowDays,
            location
        } = body;
        // -----------------------------
        // Quantity
        // -----------------------------
        if (
            quantity !== undefined
        ) {
            if (
                !isNonNegativeNumber(
                    quantity
                )
            ) {
                return res.status(400).json({
                    message:
                        "Quantity must be a valid non-negative number"
                });
            }
            inventory.quantity =
                quantity;
        }
        // -----------------------------
        // Purchase price
        // -----------------------------
        if (
            purchasePrice !==
            undefined
        ) {
            if (
                !isNonNegativeNumber(
                    purchasePrice
                )
            ) {
                return res.status(400).json({
                    message:
                        "Purchase price must be a valid non-negative number"
                });
            }
            inventory.purchasePrice =
                purchasePrice;
        }
        // -----------------------------
        // Expiry date
        // -----------------------------
        if (
            expiryDate !== undefined
        ) {
            const parsedExpiryDate =
                parseExpiryDate(
                    expiryDate
                );
            if (!parsedExpiryDate) {
                return res.status(400).json({
                    message:
                        "Invalid expiry date"
                });
            }
            inventory.expiryDate =
                parsedExpiryDate;
        }
        // -----------------------------
        // Return window
        // -----------------------------
        if (
            returnWindowDays !==
            undefined
        ) {
            if (
                !isNonNegativeNumber(
                    returnWindowDays
                )
            ) {
                return res.status(400).json({
                    message:
                        "Return window days must be a valid non-negative number"
                });
            }
            inventory.returnWindowDays =
                returnWindowDays;
        }
        // -----------------------------
        // Location
        // -----------------------------
        if (
            location !== undefined
        ) {
            if (
                typeof location !==
                    "string" ||
                !location.trim()
            ) {
                return res.status(400).json({
                    message:
                        "Location cannot be empty"
                });
            }
            inventory.location =
                location.trim();
        }
        // -----------------------------
        // Save changes
        // -----------------------------
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            await inventory.save({ session });
            const newValues = getInventoryActivityValues(inventory);
            const changes = buildInventoryActivityChanges(
                previousValues,
                newValues
            );
            const medicineName = await getMedicineName(
                inventory.medicine,
                req.userId,
                session
            );
            await InventoryActivity.create([{
                inventoryId: inventory._id,
                action: "UPDATED",
                batchNumber: inventory.batchNumber,
                medicineName,
                changes,
                performedBy: req.userId,
            }], { session });
            await session.commitTransaction();
        } catch (transactionError) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw transactionError;
        } finally {
            await session.endSession();
        }
        // -----------------------------
        // Populate updated inventory
        // -----------------------------
        const updatedInventory =
            await populatedInventory(
                Inventory.findById(id)
            );
        // -----------------------------
        // Recalculate all derived values
        //
        // This automatically updates:
        // - returnDeadline
        // - inventoryValue
        // - potentialLoss
        // - daysUntilExpiry
        // - daysUntilReturnDeadline
        // - expiryStatus
        // - returnStatus
        // -----------------------------
        const inventoryWithStatus =
            addInventoryStatus(
                updatedInventory
            );
        return res.status(200).json({
            message:
                "Inventory updated successfully",
            inventory:
                inventoryWithStatus
        });
    } catch (error) {
        return handleInventoryError(
            res,
            error,
            "Update"
        );
    }
};

/*
|--------------------------------------------------------------------------
| DELETE INVENTORY
|--------------------------------------------------------------------------
*/

export const deleteInventory = async (
    req,
    res
) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                message:
                    "Unauthorized request"
            });
        }
        const { id } =
            req.params;
        if (
            !mongoose.isValidObjectId(
                id
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid inventory ID"
            });
        }
        const inventory =
            await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                message:
                    "Inventory not found"
            });
        }
        if (
            inventory.createdBy?.toString() !==
            req.userId.toString()
        ) {
            return res.status(403).json({
                message:
                    "You are not authorized to delete this inventory"
            });
        }
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const medicineName = await getMedicineName(
                inventory.medicine,
                req.userId,
                session
            );
            // Record the final field values before deleting the batch.
            await InventoryActivity.create([{
                inventoryId: inventory._id,
                action: "DELETED",
                batchNumber: inventory.batchNumber,
                medicineName,
                changes: buildInventorySnapshotChanges(inventory, "DELETED"),
                performedBy: req.userId,
            }], { session });
            const deleteResult = await Inventory.deleteOne({
                _id: id,
                createdBy: req.userId,
            }).session(session);
            if (deleteResult.deletedCount !== 1) {
                const deletionError = new Error("Inventory not found");
                deletionError.name = "InventoryNotFoundError";
                throw deletionError;
            }
            await session.commitTransaction();
        } catch (transactionError) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            if (transactionError.name === "InventoryNotFoundError") {
                return res.status(404).json({
                    message: "Inventory not found",
                });
            }
            throw transactionError;
        } finally {
            await session.endSession();
        }
        return res.status(200).json({
            message:
                "Inventory deleted successfully"
        });
    } catch (error) {
        return handleInventoryError(
            res,
            error,
            "Delete"
        );
    }
};

/*
|--------------------------------------------------------------------------
| GET RECENT INVENTORY ACTIVITY
|--------------------------------------------------------------------------
|
| Returns activity for inventory batches owned by the authenticated user,
| including batches that have since been deleted.
|
| Query parameters:
| - page: optional positive integer (default 1)
| - limit: optional positive integer (default 20, maximum 100)
|--------------------------------------------------------------------------
*/

export const getRecentInventoryActivity = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized request",
            });
        }
        const parsePositiveInteger = (value, fallback) => {
            if (value === undefined) return fallback;
            const parsed = Number(value);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        };
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = parsePositiveInteger(req.query.limit, 20);
        if (page === null) {
            return res.status(400).json({
                success: false,
                message: "Page must be a positive integer.",
            });
        }
        if (limit === null || limit > 100) {
            return res.status(400).json({
                success: false,
                message: "Limit must be between 1 and 100.",
            });
        }
        // Include active batches owned by this user and deleted batches for
        // which this user performed the DELETED action. This lets us retrieve
        // the full history for those batches without exposing other users' logs.
        const [ownedInventoryIds, deletedBatchIds] = await Promise.all([
            Inventory.distinct("_id", { createdBy: req.userId }),
            InventoryActivity.distinct("inventoryId", {
                action: "DELETED",
                performedBy: req.userId,
            }),
        ]);
        const uniqueInventoryIds = [
            ...new Map(
                [...ownedInventoryIds, ...deletedBatchIds].map((id) => [
                    id.toString(),
                    id,
                ])
            ).values(),
        ];
        if (uniqueInventoryIds.length === 0) {
            return res.status(200).json({
                success: true,
                activities: [],
                count: 0,
                pagination: {
                    page,
                    limit,
                    totalItems: 0,
                    totalPages: 0,
                },
            });
        }
        const activityFilter = {
            inventoryId: { $in: uniqueInventoryIds },
        };
        const totalItems = await InventoryActivity.countDocuments(activityFilter);
        const totalPages = Math.ceil(totalItems / limit);
        const activities = await InventoryActivity.find(activityFilter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("performedBy", "name email role")
            .lean();
        return res.status(200).json({
            success: true,
            activities,
            count: totalItems,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
            },
        });
    } catch (error) {
        console.error("Get recent inventory activity error:", error);
        return handleInventoryError(res, error, "Get recent activity");
    }
};
