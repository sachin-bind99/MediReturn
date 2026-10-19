import assert from "node:assert/strict";
import test from "node:test";
import {
    applyAvailableSuggestions,
    clearAutomaticSuggestions,
    findDuplicateBatch,
    getSupplierAddress,
    getLatestBatchSuggestions,
    getSupplierDefaultSuggestions,
} from "./inventorySuggestions.js";

test("uses the latest saved batch as editable medicine suggestions", () => {
    const suggestions = getLatestBatchSuggestions([
        {
            batchNumber: "B-NEW",
            purchasePrice: 21.5,
            expiryDate: "2028-03-01T00:00:00.000Z",
        },
        {
            batchNumber: "B-OLD",
            purchasePrice: 18,
            expiryDate: "2027-03-01T00:00:00.000Z",
        },
    ]);

    assert.deepEqual(suggestions, {
        batchNumber: "B-NEW",
        purchasePrice: 21.5,
        expiryDate: "2028-03-01T00:00:00.000Z",
    });
});

test("does not invent medicine suggestions when no saved batch exists", () => {
    assert.deepEqual(getLatestBatchSuggestions([]), {});
});

test("keeps non-empty and manually edited values until the user applies a suggestion", () => {
    const result = applyAvailableSuggestions({
        currentValues: { batchNumber: "MANUAL", purchasePrice: "", expiryDate: "" },
        suggestions: { batchNumber: "PREVIOUS", purchasePrice: 12, expiryDate: "2028-01-01" },
        manuallyEditedFields: new Set(["batchNumber"]),
    });

    assert.deepEqual(result.values, {
        batchNumber: "MANUAL",
        purchasePrice: "12",
        expiryDate: "2028-01-01",
    });
    assert.equal(result.automaticValues.purchasePrice, "12");
});

test("current scanner batch and expiry values take priority over previous-batch suggestions", () => {
    const result = applyAvailableSuggestions({
        currentValues: {
            batchNumber: "SCANNED-BATCH",
            purchasePrice: "",
            expiryDate: "2029-04-01",
        },
        suggestions: {
            batchNumber: "PREVIOUS-BATCH",
            purchasePrice: 24.5,
            expiryDate: "2028-04-01",
        },
    });

    assert.deepEqual(result.values, {
        batchNumber: "SCANNED-BATCH",
        purchasePrice: "24.5",
        expiryDate: "2029-04-01",
    });
});

test("clears prior automatic values on selection changes without clearing manual edits", () => {
    const result = clearAutomaticSuggestions({
        currentValues: { batchNumber: "PREVIOUS", purchasePrice: "15", expiryDate: "2028-01-01" },
        automaticValues: { batchNumber: "PREVIOUS", purchasePrice: "15", expiryDate: "2028-01-01" },
        fields: ["batchNumber", "purchasePrice", "expiryDate"],
        manuallyEditedFields: new Set(["purchasePrice"]),
    });

    assert.deepEqual(result.values, {
        batchNumber: "",
        purchasePrice: "15",
        expiryDate: "",
    });
    assert.deepEqual(result.automaticValues, {});
});

test("reads optional supplier defaults and accepts a zero-day window", () => {
    assert.deepEqual(
        getSupplierDefaultSuggestions({
            defaultReturnWindowDays: 0,
            defaultInventoryLocation: "  Shelf A-4  ",
            address: "Supplier postal address",
        }),
        { returnWindowDays: 0, location: "Shelf A-4" }
    );
    assert.deepEqual(getSupplierDefaultSuggestions({ address: "Postal address" }), {});
});

test("supplier postal address remains outside inventory defaults", () => {
    const supplier = {
        address: "12 Supplier Road",
        defaultReturnWindowDays: 30,
        defaultInventoryLocation: "Shelf A-4",
    };
    const suggestions = getSupplierDefaultSuggestions(supplier);

    assert.equal(getSupplierAddress(supplier), "12 Supplier Road");
    assert.equal(getSupplierAddress(null), "");
    assert.deepEqual(suggestions, {
        returnWindowDays: 30,
        location: "Shelf A-4",
    });
});

test("detects an exact medicine and batch duplicate from the authorized batch list", () => {
    const duplicate = { _id: "inventory-1", medicine: { _id: "medicine-1" }, batchNumber: "B-1" };
    assert.equal(findDuplicateBatch([duplicate], "medicine-1", " B-1 "), duplicate);
    assert.equal(findDuplicateBatch([duplicate], "medicine-2", "B-1"), null);
    assert.equal(findDuplicateBatch([duplicate], "medicine-1", "B-2"), null);
});
