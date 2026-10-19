import assert from "node:assert/strict";
import test from "node:test";

import {
    confirmVisionFieldValue,
    createVisionReviewState,
    getVisionCandidateOptions,
    invalidateVisionFieldConfirmation,
    isValidGs1Barcode,
    mergeMedicineVisionResults,
    revokeVisionFieldConfirmation,
    restoreAcceptedVisionFields,
} from "./medicineVision.js";

const fieldNames = [
    "name",
    "genericName",
    "manufacturer",
    "category",
    "batchNumber",
    "expiryDate",
    "barcode",
];

const visionResult = () => ({
    fields: Object.fromEntries(
        fieldNames.map((field) => [
            field,
            { value: null, status: "not_found", evidence: null },
        ])
    ),
});

const withFields = (overrides) => ({
    fields: { ...visionResult().fields, ...overrides },
});

const emptyFields = () => ({
    name: "",
    genericName: "",
    manufacturer: "",
    category: "",
    batchNumber: "",
    expiryText: "",
    barcode: "",
});

const read = (value, evidence = "Visible package text") => ({
    value,
    status: "read",
    evidence,
});

const uncertain = (value) => ({
    value,
    status: "uncertain",
    evidence: "Characters need manual review",
});

function resultFor(target, source, value, status = "read") {
    const result = mergeMedicineVisionResults([
        withFields({ [source]: status === "read" ? read(value) : uncertain(value) }),
    ]).fieldResults.find((item) => item.target === target);
    return result;
}

test("returns only the seven scanner fields and preserves the printed expiry value", () => {
    const merged = mergeMedicineVisionResults([
        withFields({
            name: read("MediCare"),
            genericName: read("Example compound"),
            manufacturer: read("Example Labs"),
            category: read("Tablet"),
            batchNumber: read("AB-2403"),
            expiryDate: read("04/2027"),
            barcode: read("8901234567890"),
        }),
    ]);

    assert.deepEqual(merged.fieldResults.map((field) => field.source), fieldNames);
    assert.equal(merged.fieldResults.find((field) => field.target === "expiryText").value, "04/2027");
    assert.equal(merged.fieldResults.some((field) => ["mrp", "manufacturingDate"].includes(field.source)), false);
});

test("does not auto-fill editable fields while merging clear AI readings", () => {
    const merged = mergeMedicineVisionResults([
        withFields({ name: read("MediCare"), batchNumber: read("AB-2403") }),
    ]);

    assert.equal(Object.hasOwn(merged, "fields"), false);
    assert.equal(merged.fieldResults.find((field) => field.target === "name").status, "read");
});

test("offers conflicting candidates and warns about different medicine identities", () => {
    const merged = mergeMedicineVisionResults([
        withFields({
            name: read("MediCare"),
            genericName: read("Ingredient A"),
            manufacturer: read("Maker One"),
            batchNumber: read("AB-2403"),
        }),
        withFields({
            name: read("MediCure"),
            genericName: read("Ingredient B"),
            manufacturer: read("Maker Two"),
            batchNumber: read("AB-2408"),
        }),
    ]);

    assert.deepEqual(merged.identityConflicts, ["Medicine name", "Generic name", "Manufacturer"]);
    const name = merged.fieldResults.find((field) => field.target === "name");
    const batch = merged.fieldResults.find((field) => field.target === "batchNumber");
    assert.equal(name.status, "uncertain");
    assert.deepEqual(name.candidates, ["MediCare", "MediCure"]);
    assert.deepEqual(batch.candidates, ["AB-2403", "AB-2408"]);
});

test("lets the user select and confirm one candidate from a conflict", () => {
    const fieldResult = mergeMedicineVisionResults([
        withFields({ name: read("MediCare") }),
        withFields({ name: read("MediCure") }),
    ]).fieldResults.find((field) => field.target === "name");
    const state = createVisionReviewState([fieldResult], emptyFields());
    const options = getVisionCandidateOptions(fieldResult);
    assert.equal(state.selectedCandidates.name, "");

    const confirmed = confirmVisionFieldValue({
        fieldResult,
        target: "name",
        value: options[1],
        fields: emptyFields(),
        ...state,
    });

    assert.equal(confirmed.fields.name, "MediCure");
    assert.equal(confirmed.confirmedFields.has("name"), true);
});

test("uncertain values require an explicit candidate selection", () => {
    const fieldResult = mergeMedicineVisionResults([
        withFields({ name: uncertain("MediCare"), manufacturer: uncertain(null) }),
    ]).fieldResults.find((field) => field.target === "name");
    const state = createVisionReviewState([fieldResult], emptyFields());

    assert.equal(state.selectedCandidates.name, "");
    const missing = confirmVisionFieldValue({
        fieldResult,
        target: "name",
        value: "",
        fields: emptyFields(),
        ...state,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "select_candidate");
});

test("missing candidates leave fields editable without offering a confirmation value", () => {
    const notFound = resultFor("manufacturer", "manufacturer", null, "uncertain");
    const notFoundStatus = mergeMedicineVisionResults([
        withFields({ manufacturer: { value: null, status: "not_found", evidence: null } }),
    ]).fieldResults.find((field) => field.target === "manufacturer");

    assert.equal(notFound.status, "uncertain");
    assert.deepEqual(getVisionCandidateOptions(notFound), []);
    assert.equal(notFoundStatus.status, "not_found");
    assert.deepEqual(getVisionCandidateOptions(notFoundStatus), []);
});

test("checking a candidate copies it to the corresponding field and confirms only that field", () => {
    const fieldResult = resultFor("name", "name", "MediCare");
    const state = createVisionReviewState([fieldResult], emptyFields());
    assert.equal(state.confirmedFields.size, 0);

    const confirmed = confirmVisionFieldValue({
        fieldResult,
        target: "name",
        value: state.selectedCandidates.name,
        fields: emptyFields(),
        ...state,
    });

    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.fields.name, "MediCare");
    assert.deepEqual([...confirmed.confirmedFields], ["name"]);
});

test("different existing values require replacement confirmation", () => {
    const fieldResult = resultFor("manufacturer", "manufacturer", "Maker One");
    const state = createVisionReviewState([fieldResult], {
        ...emptyFields(),
        manufacturer: "Manual Maker",
    });
    const fields = { ...emptyFields(), manufacturer: "Manual Maker" };
    const blocked = confirmVisionFieldValue({
        fieldResult,
        target: "manufacturer",
        value: "Maker One",
        fields,
        ...state,
    });

    assert.equal(blocked.reason, "replacement_confirmation_required");
    const replaced = confirmVisionFieldValue({
        fieldResult,
        target: "manufacturer",
        value: "Maker One",
        fields,
        ...state,
        replaceExisting: true,
    });
    assert.equal(replaced.fields.manufacturer, "Maker One");
});

test("unchecking confirmation restores the prior value and revokes verification", () => {
    const fieldResult = resultFor("batchNumber", "batchNumber", "AB-2403");
    const state = createVisionReviewState([fieldResult], emptyFields());
    const confirmed = confirmVisionFieldValue({
        fieldResult,
        target: "batchNumber",
        value: "AB-2403",
        fields: emptyFields(),
        ...state,
    });
    const revoked = revokeVisionFieldConfirmation({
        target: "batchNumber",
        ...confirmed,
    });

    assert.equal(revoked.fields.batchNumber, "");
    assert.equal(revoked.confirmedFields.has("batchNumber"), false);
    assert.equal(revoked.confirmationRequiredFields.has("batchNumber"), false);
});

test("editing an accepted value revokes confirmation and requires a new check", () => {
    const fieldResult = resultFor("batchNumber", "batchNumber", "AB-2403");
    const state = createVisionReviewState([fieldResult], emptyFields());
    const accepted = confirmVisionFieldValue({
        fieldResult,
        target: "batchNumber",
        value: "AB-2403",
        fields: emptyFields(),
        ...state,
    });
    const edited = invalidateVisionFieldConfirmation({
        target: "batchNumber",
        confirmedFields: accepted.confirmedFields,
        selectedCandidates: state.selectedCandidates,
        value: "AB-2408",
    });

    assert.equal(edited.confirmedFields.has("batchNumber"), false);
    assert.equal(edited.selectedCandidates.batchNumber, "AB-2408");
    const reconfirmed = confirmVisionFieldValue({
        fieldResult,
        target: "batchNumber",
        value: "AB-2408",
        fields: { ...accepted.fields, batchNumber: "AB-2408" },
        confirmationRequiredFields: accepted.confirmationRequiredFields,
        confirmedFields: edited.confirmedFields,
        acceptedValues: accepted.acceptedValues,
    });
    assert.equal(reconfirmed.ok, true);
    assert.equal(reconfirmed.confirmedFields.has("batchNumber"), true);
});

test("resetting review state after a rescan clears all prior confirmations", () => {
    const fieldResult = resultFor("expiryText", "expiryDate", "04/2027");
    const accepted = confirmVisionFieldValue({
        fieldResult,
        target: "expiryText",
        value: "04/2027",
        fields: emptyFields(),
        ...createVisionReviewState([fieldResult], emptyFields()),
    });
    assert.equal(accepted.confirmedFields.has("expiryText"), true);

    const restoredFields = restoreAcceptedVisionFields(
        accepted.fields,
        accepted.acceptedValues
    );
    assert.equal(restoredFields.expiryText, "");

    const reset = createVisionReviewState([fieldResult], restoredFields);
    assert.equal(reset.confirmedFields.size, 0);
    assert.equal(reset.confirmationRequiredFields.size, 0);
    assert.deepEqual(reset.acceptedValues, {});
});

test("keeps the expiry text as printed, rejects malformed dates, and exposes only valid normalized dates", () => {
    const valid = resultFor("expiryText", "expiryDate", "04/2027");
    const invalid = resultFor("expiryText", "expiryDate", "13/2027");
    assert.equal(valid.value, "04/2027");
    assert.equal(invalid.status, "uncertain");
    assert.deepEqual(invalid.candidates, ["13/2027"]);

    const blocked = confirmVisionFieldValue({
        fieldResult: invalid,
        target: "expiryText",
        value: "13/2027",
        fields: emptyFields(),
        ...createVisionReviewState([invalid], emptyFields()),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "invalid_expiry");
});

test("offers an existing barcode ahead of an AI barcode and keeps barcode candidates numeric", () => {
    const fieldResult = resultFor("barcode", "barcode", "8901234567890");
    const currentFields = { ...emptyFields(), barcode: "8901234567890" };
    const state = createVisionReviewState([fieldResult], currentFields);

    assert.equal(state.selectedCandidates.barcode, "8901234567890");
    assert.deepEqual(getVisionCandidateOptions(fieldResult, "UPC 123"), ["8901234567890"]);
    assert.equal(isValidGs1Barcode("8901234567890"), true);
    assert.equal(isValidGs1Barcode("8901234567891"), false);
});

test("accepts valid UPC-E and EAN-8 values while rejecting invalid check digits", () => {
    assert.equal(isValidGs1Barcode("04252614"), true);
    assert.equal(isValidGs1Barcode("04252615"), false);
    assert.equal(isValidGs1Barcode("96385074"), true);
    assert.equal(isValidGs1Barcode("96385075"), false);
});

test("does not confirm a digit-only barcode with an invalid check digit", () => {
    const fieldResult = resultFor("barcode", "barcode", "8901234567891");
    const state = createVisionReviewState([fieldResult], emptyFields());
    const blocked = confirmVisionFieldValue({
        fieldResult,
        target: "barcode",
        value: "8901234567891",
        fields: emptyFields(),
        ...state,
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "invalid_barcode");
});
