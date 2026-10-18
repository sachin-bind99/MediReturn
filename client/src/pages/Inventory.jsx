

import { useCallback, useEffect, useState } from "react";
import {
    Link,
    useLocation,
    useNavigate,
    useSearchParams,
} from "react-router-dom";
import api from "../lib/api";
import InventoryForm from "../components/inventory/InventoryForm";

const RECENT_ACTIVITY_PAGE_SIZE = 10;

const VALID_INVENTORY_STATUSES = new Set([
    "ALL",
    "LOW_STOCK",
    "EXPIRING_SOON",
    "EXPIRED",
    "RETURN_DUE",
    "RETURN_OVERDUE",
    "NORMAL",
]);

function Inventory() {
    const navigate = useNavigate();
    const location = useLocation();
    const scannerPrefill = location.state?.scannerPrefill ?? null;
    const legacyScannerPrefill = location.state?.openInventoryForm
        ? location.state.initialValues ?? {}
        : null;
    const routePrefill = scannerPrefill ?? legacyScannerPrefill;
    const clearScannerPrefill = () => {
        if (routePrefill === null) return;
        navigate(
            {
                pathname: location.pathname,
                search: location.search,
            },
            {
                replace: true,
                state: null,
            }
        );
    };
    const [searchParams, setSearchParams] = useSearchParams();

    // --------------------------------
    // Inventory
    // --------------------------------
    const [inventories, setInventories] = useState([]);

    // --------------------------------
    // Search
    // --------------------------------
    const [search, setSearch] = useState("");
    const requestedStatus = (searchParams.get("status") || "ALL").toUpperCase();
    const statusFilter = VALID_INVENTORY_STATUSES.has(requestedStatus)
        ? requestedStatus
        : "ALL";
    const [sortBy, setSortBy] = useState("expiryDate");
    const [order, setOrder] = useState("asc");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
    });

    // --------------------------------
    // Loading / Error
    // --------------------------------
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [exporting, setExporting] = useState(false);
    const [exportNotice, setExportNotice] = useState("");
    const [exportError, setExportError] = useState("");
    // Inventory summary totals across all records matching the active filters.
    const [inventorySummary, setInventorySummary] = useState({
        totalInventoryValue: 0,
        totalPotentialLoss: 0,
    });
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState("");
    const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

    // --------------------------------
    // Add / Edit
    // --------------------------------
    const [showForm, setShowForm] = useState(false);
    const [inventoryInitialValues, setInventoryInitialValues] = useState({});
    const [selectedInventory, setSelectedInventory] =
        useState(null);
    const initialFormValues = routePrefill ?? inventoryInitialValues;
    const formInventory = routePrefill ? null : selectedInventory;
    const formIsVisible = showForm || routePrefill !== null;
    const formKey = formInventory?._id || JSON.stringify(initialFormValues);

    // --------------------------------
    // Delete
    // --------------------------------
    const [inventoryToDelete, setInventoryToDelete] =
        useState(null);
    const [deleting, setDeleting] = useState(false);

    // --------------------------------
    // Inventory activity history
    // --------------------------------
    const [activityInventory, setActivityInventory] = useState(null);
    const [activityRecords, setActivityRecords] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState("");
    // Recent activity across active and deleted inventory batches.
    const [recentActivityRecords, setRecentActivityRecords] = useState([]);
    const [recentActivityPage, setRecentActivityPage] = useState(1);
    const [recentActivityPagination, setRecentActivityPagination] = useState({
        page: 1,
        limit: RECENT_ACTIVITY_PAGE_SIZE,
        totalItems: 0,
        totalPages: 0,
    });
    const [recentActivityLoading, setRecentActivityLoading] = useState(true);
    const [recentActivityError, setRecentActivityError] = useState("");
    const [recentActivityRefreshKey, setRecentActivityRefreshKey] = useState(0);

    // --------------------------------
    // Medicine filter from URL
    // --------------------------------
    const medicineId = searchParams.get("medicineId");

    // --------------------------------
    // Fetch inventory using backend search, status, sort and pagination.
    // --------------------------------
    const fetchInventories = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const params = {
                page,
                limit,
                sortBy,
                order,
            };
            if (search.trim()) {
                params.search = search.trim();
            }
            if (statusFilter !== "ALL") {
                params.status = statusFilter;
            }
            if (medicineId) {
                params.medicineId = medicineId;
            }
            const response = await api.get("/inventory", { params });
            const items =
                response.data?.data ??
                response.data?.inventories ??
                [];
            setInventories(Array.isArray(items) ? items : []);
            const metadata = response.data?.pagination;
            if (metadata) {
                setPagination(metadata);
                // If deleting records makes the current page invalid,
                // move back to the last available page.
                if (metadata.totalPages > 0 && page > metadata.totalPages) {
                    setPage(metadata.totalPages);
                } else if (metadata.totalPages === 0 && page !== 1) {
                    setPage(1);
                }
            } else {
                // Compatibility with older API responses without pagination metadata.
                const totalItems = Number(
                    response.data?.count ?? items.length
                );
                setPagination({
                    page,
                    limit,
                    totalItems,
                    totalPages: Math.ceil(totalItems / limit),
                });
            }
        } catch (error) {
            console.error("Fetch inventory error:", error);
            setError(
                error.response?.data?.message ||
                    "Failed to load inventory."
            );
            setInventories([]);
            setPagination({
                page,
                limit,
                totalItems: 0,
                totalPages: 0,
            });
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, sortBy, order, page, limit, medicineId]);
    // The URL is the source of truth so reloads, dashboard links, and browser
    // history all keep the selected inventory status in sync.
    const handleStatusFilterChange = (nextStatus) => {
        const normalizedStatus = String(nextStatus || "ALL").toUpperCase();
        if (!VALID_INVENTORY_STATUSES.has(normalizedStatus)) return;
        setPage(1);
        const nextSearchParams = new URLSearchParams(searchParams);
        if (normalizedStatus === "ALL") {
            nextSearchParams.delete("status");
        } else {
            nextSearchParams.set("status", normalizedStatus);
        }
        setSearchParams(nextSearchParams, { replace: true });
    };
    // Debounce search/filter/sort requests by 300 milliseconds.
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchInventories();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchInventories]);
    // Fetch financial totals for all records matching the active filters.
    // Deliberately omit page and limit so the backend returns every match.
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSummaryLoading(true);
            setSummaryError("");
            try {
                const params = {};
                if (search.trim()) {
                    params.search = search.trim();
                }
                if (statusFilter !== "ALL") {
                    params.status = statusFilter;
                }
                if (medicineId) {
                    params.medicineId = medicineId;
                }
                const response = await api.get("/inventory", { params });
                const payload = response.data || {};
                const allMatchingInventories =
                    payload.data ?? payload.inventories ?? [];
                if (!Array.isArray(allMatchingInventories)) {
                    throw new Error("Unexpected inventory API response.");
                }
                const totalInventoryValue = allMatchingInventories.reduce(
                    (total, inventory) =>
                        total + (Number(inventory.inventoryValue) || 0),
                    0
                );
                const totalPotentialLoss = allMatchingInventories.reduce(
                    (total, inventory) =>
                        total + (Number(inventory.potentialLoss) || 0),
                    0
                );
                if (!cancelled) {
                    setInventorySummary({
                        totalInventoryValue,
                        totalPotentialLoss,
                    });
                }
            } catch (summaryFetchError) {
                if (!cancelled) {
                    console.error(
                        "Fetch inventory summary error:",
                        summaryFetchError
                    );
                    setSummaryError(
                        summaryFetchError.response?.data?.message ||
                            "Unable to load inventory totals. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setSummaryLoading(false);
                }
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [search, statusFilter, medicineId, summaryRefreshKey]);
    // Search, status, medicine ID, sorting and pagination are handled by the backend.
    const filteredInventories = inventories;
    // Selected medicine name
    // --------------------------------
    const selectedMedicineName = medicineId
        ? inventories.find(
              (inventory) =>
                  String(
                      inventory.medicine?._id
                  ) === String(medicineId)
          )?.medicine?.name || null
        : null;

    // --------------------------------
    // Format date
    // --------------------------------
    const formatDate = (date) => {
        if (!date) {
            return "-";
        }
        const parsedDate = new Date(date);
        if (
            Number.isNaN(
                parsedDate.getTime()
            )
        ) {
            return "-";
        }
        return parsedDate.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );
    };

    // --------------------------------
    // Format currency
    // --------------------------------
    const formatCurrency = (value) => {
        const amount = Number(value) || 0;
        return amount.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    };
    const formatActivityTimestamp = (value) => {
        if (!value) return "Unknown time";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Unknown time";
        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };
    const getActivityFieldLabel = (field) => {
        const labels = {
            medicine: "Medicine",
            supplier: "Supplier reference (ID)",
            batchNumber: "Batch number",
            quantity: "Quantity",
            purchasePrice: "Purchase price",
            expiryDate: "Expiry date",
            returnWindowDays: "Return window (days)",
            location: "Location",
        };
        return labels[field] || String(field || "Field").replace(/([A-Z])/g, " $1");
    };
    const formatActivityValue = (field, value) => {
        if (value === null || value === undefined || value === "") return "—";
        if (field === "expiryDate") return formatDate(value);
        if (field === "purchasePrice") return `₹${formatCurrency(value)}`;
        if (typeof value === "object") {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    };
    // Explain creation/deletion snapshots differently from actual updates.
    // CREATED stores the initial values; DELETED stores the last saved values.
    // UPDATED records only fields whose values actually changed.
    const renderActivityChanges = (activity, fallbackMedicineName = "") => {
        const changes = Array.isArray(activity.changes) ? activity.changes : [];
        const isCreated = activity.action === "CREATED";
        const isDeleted = activity.action === "DELETED";
        const isSnapshot = isCreated || isDeleted;

        if (changes.length === 0) {
            return (
                <p className="mt-3 text-sm text-muted">
                    {activity.action === "UPDATED"
                        ? "No field values changed, so there is no before-and-after comparison to show."
                        : "No batch details were recorded for this activity."}
                </p>
            );
        }

        return (
            <div className="mt-3 space-y-3">
                <div>
                    <h4 className="text-sm font-semibold text-gray-800">
                        {isCreated
                            ? "Initial Batch Details"
                            : isDeleted
                              ? "Batch Details at Deletion"
                              : "Changed Fields"}
                    </h4>
                    <p className="mt-1 text-xs text-muted">
                        {isCreated
                            ? "These are the values saved when the batch was created, not individual edits."
                            : isDeleted
                              ? "These are the last saved values before the batch was deleted."
                              : "Only fields that changed during this update are listed below."}
                    </p>
                </div>
                {changes.map((change, changeIndex) => {
                    const snapshotValue = isCreated ? change.newValue : change.previousValue;
                    const formattedSnapshotValue = change.field === "medicine"
                        ? activity.medicineName || fallbackMedicineName || formatActivityValue(change.field, snapshotValue)
                        : formatActivityValue(change.field, snapshotValue);

                    return (
                        <div
                            key={`${change.field}-${changeIndex}`}
                            className="rounded-lg bg-gray-50 p-3"
                        >
                            <p className="text-sm font-semibold text-gray-800">
                                {getActivityFieldLabel(change.field)}
                            </p>
                            {isSnapshot ? (
                                <div className="mt-2 rounded-md border border-line bg-panel p-2">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                                        {isCreated ? "Value when created" : "Last saved value"}
                                    </p>
                                    <p className="mt-1 break-words text-sm text-gray-700">
                                        {formattedSnapshotValue}
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="min-w-0 rounded-md border border-line bg-panel p-2">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted">
                                            Previous value
                                        </p>
                                        <p className="mt-1 break-words text-sm text-gray-700">
                                            {formatActivityValue(change.field, change.previousValue)}
                                        </p>
                                    </div>
                                    <div className="min-w-0 rounded-md border border-line bg-panel p-2">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted">
                                            New value
                                        </p>
                                        <p className="mt-1 break-words text-sm text-gray-700">
                                            {formatActivityValue(change.field, change.newValue)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };
    // --------------------------------
    // Financial totals cover every batch matching the active filters,
    // not only the records displayed on the current table page.
    const totalInventoryValue = inventorySummary.totalInventoryValue;
    const totalPotentialLoss = inventorySummary.totalPotentialLoss;

    // --------------------------------
    // Export all records matching current filters
    // --------------------------------
    const handleExportCsv = async () => {
        setExporting(true);
        setExportNotice("");
        setExportError("");
        try {
            // Intentionally omit page and limit so the API returns every
            // matching record, not only the currently visible page.
            const params = {
                sortBy,
                order,
            };
            if (search.trim()) {
                params.search = search.trim();
            }
            if (statusFilter !== "ALL") {
                params.status = statusFilter;
            }
            if (medicineId) {
                params.medicineId = medicineId;
            }
            const response = await api.get("/inventory", { params });
            const allMatchingInventories =
                response.data?.data ?? response.data?.inventories ?? [];
            if (!Array.isArray(allMatchingInventories)) {
                throw new Error("The inventory API returned an unexpected response.");
            }
            if (allMatchingInventories.length === 0) {
                setExportNotice("No inventory records match the current filters.");
                return;
            }
            const headers = [
                "Medicine Name",
                "Generic Name",
                "Manufacturer",
                "Category",
                "Barcode",
                "Batch Number",
                "Supplier",
                "Quantity",
                "Expiry Date",
                "Return Deadline",
                "Return Window Days",
                "Purchase Price (INR)",
                "Inventory Value (INR)",
                "Location",
            ];
            const toCsvCell = (value) => {
                let cell = value === null || value === undefined ? "" : String(value);
                // Prevent spreadsheet formula execution for text coming from records.
                if (/^[\t\r ]*[=+@]/.test(cell) || /^[\t\r ]*-/.test(cell)) {
                    cell = `'${cell}`;
                }
                return `"${cell.replace(/"/g, '""')}"`;
            };
            const rows = allMatchingInventories.map((inventory) => [
                inventory.medicine?.name || "Unknown Medicine",
                inventory.medicine?.genericName || "",
                inventory.medicine?.manufacturer || "",
                inventory.medicine?.category || "",
                inventory.medicine?.barcode || "",
                inventory.batchNumber || "",
                inventory.supplier?.companyName || inventory.supplier?.name || "Unknown Supplier",
                inventory.quantity ?? "",
                formatDate(inventory.expiryDate),
                formatDate(inventory.returnDeadline),
                inventory.returnWindowDays ?? "",
                inventory.purchasePrice ?? "",
                inventory.inventoryValue ?? "",
                inventory.location || "",
            ]);
            const csvContent = [headers, ...rows]
                .map((row) => row.map(toCsvCell).join(","))
                .join("\r\n");
            // BOM helps Excel open UTF-8 CSV files with the correct encoding.
            const blob = new Blob(["\uFEFF", csvContent], {
                type: "text/csv;charset=utf-8;",
            });
            const downloadUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement("a");
            const now = new Date();
            const dateStamp = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0"),
            ].join("-");
            downloadLink.href = downloadUrl;
            downloadLink.download = `medireturn_inventory_${dateStamp}.csv`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            // Give the browser time to begin the download before releasing the Blob URL.
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            setExportNotice(
                `Exported ${allMatchingInventories.length} matching inventory record${allMatchingInventories.length === 1 ? "" : "s"}.`
            );
        } catch (exportFailure) {
            console.error("Export inventory CSV error:", exportFailure);
            setExportError(
                exportFailure.response?.data?.message ||
                    exportFailure.message ||
                    "Failed to export inventory. Please try again."
            );
        } finally {
            setExporting(false);
        }
    };

    // --------------------------------
    // ADD
    // --------------------------------
    const handleAddInventory = () => {
        setSelectedInventory(null);
        setInventoryInitialValues({});
        setShowForm(true);
    };

    // --------------------------------
    // EDIT
    // --------------------------------
    const handleEditInventory = (
        inventory
    ) => {
        setInventoryInitialValues({});
        setSelectedInventory(inventory);
        setShowForm(true);
    };

    // --------------------------------
    // VIEW
    // --------------------------------
    const handleViewInventory = (
        inventory
    ) => {
        navigate(
            `/inventory/${inventory._id}`
        );
    };

    // --------------------------------
    // VIEW ACTIVITY HISTORY
    // --------------------------------
    const handleViewActivity = async (inventory) => {
        setActivityInventory(inventory);
        setActivityRecords([]);
        setActivityError("");
        setActivityLoading(true);
        try {
            const response = await api.get(`/inventory/${inventory._id}/activity`);
            const activities = response.data?.activities;
            if (!Array.isArray(activities)) {
                throw new Error("The activity API returned an unexpected response.");
            }
            setActivityRecords(activities);
        } catch (activityFetchError) {
            console.error("Fetch inventory activity error:", activityFetchError);
            setActivityError(
                activityFetchError.response?.data?.message ||
                    activityFetchError.message ||
                    "Failed to load activity history. Please try again."
            );
        } finally {
            setActivityLoading(false);
        }
    };
    const handleCloseActivity = () => {
        setActivityInventory(null);
        setActivityRecords([]);
        setActivityError("");
        setActivityLoading(false);
    };
    // Fetch a paginated activity feed. The backend scopes records to the
    // authenticated user and retains snapshots for deleted batches.
    useEffect(() => {
        let cancelled = false;
        const fetchRecentActivity = async () => {
            setRecentActivityLoading(true);
            setRecentActivityError("");
            try {
                const response = await api.get("/inventory/activity/recent", {
                    params: {
                        page: recentActivityPage,
                        limit: RECENT_ACTIVITY_PAGE_SIZE,
                    },
                });
                const payload = response.data || {};
                const activities = payload.activities ?? [];
                if (!Array.isArray(activities)) {
                    throw new Error("The recent activity API returned an unexpected response.");
                }
                if (cancelled) return;
                const metadata = payload.pagination;
                setRecentActivityRecords(activities);
                if (metadata) {
                    setRecentActivityPagination({
                        page: Number(metadata.page) || recentActivityPage,
                        limit: Number(metadata.limit) || RECENT_ACTIVITY_PAGE_SIZE,
                        totalItems: Number(metadata.totalItems) || 0,
                        totalPages: Number(metadata.totalPages) || 0,
                    });
                    if (metadata.totalPages > 0 && recentActivityPage > metadata.totalPages) {
                        setRecentActivityPage(metadata.totalPages);
                    } else if (metadata.totalPages === 0 && recentActivityPage !== 1) {
                        setRecentActivityPage(1);
                    }
                } else {
                    const totalItems = Number(payload.count ?? activities.length);
                    setRecentActivityPagination({
                        page: recentActivityPage,
                        limit: RECENT_ACTIVITY_PAGE_SIZE,
                        totalItems,
                        totalPages: Math.ceil(totalItems / RECENT_ACTIVITY_PAGE_SIZE),
                    });
                }
            } catch (recentActivityFetchError) {
                if (!cancelled) {
                    console.error("Fetch recent inventory activity error:", recentActivityFetchError);
                    setRecentActivityError(
                        recentActivityFetchError.response?.data?.message ||
                            recentActivityFetchError.message ||
                            "Failed to load recent activity. Please try again."
                    );
                    setRecentActivityRecords([]);
                }
            } finally {
                if (!cancelled) setRecentActivityLoading(false);
            }
        };
        fetchRecentActivity();
        return () => {
            cancelled = true;
        };
    }, [recentActivityPage, recentActivityRefreshKey]);

    // --------------------------------
    // FORM SUCCESS
    // --------------------------------
    const handleInventoryAdded =
        async () => {
            setShowForm(false);
            setSelectedInventory(null);
            setInventoryInitialValues({});
            clearScannerPrefill();
            await fetchInventories();
            setSummaryRefreshKey((current) => current + 1);
            setRecentActivityRefreshKey((current) => current + 1);
        };
    const handleInventoryUpdated =
        async () => {
            setShowForm(false);
            setSelectedInventory(null);
            setInventoryInitialValues({});
            await fetchInventories();
            setSummaryRefreshKey((current) => current + 1);
            setRecentActivityRefreshKey((current) => current + 1);
        };

    // --------------------------------
    // CANCEL FORM
    // --------------------------------
    const handleCancel = () => {
        setShowForm(false);
        setSelectedInventory(null);
        setInventoryInitialValues({});
        clearScannerPrefill();
    };

    // --------------------------------
    // DELETE
    // --------------------------------
    const handleDeleteClick = (
        inventory
    ) => {
        setInventoryToDelete(inventory);
    };
    const handleDeleteInventory =
        async () => {
            if (!inventoryToDelete) {
                return;
            }
            try {
                setDeleting(true);
                setError("");
                await api.delete(
                    `/inventory/${inventoryToDelete._id}`
                );
                setInventoryToDelete(null);
                await fetchInventories();
                setSummaryRefreshKey((current) => current + 1);
                setRecentActivityRefreshKey((current) => current + 1);
            } catch (error) {
                console.error(
                    "Delete inventory error:",
                    error
                );
                setError(
                    error.response?.data?.message ||
                        "Failed to delete inventory"
                );
            } finally {
                setDeleting(false);
            }
        };

    // --------------------------------
    // CANCEL DELETE
    // --------------------------------
    const handleCancelDelete = () => {
        if (!deleting) {
            setInventoryToDelete(null);
        }
    };
    return (
        <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
            <div className="mx-auto max-w-7xl">

                {/* =========================
                    Navigation
                ========================== */}
                <nav
                    className="mb-6 flex flex-wrap gap-1 rounded-xl border border-navbar-ink/20 bg-navbar p-1.5 shadow-sm"
                    aria-label="Main navigation"
                >
                    <Link
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                        to="/dashboard"
                    >
                        Overview
                    </Link>
                    <Link
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                        to="/medicines"
                    >
                        Medicines
                    </Link>
                    <span
                        className="rounded-lg bg-mint-50 px-3 py-2 text-sm font-semibold text-mint-700"
                        aria-current="page"
                    >
                        Inventory
                    </span>
                    <Link
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                        to="/suppliers"
                    >
                        Suppliers
                    </Link>
                </nav>

                {/* =========================
                    Header
                ========================== */}
                <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            Inventory
                        </h1>
                        <p className="mt-1 text-sm text-muted">
                            Manage medicine batches and stock
                        </p>
                        {selectedMedicineName && (
                            <div className="mt-3 rounded-lg bg-mint-50 px-4 py-3 text-sm text-mint-700">
                                Showing inventory for:
                                <span className="ml-1 font-semibold">
                                    {selectedMedicineName}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={exporting}
                            className="rounded-lg border border-gray-300 bg-panel px-4 py-2 font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {exporting ? "Exporting..." : "Export CSV"}
                        </button>
                        <button
                            type="button"
                            onClick={handleAddInventory}
                            className="rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                        >
                            + Add Batch
                        </button>
                    </div>
                </div>
                {exportNotice && (
                    <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                        {exportNotice}
                    </p>
                )}
                {exportError && (
                    <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {exportError}
                    </p>
                )}

                {/* =========================
                    Summary Cards
                ========================== */}
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* Total Value */}
                    <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
                        <p className="text-sm text-muted">
                            Inventory Value (All Matching Batches)
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                            {summaryLoading
                                ? "Updating..."
                                : summaryError
                                  ? "Unavailable"
                                  : `₹${formatCurrency(totalInventoryValue)}`}
                        </p>
                    </div>
                    {/* Potential Loss across all matching batches */}
                    <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
                        <p className="text-sm text-muted">
                            Potential Loss (Matching Batches)
                        </p>
                        <p className="mt-1 text-2xl font-bold text-red-600">
                            {summaryLoading
                                ? "Updating..."
                                : summaryError
                                  ? "Unavailable"
                                  : `₹${formatCurrency(totalPotentialLoss)}`}
                        </p>
                    </div>
                    {/* Batches */}
                    <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
                        <p className="text-sm text-muted">
                            Matching Batches
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                            {pagination.totalItems}
                        </p>
                    </div>
                </div>
                {summaryError && (
                    <p
                        role="alert"
                        className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        {summaryError}
                    </p>
                )}

                {/* =========================
                    Add / Edit Form
                ========================== */}
                {formIsVisible && (
                    <div className="mb-6">
                        <InventoryForm
                            key={formKey}
                            inventory={formInventory}
                            initialValues={initialFormValues}
                            onInventoryAdded={handleInventoryAdded}
                            onInventoryUpdated={handleInventoryUpdated}
                            onCancel={handleCancel}
                        />
                    </div>
                )}

                {/* =========================
                    Search, Filter and Sorting Controls
                ========================== */}
                <section className="mb-6 rounded-2xl border border-line bg-panel p-4 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {/* Unified search */}
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Search medicine, batch, supplier, location..."
                            aria-label="Search inventory"
                            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100"
                        />
                        {/* Status filter */}
                        <select
                            value={statusFilter}
                            onChange={(event) => {
                                handleStatusFilterChange(event.target.value);
                            }}
                            aria-label="Filter by inventory status"
                            className="rounded-xl border border-gray-300 bg-panel px-3 py-3 text-sm"
                        >
                            <option value="ALL">All stock</option>
                            <option value="LOW_STOCK">Low stock</option>
                            <option value="EXPIRING_SOON">Expiring soon</option>
                            <option value="RETURN_DUE">Return due</option>
                            <option value="RETURN_OVERDUE">Return overdue</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="NORMAL">Normal</option>
                        </select>
                        {/* Sort field */}
                        <select
                            value={sortBy}
                            onChange={(event) => {
                                setSortBy(event.target.value);
                                setPage(1);
                            }}
                            aria-label="Sort inventory by"
                            className="rounded-xl border border-gray-300 bg-panel px-3 py-3 text-sm"
                        >
                            <option value="expiryDate">Expiry date</option>
                            <option value="quantity">Quantity</option>
                            <option value="purchasePrice">Purchase price</option>
                            <option value="batchNumber">Batch number</option>
                            <option value="createdAt">Recently added</option>
                        </select>
                        {/* Sort direction */}
                        <select
                            value={order}
                            onChange={(event) => {
                                setOrder(event.target.value);
                                setPage(1);
                            }}
                            aria-label="Sort direction"
                            className="rounded-xl border border-gray-300 bg-panel px-3 py-3 text-sm"
                        >
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                        </select>
                        {/* Page size */}
                        <select
                            value={limit}
                            onChange={(event) => {
                                setLimit(Number(event.target.value));
                                setPage(1);
                            }}
                            aria-label="Items per page"
                            className="rounded-xl border border-gray-300 bg-panel px-3 py-3 text-sm"
                        >
                            <option value={10}>10 per page</option>
                            <option value={25}>25 per page</option>
                            <option value={50}>50 per page</option>
                        </select>
                        {/* Clear filters */}
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                handleStatusFilterChange("ALL");
                                setSortBy("expiryDate");
                                setOrder("asc");
                                setLimit(10);
                                setPage(1);
                            }}
                            className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Clear filters
                        </button>
                    </div>
                    <p className="mt-3 text-sm text-muted">
                        {pagination.totalItems} batch
                        {pagination.totalItems === 1 ? "" : "es"} found
                    </p>
                </section>
                {!loading && error && (
                    <div className="mb-6 flex items-center justify-between rounded-lg bg-red-50 p-4 text-red-600">
                        <span>
                            {error}
                        </span>
                        <button
                            type="button"
                            onClick={fetchInventories}
                            className="font-bold text-red-500 hover:text-red-700"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* =========================
                    Loading
                ========================== */}
                {loading && (
                    <div className="rounded-lg bg-panel p-6 text-center shadow-sm">
                        Loading inventory...
                    </div>
                )}

                {/* =========================
                    Inventory Table
                ========================== */}
                {!loading && !error && (
                    <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        {/* Medicine */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Medicine
                                        </th>
                                        {/* Batch */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Batch
                                        </th>
                                        {/* Supplier */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Supplier
                                        </th>
                                        {/* Quantity */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Qty
                                        </th>
                                        {/* Expiry */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Expiry
                                        </th>
                                        {/* Return */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Return
                                        </th>
                                        {/* Status */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Status
                                        </th>
                                        {/* Price */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Price
                                        </th>
                                        {/* Value */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Value
                                        </th>
                                        {/* Location */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Location
                                        </th>
                                        {/* Actions */}
                                        <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInventories.length > 0 ? (
                                        filteredInventories.map(
                                            (inventory) => {
                                                return (
                                                    <tr
                                                        key={
                                                            inventory._id
                                                        }
                                                        className="border-t border-line hover:bg-gray-50"
                                                    >
                                                        {/* Medicine */}
                                                        <td className="px-5 py-4">
                                                            <div className="font-medium text-gray-900">
                                                                {inventory.medicine
                                                                    ?.name ||
                                                                    "Unknown Medicine"}
                                                            </div>
                                                            {inventory
                                                                .medicine
                                                                ?.genericName && (
                                                                <div className="text-sm text-muted">
                                                                    {
                                                                        inventory
                                                                            .medicine
                                                                            .genericName
                                                                    }
                                                                </div>
                                                            )}
                                                        </td>
                                                        {/* Batch */}
                                                        <td className="px-5 py-4 font-medium text-gray-700">
                                                            {
                                                                inventory.batchNumber
                                                            }
                                                        </td>
                                                        {/* Supplier */}
                                                        <td className="px-5 py-4">
                                                            <div className="font-medium text-gray-900">
                                                                {inventory
                                                                    .supplier
                                                                    ?.companyName ||
                                                                    "Unknown Supplier"}
                                                            </div>
                                                            {inventory
                                                                .supplier
                                                                ?.name && (
                                                                <div className="text-sm text-muted">
                                                                    {
                                                                        inventory
                                                                            .supplier
                                                                            .name
                                                                    }
                                                                </div>
                                                            )}
                                                        </td>
                                                        {/* Quantity */}
                                                        <td className="px-5 py-4 text-gray-700">
                                                            {
                                                                inventory.quantity
                                                            }
                                                        </td>
                                                        {/* Expiry */}
                                                        <td className="px-5 py-4">
                                                            <div className="text-gray-700">
                                                                {formatDate(
                                                                    inventory.expiryDate
                                                                )}
                                                            </div>
                                                            {typeof inventory.daysUntilExpiry ===
                                                                "number" && (
                                                                <div
                                                                    className={`mt-1 text-xs ${
                                                                        inventory.daysUntilExpiry <
                                                                        0
                                                                            ? "text-gray-600"
                                                                            : inventory.daysUntilExpiry <=
                                                                                30
                                                                              ? "text-yellow-600"
                                                                              : "text-muted"
                                                                    }`}
                                                                >
                                                                    {inventory.daysUntilExpiry <
                                                                    0
                                                                        ? `${Math.abs(
                                                                              inventory.daysUntilExpiry
                                                                          )} days ago`
                                                                        : inventory.daysUntilExpiry ===
                                                                            0
                                                                          ? "Expires today"
                                                                          : `${inventory.daysUntilExpiry} days left`}
                                                                </div>
                                                            )}
                                                        </td>
                                                        {/* Return */}
                                                        <td className="px-5 py-4">
                                                            <div className="text-gray-700">
                                                                {formatDate(
                                                                    inventory.returnDeadline
                                                                )}
                                                            </div>
                                                            {typeof inventory.daysUntilReturnDeadline ===
                                                                "number" && (
                                                                <div
                                                                    className={`mt-1 text-xs ${
                                                                        inventory.daysUntilReturnDeadline <
                                                                        0
                                                                            ? "text-red-600"
                                                                            : inventory.daysUntilReturnDeadline ===
                                                                                0
                                                                              ? "text-orange-600"
                                                                              : "text-muted"
                                                                    }`}
                                                                >
                                                                    {inventory.daysUntilReturnDeadline <
                                                                    0
                                                                        ? `${Math.abs(
                                                                              inventory.daysUntilReturnDeadline
                                                                          )} days overdue`
                                                                        : inventory.daysUntilReturnDeadline ===
                                                                            0
                                                                          ? "Due today"
                                                                          : `${inventory.daysUntilReturnDeadline} days left`}
                                                                </div>
                                                            )}
                                                        </td>
                                                        {/* Status */}
                                                        <td className="px-5 py-4">
                                                            <div className="flex min-w-[145px] flex-wrap gap-1.5">
                                                                {Number(inventory.quantity) <= 10 && (
                                                                    <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">
                                                                        Low stock
                                                                    </span>
                                                                )}
                                                                {inventory.expiryStatus === "EXPIRED" && (
                                                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                                                                        Expired
                                                                    </span>
                                                                )}
                                                                {inventory.expiryStatus === "EXPIRING_SOON" && (
                                                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                                                        Expiring soon
                                                                    </span>
                                                                )}
                                                                {inventory.returnStatus === "RETURN_OVERDUE" && (
                                                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                                                                        Return overdue
                                                                    </span>
                                                                )}
                                                                {inventory.returnStatus === "RETURN_DUE" && (
                                                                    <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">
                                                                        Return due
                                                                    </span>
                                                                )}
                                                                {inventory.expiryStatus === "NORMAL" &&
                                                                    inventory.returnStatus === "NORMAL" &&
                                                                    Number(inventory.quantity) > 10 && (
                                                                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                                                                            Normal
                                                                        </span>
                                                                    )}
                                                            </div>
                                                        </td>
                                                        {/* Price */}
                                                        <td className="px-5 py-4 text-gray-700">
                                                            ₹{formatCurrency(inventory.purchasePrice)}
                                                        </td>
                                                        {/* Value */}
                                                        <td className="px-5 py-4">
                                                            <div className="font-medium text-gray-900">
                                                                ₹
                                                                {formatCurrency(
                                                                    inventory.inventoryValue
                                                                )}
                                                            </div>
                                                            {Number(
                                                                inventory.potentialLoss
                                                            ) >
                                                                0 && (
                                                                <div className="mt-1 text-xs font-medium text-red-600">
                                                                    Loss: ₹
                                                                    {formatCurrency(
                                                                        inventory.potentialLoss
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        {/* Location */}
                                                        <td className="px-5 py-4 text-sm text-gray-700">
                                                            {inventory.location || "—"}
                                                        </td>
                                                        {/* Actions */}
                                                        <td className="px-5 py-4">
                                                            <div className="flex flex-wrap gap-2">
                                                                {/* View */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleViewInventory(
                                                                            inventory
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-mint-500 px-3 py-1 text-sm font-medium text-mint-700 hover:bg-mint-50"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleViewActivity(inventory)}
                                                                    className="rounded-lg border border-line px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                                                    aria-label={`View activity history for batch ${inventory.batchNumber || ""}`}
                                                                >
                                                                    History
                                                                </button>
                                                                {/* Edit */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleEditInventory(
                                                                            inventory
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-mint-500 px-3 py-1 text-sm font-medium text-mint-700 hover:bg-mint-50"
                                                                >
                                                                    Edit
                                                                </button>
                                                                {/* Delete */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleDeleteClick(
                                                                            inventory
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-red-500 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                        )
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={11}
                                                className="px-6 py-10 text-center text-muted"
                                            >
                                                {medicineId
                                                    ? `No inventory matches the selected medicine${search.trim() ? " and your search" : ""}${statusFilter !== "ALL" ? ` with status ${statusFilter.replace(/_/g, " ").toLowerCase()}` : ""}.`
                                                    : search.trim() || statusFilter !== "ALL"
                                                      ? "No inventory matches your search and status filters."
                                                      : "No inventory found."}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {!loading && !error && (
                    <section className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-600">
                            Showing{" "}
                            {pagination.totalItems === 0
                                ? 0
                                : (page - 1) * limit + 1}
                            {" – "}
                            {Math.min(page * limit, pagination.totalItems)}
                            {" of "}
                            {pagination.totalItems} batches
                        </p>
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setPage((current) => current - 1)}
                                disabled={page <= 1 || loading}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="whitespace-nowrap text-sm text-gray-600">
                                Page {page} of {Math.max(pagination.totalPages, 1)}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((current) => current + 1)}
                                disabled={
                                    loading ||
                                    pagination.totalPages === 0 ||
                                    page >= pagination.totalPages
                                }
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </section>
                )}

                {/* =========================
                    Recent Inventory Activity
                ========================== */}
                <section
                    aria-labelledby="recent-inventory-activity-title"
                    className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-sm"
                >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 id="recent-inventory-activity-title" className="text-xl font-semibold text-gray-900">
                                Recent Inventory Activity
                            </h2>
                            <p className="mt-1 text-sm text-muted">
                                Latest inventory changes, including activity for deleted batches.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setRecentActivityRefreshKey((current) => current + 1)}
                            disabled={recentActivityLoading}
                            className="self-start rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {recentActivityLoading ? "Refreshing..." : "Refresh activity"}
                        </button>
                    </div>
                    {recentActivityLoading ? (
                        <div className="py-8 text-center text-sm text-gray-600" role="status">
                            Loading recent activity...
                        </div>
                    ) : recentActivityError ? (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                            <p className="text-sm text-red-700" role="alert">
                                {recentActivityError}
                            </p>
                            <button
                                type="button"
                                onClick={() => setRecentActivityRefreshKey((current) => current + 1)}
                                className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                            >
                                Try again
                            </button>
                        </div>
                    ) : recentActivityRecords.length === 0 ? (
                        <div className="mt-4 rounded-lg border border-line bg-gray-50 px-4 py-8 text-center">
                            <p className="font-medium text-gray-800">No recent activity found.</p>
                            <p className="mt-1 text-sm text-muted">
                                Activity created after the audit log was enabled will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-5 space-y-4">
                            {recentActivityRecords.map((activity, index) => {
                                const actionStyles = {
                                    CREATED: "bg-green-100 text-green-800",
                                    UPDATED: "bg-mint-100 text-mint-800",
                                    DELETED: "bg-red-100 text-red-800",
                                };
                                const actionLabels = {
                                    CREATED: "Created",
                                    UPDATED: "Updated",
                                    DELETED: "Deleted",
                                };
                                const user = activity.performedBy;
                                return (
                                    <article
                                        key={activity._id || `${activity.action}-${activity.createdAt}-${index}`}
                                        className="rounded-xl border border-line p-4"
                                    >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${actionStyles[activity.action] || "bg-gray-100 text-gray-700"}`}>
                                                    {actionLabels[activity.action] || activity.action || "Activity"}
                                                </span>
                                                <span className="font-medium text-gray-900">
                                                    {activity.medicineName || "Unknown medicine"}
                                                </span>
                                            </div>
                                            <time className="text-xs text-muted" dateTime={activity.createdAt || undefined}>
                                                {formatActivityTimestamp(activity.createdAt)}
                                            </time>
                                        </div>
                                        <p className="mt-2 text-sm text-gray-600">
                                            Batch: <span className="font-medium text-gray-800">{activity.batchNumber || "—"}</span>
                                        </p>
                                        <p className="mt-1 text-sm text-gray-600">
                                            Performed by: {user?.name || user?.email || "Unknown user"}
                                            {user?.email && user?.name ? ` (${user.email})` : ""}
                                        </p>
                                        {renderActivityChanges(activity)}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    {!recentActivityLoading && !recentActivityError && recentActivityPagination.totalItems > 0 && (
                        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-gray-600">
                                Showing {(recentActivityPage - 1) * RECENT_ACTIVITY_PAGE_SIZE + 1}
                                {" – "}
                                {Math.min(recentActivityPage * RECENT_ACTIVITY_PAGE_SIZE, recentActivityPagination.totalItems)}
                                {" of "}{recentActivityPagination.totalItems} activities
                            </p>
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => setRecentActivityPage((current) => Math.max(1, current - 1))}
                                    disabled={recentActivityPage <= 1 || recentActivityLoading}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Previous
                                </button>
                                <span className="whitespace-nowrap text-sm text-gray-600">
                                    Page {recentActivityPage} of {Math.max(recentActivityPagination.totalPages, 1)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setRecentActivityPage((current) => current + 1)}
                                    disabled={recentActivityLoading || recentActivityPage >= recentActivityPagination.totalPages}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* =========================
                    Inventory Activity History Modal
                ========================== */}
                {activityInventory && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                        onClick={handleCloseActivity}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="inventory-activity-title"
                            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-panel p-5 shadow-xl sm:p-6"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 id="inventory-activity-title" className="text-xl font-semibold text-gray-900">
                                        Inventory Activity History
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-600">
                                        {activityInventory.medicine?.name || "Unknown Medicine"}
                                        {" · Batch "}
                                        {activityInventory.batchNumber || "—"}
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                        Newest activity appears first.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCloseActivity}
                                    aria-label="Close activity history"
                                    className="rounded-lg px-3 py-1 text-2xl leading-none text-muted hover:bg-gray-100 hover:text-gray-800"
                                >
                                    ×
                                </button>
                            </div>
                            {activityLoading ? (
                                <div className="py-10 text-center text-gray-600" role="status">
                                    Loading activity history...
                                </div>
                            ) : activityError ? (
                                <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
                                    <p className="text-sm text-red-700" role="alert">
                                        {activityError}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleViewActivity(activityInventory)}
                                        className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : activityRecords.length === 0 ? (
                                <div className="mt-5 rounded-lg border border-line bg-gray-50 px-4 py-8 text-center">
                                    <p className="font-medium text-gray-800">No activity records found.</p>
                                    <p className="mt-1 text-sm text-muted">
                                        Activity is recorded for actions performed after the audit log was enabled.
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-5 space-y-4">
                                    {activityRecords.map((activity, index) => {
                                        const actionStyles = {
                                            CREATED: "bg-green-100 text-green-800",
                                            UPDATED: "bg-mint-100 text-mint-800",
                                            DELETED: "bg-red-100 text-red-800",
                                        };
                                        const actionLabels = {
                                            CREATED: "Created",
                                            UPDATED: "Updated",
                                            DELETED: "Deleted",
                                        };
                                        const user = activity.performedBy;
                                        return (
                                            <article
                                                key={activity._id || `${activity.action}-${activity.createdAt}-${index}`}
                                                className="rounded-xl border border-line p-4"
                                            >
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${actionStyles[activity.action] || "bg-gray-100 text-gray-700"}`}>
                                                            {actionLabels[activity.action] || activity.action || "Activity"}
                                                        </span>
                                                        <span className="text-sm font-medium text-gray-800">
                                                            {activity.medicineName || activityInventory.medicine?.name || "Unknown Medicine"}
                                                        </span>
                                                    </div>
                                                    <time className="text-xs text-muted" dateTime={activity.createdAt || undefined}>
                                                        {formatActivityTimestamp(activity.createdAt)}
                                                    </time>
                                                </div>
                                                <p className="mt-2 text-sm text-gray-600">
                                                    Performed by: {user?.name || user?.email || "Unknown user"}
                                                    {user?.email && user?.name ? ` (${user.email})` : ""}
                                                </p>
                                                        {renderActivityChanges(activity, activityInventory.medicine?.name)}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleCloseActivity}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================
                    Delete Confirmation Modal
                ========================== */}
                {inventoryToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation">
                        <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="inventory-delete-title">
                            <h2 id="inventory-delete-title" className="text-xl font-semibold text-gray-900">
                                Delete Inventory Batch
                            </h2>
                            <p className="mt-3 text-gray-600">
                                Are you sure you want to delete this inventory batch?
                            </p>
                            <div className="mt-4 rounded-lg bg-gray-50 p-4">
                                <p className="font-medium text-gray-900">
                                    {inventoryToDelete
                                        .medicine
                                        ?.name ||
                                        "Unknown Medicine"}
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                    Supplier:{" "}
                                    {inventoryToDelete
                                        .supplier
                                        ?.companyName ||
                                        "Unknown Supplier"}
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                    Batch:{" "}
                                    {
                                        inventoryToDelete.batchNumber
                                    }
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                    Quantity:{" "}
                                    {
                                        inventoryToDelete.quantity
                                    }
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                    Inventory Value: ₹
                                    {formatCurrency(
                                        inventoryToDelete.inventoryValue
                                    )}
                                </p>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={
                                        handleCancelDelete
                                    }
                                    disabled={deleting}
                                    className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={
                                        handleDeleteInventory
                                    }
                                    disabled={deleting}
                                    className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                    {deleting
                                        ? "Deleting..."
                                        : "Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Inventory;
