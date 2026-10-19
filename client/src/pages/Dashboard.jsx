import { useCallback, useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";

import api from "../lib/api";
import { clearAuthToken, getAuthToken } from "../lib/authSession";

// ----------------------------------------
// Main KPI configuration
// ----------------------------------------
const mainMetrics = [
    {
        key: "totalMedicines",
        title: "Total Medicines",
        icon: "Rx",
        color: "bg-mint-100 text-mint-700",
        note: "Medicine records in your catalog"
    },
    {
        key: "totalBatches",
        title: "Total Batches",
        icon: "Box",
        color: "bg-mint-200 text-mint-800",
        note: "Inventory batches currently tracked"
    },
    {
        key: "totalUnits",
        title: "Total Units",
        icon: "U",
        color: "bg-emerald-50 text-emerald-700",
        note: "Total units across all batches"
    },
    {
        key: "inventoryValue",
        title: "Inventory Value",
        icon: "₹",
        color: "bg-amber-50 text-amber-700",
        note: "Current value of all inventory"
    }
];

// ----------------------------------------
// Risk KPI configuration
// ----------------------------------------
const riskMetrics = [
    {
        key: "lowStock",
        title: "Low Stock",
        status: "LOW_STOCK",
        icon: "!",
        color: "bg-rose-50 text-rose-700",
        note: "Batches with 10 or fewer units"
    },
    {
        key: "expiringSoon",
        title: "Expiring Soon",
        status: "EXPIRING_SOON",
        icon: "!",
        color: "bg-amber-50 text-amber-700",
        note: "Batches expiring within 30 days"
    },
    {
        key: "returnDue",
        title: "Return Due",
        status: "RETURN_DUE",
        icon: "!",
        color: "bg-orange-50 text-orange-700",
        note: "Batches whose return is due today"
    },
    {
        key: "returnOverdue",
        title: "Return Overdue",
        status: "RETURN_OVERDUE",
        icon: "!",
        color: "bg-red-50 text-red-700",
        note: "Batches past their return deadline"
    },
    {
        key: "expired",
        title: "Expired",
        status: "EXPIRED",
        icon: "E",
        color: "bg-slate-100 text-slate-700",
        note: "Batches that have already expired"
    }
];

// ----------------------------------------
// Number formatting
// ----------------------------------------
const formatNumber = (value) => {
    const number = Number(value) || 0;

    return number.toLocaleString("en-IN");
};

// ----------------------------------------
// Currency formatting
// ----------------------------------------
const formatCurrency = (value) => {
    const number = Number(value) || 0;

    return number.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

// ----------------------------------------
// Date formatting
// ----------------------------------------
const formatDate = (date) => {
    if (!date) {
        return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "—";
    }

    return parsedDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

// ----------------------------------------
// Relative date formatting
// ----------------------------------------
const formatRecentDate = (date) => {
    if (!date) {
        return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "—";
    }

    const now = new Date();

    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const target = new Date(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate()
    );

    const diffDays = Math.round(
        (today.getTime() - target.getTime()) /
            (24 * 60 * 60 * 1000)
    );

    if (diffDays === 0) {
        return "Today";
    }

    if (diffDays === 1) {
        return "Yesterday";
    }

    if (diffDays > 1 && diffDays <= 7) {
        return `${diffDays} days ago`;
    }

    return formatDate(date);
};

// ----------------------------------------
// Get urgent issue configuration
// ----------------------------------------
const getIssueConfig = (issue) => {
    switch (issue) {
        case "Expired":
            return {
                icon: "E",
                className:
                    "bg-gray-100 text-gray-800 border-gray-300"
            };

        case "Return Overdue":
            return {
                icon: "!",
                className:
                    "bg-red-50 text-red-700 border-red-200"
            };

        case "Return Due":
            return {
                icon: "!",
                className:
                    "bg-orange-50 text-orange-700 border-orange-200"
            };

        case "Expiring Soon":
            return {
                icon: "!",
                className:
                    "bg-yellow-50 text-yellow-700 border-yellow-200"
            };

        default:
            return {
                icon: "-",
                className:
                    "bg-gray-50 text-gray-600 border-line"
            };
    }
};

function Dashboard({ user }) {
    const navigate = useNavigate();

    // --------------------------------
    // Dashboard stats
    // --------------------------------
    const [stats, setStats] = useState({
        totalMedicines: 0,
        totalBatches: 0,
        totalUnits: 0,
        inventoryValue: 0,
        lowStock: 0,
        expiringSoon: 0,
        returnDue: 0,
        returnOverdue: 0,
        expired: 0,
        potentialLoss: 0
    });

    // --------------------------------
    // Dashboard lists
    // --------------------------------
    const [urgentAttention, setUrgentAttention] =
        useState([]);

    const [upcomingReturns, setUpcomingReturns] =
        useState([]);

    const [recentInventory, setRecentInventory] =
        useState([]);

    // --------------------------------
    // Return request summary
    // --------------------------------
    const [returnSummary, setReturnSummary] = useState({
        pendingReturns: 0,
        completedReturns: 0,
        totalReturnValue: 0
    });

    // --------------------------------
    // Loading / Error
    // --------------------------------
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // --------------------------------
    // Notification unread count
    // --------------------------------
    const [unreadAlertCount, setUnreadAlertCount] = useState(0);

    const userName =
        user?.name ||
        user?.email ||
        "Pharmacy team";

    const initials = userName
        .slice(0, 1)
        .toUpperCase();

    // --------------------------------
    // Fetch complete dashboard
    // --------------------------------
    const fetchDashboardStats = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const response =
                await api.get("/dashboard");

            const data = response.data || {};

            setStats({
                totalMedicines:
                    data.stats?.totalMedicines || 0,

                totalBatches:
                    data.stats?.totalBatches || 0,

                totalUnits:
                    data.stats?.totalUnits || 0,

                inventoryValue:
                    data.stats?.inventoryValue || 0,

                expiringSoon:
                    data.stats?.expiringSoon || 0,

                returnDue:
                    data.stats?.returnDue || 0,

                returnOverdue:
                    data.stats?.returnOverdue || 0,

                expired:
                    data.stats?.expired || 0,

                potentialLoss:
                    data.stats?.potentialLoss || 0
            });

            setUrgentAttention(
                Array.isArray(data.urgentAttention)
                    ? data.urgentAttention
                    : []
            );

            setUpcomingReturns(
                Array.isArray(data.upcomingReturns)
                    ? data.upcomingReturns
                    : []
            );

            setRecentInventory(
                Array.isArray(data.recentInventory)
                    ? data.recentInventory
                    : []
            );

            // Load the low-stock count from the inventory API so it uses
            // the same LOW_STOCK_THRESHOLD rule as the Inventory page.
            // If this request fails, the rest of the dashboard still loads.
            try {
                const lowStockResponse = await api.get("/inventory", {
                    params: { status: "LOW_STOCK" }
                });

                const lowStockCount = Number(
                    lowStockResponse.data?.count ??
                    lowStockResponse.data?.pagination?.totalItems ??
                    (Array.isArray(lowStockResponse.data?.inventories)
                        ? lowStockResponse.data.inventories.length
                        : 0)
                ) || 0;

                setStats((currentStats) => ({
                    ...currentStats,
                    lowStock: lowStockCount
                }));
            } catch (lowStockError) {
                console.error(
                    "Fetch dashboard low-stock count error:",
                    lowStockError
                );
            }

            // Fetch return metrics separately so a returns API issue
            // does not prevent the main dashboard data from loading.
            try {
                const returnsResponse = await api.get("/returns");
                const returnRequests = Array.isArray(
                    returnsResponse.data?.returns
                )
                    ? returnsResponse.data.returns
                    : [];

                setReturnSummary({
                    pendingReturns: returnRequests.filter(
                        (item) => item.status === "PENDING"
                    ).length,
                    completedReturns: returnRequests.filter(
                        (item) => item.status === "RETURNED"
                    ).length,
                    totalReturnValue: returnRequests.reduce(
                        (total, item) =>
                            total + Number(item.returnValue || 0),
                        0
                    )
                });
            } catch (returnError) {
                console.error(
                    "Fetch dashboard return summary error:",
                    returnError
                );
                // Keep the dashboard usable if return metrics are unavailable.
            }
        } catch (error) {
            console.error(
                "Fetch dashboard error:",
                error
            );

            setError(
                error.response?.data?.message ||
                    "Failed to load dashboard"
            );
        } finally {
            setLoading(false);
        }
    }, []);

    // --------------------------------
    // Initial fetch
    // --------------------------------
    useEffect(() => {
        const timerId = window.setTimeout(() => {
            void fetchDashboardStats();
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [fetchDashboardStats]);

    // --------------------------------
    // Refresh notification count on mount
    // --------------------------------
    useEffect(() => {
        let active = true;

        async function refreshAlertCount() {
            // Refresh alert conditions first. Continue fetching the unread
            // count even if alert generation fails.
            try {
                await api.post("/alerts/generate");
            } catch (error) {
                console.error(
                    "Dashboard alert generation error:",
                    error
                );
            }

            try {
                const response = await api.get(
                    "/alerts/unread-count"
                );

                if (active) {
                    setUnreadAlertCount(
                        Number(response.data?.count) || 0
                    );
                }
            } catch (error) {
                console.error(
                    "Fetch unread alert count error:",
                    error
                );
            }
        }

        refreshAlertCount();

        return () => {
            active = false;
        };
    }, []);

    // --------------------------------
    // Sign out
    // --------------------------------
    const handleSignOut = async () => {
        const sessionToken = getAuthToken();

        try {
            await api.post("/auth/logout");
        } catch {
            // Clear the browser session even if the API is unreachable.
        } finally {
            if (getAuthToken() === sessionToken) {
                clearAuthToken();
                navigate("/login", {
                    replace: true
                });
            }
        }
    };

    // --------------------------------
    // Navigate to inventory details
    // --------------------------------
    const handleInventoryClick = (
        inventoryId
    ) => {
        if (!inventoryId) {
            return;
        }

        navigate(
            `/inventory/${inventoryId}`
        );
    };

    // --------------------------------
    // Calculate display-only normal counts
    //
    // These use already-calculated API
    // status counts. No business logic
    // is being performed here.
    // --------------------------------
    const normalExpiryBatches = Math.max(
        0,
        Number(stats.totalBatches || 0) -
            Number(stats.expiringSoon || 0) -
            Number(stats.expired || 0)
    );

    const normalReturnBatches = Math.max(
        0,
        Number(stats.totalBatches || 0) -
            Number(stats.returnDue || 0) -
            Number(stats.returnOverdue || 0)
    );

    // --------------------------------
    // Inventory status chart data
    // --------------------------------
    const statusDistributionData = [
        {
            name: "Normal",
            count: normalExpiryBatches
        },
        {
            name: "Expiring Soon",
            count: Number(stats.expiringSoon || 0)
        },
        {
            name: "Return Due",
            count: Number(stats.returnDue || 0)
        },
        {
            name: "Overdue",
            count: Number(stats.returnOverdue || 0)
        },
        {
            name: "Expired",
            count: Number(stats.expired || 0)
        }
    ];

    return (
        <div className="min-h-screen bg-canvas text-slate-800">

            {/* =================================
                Header
            ================================== */}
            <header className="sticky top-0 z-20 border-b border-navbar-ink/20 bg-navbar text-navbar-ink shadow-sm backdrop-blur-xl">
                <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10">

                    <div className="flex shrink-0 items-center gap-3">
                        <Link
                            className="grid size-10 place-items-center rounded-2xl bg-mint-100 text-mint-700 transition hover:bg-mint-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-600 focus-visible:ring-offset-2"
                            to="/inventory"
                            state={{ openInventoryForm: true }}
                            aria-label="Add inventory batch"
                            title="Add inventory batch"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                className="size-5"
                                fill="none"
                            >
                                <path
                                    d="M12 5v14M5 12h14"
                                    stroke="currentColor"
                                    strokeWidth="2.6"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </Link>

                        <Link
                            className="font-semibold tracking-tight text-navbar-ink"
                            to="/dashboard"
                            aria-label="MediReturn dashboard"
                        >
                            <span className="text-lg">
                                Medi
                                <span className="text-navbar-ink">
                                    Return
                                </span>
                            </span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-5">

                        <div className="hidden items-center gap-3 sm:flex">
                            <span className="grid size-9 place-items-center rounded-full bg-mint-100 text-sm font-bold text-mint-800">
                                {initials}
                            </span>

                            <div className="max-w-48">
                                <p className="truncate text-sm font-semibold text-navbar-ink">
                                    {userName}
                                </p>

                                <p className="text-xs text-navbar-ink">
                                    Pharmacy workspace
                                </p>
                            </div>
                        </div>

                        <Link
                            to="/alerts"
                            aria-label={`Notifications: ${unreadAlertCount} unread`}
                            className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-mint-800 transition hover:bg-mint-50"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                className="size-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                                <path d="M10 21h4" />
                            </svg>

                            {unreadAlertCount > 0 && (
                                <span className="absolute -right-1 -top-1 grid min-w-5 h-5 place-items-center rounded-full bg-danger-button px-1 text-[10px] font-bold text-white">
                                    {unreadAlertCount > 99
                                        ? "99+"
                                        : unreadAlertCount}
                                </span>
                            )}
                        </Link>

                        <span className="hidden h-8 w-px bg-slate-700 sm:block" />

                        <button
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-panel px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            type="button"
                            onClick={handleSignOut}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            {/* =================================
                Main Layout
            ================================== */}
            <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1440px] lg:grid-cols-[252px_minmax(0,1fr)]">

                {/* =================================
                    Sidebar
                ================================== */}
                <aside className="border-b border-panel-muted bg-sidebar p-3 sm:px-6 lg:border-b-0 lg:border-r lg:px-5 lg:py-8">

                    <p className="hidden px-3 pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-mint-900 lg:block">
                        Workspace
                    </p>

                    <nav
                        className="flex gap-2 overflow-x-auto lg:flex-col"
                        aria-label="Dashboard sections"
                    >
                        {/* Overview */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl bg-mint-50 px-3.5 py-3 text-sm font-semibold text-mint-800 ring-1 ring-inset ring-mint-100"
                            to="/dashboard"
                            aria-current="page"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className="size-[18px]"
                                fill="none"
                                aria-hidden="true"
                            >
                                <rect
                                    x="3"
                                    y="3"
                                    width="5.5"
                                    height="5.5"
                                    rx="1.3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <rect
                                    x="11.5"
                                    y="3"
                                    width="5.5"
                                    height="5.5"
                                    rx="1.3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <rect
                                    x="3"
                                    y="11.5"
                                    width="5.5"
                                    height="5.5"
                                    rx="1.3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <rect
                                    x="11.5"
                                    y="11.5"
                                    width="5.5"
                                    height="5.5"
                                    rx="1.3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                            </svg>

                            Overview
                        </Link>

                        {/* Medicines */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900 transition hover:bg-panel/60 hover:text-mint-900"
                            to="/medicines"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className="size-[18px]"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M6.8 4.2a3.5 3.5 0 0 1 5 0l4 4a3.5 3.5 0 0 1-5 5l-4-4a3.5 3.5 0 0 1 0-5Z"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <path
                                    d="m7.5 11.4 6.9-6.9"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                            </svg>

                            Medicines

                            <span className="ml-auto hidden rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint-800 lg:inline-flex">
                                Open
                            </span>
                        </Link>

                        {/* Medicine Scanner */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900 transition hover:bg-panel/60 hover:text-mint-900"
                            to="/medicine-scanner"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className="size-[18px]"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M3 6V4.5A1.5 1.5 0 0 1 4.5 3H6m8 0h1.5A1.5 1.5 0 0 1 17 4.5V6m0 8v1.5a1.5 1.5 0 0 1-1.5 1.5H14m-8 0H4.5A1.5 1.5 0 0 1 3 15.5V14M5 10h10M6.5 8v4m2.5-4v4m2.5-4v4m2.5-4v4"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>

                            Medicine Scanner

                            <span className="ml-auto hidden rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint-800 lg:inline-flex">
                                Open
                            </span>
                        </Link>

                        {/* Inventory */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900 transition hover:bg-panel/60 hover:text-mint-900"
                            to="/inventory"
                        >
                            <span
                                className="grid size-[18px] place-items-center rounded bg-mint-100 text-[10px] font-bold text-mint-800"
                                aria-hidden="true"
                            >
                                I
                            </span>

                            Inventory

                            <span className="ml-auto hidden rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint-800 lg:inline-flex">
                                Open
                            </span>
                        </Link>

                        {/* Suppliers */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900 transition hover:bg-panel/60 hover:text-mint-900"
                            to="/suppliers"
                        >
                            <span
                                className="grid size-[18px] place-items-center rounded bg-mint-100 text-[10px] font-bold text-mint-800"
                                aria-hidden="true"
                            >
                                S
                            </span>

                            Suppliers

                            <span className="ml-auto hidden rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint-800 lg:inline-flex">
                                Open
                            </span>
                        </Link>

                        {/* Returns */}
                        <Link
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900 transition hover:bg-panel/60 hover:text-mint-900"
                            to="/returns"
                        >
                            <span
                                className="grid size-[18px] place-items-center rounded bg-mint-100 text-[10px] font-bold text-mint-800"
                                aria-hidden="true"
                            >
                                R
                            </span>

                            Returns

                            <span className="ml-auto hidden rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint-800 lg:inline-flex">
                                Open
                            </span>
                        </Link>

                        {/* Analytics */}
                        <div
                            className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-mint-900"
                            aria-disabled="true"
                        >
                            <span
                                className="grid size-[18px] place-items-center text-[10px] font-bold"
                                aria-hidden="true"
                            >
                                A
                            </span>

                            Analytics

                            <span className="ml-auto hidden text-[10px] font-semibold uppercase tracking-wide text-mint-900 lg:inline-flex">
                                Soon
                            </span>
                        </div>
                    </nav>

                    {/* Sidebar Info */}
                    <div className="mt-10 hidden rounded-2xl border border-deep-teal bg-deep-teal p-4 lg:block">

                        <span
                            className="grid size-9 place-items-center rounded-xl bg-panel text-mint-700 shadow-sm"
                            aria-hidden="true"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className="size-4"
                                fill="none"
                            >
                                <path
                                    d="M10 2.5 3.8 5v4.2c0 3.8 2.6 6.6 6.2 8.3 3.6-1.7 6.2-4.5 6.2-8.3V5L10 2.5Z"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <path
                                    d="m7.5 9.8 1.7 1.7 3.4-3.7"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>

                        <p className="mt-4 text-sm font-semibold text-white">
                            Smart inventory monitoring
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-300">
                            Track batches, suppliers, expiry dates and return deadlines from one workspace.
                        </p>
                    </div>
                </aside>

                {/* =================================
                    Dashboard Content
                ================================== */}
                <main className="min-w-0 px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12">

                    {/* Header */}
                    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">

                        <div>
                            <span className="text-xs font-bold uppercase tracking-[0.16em] text-mint-700">
                                Your workspace
                            </span>

                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                Good to see you
                                {user?.name
                                    ? `, ${user.name.split(" ")[0]}`
                                    : ""}
                            </h1>

                            <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
                                Here's a quick overview of your pharmacy workspace.
                            </p>
                        </div>

                        <Link
                            className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-xl bg-mint-700 px-4 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:bg-mint-800"
                            to="/inventory"
                        >
                            <svg
                                viewBox="0 0 20 20"
                                className="size-4"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M10 4v12M4 10h12"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                />
                            </svg>

                            Manage inventory
                        </Link>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                            <span>
                                {error}
                            </span>

                            <button
                                type="button"
                                onClick={fetchDashboardStats}
                                className="font-semibold underline underline-offset-2 hover:no-underline"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Loading */}
                    {loading ? (
                        <div className="space-y-6">

                            <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                                {Array.from({
                                    length: 9
                                }).map((_, index) => (
                                    <article
                                        key={index}
                                        className="rounded-2xl border border-line/80 bg-panel p-5 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                                            <div className="size-10 animate-pulse rounded-xl bg-slate-200" />
                                        </div>

                                        <div className="mt-5 h-9 w-24 animate-pulse rounded bg-slate-200" />

                                        <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-100" />
                                    </article>
                                ))}
                            </section>

                            <div className="grid gap-6 lg:grid-cols-2">
                                <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
                                <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
                            </div>

                        </div>
                    ) : Number(stats?.totalBatches || 0) === 0 ? (
                        <section className="overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm">
                            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                                <div className="p-8 sm:p-10">
                                    <span className="inline-flex rounded-xl bg-mint-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-mint-700">
                                        Inventory workspace
                                    </span>

                                    <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                                        No inventory available
                                    </h2>

                                    <p className="mt-3 max-w-xl text-sm leading-7 text-muted sm:text-base">
                                        Add your first medicine batch to start tracking expiry dates,
                                        inventory value and supplier returns.
                                    </p>

                                    <Link
                                        to="/inventory"
                                        className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mint-700 px-5 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:bg-mint-800"
                                    >
                                        Add Inventory

                                        <svg
                                            viewBox="0 0 20 20"
                                            className="size-4"
                                            fill="none"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M10 4v12M4 10h12"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    </Link>
                                </div>

                                <div className="hidden min-h-[280px] items-center justify-center bg-slate-50 lg:flex">
                                    <div className="grid size-24 place-items-center rounded-[2rem] bg-panel text-mint-700 shadow-xl shadow-mint-900/10 ring-1 ring-slate-100">
                                        <svg
                                            viewBox="0 0 24 24"
                                            className="size-10"
                                            fill="none"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z"
                                                stroke="currentColor"
                                                strokeWidth="1.7"
                                                strokeLinejoin="round"
                                            />
                                            <path
                                                d="M4 7.5 12 11l8-3.5M12 11v9"
                                                stroke="currentColor"
                                                strokeWidth="1.7"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : (
                        <>
                            {/* =================================
                                Main KPI Cards
                            ================================== */}
                            <section
                                className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
                                aria-label="Main dashboard metrics"
                            >
                                {mainMetrics.map(
                                    (metric) => {
                                        const value =
                                            stats?.[
                                                metric.key
                                            ] ?? 0;

                                        const displayValue =
                                            metric.key ===
                                            "inventoryValue"
                                                ? `₹${formatCurrency(
                                                      value
                                                  )}`
                                                : formatNumber(
                                                      value
                                                  );

                                        return (
                                            <article
                                                key={
                                                    metric.key
                                                }
                                                className="rounded-2xl border border-line/80 bg-panel p-5 shadow-sm shadow-slate-900/[0.025] transition hover:-translate-y-0.5 hover:shadow-lg"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="text-sm font-semibold text-slate-600">
                                                        {
                                                            metric.title
                                                        }
                                                    </p>

                                                    <span
                                                        className={`grid size-10 place-items-center rounded-xl text-lg font-semibold ${metric.color}`}
                                                    >
                                                        {
                                                            metric.icon
                                                        }
                                                    </span>
                                                </div>

                                                <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                                                    {
                                                        displayValue
                                                    }
                                                </p>

                                                <p className="mt-2 text-[13px] leading-5 text-muted">
                                                    {
                                                        metric.note
                                                    }
                                                </p>
                                            </article>
                                        );
                                    }
                                )}
                            </section>

                            {/* =================================
                                Return Risk Cards
                            ================================== */}
                            <section
                                className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
                                aria-label="Inventory risk metrics"
                            >
                                {riskMetrics.map(
                                    (metric) => (
                                        <Link
                                            key={metric.key}
                                            to={`/inventory?status=${metric.status}`}
                                            aria-label={`View inventory: ${metric.title}`}
                                            className="block rounded-2xl border border-line/80 bg-panel p-5 shadow-sm shadow-slate-900/[0.025] transition hover:-translate-y-0.5 hover:border-mint-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-600 focus-visible:ring-offset-2"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm font-semibold text-slate-600">
                                                    {
                                                        metric.title
                                                    }
                                                </p>

                                                <span
                                                    className={`grid size-10 place-items-center rounded-xl text-lg font-semibold ${metric.color}`}
                                                >
                                                    {
                                                        metric.icon
                                                    }
                                                </span>
                                            </div>

                                            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                                                {formatNumber(
                                                    stats?.[
                                                        metric
                                                            .key
                                                    ]
                                                )}
                                            </p>

                                            <p className="mt-2 text-[13px] leading-5 text-muted">
                                                {
                                                    metric.note
                                                }
                                            </p>
                                        </Link>
                                    )
                                )}
                            </section>

                            {/* =================================
                                Return Request Summary
                            ================================== */}
                            <section
                                className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
                                aria-label="Return request summary"
                            >
                                <article className="rounded-2xl border border-line/80 bg-panel p-5 shadow-sm shadow-slate-900/[0.025] transition hover:-translate-y-0.5 hover:shadow-lg">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-600">
                                            Pending Returns
                                        </p>
                                        <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-lg text-amber-700">
                                            ...
                                        </span>
                                    </div>
                                    <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                                        {formatNumber(returnSummary.pendingReturns)}
                                    </p>
                                    <Link
                                        to="/returns"
                                        className="mt-3 inline-block text-sm font-semibold text-mint-700 hover:text-mint-800"
                                    >
                                        View requests &rarr;
                                    </Link>
                                </article>

                                <article className="rounded-2xl border border-line/80 bg-panel p-5 shadow-sm shadow-slate-900/[0.025] transition hover:-translate-y-0.5 hover:shadow-lg">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-600">
                                            Completed Returns
                                        </p>
                                        <span className="grid size-10 place-items-center rounded-xl bg-green-50 text-lg text-green-700">
                                            OK
                                        </span>
                                    </div>
                                    <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                                        {formatNumber(returnSummary.completedReturns)}
                                    </p>
                                    <Link
                                        to="/returns"
                                        className="mt-3 inline-block text-sm font-semibold text-mint-700 hover:text-mint-800"
                                    >
                                        View requests &rarr;
                                    </Link>
                                </article>

                                <article className="rounded-2xl border border-line/80 bg-panel p-5 shadow-sm shadow-slate-900/[0.025] transition hover:-translate-y-0.5 hover:shadow-lg">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-600">
                                            Total Return Value
                                        </p>
                                        <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-lg font-semibold text-emerald-700">
                                            ₹
                                        </span>
                                    </div>
                                    <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                                        ₹{formatCurrency(returnSummary.totalReturnValue)}
                                    </p>
                                    <p className="mt-3 text-[13px] leading-5 text-muted">
                                        Value of all recorded return requests
                                    </p>
                                </article>
                            </section>

                            {/* =================================
                                Potential Loss
                            ================================== */}
                            <section className="mt-6 overflow-hidden rounded-3xl border border-red-200 bg-panel shadow-sm">

                                <div className="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">

                                    <div className="flex items-start gap-4">

                                        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-red-50 text-xl text-red-600">
                                            !
                                        </span>

                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
                                                Financial Risk
                                            </p>

                                            <h2 className="mt-1 text-xl font-semibold text-slate-900">
                                                Potential Loss
                                            </h2>

                                            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                                                Value of inventory that is currently considered potential loss because the associated batches have expired.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-5">

                                        <p className="text-3xl font-bold text-red-600">
                                            ₹
                                            {formatCurrency(
                                                stats?.potentialLoss
                                            )}
                                        </p>

                                        <Link
                                            to="/inventory"
                                            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                        >
                                            Review
                                        </Link>
                                    </div>
                                </div>
                            </section>

                            {/* =================================
                                Compact Status Summary
                            ================================== */}
                            <section className="mt-6 grid gap-6 lg:grid-cols-2">

                                {/* Expiry */}
                                <article className="rounded-3xl border border-line/80 bg-panel p-6 shadow-sm">

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">
                                                Expiry Overview
                                            </h2>

                                            <p className="mt-1 text-sm text-muted">
                                                Current batch expiry status
                                            </p>
                                        </div>

                                        <Link
                                            to="/inventory"
                                            className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                                        >
                                            View inventory
                                        </Link>
                                    </div>

                                    <div className="mt-6 grid grid-cols-3 gap-3">

                                        <div className="rounded-2xl bg-mint-50 p-4">
                                            <p className="text-xs font-semibold text-mint-700">
                                                Normal
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    normalExpiryBatches
                                                )}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl bg-amber-50 p-4">
                                            <p className="text-xs font-semibold text-amber-700">
                                                Expiring Soon
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    stats.expiringSoon
                                                )}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl bg-slate-100 p-4">
                                            <p className="text-xs font-semibold text-slate-700">
                                                Expired
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    stats.expired
                                                )}
                                            </p>
                                        </div>

                                    </div>
                                </article>

                                {/* Returns */}
                                <article className="rounded-3xl border border-line/80 bg-panel p-6 shadow-sm">

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">
                                                Return Overview
                                            </h2>

                                            <p className="mt-1 text-sm text-muted">
                                                Current return status
                                            </p>
                                        </div>

                                        <Link
                                            to="/inventory"
                                            className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                                        >
                                            View inventory
                                        </Link>
                                    </div>

                                    <div className="mt-6 grid grid-cols-3 gap-3">

                                        <div className="rounded-2xl bg-mint-50 p-4">
                                            <p className="text-xs font-semibold text-mint-700">
                                                Normal
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    normalReturnBatches
                                                )}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl bg-orange-50 p-4">
                                            <p className="text-xs font-semibold text-orange-700">
                                                Due
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    stats.returnDue
                                                )}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl bg-red-50 p-4">
                                            <p className="text-xs font-semibold text-red-700">
                                                Overdue
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                                {formatNumber(
                                                    stats.returnOverdue
                                                )}
                                            </p>
                                        </div>

                                    </div>
                                </article>
                            </section>

                            {/* =================================
                                Inventory Status Distribution
                            ================================== */}
                            <section className="mt-6 rounded-3xl border border-line/80 bg-panel p-6 shadow-sm">
                                <div className="mb-6">
                                    <h2 className="text-xl font-semibold text-slate-900">
                                        Inventory Status Distribution
                                    </h2>

                                    <p className="mt-1 text-sm text-muted">
                                        Current batch status indicators across your inventory
                                    </p>
                                </div>

                                <div className="h-[320px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={statusDistributionData}
                                            margin={{
                                                top: 10,
                                                right: 20,
                                                left: 0,
                                                bottom: 10
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                vertical={false}
                                                stroke="var(--color-line)"
                                            />

                                            <XAxis
                                                dataKey="name"
                                                tick={{
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    fill: "var(--color-muted)"
                                                }}
                                                tickMargin={8}
                                                minTickGap={8}
                                                axisLine={false}
                                                tickLine={false}
                                            />

                                            <YAxis
                                                allowDecimals={false}
                                                tick={{
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    fill: "var(--color-muted)"
                                                }}
                                                axisLine={false}
                                                tickLine={false}
                                            />

                                            <Tooltip
                                                cursor={{
                                                    fill: "rgba(66, 131, 106, 0.12)"
                                                }}
                                                contentStyle={{
                                                    backgroundColor: "var(--color-panel)",
                                                    border: "1px solid var(--color-line)",
                                                    borderRadius: "12px",
                                                    color: "var(--color-ink)",
                                                }}
                                                labelStyle={{
                                                    color: "var(--color-ink)",
                                                    fontWeight: 600,
                                                }}
                                                itemStyle={{
                                                    color: "var(--color-muted)",
                                                    fontWeight: 500,
                                                }}
                                            />

                                            <Bar
                                                dataKey="count"
                                                name="Batches"
                                                fill="#42836a"
                                                radius={[
                                                    8,
                                                    8,
                                                    0,
                                                    0
                                                ]}
                                                maxBarSize={56}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <p className="mt-3 text-[13px] leading-5 text-muted">
                                    Status indicators can overlap when a batch is both expired and past its return deadline.
                                </p>
                            </section>

                            {/* =================================
                                Urgent Attention
                            ================================== */}
                            <section className="mt-6 overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm">

                                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">
                                                !
                                            </span>

                                            <h2 className="text-xl font-semibold text-slate-900">
                                                Urgent Attention
                                            </h2>
                                        </div>

                                        <p className="mt-1 text-sm text-muted">
                                            Batches that may require immediate action
                                        </p>
                                    </div>

                                    <Link
                                        to="/inventory"
                                        className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                                    >
                                        View all inventory
                                    </Link>
                                </div>

                                {urgentAttention.length ===
                                0 ? (
                                    <div className="px-6 py-12 text-center">
                                        <div className="mx-auto grid size-12 place-items-center rounded-full bg-green-50 text-xl">
                                            OK
                                        </div>

                                        <p className="mt-3 font-semibold text-slate-800">
                                            No urgent batches
                                        </p>

                                        <p className="mt-1 text-sm text-muted">
                                            Your current inventory does not require immediate attention.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">

                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Medicine
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Batch
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Issue
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Value
                                                    </th>

                                                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-muted">
                                                        Action
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {urgentAttention.map(
                                                    (item) => {
                                                        const issueConfig =
                                                            getIssueConfig(
                                                                item.issue
                                                            );

                                                        return (
                                                            <tr
                                                                key={
                                                                    item._id
                                                                }
                                                                className="border-t border-slate-100 transition hover:bg-slate-50"
                                                            >
                                                                <td className="px-6 py-4">
                                                                    <div className="font-semibold text-slate-900">
                                                                        {item
                                                                            .medicine
                                                                            ?.name ||
                                                                            "Unknown Medicine"}
                                                                    </div>

                                                                    {item
                                                                        .medicine
                                                                        ?.genericName && (
                                                                        <div className="text-xs text-muted">
                                                                            {
                                                                                item
                                                                                    .medicine
                                                                                    .genericName
                                                                            }
                                                                        </div>
                                                                    )}
                                                                </td>

                                                                <td className="px-6 py-4 font-medium text-slate-700">
                                                                    {
                                                                        item.batchNumber
                                                                    }
                                                                </td>

                                                                <td className="px-6 py-4">
                                                                    <span
                                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${issueConfig.className}`}
                                                                    >
                                                                        <span>
                                                                            {
                                                                                issueConfig.icon
                                                                            }
                                                                        </span>

                                                                        {
                                                                            item.issue
                                                                        }
                                                                    </span>
                                                                </td>

                                                                <td className="px-6 py-4 font-semibold text-slate-900">
                                                                    ₹
                                                                    {formatCurrency(
                                                                        item.inventoryValue
                                                                    )}
                                                                </td>

                                                                <td className="px-6 py-4 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleInventoryClick(
                                                                                item._id
                                                                            )
                                                                        }
                                                                        className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-mint-300 hover:bg-mint-50 hover:text-mint-800"
                                                                    >
                                                                        View
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }
                                                )}
                                            </tbody>

                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* =================================
                                Upcoming Returns
                            ================================== */}
                            <section className="mt-6 overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm">

                                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

                                    <div>
                                        <h2 className="text-xl font-semibold text-slate-900">
                                            Upcoming Returns
                                        </h2>

                                        <p className="mt-1 text-sm text-muted">
                                            Nearest return deadlines first
                                        </p>
                                    </div>

                                    <Link
                                        to="/inventory"
                                        className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                                    >
                                        View inventory
                                    </Link>
                                </div>

                                {upcomingReturns.length ===
                                0 ? (
                                    <div className="px-6 py-12 text-center">
                                        <div className="mx-auto grid size-12 place-items-center rounded-full bg-mint-50 text-xl">
                                            Box
                                        </div>

                                        <p className="mt-3 font-semibold text-slate-800">
                                            No upcoming returns
                                        </p>

                                        <p className="mt-1 text-sm text-muted">
                                            There are currently no future return deadlines.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">

                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Medicine
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Supplier
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Deadline
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Value
                                                    </th>

                                                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-muted">
                                                        Action
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {upcomingReturns.map(
                                                    (item) => (
                                                        <tr
                                                            key={
                                                                item._id
                                                            }
                                                            className="border-t border-slate-100 transition hover:bg-slate-50"
                                                        >
                                                            <td className="px-6 py-4">
                                                                <div className="font-semibold text-slate-900">
                                                                    {item
                                                                        .medicine
                                                                        ?.name ||
                                                                        "Unknown Medicine"}
                                                                </div>

                                                                <div className="text-xs text-muted">
                                                                    Batch:{" "}
                                                                    {
                                                                        item.batchNumber
                                                                    }
                                                                </div>
                                                            </td>

                                                            <td className="px-6 py-4">
                                                                <div className="font-medium text-slate-800">
                                                                    {item
                                                                        .supplier
                                                                        ?.companyName ||
                                                                        "Unknown Supplier"}
                                                                </div>

                                                                {item
                                                                    .supplier
                                                                    ?.name && (
                                                                    <div className="text-xs text-muted">
                                                                        {
                                                                            item
                                                                                .supplier
                                                                                .name
                                                                        }
                                                                    </div>
                                                                )}
                                                            </td>

                                                            <td className="px-6 py-4">
                                                                <div className="font-semibold text-slate-900">
                                                                    {formatDate(
                                                                        item.returnDeadline
                                                                    )}
                                                                </div>

                                                                {typeof item.daysUntilReturnDeadline ===
                                                                    "number" && (
                                                                    <div className="mt-1 text-xs text-muted">
                                                                        {
                                                                            item.daysUntilReturnDeadline
                                                                        }{" "}
                                                                        days left
                                                                    </div>
                                                                )}
                                                            </td>

                                                            <td className="px-6 py-4 font-semibold text-slate-900">
                                                                ₹
                                                                {formatCurrency(
                                                                    item.inventoryValue
                                                                )}
                                                            </td>

                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleInventoryClick(
                                                                            item._id
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-mint-300 hover:bg-mint-50 hover:text-mint-800"
                                                                >
                                                                    View
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                )}
                                            </tbody>

                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* =================================
                                Recently Added Inventory
                            ================================== */}
                            <section className="mt-6 overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm">

                                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

                                    <div>
                                        <h2 className="text-xl font-semibold text-slate-900">
                                            Recently Added Inventory
                                        </h2>

                                        <p className="mt-1 text-sm text-muted">
                                            Latest batches added to your inventory
                                        </p>
                                    </div>

                                    <Link
                                        to="/inventory"
                                        className="text-sm font-semibold text-mint-700 hover:text-mint-800"
                                    >
                                        View all inventory
                                    </Link>
                                </div>

                                {recentInventory.length ===
                                0 ? (
                                    <div className="px-6 py-12 text-center">
                                        <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-50 text-xl">
                                            Box
                                        </div>

                                        <p className="mt-3 font-semibold text-slate-800">
                                            No inventory added yet
                                        </p>

                                        <p className="mt-1 text-sm text-muted">
                                            Add your first batch to see it here.
                                        </p>

                                        <Link
                                            to="/inventory"
                                            className="mt-4 inline-flex rounded-lg bg-mint-700 px-4 py-2 text-sm font-semibold text-white hover:bg-mint-800"
                                        >
                                            Add Inventory
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">

                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Medicine
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Batch
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Quantity
                                                    </th>

                                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted">
                                                        Added
                                                    </th>

                                                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-muted">
                                                        Action
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {recentInventory.map(
                                                    (item) => (
                                                        <tr
                                                            key={
                                                                item._id
                                                            }
                                                            className="border-t border-slate-100 transition hover:bg-slate-50"
                                                        >
                                                            <td className="px-6 py-4">
                                                                <div className="font-semibold text-slate-900">
                                                                    {item
                                                                        .medicine
                                                                        ?.name ||
                                                                        "Unknown Medicine"}
                                                                </div>

                                                                {item
                                                                    .medicine
                                                                    ?.genericName && (
                                                                    <div className="text-xs text-muted">
                                                                        {
                                                                            item
                                                                                .medicine
                                                                                .genericName
                                                                        }
                                                                    </div>
                                                                )}
                                                            </td>

                                                            <td className="px-6 py-4 font-medium text-slate-700">
                                                                {
                                                                    item.batchNumber
                                                                }
                                                            </td>

                                                            <td className="px-6 py-4 font-medium text-slate-700">
                                                                {
                                                                    item.quantity
                                                                }
                                                            </td>

                                                            <td className="px-6 py-4 text-slate-600">
                                                                {formatRecentDate(
                                                                    item.createdAt
                                                                )}
                                                            </td>

                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleInventoryClick(
                                                                            item._id
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-mint-300 hover:bg-mint-50 hover:text-mint-800"
                                                                >
                                                                    View
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                )}
                                            </tbody>

                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* =================================
                                Footer Note
                            ================================== */}
                            <div className="mt-6 rounded-2xl border border-line bg-panel px-5 py-4 text-sm text-muted">
                                Dashboard data is calculated from your current inventory and automatically updates as batches change.
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}

export default Dashboard;
