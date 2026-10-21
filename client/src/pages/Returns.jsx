import { useCallback, useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";

import api from "../lib/api";

import ReturnForm from "../components/returns/ReturnForm";
import ResponsiveTableHint from "../components/ResponsiveTableHint.jsx";

const STATUS_OPTIONS = ["PENDING", "APPROVED", "REJECTED", "RETURNED"];

// Allowed status transitions.

// The backend must enforce these rules too.

const NEXT_STATUSES = {

  PENDING: ["APPROVED", "REJECTED"],

  APPROVED: ["RETURNED"],

  REJECTED: [],

  RETURNED: [],

};

const STATUS_CONFIG = {

  PENDING: "bg-amber-50 text-amber-700 border-amber-200",

  APPROVED: "bg-sky-50 text-sky-700 border-sky-200",

  REJECTED: "bg-red-50 text-red-700 border-red-200",

  RETURNED: "bg-green-50 text-green-700 border-green-200",

};

const formatCurrency = (value) =>

  Number(value || 0).toLocaleString("en-IN", {

    minimumFractionDigits: 2,

    maximumFractionDigits: 2,

  });

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

function getReturnsFromResponse(data) {

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.returns)) return data.returns;

  return [];

}

function getInventoriesFromResponse(data) {

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.inventories)) return data.inventories;

  return [];

}

export default function Returns() {

  const [returns, setReturns] = useState([]);

  const [eligibleInventories, setEligibleInventories] = useState([]);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);

  const [loadingInventory, setLoadingInventory] = useState(false);

  const [loading, setLoading] = useState(true);

  const [updatingId, setUpdatingId] = useState("");

  const [pageError, setPageError] = useState("");

  const [formError, setFormError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  // GET /api/returns

  const fetchReturns = useCallback(async (showLoader = true) => {

    try {

      if (showLoader) setLoading(true);

      setPageError("");

      const response = await api.get("/returns");

      setReturns(getReturnsFromResponse(response.data));

    } catch (error) {

      console.error("Fetch returns error:", error);

      setPageError(

        error.response?.data?.message ||

          "Unable to load return requests."

      );

    } finally {

      if (showLoader) setLoading(false);

    }

  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchReturns();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [fetchReturns]);

  // GET /api/inventory

  // Only inventory batches eligible for supplier return are displayed.

  const fetchEligibleInventory = async () => {

    try {

      setLoadingInventory(true);

      setFormError("");

      const response = await api.get("/inventory");

      const inventoryList = getInventoriesFromResponse(response.data);

      setEligibleInventories(

        inventoryList.filter(

          (item) =>

            item.returnStatus === "RETURN_DUE" ||

            item.returnStatus === "RETURN_OVERDUE"

        )

      );

    } catch (error) {

      console.error("Fetch eligible inventory error:", error);

      setFormError(

        error.response?.data?.message ||

          "Unable to load eligible inventory."

      );

    } finally {

      setLoadingInventory(false);

    }

  };

  const handleNewReturn = async () => {

    setShowForm(true);

    setFormError("");

    setPageError("");

    setSuccessMessage("");

    await fetchEligibleInventory();

  };

  // Called by ReturnForm after POST /api/returns succeeds.

  const handleReturnCreated = async () => {

    setShowForm(false);

    setSuccessMessage(

      "Return request created successfully. Status: PENDING."

    );

    await Promise.all([

      fetchReturns(false),

      fetchEligibleInventory(),

    ]);

  };

  // PATCH /api/returns/:id/status

  const handleStatusChange = async (returnId, newStatus) => {

    setPageError("");

    setSuccessMessage("");

    try {

      setUpdatingId(returnId);

      await api.patch(`/returns/${returnId}/status`, {

        status: newStatus,

      });

      // Refresh the list after updating the status.

      await fetchReturns(false);

      if (newStatus === "RETURNED") {

        await fetchEligibleInventory();

      }

      setSuccessMessage(

        newStatus === "RETURNED"

          ? "Return completed and inventory refreshed successfully."

          : `Return status updated to ${newStatus}.`

      );

    } catch (error) {

      console.error("Update return status error:", error);

      setPageError(

        error.response?.data?.message ||

          "Unable to update return status."

      );

    } finally {

      setUpdatingId("");

    }

  };

  // Search and status filtering.

  const filteredReturns = useMemo(() => {

    const searchText = search.trim().toLowerCase();

    return returns.filter((item) => {

      const values = [

        item.medicine?.name,

        item.medicine?.genericName,

        item.batchNumber,

        item.supplier?.companyName,

        item.supplier?.name,

        item.reason,

      ];

      const matchesSearch = values.some((value) =>

        String(value || "").toLowerCase().includes(searchText)

      );

      const matchesStatus =

        statusFilter === "ALL" || item.status === statusFilter;

      return matchesSearch && matchesStatus;

    });

  }, [returns, search, statusFilter]);

  const totalReturnValue = returns.reduce(

    (total, item) => total + Number(item.returnValue || 0),

    0

  );

  const pendingCount = returns.filter(

    (item) => item.status === "PENDING"

  ).length;

  return (

    <div className="min-h-screen bg-canvas text-slate-800">

      {/* Header */}

      <header className="border-b border-line bg-navbar text-navbar-ink shadow-sm">

        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">

          <div>

            <h1 className="text-2xl font-semibold text-navbar-ink">

              Returns

            </h1>

            <p className="mt-1 text-sm text-navbar-ink">

              Manage medicine return requests and their status workflow.

            </p>

          </div>

          <div className="flex flex-wrap gap-3">

            <Link

              to="/dashboard"

              className="inline-flex items-center rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"

            >

              Dashboard

            </Link>

            <button

              type="button"

              onClick={handleNewReturn}

              className="rounded-xl bg-mint-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-800"

            >

              + New Return

            </button>

          </div>

        </div>

      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Error message */}

        {pageError && (

          <div

            role="alert"

            className="mb-5 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"

          >

            <span>⚠️ {pageError}</span>

            <button

              type="button"

              onClick={() => fetchReturns()}

              className="w-fit font-semibold underline underline-offset-2"

            >

              Retry

            </button>

          </div>

        )}

        {/* Success message */}

        {successMessage && (

          <div

            role="status"

            className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800"

          >

            {successMessage}

          </div>

        )}

        {/* Summary cards */}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">

          <article className="rounded-2xl border border-line bg-panel p-5 shadow-sm">

            <p className="text-sm font-medium text-muted">

              Total Return Requests

            </p>

            <p className="mt-2 text-3xl font-semibold text-slate-900">

              {loading ? "—" : returns.length}

            </p>

          </article>

          <article className="rounded-2xl border border-line bg-panel p-5 shadow-sm">

            <p className="text-sm font-medium text-muted">

              Pending Requests

            </p>

            <p className="mt-2 text-3xl font-semibold text-amber-600">

              {loading ? "—" : pendingCount}

            </p>

          </article>

          <article className="rounded-2xl border border-line bg-panel p-5 shadow-sm">

            <p className="text-sm font-medium text-muted">

              Total Requested Value

            </p>

            <p className="mt-2 text-3xl font-semibold text-slate-900">

              {loading

                ? "—"

                : `₹${formatCurrency(totalReturnValue)}`}

            </p>

          </article>

        </section>

        {/* Create return form */}

        {showForm && (

          <section className="mb-8 rounded-3xl border border-line bg-panel p-5 shadow-sm sm:p-8">

            <div className="mb-5 flex items-start justify-between gap-4">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">

                  Create Return Request

                </h2>

                <p className="mt-1 text-sm leading-6 text-muted">

                  Select a batch whose supplier-return deadline is due or

                  overdue.

                </p>

              </div>

              <button

                type="button"

                onClick={() => {

                  setShowForm(false);

                  setFormError("");

                }}

                className="text-sm font-semibold text-muted hover:text-slate-900"

              >

                Cancel

              </button>

            </div>

            {formError && (

              <div

                role="alert"

                className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"

              >

                {formError}

                <button

                  type="button"

                  onClick={fetchEligibleInventory}

                  className="ml-3 font-semibold underline"

                >

                  Reload inventory

                </button>

              </div>

            )}

            {loadingInventory ? (

              <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted">

                Loading eligible inventory...

              </div>

            ) : (

              <ReturnForm

                inventoryItems={eligibleInventories}

                onCreated={handleReturnCreated}

              />

            )}

          </section>

        )}

        {/* Search and status filter */}

        <section className="mb-6 rounded-2xl border border-line bg-panel p-4 shadow-sm">

          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">

            <input

              type="search"

              value={search}

              onChange={(event) => setSearch(event.target.value)}

              placeholder="Search medicine, batch, supplier, reason..."

              aria-label="Search return requests"

              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-mint-600"

            />

            <select

              value={statusFilter}

              onChange={(event) => setStatusFilter(event.target.value)}

              aria-label="Filter return requests by status"

              className="w-full min-w-0 rounded-xl border border-slate-300 bg-panel px-3 py-3 text-sm outline-none focus:border-mint-600"

            >

              <option value="ALL">Status: All</option>

              {STATUS_OPTIONS.map((status) => (

                <option key={status} value={status}>

                  {status}

                </option>

              ))}

            </select>

          </div>

        </section>

        {/* Return requests table */}

        <section className="overflow-hidden rounded-3xl border border-line bg-panel shadow-sm">

          <div className="border-b border-slate-100 px-6 py-5">

            <h2 className="font-semibold text-slate-900">

              Return Requests

            </h2>

            <p className="mt-1 text-sm text-muted">

              {loading

                ? "Loading requests..."

                : `${filteredReturns.length} request(s)`}

            </p>

          </div>

          {loading ? (

            <div className="space-y-4 p-6">

              <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />

              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />

              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />

              <div className="h-12 animate-pulse rounded-xl bg-slate-100" />

            </div>

          ) : pageError && returns.length === 0 ? (

            <div className="p-10 text-center">

              <p className="font-semibold text-slate-800">

                Unable to load returns

              </p>

              <button

                type="button"

                onClick={() => fetchReturns()}

                className="mt-4 rounded-xl bg-mint-700 px-4 py-2 text-sm font-semibold text-white hover:bg-mint-800"

              >

                Retry

              </button>

            </div>

          ) : filteredReturns.length === 0 ? (

            <div className="px-6 py-12 text-center">

              <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-50 text-xl">

                ↩

              </div>

              <h3 className="mt-4 font-semibold text-slate-800">

                {returns.length === 0

                  ? "No return requests yet"

                  : "No matching return requests"}

              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">

                {returns.length === 0

                  ? "Create a return request when an eligible inventory batch becomes due or overdue."

                  : "Try changing your search term or status filter."}

              </p>

              {returns.length === 0 && (

                <button

                  type="button"

                  onClick={handleNewReturn}

                  className="mt-5 rounded-xl bg-mint-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-800"

                >

                  + New Return

                </button>

              )}

            </div>

          ) : (

            <>
            <ResponsiveTableHint />
            <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" role="region" tabIndex={0} aria-label="Return requests, horizontally scrollable table">

              <table className="w-full min-w-[1100px]">

                <thead className="bg-slate-50">

                  <tr>

                    {[

                      "Medicine",

                      "Batch",

                      "Supplier",

                      "Quantity",

                      "Return Value",

                      "Status",

                      "Created",

                      "Update Status",

                    ].map((heading) => (

                      <th

                        key={heading}

                        className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-muted"

                      >

                        {heading}

                      </th>

                    ))}

                  </tr>

                </thead>

                <tbody>

                  {filteredReturns.map((item) => {

                    const statusClass =

                      STATUS_CONFIG[item.status] ||

                      "bg-slate-50 text-slate-600 border-line";

                    const nextStatuses =

                      NEXT_STATUSES[item.status] || [];

                    const isUpdating = updatingId === item._id;

                    return (

                      <tr

                        key={item._id}

                        className="border-t border-slate-100 hover:bg-slate-50/70"

                      >

                        {/* Clickable medicine name */}

                        <td className="px-5 py-4">

                          <Link
                            to={`/returns/${item._id}`}
                            aria-label={`View return details for ${item.medicine?.name || "this return request"}`}
                            className="font-semibold text-mint-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-600 focus-visible:ring-offset-2"
                          >

                            {item.medicine?.name || "Unknown Medicine"}

                          </Link>

                          {item.medicine?.genericName && (

                            <p className="mt-1 text-xs text-muted">

                              {item.medicine.genericName}

                            </p>

                          )}

                          <p className="mt-1 max-w-48 truncate text-xs text-slate-400">

                            {item.reason}

                          </p>

                        </td>

                        <td className="px-5 py-4 font-medium text-slate-700">

                          {item.batchNumber || "—"}

                        </td>

                        <td className="px-5 py-4 text-sm text-slate-700">

                          {item.supplier?.companyName ||

                            item.supplier?.name ||

                            "Unknown Supplier"}

                        </td>

                        <td className="px-5 py-4 text-sm text-slate-700">

                          {item.quantity}

                        </td>

                        <td className="px-5 py-4 font-semibold text-slate-900">

                          ₹{formatCurrency(item.returnValue)}

                        </td>

                        <td className="px-5 py-4">

                          <span

                            className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass}`}

                          >

                            {item.status}

                          </span>

                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">

                          {formatDate(item.createdAt)}

                        </td>

                        <td className="px-5 py-4">

                          <select

                            aria-label={`Update status for batch ${

                              item.batchNumber || "unknown"

                            }`}

                            value=""

                            disabled={

                              isUpdating || nextStatuses.length === 0

                            }

                            onChange={(event) => {

                              const selectedStatus = event.target.value;

                              if (selectedStatus) {

                                handleStatusChange(

                                  item._id,

                                  selectedStatus

                                );

                              }

                            }}

                            className="rounded-lg border border-line bg-panel px-2 py-2 text-xs font-medium text-slate-700 outline-none focus:border-mint-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"

                          >

                            <option value="" disabled>

                              {nextStatuses.length

                                ? "Choose action"

                                : "No further actions"}

                            </option>

                            {nextStatuses.map((status) => (

                              <option key={status} value={status}>

                                {status}

                              </option>

                            ))}

                          </select>

                          {isUpdating && (

                            <p className="mt-1 text-xs text-slate-400">

                              Updating...

                            </p>

                          )}

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

              </table>

            </div>

            </>
          )}

        </section>

        {/* Navigation links */}

        <div className="mt-6 flex flex-wrap gap-5 text-sm font-semibold">

          <Link

            to="/inventory"

            className="text-mint-700 hover:text-mint-800"

          >

            ← Inventory

          </Link>

          <Link

            to="/suppliers"

            className="text-mint-700 hover:text-mint-800"

          >

            Suppliers

          </Link>

        </div>

      </main>

    </div>

  );

}
