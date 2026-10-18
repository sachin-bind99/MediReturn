import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../lib/api";

function InventoryDetails() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [inventory, setInventory] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // --------------------------------
    // Fetch inventory details
    // --------------------------------
    const fetchInventoryDetails = useCallback(async (signal) => {
        try {
            setLoading(true);
            setError("");

            const response = await api.get(
                `/inventory/${id}`,
                { signal }
            );

            setInventory(response.data.inventory);
        } catch (error) {
            if (signal?.aborted) return;
            console.error(
                "Fetch inventory details error:",
                error
            );

            setError(
                error.response?.data?.message ||
                    "Failed to load inventory details"
            );
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [id]);

    // --------------------------------
    // Initial fetch
    // --------------------------------
    useEffect(() => {
        if (id) {
            const controller = new AbortController();
            const timerId = window.setTimeout(() => {
                void fetchInventoryDetails(controller.signal);
            }, 0);

            return () => {
                window.clearTimeout(timerId);
                controller.abort();
            };
        }
        return undefined;
    }, [id, fetchInventoryDetails]);

    // --------------------------------
    // Format date
    // --------------------------------
    const formatDate = (date) => {
        if (!date) {
            return "-";
        }

        const parsedDate = new Date(date);

        if (
            Number.isNaN(parsedDate.getTime())
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

    // --------------------------------
    // Status configuration
    // --------------------------------
    const getStatusConfig = (status) => {
        switch (status) {
            case "NORMAL":
                return {
                    icon: "🟢",
                    label: "NORMAL",
                    className:
                        "border-green-200 bg-green-50 text-green-700"
                };

            case "EXPIRING_SOON":
                return {
                    icon: "🟡",
                    label: "EXPIRING SOON",
                    className:
                        "border-yellow-200 bg-yellow-50 text-yellow-700"
                };

            case "RETURN_DUE":
                return {
                    icon: "🟠",
                    label: "RETURN DUE",
                    className:
                        "border-orange-200 bg-orange-50 text-orange-700"
                };

            case "RETURN_OVERDUE":
                return {
                    icon: "🔴",
                    label: "RETURN OVERDUE",
                    className:
                        "border-red-200 bg-red-50 text-red-700"
                };

            case "EXPIRED":
                return {
                    icon: "⚫",
                    label: "EXPIRED",
                    className:
                        "border-gray-300 bg-gray-100 text-gray-800"
                };

            default:
                return {
                    icon: "⚪",
                    label: status || "UNKNOWN",
                    className:
                        "border-line bg-gray-50 text-gray-600"
                };
        }
    };

    // --------------------------------
    // Loading
    // --------------------------------
    if (loading) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-5xl">
                    <div className="rounded-xl border border-line bg-panel p-8 text-center shadow-sm">
                        Loading inventory details...
                    </div>
                </div>
            </div>
        );
    }

    // --------------------------------
    // Error
    // --------------------------------
    if (error) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-5xl">

                    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600">
                        <h2 className="text-lg font-semibold">
                            Unable to load inventory
                        </h2>

                        <p className="mt-2">
                            {error}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            navigate("/inventory")
                        }
                        className="mt-5 rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                    >
                        ← Back to Inventory
                    </button>
                </div>
            </div>
        );
    }

    // --------------------------------
    // Inventory not found
    // --------------------------------
    if (!inventory) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-5xl">

                    <div className="rounded-xl border border-line bg-panel p-8 text-center shadow-sm">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Inventory batch not found
                        </h2>

                        <p className="mt-2 text-sm text-muted">
                            The inventory batch you are looking
                            for does not exist.
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                navigate("/inventory")
                            }
                            className="mt-5 rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                        >
                            Back to Inventory
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const expiryStatusConfig =
        getStatusConfig(
            inventory.expiryStatus
        );

    const returnStatusConfig =
        getStatusConfig(
            inventory.returnStatus
        );

    return (
        <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
            <div className="mx-auto max-w-5xl">

                {/* =========================
                    Navigation
                ========================== */}
                <nav
                    className="mb-6 flex flex-wrap gap-1 rounded-xl border border-navbar-ink/20 bg-navbar p-1.5 shadow-sm"
                    aria-label="Main navigation"
                >
                    <Link
                        to="/dashboard"
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                    >
                        Overview
                    </Link>

                    <Link
                        to="/medicines"
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                    >
                        Medicines
                    </Link>

                    <Link
                        to="/inventory"
                        className="rounded-lg bg-mint-50 px-3 py-2 text-sm font-semibold text-mint-700"
                    >
                        Inventory
                    </Link>

                    <Link
                        to="/suppliers"
                        className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink"
                    >
                        Suppliers
                    </Link>
                </nav>

                {/* =========================
                    Header
                ========================== */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                navigate("/inventory")
                            }
                            className="mb-3 text-sm font-medium text-mint-700 hover:text-mint-800"
                        >
                            ← Back to Inventory
                        </button>

                        <h1 className="text-3xl font-bold text-gray-900">
                            {inventory.medicine?.name ||
                                "Inventory Batch"}
                        </h1>

                        {inventory.medicine
                            ?.genericName && (
                            <p className="mt-1 text-sm text-muted">
                                {
                                    inventory.medicine
                                        .genericName
                                }
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            navigate("/inventory")
                        }
                        className="rounded-lg border border-gray-300 bg-panel px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                    >
                        All Inventory
                    </button>
                </div>

                {/* =========================
                    Batch Overview
                ========================== */}
                <div className="mb-6 rounded-xl border border-line bg-panel p-6 shadow-sm">

                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Batch Information
                            </h2>

                            <p className="mt-1 text-sm text-muted">
                                Complete information for this
                                inventory batch
                            </p>
                        </div>

                        <span className="rounded-lg bg-mint-50 px-3 py-2 text-sm font-semibold text-mint-700">
                            Batch:{" "}
                            {inventory.batchNumber ||
                                "N/A"}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">

                        {/* Medicine */}
                        <div>
                            <p className="text-sm text-muted">
                                Medicine
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.medicine
                                    ?.name ||
                                    "Unknown Medicine"}
                            </p>
                        </div>

                        {/* Generic Name */}
                        <div>
                            <p className="text-sm text-muted">
                                Generic Name
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.medicine
                                    ?.genericName ||
                                    "N/A"}
                            </p>
                        </div>

                        {/* Batch */}
                        <div>
                            <p className="text-sm text-muted">
                                Batch Number
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.batchNumber ||
                                    "N/A"}
                            </p>
                        </div>

                        {/* Quantity */}
                        <div>
                            <p className="text-sm text-muted">
                                Quantity
                            </p>

                            <p className="mt-1 text-xl font-bold text-gray-900">
                                {inventory.quantity ??
                                    0}{" "}
                                units
                            </p>
                        </div>

                        {/* Purchase Price */}
                        <div>
                            <p className="text-sm text-muted">
                                Purchase Price
                            </p>

                            <p className="mt-1 text-xl font-bold text-gray-900">
                                ₹
                                {formatCurrency(
                                    inventory.purchasePrice
                                )}
                            </p>
                        </div>

                        {/* Inventory Value */}
                        <div>
                            <p className="text-sm text-muted">
                                Inventory Value
                            </p>

                            <p className="mt-1 text-xl font-bold text-gray-900">
                                ₹
                                {formatCurrency(
                                    inventory.inventoryValue
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* =========================
                    Dates & Return Information
                ========================== */}
                <div className="mb-6 rounded-xl border border-line bg-panel p-6 shadow-sm">

                    <div className="mb-5">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Expiry & Return Information
                        </h2>

                        <p className="mt-1 text-sm text-muted">
                            Important dates and current status
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">

                        {/* Expiry Date */}
                        <div>
                            <p className="text-sm text-muted">
                                Expiry Date
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {formatDate(
                                    inventory.expiryDate
                                )}
                            </p>

                            {typeof inventory.daysUntilExpiry ===
                                "number" && (
                                <p className="mt-1 text-sm text-muted">
                                    {inventory.daysUntilExpiry <
                                    0
                                        ? `${Math.abs(
                                              inventory.daysUntilExpiry
                                          )} days ago`
                                        : inventory.daysUntilExpiry ===
                                            0
                                          ? "Expires today"
                                          : `${inventory.daysUntilExpiry} days remaining`}
                                </p>
                            )}
                        </div>

                        {/* Return Window */}
                        <div>
                            <p className="text-sm text-muted">
                                Return Window
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {
                                    inventory.returnWindowDays
                                }{" "}
                                days
                            </p>
                        </div>

                        {/* Return Deadline */}
                        <div>
                            <p className="text-sm text-muted">
                                Return Deadline
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {formatDate(
                                    inventory.returnDeadline
                                )}
                            </p>

                            {typeof inventory.daysUntilReturnDeadline ===
                                "number" && (
                                <p
                                    className={`mt-1 text-sm ${
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
                                          : `${inventory.daysUntilReturnDeadline} days remaining`}
                                </p>
                            )}
                        </div>

                    </div>
                </div>

                {/* =========================
                    Status Section
                ========================== */}
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">

                    {/* Expiry Status */}
                    <div className="rounded-xl border border-line bg-panel p-6 shadow-sm">

                        <p className="text-sm text-muted">
                            Expiry Status
                        </p>

                        <div className="mt-3">
                            <span
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${expiryStatusConfig.className}`}
                            >
                                <span>
                                    {
                                        expiryStatusConfig.icon
                                    }
                                </span>

                                {
                                    expiryStatusConfig.label
                                }
                            </span>
                        </div>
                    </div>

                    {/* Return Status */}
                    <div className="rounded-xl border border-line bg-panel p-6 shadow-sm">

                        <p className="text-sm text-muted">
                            Return Status
                        </p>

                        <div className="mt-3">
                            <span
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${returnStatusConfig.className}`}
                            >
                                <span>
                                    {
                                        returnStatusConfig.icon
                                    }
                                </span>

                                {
                                    returnStatusConfig.label
                                }
                            </span>
                        </div>
                    </div>
                </div>

                {/* =========================
                    Potential Loss
                ========================== */}
                <div className="mb-6 rounded-xl border border-line bg-panel p-6 shadow-sm">

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                        <div>
                            <p className="text-sm text-muted">
                                Potential Loss
                            </p>

                            <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                ₹
                                {formatCurrency(
                                    inventory.potentialLoss
                                )}
                            </h2>

                            {Number(
                                inventory.potentialLoss
                            ) > 0 ? (
                                <p className="mt-2 text-sm font-medium text-red-600">
                                    ⚠️ This batch represents potential inventory loss.
                                </p>
                            ) : (
                                <p className="mt-2 text-sm text-muted">
                                    No potential loss recorded
                                    for this batch.
                                </p>
                            )}
                        </div>

                        <div className="rounded-xl bg-gray-50 p-4">
                            <p className="text-sm text-muted">
                                Inventory Value
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                ₹
                                {formatCurrency(
                                    inventory.inventoryValue
                                )}
                            </p>
                        </div>

                    </div>
                </div>

                {/* =========================
                    Supplier Information
                ========================== */}
                <div className="mb-6 rounded-xl border border-line bg-panel p-6 shadow-sm">

                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Supplier
                            </h2>

                            <p className="mt-1 text-sm text-muted">
                                Supplier responsible for this batch
                            </p>
                        </div>

                        {inventory.supplier?._id && (
                            <button
                                type="button"
                                onClick={() =>
                                    navigate(
                                        `/suppliers/${inventory.supplier._id}`
                                    )
                                }
                                className="rounded-lg border border-mint-500 px-4 py-2 text-sm font-medium text-mint-700 hover:bg-mint-50"
                            >
                                View Supplier
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">

                        {/* Company */}
                        <div>
                            <p className="text-sm text-muted">
                                Company
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.supplier
                                    ?.companyName ||
                                    "Unknown Supplier"}
                            </p>
                        </div>

                        {/* Contact */}
                        <div>
                            <p className="text-sm text-muted">
                                Contact Name
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.supplier
                                    ?.name ||
                                    "N/A"}
                            </p>
                        </div>

                        {/* Phone */}
                        <div>
                            <p className="text-sm text-muted">
                                Phone
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.supplier
                                    ?.phone ||
                                    "N/A"}
                            </p>
                        </div>

                        {/* Email */}
                        <div>
                            <p className="text-sm text-muted">
                                Email
                            </p>

                            <p className="mt-1 break-all font-semibold text-gray-900">
                                {inventory.supplier
                                    ?.email ||
                                    "N/A"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* =========================
                    Storage Information
                ========================== */}
                <div className="mb-6 rounded-xl border border-line bg-panel p-6 shadow-sm">

                    <h2 className="text-xl font-semibold text-gray-900">
                        Storage Information
                    </h2>

                    <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">

                        <div>
                            <p className="text-sm text-muted">
                                Location
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.location ||
                                    "N/A"}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-muted">
                                Manufacturer
                            </p>

                            <p className="mt-1 font-semibold text-gray-900">
                                {inventory.medicine
                                    ?.manufacturer ||
                                    "N/A"}
                            </p>
                        </div>

                    </div>
                </div>

                {/* =========================
                    Bottom Actions
                ========================== */}
                <div className="flex flex-wrap justify-end gap-3">

                    <button
                        type="button"
                        onClick={() =>
                            navigate("/inventory")
                        }
                        className="rounded-lg border border-gray-300 bg-panel px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Back to Inventory
                    </button>

                    {inventory.supplier?._id && (
                        <button
                            type="button"
                            onClick={() =>
                                navigate(
                                    `/suppliers/${inventory.supplier._id}`
                                )
                            }
                            className="rounded-lg bg-mint-700 px-5 py-2.5 font-medium text-white hover:bg-mint-800"
                        >
                            View Supplier
                        </button>
                    )}

                </div>

            </div>
        </div>
    );
}

export default InventoryDetails;
