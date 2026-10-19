import { normalizeExpiryDate } from "./expiryDate.js";

const VISION_FIELD_CONFIG = [
    { source: "name", target: "name", label: "Medicine name" },
    { source: "genericName", target: "genericName", label: "Generic name" },
    { source: "manufacturer", target: "manufacturer", label: "Manufacturer" },
    { source: "category", target: "category", label: "Category" },
    { source: "batchNumber", target: "batchNumber", label: "Batch number" },
    { source: "expiryDate", target: "expiryText", label: "Expiry date as printed", date: true },
    { source: "barcode", target: "barcode", label: "Barcode", barcode: true },
];

const IDENTITY_FIELDS = new Set(["name", "genericName", "manufacturer"]);

const normalizeText = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function normalizeBarcode(value) {
    return String(value ?? "").replace(/\D/g, "");
}

function hasValidGtinCheckDigit(digits) {
    const checkDigit = Number(digits.at(-1));
    let sum = 0;
    for (let index = digits.length - 2; index >= 0; index -= 1) {
        const distanceFromCheckDigit = digits.length - 1 - index;
        sum += Number(digits[index]) * (distanceFromCheckDigit % 2 === 1 ? 3 : 1);
    }

    return (10 - (sum % 10)) % 10 === checkDigit;
}

function expandUpcEToUpcA(digits) {
    if (digits.length !== 8 || !["0", "1"].includes(digits[0])) return null;

    const [numberSystem, d1, d2, d3, d4, d5, d6, checkDigit] = digits;
    let upcAData;

    if (d6 <= "2") {
        upcAData = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
    } else if (d6 === "3") {
        upcAData = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
    } else if (d6 === "4") {
        upcAData = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
    } else {
        upcAData = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
    }

    return `${upcAData}${checkDigit}`;
}

export function isValidGs1Barcode(value) {
    const digits = normalizeBarcode(value);
    if (![8, 12, 13, 14].includes(digits.length)) return false;
    if (digits !== String(value ?? "").trim()) return false;

    if (hasValidGtinCheckDigit(digits)) return true;
    if (digits.length !== 8) return false;

    const expandedUpcA = expandUpcEToUpcA(digits);
    return Boolean(expandedUpcA && hasValidGtinCheckDigit(expandedUpcA));
}

function comparableValue(config, value) {
    if (config.barcode) return normalizeBarcode(value);
    if (config.date) {
        return normalizeExpiryDate(value).date || normalizeText(value);
    }
    return normalizeText(value);
}

function candidateText(config, value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (config.barcode && !/^\d+$/.test(trimmed)) return "";
    return trimmed;
}

function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
}

function makeFieldResult(config, imageAnalyses) {
    const candidates = imageAnalyses
        .map((analysis) => analysis?.fields?.[config.source])
        .filter(
            (candidate) =>
                candidate &&
                ["read", "uncertain", "not_found"].includes(candidate.status) &&
                (candidate.value === null || typeof candidate.value === "string")
        );
    const readings = candidates.filter(
        (candidate) => candidate.status === "read" && candidate.value?.trim()
    );
    const uncertain = candidates.filter((candidate) => candidate.status === "uncertain");
    const readingGroups = new Map();
    const invalidReadings = [];

    for (const candidate of readings) {
        const value = candidateText(config, candidate.value);
        if (!value) continue;
        if (config.date && !normalizeExpiryDate(value).date) {
            invalidReadings.push(value);
            continue;
        }
        if (config.barcode && !isValidGs1Barcode(value)) {
            invalidReadings.push(value);
            continue;
        }

        const key = comparableValue(config, value);
        const group = readingGroups.get(key) ?? { value, evidence: [] };
        if (candidate.evidence) group.evidence.push(candidate.evidence);
        readingGroups.set(key, group);
    }

    const uncertainValues = uncertain
        .map((candidate) => candidateText(config, candidate.value))
        .filter(Boolean);
    const readingValues = [...readingGroups.values()].map((group) => group.value);
    const allCandidateValues = uniqueValues([
        ...readingValues,
        ...uncertainValues,
        ...invalidReadings,
    ]);
    const hasUncertainReading = uncertain.length > 0;

    if (
        readingGroups.size === 1 &&
        !hasUncertainReading &&
        invalidReadings.length === 0
    ) {
        const group = readingGroups.values().next().value;
        return {
            ...config,
            status: "read",
            value: group.value,
            candidates: [group.value],
            evidence: [...new Set(group.evidence)].join(" · ") || null,
        };
    }

    if (
        readingGroups.size > 0 ||
        hasUncertainReading ||
        readings.length > 0 ||
        invalidReadings.length > 0
    ) {
        return {
            ...config,
            status: "uncertain",
            value: allCandidateValues.length === 1 ? allCandidateValues[0] : null,
            candidates: allCandidateValues,
            evidence: null,
        };
    }

    return {
        ...config,
        status: "not_found",
        value: null,
        candidates: [],
        evidence: null,
    };
}

/** Merge photo readings without filling editable fields or choosing conflicts. */
export function mergeMedicineVisionResults(imageAnalyses) {
    const fieldResults = VISION_FIELD_CONFIG.map((config) =>
        makeFieldResult(config, imageAnalyses)
    );
    const identityConflicts = fieldResults
        .filter(
            (result) =>
                IDENTITY_FIELDS.has(result.source) &&
                result.status === "uncertain" &&
                result.candidates.length > 1
        )
        .map((result) => result.label);

    return { fieldResults, identityConflicts };
}

export function getVisionCandidateOptions(fieldResult, currentValue = "") {
    const options = [...(fieldResult?.candidates ?? [])];
    if (fieldResult?.status === "read" && fieldResult.value) {
        options.unshift(fieldResult.value);
    }

    const currentText = String(currentValue ?? "").trim();
    const current = fieldResult?.barcode
        ? candidateText(fieldResult, currentText)
        : currentText;
    if (current && options.length > 0 && !options.includes(current)) {
        options.push(current);
    }

    return uniqueValues(options);
}

export function createVisionReviewState(fieldResults = [], currentFields = {}) {
    const selectedCandidates = {};
    for (const result of fieldResults) {
        if (!result.target) continue;
        const options = getVisionCandidateOptions(result);
        if (result.status === "read") {
            const current = String(currentFields[result.target] ?? "").trim();
            selectedCandidates[result.target] =
                result.target === "barcode" && isValidGs1Barcode(current)
                    ? current
                    : options[0] ?? "";
        } else {
            // Uncertain readings require an explicit candidate selection.
            selectedCandidates[result.target] = "";
        }
    }

    return {
        selectedCandidates,
        confirmationRequiredFields: new Set(),
        confirmedFields: new Set(),
        acceptedValues: {},
    };
}

export function restoreAcceptedVisionFields(fields, acceptedValues) {
    const restoredFields = { ...fields };
    for (const [target, accepted] of Object.entries(acceptedValues ?? {})) {
        if (String(fields[target] ?? "").trim() === accepted.value) {
            restoredFields[target] = accepted.previousValue;
        }
    }
    return restoredFields;
}

export function confirmVisionFieldValue({
    fieldResult,
    target,
    value,
    fields,
    confirmationRequiredFields,
    confirmedFields,
    acceptedValues,
    replaceExisting = false,
}) {
    const candidate = String(value ?? "").trim();
    const existing = String(fields[target] ?? "").trim();
    const options = getVisionCandidateOptions(fieldResult, existing);

    if (!candidate || !options.includes(candidate)) {
        return { ok: false, reason: "select_candidate" };
    }
    if (target === "expiryText" && !normalizeExpiryDate(candidate).date) {
        return { ok: false, reason: "invalid_expiry" };
    }
    if (target === "barcode" && !isValidGs1Barcode(candidate)) {
        return { ok: false, reason: "invalid_barcode" };
    }
    if (existing && existing !== candidate && !replaceExisting) {
        return {
            ok: false,
            reason: "replacement_confirmation_required",
            existing,
            candidate,
        };
    }

    const wasRequired = confirmationRequiredFields.has(target);
    const nextRequiredFields = new Set(confirmationRequiredFields);
    nextRequiredFields.add(target);
    const nextConfirmedFields = new Set(confirmedFields);
    nextConfirmedFields.add(target);

    return {
        ok: true,
        fields: { ...fields, [target]: candidate },
        confirmationRequiredFields: nextRequiredFields,
        confirmedFields: nextConfirmedFields,
        acceptedValues: {
            ...acceptedValues,
            [target]: {
                value: candidate,
                previousValue: existing,
                previousRequired: wasRequired,
            },
        },
    };
}

export function revokeVisionFieldConfirmation({
    target,
    fields,
    confirmationRequiredFields,
    confirmedFields,
    acceptedValues,
}) {
    const accepted = acceptedValues[target];
    const nextFields = { ...fields };
    if (
        accepted &&
        String(fields[target] ?? "").trim() === accepted.value
    ) {
        nextFields[target] = accepted.previousValue;
    }

    const nextRequiredFields = new Set(confirmationRequiredFields);
    nextRequiredFields.delete(target);
    if (accepted?.previousRequired) nextRequiredFields.add(target);

    const nextConfirmedFields = new Set(confirmedFields);
    nextConfirmedFields.delete(target);
    const nextAcceptedValues = { ...acceptedValues };
    delete nextAcceptedValues[target];

    return {
        fields: nextFields,
        confirmationRequiredFields: nextRequiredFields,
        confirmedFields: nextConfirmedFields,
        acceptedValues: nextAcceptedValues,
    };
}

export function invalidateVisionFieldConfirmation({
    target,
    confirmedFields,
    selectedCandidates,
    value,
}) {
    const nextConfirmedFields = new Set(confirmedFields);
    nextConfirmedFields.delete(target);
    return {
        confirmedFields: nextConfirmedFields,
        selectedCandidates: {
            ...selectedCandidates,
            [target]: value || selectedCandidates[target] || "",
        },
    };
}
