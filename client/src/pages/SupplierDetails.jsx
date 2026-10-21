import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import ResponsiveTableHint from "../components/ResponsiveTableHint.jsx";

const getReferenceId = (value) => {
    if (value && typeof value === "object") {
        value = value._id;
    }

    return value == null ? "" : String(value);
};

const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;

function calculateInventoryValue(item) {
    const quantity = Number(item.quantity) || 0;
    const purchasePrice = Number(item.purchasePrice) || 0;
    return quantity * purchasePrice;
}

function formatDate(value) {
    if (!value) return "N/A";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function SupplierDetails() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [supplier, setSupplier] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [supplierReturns, setSupplierReturns] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [returnsError, setReturnsError] = useState("");

    // Fetch supplier and inventory, then connect this supplier's returns.
    const fetchSupplierDetails = useCallback(async () => {
        setLoading(true);
        setError("");
        setReturnsError("");

        try {
            const [supplierResponse, inventoryResponse] = await Promise.all([
                api.get(`/suppliers/${id}`),
                api.get("/inventory"),
            ]);

            const supplierData = supplierResponse.data?.supplier ?? null;

            const allInventory = Array.isArray(
                inventoryResponse.data?.inventories
            )
                ? inventoryResponse.data.inventories
                : [];

            // Support both populated supplier objects and supplier IDs.
            const supplierInventory = allInventory.filter(
                (item) =>
                    getReferenceId(item.supplier) === String(id)
            );

            setSupplier(supplierData);
            setInventory(supplierInventory);

            // Returns are loaded separately so a returns endpoint error
            // does not prevent supplier and inventory information showing.
            try {
                const returnsResponse = await api.get("/returns");

                const allReturns = Array.isArray(
                    returnsResponse.data?.returns
                )
                    ? returnsResponse.data.returns
                    : [];

                const matchingReturns = allReturns.filter(
                    (item) =>
                        getReferenceId(item.supplier) === String(id)
                );

                setSupplierReturns(matchingReturns);
            } catch (returnError) {
                console.error(
                    "Fetch supplier returns error:",
                    returnError
                );

                setSupplierReturns([]);

                setReturnsError(
                    returnError.response?.data?.message ||
                        "Unable to load return statistics."
                );
            }
        } catch (fetchError) {
            console.error(
                "Fetch supplier details error:",
                fetchError
            );

            setError(
                fetchError.response?.data?.message ||
                    "Failed to load supplier details."
            );
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            const timerId = window.setTimeout(() => {
                void fetchSupplierDetails();
            }, 0);
            return () => window.clearTimeout(timerId);
        }
        return undefined;
    }, [id, fetchSupplierDetails]);

    // Calculate inventory value.
    const totalInventoryValue = useMemo(
        () =>
            inventory.reduce(
                (total, item) => total + calculateInventoryValue(item),
                0
            ),
        [inventory]
    );

    const totalInventoryQuantity = useMemo(
        () =>
            inventory.reduce(
                (total, item) => total + (Number(item.quantity) || 0),
                0
            ),
        [inventory]
    );

    // Calculate supplier return statistics from existing return records.
    const returnSummary = useMemo(() => {
        return {
            pendingReturns: supplierReturns.filter(
                (item) => item.status === "PENDING"
            ).length,

            approvedReturns: supplierReturns.filter(
                (item) => item.status === "APPROVED"
            ).length,

            completedReturns: supplierReturns.filter(
                (item) => item.status === "RETURNED"
            ).length,

            totalReturnValue: supplierReturns.reduce(
                (total, item) =>
                    total + (Number(item.returnValue) || 0),
                0
            ),
        };
    }, [supplierReturns]);

    // Loading
    if (loading) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-7xl">
                    <div className="rounded-lg bg-panel p-8 text-center shadow-sm">
                        Loading supplier details...
                    </div>
                </div>
            </div>
        );
    }

    // Error
    if (error) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-600">
                        {error}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={fetchSupplierDetails}
                            className="rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                        >
                            Retry
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate("/suppliers")}
                            className="rounded-lg border border-gray-300 bg-panel px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Back to Suppliers
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Supplier not found
    if (!supplier) {
        return (
            <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
                <div className="mx-auto max-w-7xl">
                    <div className="rounded-lg bg-panel p-8 text-center shadow-sm">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Supplier not found
                        </h2>

                        <p className="mt-2 text-muted">
                            The supplier you are looking for does not exist.
                        </p>

                        <button
                            type="button"
                            onClick={() => navigate("/suppliers")}
                            className="mt-5 rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                        >
                            Back to Suppliers
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const inventoryCards = [
        {
            label: "Inventory Batches",
            value: inventory.length,
            valueClass: "text-gray-900",
        },
        {
            label: "Total Quantity",
            value: totalInventoryQuantity.toLocaleString("en-IN"),
            valueClass: "text-gray-900",
        },
        {
            label: "Inventory Value",
            value: formatCurrency(totalInventoryValue),
            valueClass: "text-gray-900",
        },
    ];

    const returnCards = [
        {
            label: "Pending Returns",
            value: returnSummary.pendingReturns,
            valueClass: "text-amber-600",
        },
        {
            label: "Approved Returns",
            value: returnSummary.approvedReturns,
            valueClass: "text-sky-600",
        },
        {
            label: "Completed Returns",
            value: returnSummary.completedReturns,
            valueClass: "text-green-600",
        },
        {
            label: "Total Return Value",
            value: formatCurrency(returnSummary.totalReturnValue),
            valueClass: "text-gray-900",
        },
    ];

    return (
        <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <button
                            type="button"
                            onClick={() => navigate("/suppliers")}
                            className="mb-3 text-sm font-medium text-mint-700 hover:text-mint-800"
                        >
                            ← Back to Suppliers
                        </button>

                        <h1 className="text-3xl font-bold text-gray-900">
                            {supplier.companyName || supplier.name || "Supplier"}
                        </h1>

                        <p className="mt-1 text-sm text-muted">
                            Supplier details, inventory, and returns
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/suppliers"
                            className="rounded-lg border border-gray-300 bg-panel px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                        >
                            All Suppliers
                        </Link>

                        <Link
                            to="/returns"
                            className="rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800"
                        >
                            View Returns
                        </Link>
                    </div>
                </div>

                {/* Supplier Information */}
                <section className="mb-8 rounded-xl border border-line bg-panel p-6 shadow-sm">
                    <div className="mb-5">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Supplier Information
                        </h2>

                        <p className="mt-1 text-sm text-muted">
                            Contact and company information
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="text-sm text-muted">Company</p>
                            <p className="mt-1 font-semibold text-gray-900">
                                {supplier.companyName || "N/A"}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-muted">Contact Name</p>
                            <p className="mt-1 font-semibold text-gray-900">
                                {supplier.name || "N/A"}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-muted">Phone</p>
                            <p className="mt-1 font-semibold text-gray-900">
                                {supplier.phone || "N/A"}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-muted">Email</p>
                            <p className="mt-1 break-words font-semibold text-gray-900">
                                {supplier.email || "N/A"}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                        <p className="text-sm text-muted">Address</p>
                        <p className="mt-1 text-gray-900">
                            {supplier.address || "N/A"}
                        </p>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                        <p className="text-sm text-muted">Return Policy</p>
                        <p className="mt-1 text-gray-900">
                            {supplier.returnPolicy || "N/A"}
                        </p>
                    </div>
                </section>

                {/* Inventory Summary */}
                <section className="mb-8">
                    <h2 className="mb-4 text-xl font-semibold text-gray-900">
                        Inventory Summary
                    </h2>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {inventoryCards.map((card) => (
                            <article
                                key={card.label}
                                className="rounded-xl border border-line bg-panel p-5 shadow-sm"
                            >
                                <p className="text-sm text-muted">
                                    {card.label}
                                </p>

                                <p className={`mt-1 text-2xl font-bold ${card.valueClass}`}>
                                    {card.value}
                                </p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Return Summary */}
                <section className="mb-8">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Return Summary
                            </h2>

                            <p className="mt-1 text-sm text-muted">
                                Return requests linked to this supplier
                            </p>
                        </div>

                        <Link
                            to="/returns"
                            className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                        >
                            Manage returns →
                        </Link>
                    </div>

                    {returnsError && (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            {returnsError} Supplier and inventory information is still available.

                            <button
                                type="button"
                                onClick={fetchSupplierDetails}
                                className="ml-2 font-semibold underline"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {returnCards.map((card) => (
                            <article
                                key={card.label}
                                className="rounded-xl border border-line bg-panel p-5 shadow-sm"
                            >
                                <p className="text-sm text-muted">
                                    {card.label}
                                </p>

                                <p className={`mt-2 text-2xl font-bold ${card.valueClass}`}>
                                    {card.value}
                                </p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Inventory Supplied */}
                <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                    <div className="border-b border-line px-6 py-5">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Inventory Supplied
                        </h2>

                        <p className="mt-1 text-sm text-muted">
                            Medicines and batches supplied by this supplier
                        </p>
                    </div>

                    <ResponsiveTableHint />
                    <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" role="region" tabIndex={0} aria-label="Inventory supplied by this supplier, horizontally scrollable table">
                        <table className="w-full min-w-[880px]">
                            <thead className="bg-gray-100">
                                <tr>
                                    {[
                                        "Medicine",
                                        "Batch",
                                        "Qty",
                                        "Expiry",
                                        "Purchase Price",
                                        "Location",
                                    ].map((heading) => (
                                        <th
                                            key={heading}
                                            className="px-6 py-4 text-left text-sm font-semibold text-gray-700"
                                        >
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {inventory.length > 0 ? (
                                    inventory.map((item) => (
                                        <tr
                                            key={item._id}
                                            className="border-t border-line hover:bg-gray-50"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">
                                                    {item.medicine?.name || "N/A"}
                                                </div>

                                                {item.medicine?.genericName && (
                                                    <div className="text-sm text-muted">
                                                        {item.medicine.genericName}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-gray-700">
                                                {item.batchNumber || "N/A"}
                                            </td>

                                            <td className="px-6 py-4 text-gray-700">
                                                {item.quantity ?? 0}
                                            </td>

                                            <td className="px-6 py-4 text-gray-700">
                                                {formatDate(item.expiryDate)}
                                            </td>

                                            <td className="px-6 py-4 text-gray-700">
                                                {formatCurrency(item.purchasePrice)}
                                            </td>

                                            <td className="px-6 py-4 text-gray-700">
                                                {item.location || "N/A"}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-6 py-12 text-center"
                                        >
                                            <p className="text-lg font-medium text-gray-700">
                                                No inventory supplied
                                            </p>

                                            <p className="mt-1 text-sm text-muted">
                                                No inventory batches are currently linked to this supplier.
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default SupplierDetails;
