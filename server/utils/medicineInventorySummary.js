import {
    EXPIRY_STATUS,
    getDaysUntilExpiry,
    getExpiryStatus,
} from "./inventoryStatus.js";

const emptySummary = () => ({
    latestPurchasePrice: null,
    latestBatchNumber: null,
    nextExpiryDate: null,
    inventoryBatchCount: 0,
});

const idString = (value) => String(value?._id ?? value ?? "");

const createdAtTime = (value) => {
    const time = new Date(value ?? 0).getTime();
    return Number.isFinite(time) ? time : 0;
};

const compareNewestFirst = (left, right) => {
    const timeDifference = createdAtTime(right.createdAt) - createdAtTime(left.createdAt);
    if (timeDifference !== 0) return timeDifference;
    return idString(right._id).localeCompare(idString(left._id));
};

const dateOnlyString = (value) => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }

    const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
    if (!match || getDaysUntilExpiry(value) === null) return null;
    return match[1];
};

/**
 * Summarize owner-filtered inventory records for catalog medicines.
 * The latest batch is chosen by createdAt descending, then _id descending.
 * The next expiry is the earliest valid batch that is not expired today.
 */
export function buildMedicineInventorySummaries(medicines, inventoryRecords, now = new Date()) {
    const summaries = new Map(
        medicines.map((medicine) => [idString(medicine), emptySummary()])
    );

    const recordsByMedicine = new Map();
    for (const record of inventoryRecords) {
        const medicineId = idString(record.medicine);
        if (!summaries.has(medicineId)) continue;
        const records = recordsByMedicine.get(medicineId) ?? [];
        records.push(record);
        recordsByMedicine.set(medicineId, records);
    }

    for (const [medicineId, records] of recordsByMedicine) {
        const newestFirst = [...records].sort(compareNewestFirst);
        const latest = newestFirst[0];
        const summary = summaries.get(medicineId);

        summary.inventoryBatchCount = newestFirst.length;
        summary.latestBatchNumber = latest.batchNumber ?? null;
        const latestPurchasePrice = Number(latest.purchasePrice);
        summary.latestPurchasePrice = latest.purchasePrice !== null &&
            latest.purchasePrice !== undefined &&
            latest.purchasePrice !== "" &&
            Number.isFinite(latestPurchasePrice)
            ? latestPurchasePrice
            : null;

        let nextExpiryDays = Number.POSITIVE_INFINITY;
        for (const record of newestFirst) {
            const daysUntilExpiry = getDaysUntilExpiry(record.expiryDate, now);
            if (
                daysUntilExpiry === null ||
                getExpiryStatus(record.expiryDate, undefined, now) === EXPIRY_STATUS.EXPIRED ||
                daysUntilExpiry >= nextExpiryDays
            ) {
                continue;
            }

            const expiryDate = dateOnlyString(record.expiryDate);
            if (!expiryDate) continue;
            nextExpiryDays = daysUntilExpiry;
            summary.nextExpiryDate = expiryDate;
        }
    }

    return summaries;
}
