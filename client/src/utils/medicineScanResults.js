import parseMedicineText from "./parseMedicineText.js";
import { normalizeExpiryDate } from "./expiryDate.js";

const SCANNER_FIELDS = [
    "name",
    "genericName",
    "manufacturer",
    "category",
    "batchNumber",
    "expiryText",
    "barcode",
];

const FIELD_LABELS = {
    name: "medicine name",
    genericName: "generic name",
    manufacturer: "manufacturer",
    category: "category",
    batchNumber: "batch number",
    expiryText: "expiry date",
    barcode: "barcode",
};

/** Split parsed text into safe form candidates and values that need review. */
export function splitMedicineFormCandidates(parsedFields) {
    const fields = {};
    const uncertainFields = [];

    for (const [field, value] of Object.entries(parsedFields ?? {})) {
        if (!SCANNER_FIELDS.includes(field) || !value) continue;

        if (field === "expiryText" && !normalizeExpiryDate(value).date) {
            uncertainFields.push({
                field,
                label: FIELD_LABELS[field],
                candidate: String(value),
            });
            continue;
        }

        fields[field] = value;
    }

    return { fields, uncertainFields };
}

// Tesseract's page confidence is an engine score (0-100), not a probability.
// Below this threshold keep the OCR text for review but do not auto-fill fields
// or create conflicts from it.
export const MIN_AUTOFILL_CONFIDENCE = 50;

const normalizeText = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function comparableValue(field, value) {
    if (field === "barcode") return String(value ?? "").replace(/\D/g, "");
    if (field === "expiryText") {
        const normalizedDate = normalizeExpiryDate(value).date;
        return normalizedDate || normalizeText(value);
    }
    return normalizeText(value);
}

function areLikelyNameOcrVariants(values) {
    if (values.length !== 2) return false;

    const [left, right] = values.map((value) => normalizeText(value));
    if (Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 1) {
        return false;
    }

    let leftIndex = 0;
    let rightIndex = 0;
    let differences = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
        if (left[leftIndex] === right[rightIndex]) {
            leftIndex += 1;
            rightIndex += 1;
            continue;
        }

        differences += 1;
        if (differences > 1) return false;

        if (left.length > right.length) leftIndex += 1;
        else if (right.length > left.length) rightIndex += 1;
        else {
            leftIndex += 1;
            rightIndex += 1;
        }
    }

    if (leftIndex < left.length || rightIndex < right.length) differences += 1;
    return differences <= 1;
}

function combineUniqueText(texts) {
    const seenLines = new Set();
    const combinedLines = [];

    for (const text of texts) {
        for (const line of String(text ?? "").split(/\r?\n/)) {
            const value = line.trim();
            const key = normalizeText(value);
            if (!value || seenLines.has(key)) continue;
            seenLines.add(key);
            combinedLines.push(value);
        }
    }

    return combinedLines.join("\n");
}

/** Merge per-photo OCR/barcode results without silently choosing conflicts. */
export function mergeMedicineScanResults(
    imageResults,
    currentFields,
    protectedFields = new Set()
) {
    const combinedText = combineUniqueText(
        imageResults.map((result) => result.recognizedText)
    );
    const decodedBarcodes = [...new Set(
        imageResults
            .map((result) => String(result.decodedBarcode ?? "").replace(/\D/g, ""))
            .filter(Boolean)
    )];
    const candidates = Object.fromEntries(
        SCANNER_FIELDS.map((field) => [field, []])
    );
    const unlabelledNames = new Map();

    for (let index = 0; index < imageResults.length; index += 1) {
        const result = imageResults[index];
        if (result.recognizedText) {
            const parsingText = typeof result.parsingText === "string"
                ? result.parsingText
                : result.recognizedText;
            const parsedFields = parseMedicineText(parsingText);
            const confidence = Number(
                result.fieldConfidence ?? result.confidence
            );
            const hasUsableConfidence =
                Number.isFinite(confidence) &&
                confidence >= MIN_AUTOFILL_CONFIDENCE;

            if (hasUsableConfidence) {
                for (const field of SCANNER_FIELDS) {
                    const value = parsedFields[field];
                    if (!value || field === "barcode") continue;
                    if (field === "expiryText" && !normalizeExpiryDate(value).date) continue;
                    const key = comparableValue(field, value);
                    const existing = candidates[field].find((item) => item.key === key);
                    if (existing) {
                        if (confidence > existing.confidence) {
                            existing.value = value;
                            existing.confidence = confidence;
                        }
                    } else {
                        candidates[field].push({ value, key, confidence });
                    }
                }

                if (!parsedFields.name) {
                    const possibleName = parseMedicineText(parsingText, {
                        allowUnlabelledName: true,
                    }).name;
                    if (possibleName) {
                        const key = comparableValue("name", possibleName);
                        const matchingName = unlabelledNames.get(key) ?? {
                            value: possibleName,
                            confidence,
                            imageIndexes: new Set(),
                        };
                        matchingName.confidence = Math.max(matchingName.confidence, confidence);
                        matchingName.imageIndexes.add(result.photoId ?? index);
                        unlabelledNames.set(key, matchingName);
                    }
                }
            }
        }

        if (result.decodedBarcode) {
            const value = String(result.decodedBarcode).replace(/\D/g, "");
            const key = comparableValue("barcode", value);
            const existing = candidates.barcode.find((item) => item.key === key);
            if (value && !existing) {
                candidates.barcode.push({ value, key, confidence: Infinity });
            }
        }
    }

    // Unlabelled front-panel text is useful only when a product-like candidate
    // (next to a strength) repeats across separate clear photos. A single word
    // read from artwork is never promoted to the medicine name.
    for (const [key, candidate] of unlabelledNames) {
        if (candidate.imageIndexes.size < 2) continue;
        const existing = candidates.name.find((item) => item.key === key);
        if (!existing) {
            candidates.name.push({
                value: candidate.value,
                key,
                confidence: candidate.confidence,
            });
        }
    }

    const fields = { ...currentFields };
    const conflicts = [];

    for (const [field, values] of Object.entries(candidates)) {
        const currentValue = String(fields[field] ?? "").trim();
        const currentKey = comparableValue(field, currentValue);
        const conflictValues = [];
        const addConflictValue = (value) => {
            if (!value) return;
            if (!conflictValues.some(
                (existing) => comparableValue(field, existing) === comparableValue(field, value)
            )) {
                conflictValues.push(value);
            }
        };

        if (values.length > 1) {
            addConflictValue(currentValue);
            values.forEach((item) => addConflictValue(item.value));
        } else if (values.length === 1 && currentValue && currentKey !== values[0].key) {
            addConflictValue(currentValue);
            addConflictValue(values[0].value);
        }

        if (
            conflictValues.length > 1 &&
            !(field === "name" && areLikelyNameOcrVariants(conflictValues))
        ) {
            conflicts.push({
                field,
                label: FIELD_LABELS[field],
                values: conflictValues,
            });
            continue;
        }

        if (values.length === 1 && !currentValue && !protectedFields.has(field)) {
            fields[field] = values[0].value;
        }
    }

    return { combinedText, decodedBarcodes, fields, conflicts };
}
