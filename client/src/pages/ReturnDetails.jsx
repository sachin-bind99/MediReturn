import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";

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

export default function ReturnDetails() {
  const { id } = useParams();

  const [returnItem, setReturnItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchReturn() {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(`/returns/${id}`);

        if (active) {
          setReturnItem(response.data?.return ?? response.data);
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load return details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchReturn();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <div className="p-8">Loading return details...</div>;
  }

  if (error || !returnItem) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-red-600">
          {error || "Return not found."}
        </p>
        <Link
          to="/returns"
          className="mt-4 inline-block text-mint-700 underline"
        >
          Back to Returns
        </Link>
      </main>
    );
  }

  const status = returnItem.status;
  const isRejected = status === "REJECTED";
  const isApproved =
    status === "APPROVED" || status === "RETURNED";
  const isReturned = status === "RETURNED";

  // MVP display ID. This is derived from the MongoDB ID,
  // not a sequential number such as RT001.
  const displayId =
    returnItem.returnNumber ||
    `RT-${String(returnItem._id).slice(-6).toUpperCase()}`;

  const details = [
    {
      label: "Medicine",
      value: returnItem.medicine?.name || "Unknown medicine",
    },
    {
      label: "Batch",
      value: returnItem.batchNumber || "—",
    },
    {
      label: "Supplier",
      value:
        returnItem.supplier?.companyName ||
        returnItem.supplier?.name ||
        "Unknown supplier",
    },
    {
      label: isReturned ? "Quantity Returned" : "Return Quantity",
      value: returnItem.quantity,
    },
    {
      label: "Return Value",
      value: `₹${formatCurrency(returnItem.returnValue)}`,
    },
    {
      label: "Reason",
      value: returnItem.reason || "—",
    },
    {
      label: "Status",
      value: status,
    },
    {
      label: "Created",
      value: formatDate(returnItem.createdAt),
    },
  ];

  const workflow = isRejected
    ? [
        { label: "Return Created", complete: true },
        { label: "Rejected", complete: true },
      ]
    : [
        { label: "Return Created", complete: true },
        { label: "Approved", complete: isApproved },
        { label: "Returned", complete: isReturned },
      ];

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/returns"
          className="text-sm font-semibold text-mint-700 hover:underline"
        >
          ← Back to Returns
        </Link>

        <header className="mt-5 rounded-2xl border bg-panel p-6">
          <p className="text-sm text-muted">Return Details</p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Return #{displayId}
          </h1>

          <p className="mt-2 text-sm text-muted">
            Created {formatDate(returnItem.createdAt)}
          </p>
        </header>

        <section className="mt-6 rounded-2xl border bg-panel p-6">
          <h2 className="text-lg font-semibold">
            Return Information
          </h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label}>
                <p className="text-sm text-muted">
                  {detail.label}
                </p>
                <p className="mt-1 font-medium text-slate-900">
                  {detail.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-panel p-6">
          <h2 className="text-lg font-semibold">
            Return Workflow
          </h2>

          <div className="mt-5 space-y-4">
            {workflow.map((step, index) => (
              <div
                key={step.label}
                className="flex items-center gap-3"
              >
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    step.complete
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.complete ? "✓" : "○"}
                </span>

                <span
                  className={
                    step.complete
                      ? "font-semibold text-slate-900"
                      : "text-muted"
                  }
                >
                  {step.label}
                </span>

                {index < workflow.length - 1 && (
                  <span className="sr-only">
                    Next workflow step
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}