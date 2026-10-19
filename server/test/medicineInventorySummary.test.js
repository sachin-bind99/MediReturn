import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicineInventorySummaries } from "../utils/medicineInventorySummary.js";

const now = new Date("2026-10-20T12:00:00.000Z");

test("summarizes the newest batch and earliest valid non-expired batch expiry", () => {
    const medicines = [{ _id: "medicine-1" }];
    const summaries = buildMedicineInventorySummaries(medicines, [
        {
            _id: "batch-newest",
            medicine: "medicine-1",
            batchNumber: "B-NEW",
            purchasePrice: 25.5,
            expiryDate: new Date("2028-03-01T00:00:00.000Z"),
            createdAt: "2026-10-19T10:00:00.000Z",
        },
        {
            _id: "batch-nearest",
            medicine: "medicine-1",
            batchNumber: "B-NEAR",
            purchasePrice: 18,
            expiryDate: new Date("2026-10-20T00:00:00.000Z"),
            createdAt: "2026-10-18T10:00:00.000Z",
        },
        {
            _id: "batch-expired",
            medicine: "medicine-1",
            batchNumber: "B-OLD",
            purchasePrice: 10,
            expiryDate: new Date("2026-10-19T00:00:00.000Z"),
            createdAt: "2026-10-17T10:00:00.000Z",
        },
        {
            _id: "batch-invalid-date",
            medicine: "medicine-1",
            batchNumber: "B-INVALID",
            purchasePrice: 5,
            expiryDate: "2026-02-30",
            createdAt: "2026-10-16T10:00:00.000Z",
        },
    ], now);

    assert.deepEqual(summaries.get("medicine-1"), {
        latestPurchasePrice: 25.5,
        latestBatchNumber: "B-NEW",
        nextExpiryDate: "2026-10-20",
        inventoryBatchCount: 4,
    });
});

test("returns an empty inventory summary and ignores records outside the catalog scope", () => {
    const summaries = buildMedicineInventorySummaries(
        [{ _id: "medicine-without-batches" }],
        [{
            medicine: "another-medicine",
            batchNumber: "OTHER",
            purchasePrice: 999,
            expiryDate: "2028-01-01",
        }],
        now
    );

    assert.deepEqual(summaries.get("medicine-without-batches"), {
        latestPurchasePrice: null,
        latestBatchNumber: null,
        nextExpiryDate: null,
        inventoryBatchCount: 0,
    });
});

test("uses the newest record deterministically when created timestamps tie", () => {
    const summaries = buildMedicineInventorySummaries(
        [{ _id: "medicine-1" }],
        [
            { _id: "batch-a", medicine: "medicine-1", batchNumber: "A", purchasePrice: 1, createdAt: now },
            { _id: "batch-z", medicine: "medicine-1", batchNumber: "Z", purchasePrice: 2, createdAt: now },
        ],
        now
    );

    assert.equal(summaries.get("medicine-1").latestBatchNumber, "Z");
    assert.equal(summaries.get("medicine-1").latestPurchasePrice, 2);
});
