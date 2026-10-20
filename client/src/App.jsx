
import { Fragment, lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";

import {
    BrowserRouter,
    Link,
    Navigate,
    Route,
    Routes,
} from "react-router-dom";

import api from "./lib/api";
import MobileAppNavigation from "./components/MobileAppNavigation.jsx";
import {
    clearAuthToken,
    getAuthToken,
    subscribeToAuthToken
} from "./lib/authSession";

// Route-level splitting keeps OCR and chart dependencies out of the first load.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Medicines = lazy(() => import("./pages/Medicines"));
const Inventory = lazy(() => import("./pages/Inventory"));
const InventoryDetails = lazy(() => import("./pages/InventoryDetails"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const SupplierDetails = lazy(() => import("./pages/SupplierDetails"));
const Returns = lazy(() => import("./pages/Returns"));
const ReturnDetails = lazy(() => import("./pages/ReturnDetails"));
const Alerts = lazy(() => import("./pages/Alerts"));
const MedicineScanner = lazy(() => import("./pages/MedicineScanner"));

function PageLoading() {
    return (
        <main
            className="grid min-h-screen place-items-center bg-canvas px-5"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
                <span className="size-5 animate-spin rounded-full border-2 border-mint-100 border-t-mint-700" aria-hidden="true" />
                Loading MediReturn...
            </div>
        </main>
    );
}

// ========================================
// Protected Route
// ========================================
function ProtectedRoute({ render }) {
    const token = useSyncExternalStore(
        subscribeToAuthToken,
        getAuthToken,
        () => null
    );

    const [verification, setVerification] = useState({
        token: null,
        status: "unauthenticated",
        user: null
    });

    useEffect(() => {
        if (!token) {
            return undefined;
        }

        const controller = new AbortController();

        api.get("/auth/me", {
            signal: controller.signal,
        })
            .then(({ data }) => {
                if (getAuthToken() === token) {
                    setVerification({
                        token,
                        status: "authenticated",
                        user: data.user
                    });
                }
            })
            .catch((error) => {
                if (controller.signal.aborted || getAuthToken() !== token) {
                    return;
                }

                if (
                    error.response?.status === 401 ||
                    error.response?.status === 404
                ) {
                    clearAuthToken();
                    return;
                }

                setVerification({
                    token,
                    status: "unavailable",
                    user: null
                });
            });

        return () => controller.abort();
    }, [token]);

    const status = verification.token === token
        ? verification.status
        : token
            ? "checking"
            : "unauthenticated";
    const user = verification.token === token ? verification.user : null;

    // Checking session
    if (status === "checking") {
        return (
            <main className="grid min-h-screen place-items-center bg-canvas px-6">
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
                    <span className="size-5 animate-spin rounded-full border-2 border-mint-100 border-t-mint-700" />
                    Checking your session...
                </div>
            </main>
        );
    }

    // Server unavailable
    if (status === "unavailable") {
        return (
            <main className="grid min-h-screen place-items-center bg-canvas px-6">
                <div className="max-w-md rounded-3xl border border-line bg-panel p-7 text-center shadow-sm sm:p-9">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                        <svg
                            viewBox="0 0 20 20"
                            className="size-5"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M10 6v4m0 3h.01M8.3 3.8 2.7 14a1.5 1.5 0 0 0 1.3 2.2h12a1.5 1.5 0 0 0 1.3-2.2L11.7 3.8a2 2 0 0 0-3.4 0Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>

                    <h1 className="mt-4 text-lg font-semibold text-slate-900">
                        We couldn't verify your session
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-muted">
                        Check the server connection and{" "}
                        <Link
                            className="font-semibold text-mint-700 hover:text-mint-800"
                            to="/login"
                        >
                            try again
                        </Link>
                        .
                    </p>
                </div>
            </main>
        );
    }

    // Not authenticated
    if (status !== "authenticated") {
        return <Navigate to="/login" replace />;
    }

    return (
        <Fragment key={token}>
            <MobileAppNavigation />
            {render(user)}
        </Fragment>
    );
}

function HomeRoute() {
    const token = useSyncExternalStore(
        subscribeToAuthToken,
        getAuthToken,
        () => null
    );

    return token
        ? <Navigate to="/dashboard" replace />
        : <Landing />;
}

// ========================================
// Main App
// ========================================
function App() {
    return (
        <BrowserRouter>
            <Suspense fallback={<PageLoading />}>
            <Routes>
                {/* =================================
                    Public Routes
                ================================== */}

                <Route
                    path="/"
                    element={<HomeRoute />}
                />

                <Route
                    path="/login"
                    element={<Login />}
                />

                <Route
                    path="/register"
                    element={<Register />}
                />

                {/* Password Recovery */}
                <Route
                    path="/forgot-password"
                    element={<ForgotPassword />}
                />

                <Route
                    path="/reset-password"
                    element={<ResetPassword />}
                />

                {/* =================================
                    Protected Routes
                ================================== */}

                {/* Dashboard */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute
                            render={(user) => (
                                <Dashboard user={user} />
                            )}
                        />
                    }
                />

                {/* Medicines */}
                <Route
                    path="/medicines"
                    element={
                        <ProtectedRoute
                            render={() => <Medicines />}
                        />
                    }
                />

                {/* Medicine Scanner */}
                <Route
                    path="/medicine-scanner"
                    element={
                        <ProtectedRoute
                            render={() => <MedicineScanner />}
                        />
                    }
                />

                {/* Inventory List */}
                <Route
                    path="/inventory"
                    element={
                        <ProtectedRoute
                            render={() => <Inventory />}
                        />
                    }
                />

                {/* Inventory Details */}
                <Route
                    path="/inventory/:id"
                    element={
                        <ProtectedRoute
                            render={(user) => (
                                <InventoryDetails user={user} />
                            )}
                        />
                    }
                />

                {/* Suppliers */}
                <Route
                    path="/suppliers"
                    element={
                        <ProtectedRoute
                            render={() => <Suppliers />}
                        />
                    }
                />

                {/* Supplier Details */}
                <Route
                    path="/suppliers/:id"
                    element={
                        <ProtectedRoute
                            render={(user) => (
                                <SupplierDetails user={user} />
                            )}
                        />
                    }
                />

                {/* Returns */}
                <Route
                    path="/returns"
                    element={
                        <ProtectedRoute
                            render={() => <Returns />}
                        />
                    }
                />

                {/* Return Details */}
                <Route
                    path="/returns/:id"
                    element={
                        <ProtectedRoute
                            render={() => <ReturnDetails />}
                        />
                    }
                />

                {/* Alerts */}
                <Route
                    path="/alerts"
                    element={
                        <ProtectedRoute
                            render={() => <Alerts />}
                        />
                    }
                />

                {/* =================================
                    Fallback
                ================================== */}

                <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                />
            </Routes>
            </Suspense>
        </BrowserRouter>
    );
}

export default App;
