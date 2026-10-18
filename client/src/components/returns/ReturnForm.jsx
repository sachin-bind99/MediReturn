import { useState } from "react";
import api from "../../lib/api";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getMedicineName(inventory) {
  return inventory?.medicine?.name || inventory?.medicine?.genericName || "Unknown medicine";
}

function getSupplierName(inventory) {
  return inventory?.supplier?.companyName || inventory?.supplier?.name || "Unknown supplier";
}

function getReturnDeadline(inventory) {
  if (!inventory?.expiryDate) return "Not available";

  const deadline = new Date(inventory.expiryDate);
  if (Number.isNaN(deadline.getTime())) return "Not available";

  const returnWindowDays = Number(inventory.returnWindowDays) || 0;
  deadline.setUTCDate(deadline.getUTCDate() - returnWindowDays);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(deadline);
}

export default function ReturnForm({ inventoryItems = [], onCreated }) {
  const [inventoryId, setInventoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedInventory = inventoryItems.find((item) => item._id === inventoryId);
  const availableQuantity = Number(selectedInventory?.quantity) || 0;
  const purchasePrice = Number(selectedInventory?.purchasePrice) || 0;
  const requestedQuantity = Number(quantity) || 0;
  const estimatedReturnValue = requestedQuantity > 0 ? requestedQuantity * purchasePrice : 0;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!selectedInventory) {
      setError("Please select an inventory batch.");
      return;
    }

    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      setError("Return quantity must be a positive whole number.");
      return;
    }

    if (requestedQuantity > availableQuantity) {
      setError(`Return quantity cannot exceed ${availableQuantity}.`);
      return;
    }

    if (!reason.trim()) {
      setError("Please provide a reason for the return.");
      return;
    }

    try {
      setSubmitting(true);

      // The server must calculate returnValue from the saved inventory price.
      await api.post("/returns", {
        inventory: selectedInventory._id,
        quantity: requestedQuantity,
        reason: reason.trim(),
      });

      setInventoryId("");
      setQuantity("");
      setReason("");

      if (onCreated) await onCreated();
    } catch (requestError) {
      console.error("Create return error:", requestError);
      setError(requestError.response?.data?.message || "Unable to create the return request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {inventoryItems.length === 0 ? (
        <div className="rounded-2xl border border-line bg-slate-50 p-6">
          <h3 className="font-semibold text-slate-800">No eligible inventory batches</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            A return can be requested when a batch has a RETURN_DUE or RETURN_OVERDUE status.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="return-inventory" className="mb-2 block text-sm font-medium text-slate-700">
              Inventory Batch
            </label>
            <select
              id="return-inventory"
              value={inventoryId}
              onChange={(event) => {
                setInventoryId(event.target.value);
                setQuantity("");
                setError("");
              }}
              required
              className="w-full rounded-xl border border-slate-300 bg-panel px-3 py-3 text-sm outline-none focus:border-mint-600 focus:ring-2 focus:ring-mint-100"
            >
              <option value="">Select a batch</option>
              {inventoryItems.map((item) => (
                <option key={item._id} value={item._id}>
                  {getMedicineName(item)} — {item.batchNumber || "No batch"} — {getSupplierName(item)}
                </option>
              ))}
            </select>
          </div>

          {selectedInventory && (
            <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Medicine</p>
                <p className="mt-1 font-semibold text-slate-800">{getMedicineName(selectedInventory)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Batch</p>
                <p className="mt-1 font-semibold text-slate-800">{selectedInventory.batchNumber || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Supplier</p>
                <p className="mt-1 font-semibold text-slate-800">{getSupplierName(selectedInventory)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Available Quantity</p>
                <p className="mt-1 font-semibold text-slate-800">{availableQuantity}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Purchase Price per Unit</p>
                <p className="mt-1 font-semibold text-slate-800">{formatCurrency(purchasePrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Return Deadline</p>
                <p className="mt-1 font-semibold text-slate-800">{getReturnDeadline(selectedInventory)}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="return-quantity" className="mb-2 block text-sm font-medium text-slate-700">
              Return Quantity
            </label>
            <input
              id="return-quantity"
              type="number"
              min="1"
              max={availableQuantity || undefined}
              step="1"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setError("");
              }}
              disabled={!selectedInventory}
              required
              placeholder="Enter quantity to return"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-mint-600 focus:ring-2 focus:ring-mint-100 disabled:bg-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">Must not exceed available inventory.</p>
          </div>

          <div>
            <label htmlFor="return-reason" className="mb-2 block text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="return-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError("");
              }}
              rows={3}
              maxLength={500}
              required
              placeholder="For example, near expiry"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-mint-600 focus:ring-2 focus:ring-mint-100"
            />
          </div>

          {selectedInventory && requestedQuantity > 0 && (
            <div className="rounded-xl border border-mint-100 bg-mint-50 px-4 py-3">
              <p className="text-sm text-mint-800">Estimated Return Value</p>
              <p className="mt-1 text-xl font-semibold text-mint-800">{formatCurrency(estimatedReturnValue)}</p>
              <p className="mt-1 text-xs text-mint-700">
                {requestedQuantity} units × {formatCurrency(purchasePrice)}. The backend recalculates the authoritative value.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedInventory}
            className="rounded-xl bg-mint-700 px-5 py-3 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating Request..." : "Create Return"}
          </button>
        </>
      )}
    </form>
  );
}
