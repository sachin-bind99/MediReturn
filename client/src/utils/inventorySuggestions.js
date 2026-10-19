export const MEDICINE_SUGGESTION_FIELDS = [
    "batchNumber",
    "purchasePrice",
    "expiryDate",
];

export const SUPPLIER_SUGGESTION_FIELDS = [
    "returnWindowDays",
    "location",
];

const hasValue = (value) => value !== undefined && value !== null && value !== "";

export const getLatestBatchSuggestions = (batches = []) => {
    const latestBatch = batches[0];
    if (!latestBatch) return {};

    return Object.fromEntries(
        MEDICINE_SUGGESTION_FIELDS
            .filter((field) => hasValue(latestBatch[field]))
            .map((field) => [field, latestBatch[field]])
    );
};

export const getSupplierDefaultSuggestions = (supplier) => {
    if (!supplier) return {};

    const suggestions = {};
    if (hasValue(supplier.defaultReturnWindowDays)) {
        suggestions.returnWindowDays = supplier.defaultReturnWindowDays;
    }
    if (
        typeof supplier.defaultInventoryLocation === "string" &&
        supplier.defaultInventoryLocation.trim()
    ) {
        suggestions.location = supplier.defaultInventoryLocation.trim();
    }
    return suggestions;
};

export const getSupplierAddress = (supplier) =>
    typeof supplier?.address === "string" ? supplier.address.trim() : "";

const toFormValue = (value) => String(value);

export const applyAvailableSuggestions = ({
    currentValues,
    suggestions,
    manuallyEditedFields = new Set(),
    automaticValues = {},
}) => {
    const nextValues = { ...currentValues };
    const nextAutomaticValues = { ...automaticValues };

    for (const [field, suggestion] of Object.entries(suggestions)) {
        if (!hasValue(suggestion) || manuallyEditedFields.has(field)) continue;

        const suggestedValue = toFormValue(suggestion);
        const currentValue = toFormValue(currentValues[field] ?? "");
        const previousAutomaticValue = automaticValues[field];
        const canApply =
            currentValue === "" ||
            (previousAutomaticValue !== undefined &&
                currentValue === previousAutomaticValue);

        if (canApply) {
            nextValues[field] = suggestedValue;
            nextAutomaticValues[field] = suggestedValue;
        }
    }

    return {
        values: nextValues,
        automaticValues: nextAutomaticValues,
    };
};

export const clearAutomaticSuggestions = ({
    currentValues,
    automaticValues,
    fields,
    manuallyEditedFields = new Set(),
}) => {
    const nextValues = { ...currentValues };
    const nextAutomaticValues = { ...automaticValues };

    for (const field of fields) {
        if (
            !manuallyEditedFields.has(field) &&
            automaticValues[field] !== undefined &&
            String(currentValues[field] ?? "") === automaticValues[field]
        ) {
            nextValues[field] = "";
        }
        delete nextAutomaticValues[field];
    }

    return {
        values: nextValues,
        automaticValues: nextAutomaticValues,
    };
};

export const findDuplicateBatch = (batches = [], medicineId, batchNumber) => {
    const normalizedBatchNumber = String(batchNumber || "").trim();
    if (!medicineId || !normalizedBatchNumber) return null;

    return batches.find((batch) => {
        const batchMedicineId = batch.medicine?._id || batch.medicine;
        return (
            String(batchMedicineId || "") === String(medicineId) &&
            String(batch.batchNumber || "").trim() === normalizedBatchNumber
        );
    }) || null;
};
