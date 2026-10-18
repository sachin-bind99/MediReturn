import { useCallback, useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import api from "../lib/api";



const ALERT_LABELS = {

    RETURN_DUE: "Return due soon",

    RETURN_OVERDUE: "Return deadline passed",

    EXPIRING_SOON: "Medicine expiring soon",

    EXPIRED: "Medicine expired",

};



const RETURN_ALERT_TYPES = ["RETURN_DUE", "RETURN_OVERDUE"];



const formatDate = (value) => {

    if (!value) return "—";



    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";



    return date.toLocaleDateString("en-IN", {

        day: "2-digit",

        month: "short",

        year: "numeric",

    });

};



const getInventoryId = (inventory) => {

    if (inventory && typeof inventory === "object") {

        return inventory._id || inventory.id || "";

    }



    return inventory || "";

};



export default function Alerts() {

    const navigate = useNavigate();



    const [alerts, setAlerts] = useState([]);

    const [unreadCount, setUnreadCount] = useState(0);

    const [loading, setLoading] = useState(true);

    const [actionLoading, setActionLoading] = useState("");

    const [error, setError] = useState("");

    const [generationWarning, setGenerationWarning] = useState("");

    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");

    const [typeFilter, setTypeFilter] = useState("ALL");
    const [priorityFilter, setPriorityFilter] = useState("ALL");

    const [unreadOnly, setUnreadOnly] = useState(false);



    const loadAlerts = useCallback(

        async ({ generate = false, showLoading = true } = {}) => {

            // State that controls the initial render is initialized above.
            // Refresh-specific state changes happen in the button handler,
            // not synchronously when this function is called by useEffect.

            try {

                // Generate current status-based alerts when entering the page

                // or when the user presses Refresh alerts.

                if (generate) {

                    try {

                        await api.post("/alerts/generate");

                    } catch (generationError) {

                        console.error("Alert generation error:", generationError);

                        setGenerationWarning(

                            "Could not refresh alert conditions. Showing saved alerts instead."

                        );

                    }

                }



                const [alertsResponse, countResponse] = await Promise.all([

                    api.get("/alerts"),

                    api.get("/alerts/unread-count"),

                ]);



                setAlerts(

                    Array.isArray(alertsResponse.data?.alerts)

                        ? alertsResponse.data.alerts

                        : []

                );

                setUnreadCount(Number(countResponse.data?.count) || 0);

            } catch (loadError) {

                console.error("Load alerts error:", loadError);

                setError(

                    loadError.response?.data?.message ||

                        "Unable to load notifications. Please try again."

                );

            } finally {

                if (showLoading) setLoading(false);

            }

        },

        []

    );



    const handleRefreshAlerts = () => {
        setLoading(true);
        setError("");
        setGenerationWarning("");
        void loadAlerts({ generate: true });
    };

    useEffect(() => {
        // Defer the initial request until after the effect has been set up.
        const timerId = window.setTimeout(() => {
            void loadAlerts({ generate: true });
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [loadAlerts]);



    const markAsRead = async (alertId) => {

        setActionLoading(alertId);

        setError("");

        setNotice("");



        try {

            await api.patch(`/alerts/${alertId}/read`);

            await loadAlerts({ showLoading: false });

            setNotice("Alert marked as read.");

        } catch (actionError) {

            console.error("Mark alert read error:", actionError);

            setError(

                actionError.response?.data?.message ||

                    "Unable to mark alert as read."

            );

        } finally {

            setActionLoading("");

        }

    };



    const markAllAsRead = async () => {

        setActionLoading("ALL");

        setError("");

        setNotice("");



        try {

            await api.patch("/alerts/read-all");

            await loadAlerts({ showLoading: false });

            setNotice("All alerts marked as read.");

        } catch (actionError) {

            console.error("Mark all alerts read error:", actionError);

            setError(

                actionError.response?.data?.message ||

                    "Unable to mark alerts as read."

            );

        } finally {

            setActionLoading("");

        }

    };



    const openInventory = async (alert) => {

        const inventoryId = getInventoryId(alert.inventory);



        if (!inventoryId) {

            setError("The inventory batch linked to this alert is unavailable.");

            return;

        }



        setError("");

        // Mark it as read before navigating. A read failure should not prevent

        // the user from reviewing the inventory batch.

        if (!alert.isRead) {

            setActionLoading(alert._id);

            try {

                await api.patch(`/alerts/${alert._id}/read`);

                await loadAlerts({ showLoading: false });

            } catch (actionError) {

                console.error("Mark alert read before opening batch:", actionError);

                setError(

                    actionError.response?.data?.message ||

                        "The alert could not be marked as read, but you can still review the batch."

                );

            } finally {

                setActionLoading("");

            }

        }



        navigate(`/inventory/${inventoryId}`);

    };



    const visibleAlerts = alerts.filter((alert) => {
        const searchText = search.trim().toLowerCase();
        const inventory =
            alert.inventory && typeof alert.inventory === "object"
                ? alert.inventory
                : null;

        const matchesSearch = [
            alert.title,
            alert.message,
            alert.batchNumber,
            inventory?.batchNumber,
        ].some((value) =>
            String(value ?? "").toLowerCase().includes(searchText)
        );

        const matchesType = typeFilter === "ALL" || alert.type === typeFilter;
        const matchesPriority =
            priorityFilter === "ALL" ||
            String(alert.priority ?? "").toUpperCase() === priorityFilter;
        const matchesUnread = !unreadOnly || !alert.isRead;

        return matchesSearch && matchesType && matchesPriority && matchesUnread;
    });



    return (

        <div className="min-h-screen bg-canvas text-slate-800">

            <header className="border-b border-line bg-navbar text-navbar-ink shadow-sm">

                <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">

                    <div>

                        <h1 className="text-2xl font-bold text-navbar-ink">

                            Notifications

                        </h1>

                        <p className="mt-1 text-sm text-navbar-ink">

                            Inventory expiry and return deadline alerts.

                        </p>

                        <p className="mt-2 text-sm font-semibold text-navbar-ink">

                            {unreadCount} unread

                        </p>

                    </div>



                    <div className="flex flex-wrap gap-3">

                        <Link

                            to="/dashboard"

                            className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"

                        >

                            Dashboard

                        </Link>

                        <button

                            type="button"

                            onClick={handleRefreshAlerts}

                            disabled={loading}

                            className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"

                        >

                            {loading ? "Refreshing..." : "Refresh alerts"}

                        </button>

                        <button

                            type="button"

                            onClick={markAllAsRead}

                            disabled={unreadCount === 0 || actionLoading !== ""}

                            className="rounded-xl bg-mint-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50"

                        >

                            {actionLoading === "ALL" ? "Updating..." : "Mark all as read"}

                        </button>

                    </div>

                </div>

            </header>



            <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6">

                {error && (

                    <div

                        role="alert"

                        className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"

                    >

                        {error}

                    </div>

                )}

                {generationWarning && (

                    <div

                        role="status"

                        className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"

                    >

                        {generationWarning}

                    </div>

                )}

                {notice && (

                    <div

                        role="status"

                        className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"

                    >

                        {notice}

                    </div>

                )}



                <section
                    className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    aria-label="Filter alerts"
                >
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search title, message, or batch number..."
                        aria-label="Search alerts by title, message, or batch number"
                        className="min-w-0 rounded-xl border border-slate-300 bg-panel px-3 py-2.5 text-sm outline-none focus:border-mint-600 focus:ring-2 focus:ring-mint-100"
                    />

                    <select
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                        aria-label="Filter alerts by type"
                        className="rounded-xl border border-slate-300 bg-panel px-3 py-2.5 text-sm outline-none focus:border-mint-600"
                    >
                        <option value="ALL">All alert types</option>
                        <option value="RETURN_DUE">Return due</option>
                        <option value="RETURN_OVERDUE">Return overdue</option>
                        <option value="EXPIRING_SOON">Expiring soon</option>
                        <option value="EXPIRED">Expired</option>
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(event) => setPriorityFilter(event.target.value)}
                        aria-label="Filter alerts by priority"
                        className="rounded-xl border border-slate-300 bg-panel px-3 py-2.5 text-sm outline-none focus:border-mint-600"
                    >
                        <option value="ALL">All priorities</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                    </select>

                    <label className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm">
                        <input
                            type="checkbox"
                            checked={unreadOnly}
                            onChange={(event) => setUnreadOnly(event.target.checked)}
                        />
                        Unread only
                    </label>
                </section>



                {loading ? (

                    <div className="space-y-4">

                        {[1, 2, 3].map((item) => (

                            <div

                                key={item}

                                className="h-32 animate-pulse rounded-2xl bg-panel"

                            />

                        ))}

                    </div>

                ) : visibleAlerts.length === 0 ? (

                    <div className="rounded-2xl border border-line bg-panel px-6 py-14 text-center">

                        <div className="text-3xl" aria-hidden="true">✓</div>

                        <h2 className="mt-3 font-semibold text-slate-900">

                            No notifications found

                        </h2>

                        <p className="mt-1 text-sm text-muted">

                            There are no active alerts matching your filters.

                        </p>

                    </div>

                ) : (

                    <div className="space-y-4">

                        {visibleAlerts.map((alert) => {

                            const inventory =

                                alert.inventory && typeof alert.inventory === "object"

                                    ? alert.inventory

                                    : null;

                            const inventoryId = getInventoryId(alert.inventory);

                            const medicineName =

                                inventory?.medicine?.name ||

                                inventory?.medicine?.genericName ||

                                "Medicine";

                            const supplierName =

                                inventory?.supplier?.companyName ||

                                inventory?.supplier?.name ||

                                "Supplier";

                            const isCritical = alert.priority === "CRITICAL";

                            const isReturnAlert = RETURN_ALERT_TYPES.includes(alert.type);

                            const isExpiredAlert = alert.type === "EXPIRED";



                            return (

                                <article

                                    key={alert._id}

                                    className={`rounded-2xl border bg-panel p-5 shadow-sm ${

                                        alert.isRead ? "border-line" : "border-mint-200"

                                    }`}

                                >

                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                                        <button

                                            type="button"

                                            onClick={() => openInventory(alert)}

                                            disabled={!inventoryId}

                                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-70"

                                        >

                                            <div className="flex flex-wrap items-center gap-2">

                                                <h2 className="font-semibold text-slate-900">

                                                    {alert.title || ALERT_LABELS[alert.type] || alert.type}

                                                </h2>

                                                {!alert.isRead && (

                                                    <span className="rounded-full bg-mint-50 px-2 py-1 text-xs font-semibold text-mint-700">

                                                        Unread

                                                    </span>

                                                )}

                                                <span

                                                    className={`rounded-full px-2 py-1 text-xs font-semibold ${

                                                        isCritical

                                                            ? "bg-red-50 text-red-700"

                                                            : "bg-amber-50 text-amber-700"

                                                    }`}

                                                >

                                                    {alert.priority}

                                                </span>

                                            </div>



                                            <p className="mt-2 text-sm leading-6 text-slate-600">

                                                {alert.message}

                                            </p>

                                            <p className="mt-3 text-sm font-medium text-slate-800">

                                                Batch {inventory?.batchNumber || "Unavailable"} · {supplierName}

                                            </p>

                                            <p className="mt-1 text-xs text-muted">

                                                {medicineName} · Alert created {formatDate(alert.createdAt)}

                                            </p>

                                            <span className="mt-3 inline-block text-sm font-semibold text-mint-700">

                                                Review batch details →

                                            </span>

                                        </button>



                                        {!alert.isRead && (

                                            <button

                                                type="button"

                                                onClick={() => markAsRead(alert._id)}

                                                disabled={actionLoading === alert._id || actionLoading === "ALL"}

                                                className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"

                                            >

                                                {actionLoading === alert._id ? "Updating..." : "Mark as read"}

                                            </button>

                                        )}

                                    </div>



                                    {isReturnAlert && (

                                        <div className="mt-4 border-t border-slate-100 pt-4">

                                            <p className="mb-2 text-sm text-slate-600">

                                                Review the batch details and supplier return policy before submitting a return request.

                                            </p>

                                            <Link

                                                to="/returns"

                                                className="inline-flex items-center rounded-lg bg-mint-700 px-4 py-2 text-sm font-semibold text-white hover:bg-mint-800"

                                            >

                                                Open Return Workflow →

                                            </Link>

                                        </div>

                                    )}



                                    {isExpiredAlert && (

                                        <div

                                            role="alert"

                                            className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"

                                        >

                                            <strong>EXPIRED BATCH:</strong> This batch is past its expiry date. Follow your pharmacy's handling and disposal policy. Supplier return acceptance is not guaranteed.

                                        </div>

                                    )}

                                </article>

                            );

                        })}

                    </div>

                )}

            </main>

        </div>

    );

}
