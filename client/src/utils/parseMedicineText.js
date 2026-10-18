
const MANUFACTURER_LABEL =
    String.raw`(?:MANUFACTURER(?:\s+NAME)?|MANUFACTURED[.\s-]+(?:BY|(?:AND|&|/)\s*MARKETED[.\s-]+BY)|MARKETED[.\s-]+BY|M\s*\.?\s*F\s*\.?\s*[GD]\s*\.?\s*(?:BY|NAME))`;

const FIELD_PATTERNS = {
    name: [
        /^\s*(?:MEDICINE(?:\s+NAME)?|PRODUCT\s+NAME|TRADE\s+NAME|BRAND(?:\s+NAME)?)\s*[:#=-]?\s*(.*?)\s*$/i,
        /^\s*NAME\s*[:#=-]\s*(.*?)\s*$/i,
    ],

    genericName: [
        /^\s*GENERIC(?:\s+NAME)?\s*[:#=-]?\s*(.*?)\s*$/i,
        /^\s*COMPOSITION\s*[:#=-]?\s*(.*?)\s*$/i,
        /^\s*ACTIVE\s+INGREDIENTS?\s*[:#=-]\s*(.*?)\s*$/i,
    ],

    manufacturer: [
        new RegExp(
            `^\\s*${MANUFACTURER_LABEL}\\b\\s*[-:#=;,.\\u2013\\u2014|]?\\s*(.*?)\\s*$`,
            "i"
        ),
    ],

    batchNumber: [
        /^\s*(?:BATCH(?:\s*(?:NO\.?|NUMBER|#))?|B\.?\s*NO\.?|LOT(?:\s*(?:NO\.?|NUMBER|#))?)\s*[:#=-]?\s*(.*?)\s*$/i,
    ],

    expiryText: [
        /^\s*(?:EXP(?:IRY|IRATION)?(?:\s*(?:DATE|DT))?|USE\s+BEFORE|BEST\s+BEFORE)\s*[:#=-]?\s*(.*?)\s*$/i,
    ],

    category: [
        /^\s*CATEGORY\s*[:#=-]?\s*(.*?)\s*$/i,
    ],
};

const ANY_KNOWN_LABEL = new RegExp(
    `^\\s*(?:MEDICINE(?:\\s+NAME)?|PRODUCT\\s+NAME|TRADE\\s+NAME|BRAND(?:\\s+NAME)?|NAME|GENERIC(?:\\s+NAME)?|COMPOSITION|ACTIVE\\s+INGREDIENTS?|(?:(?:EACH\\s+)?(?:TABLET|CAPSULE|CAPLET|\\d+\\s*ML)\\s+)?CONTAINS|${MANUFACTURER_LABEL}|MANUFACTUR(?:ING|ED)\\s+(?:LIC(?:ENCE|ENSE)?|DATE)|M\\s*\\.?\\s*F\\s*\\.?\\s*[GD](?:\\s*\\.?\\s*(?:BY|NAME|DATE|DT|LIC(?:ENCE|ENSE)?))?|BATCH|B\\.?\\s*NO\\.?|LOT|EXP(?:IRY|IRATION)?|USE\\s+BEFORE|BEST\\s+BEFORE|BARCODE|EAN|UPC|CATEGORY)\\b`,
    "i"
);

const MANUFACTURER_TRAILING_LABEL =
    /[\s,;|:/]+(?:M\s*\.?\s*F\s*\.?\s*[GD]\s*\.?\s*(?:LIC(?:ENCE|ENSE)?\.?|DATE|DT)\b|MANUFACTUR(?:ING|ED)\s+(?:LIC(?:ENCE|ENSE)?|DATE|DT)\b)[\s\S]*$/i;

function isManufacturingMetadata(value) {
    return /^(?:DATE|DT|LIC|LICENCE|LICENSE|NO\.?|M\s*\.?\s*F\s*\.?\s*[GD]\s*\.?\s*(?:LIC|LICENCE|LICENSE|DATE|DT)\b)\b/i.test(value);
}

function cleanValue(value) {
    return String(value ?? "")
        .replace(/[“”‘’"'`]/g, "")
        .replace(/[®™]/g, "")
        .replace(/^[\s:#=–—-]+/, "")
        .replace(/[\s;|]+$/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractLabeledValue(lines, patterns) {
    for (let index = 0; index < lines.length; index += 1) {
        for (const pattern of patterns) {
            const match = lines[index].match(pattern);

            if (!match) continue;

            let value = cleanValue(match[1]);

            if (patterns === FIELD_PATTERNS.manufacturer) {
                // A label and its licence/date details can be OCR'd onto the
                // same line. Keep only the value after the company label.
                value = value.replace(MANUFACTURER_TRAILING_LABEL, "").trim();

                // Bare MFG labels are ambiguous (often a date or licence
                // abbreviation), so never accept those values as a company.
                if (isManufacturingMetadata(value)) {
                    continue;
                }
            }

            // Some labels have their value on the next line.
            if (!value && index + 1 < lines.length) {
                const nextLine = cleanValue(lines[index + 1]);

                if (nextLine && !ANY_KNOWN_LABEL.test(nextLine)) {
                    value = nextLine;
                }
            }

            if (value) return value;
        }
    }

    return "";
}

function simplifyIngredient(value) {
    return cleanValue(value)
        .replace(
            /^(?:each\s+(?:tablet|capsule|caplet|5\s*ml|\d+\s*ml)\s+)?contains\s*[:=-]?\s*/i,
            ""
        )
        // Keep multiple active ingredients while removing printed strengths
        // and pharmacopeia markers (for example, "500 mg IP").
        .replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|iu)\b/gi, " ")
        .replace(/\s+(?:IP|BP|USP|NF|PH\.?\s*EUR)\b/gi, " ")
        .replace(/\s*[+&,]\s*[+&,\s]*$/g, "")
        .replace(/\s*([+&,])\s*/g, " $1 ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractCompositionIngredient(lines) {
    // Common packaging layout: "Each tablet contains: Paracetamol 500 mg".
    // Only return ingredient names visible in that labeled composition.
    for (const line of lines) {
        const inlineMatch = line.match(
            /^\s*(?:(?:each\s+)?(?:tablet|capsule|caplet|5\s*ml|\d+\s*ml)\s+)?contains\s*[:=-]?\s*(.+?)\s*$/i
        );

        if (!inlineMatch) continue;

        const ingredient = simplifyIngredient(inlineMatch[1]);

        if (ingredient && /[a-zA-Z]{3,}/.test(ingredient)) {
            return ingredient;
        }
    }

    const startIndex = lines.findIndex((line) =>
        /\bcontains\s*:?\s*$/i.test(line) &&
        /\b(each|tablet|capsule|contains)\b/i.test(line)
    );

    if (startIndex === -1) return "";

    // Check the next few lines for the active ingredient.
    for (
        let index = startIndex + 1;
        index < Math.min(startIndex + 4, lines.length);
        index += 1
    ) {
        const line = cleanValue(lines[index]);

        if (!line || ANY_KNOWN_LABEL.test(line)) continue;

        const ingredient = simplifyIngredient(line);

        if (
            ingredient &&
            /[a-zA-Z]{3,}/.test(ingredient) &&
            !/\b(?:dosage|store|keep|mrp|expiry|batch)\b/i.test(ingredient)
        ) {
            return ingredient;
        }
    }

    return "";
}

function findPossibleMedicineName(lines) {
    const labelledName = extractLabeledValue(
        lines,
        FIELD_PATTERNS.name
    );

    if (labelledName) return labelledName;

    const candidates = [];

    for (const line of lines) {
        const candidate = cleanValue(line);

        if (!candidate || ANY_KNOWN_LABEL.test(candidate)) continue;

        if (
            /\b(?:tablets?|capsules?|analgesic|antipyretic|dosage|contains|store|keep|mg|mcg|ml|IP|BP|USP)\b/i.test(candidate)
        ) {
            continue;
        }

        if (!/[a-zA-Z]{3,}/.test(candidate)) continue;

        if (/^[\d\s./-]+$/.test(candidate)) continue;

        // A short product-like name containing a strength number
        // is a better candidate than a generic descriptive line.
        let score = 0;

        if (/\d{2,4}\b/.test(candidate)) score += 5;
        if (/^[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z0-9-]+){0,3}$/.test(candidate)) {
            score += 2;
        }

        if (candidate.length > 45) score -= 3;

        candidates.push({ value: candidate, score });
    }

    candidates.sort((a, b) => b.score - a.score);

    return candidates[0]?.value || "";
}

/**
 * Parse recognized package text into editable medicine fields.
 * Values are suggestions only and must be checked against
 * the physical package. Barcode values are supplied by ZXing, never by OCR.
 */
export function parseMedicineText(rawText) {
    const emptyFields = {
        name: "",
        genericName: "",
        manufacturer: "",
        category: "",
        batchNumber: "",
        expiryText: "",
        barcode: "",
    };

    if (typeof rawText !== "string" || !rawText.trim()) {
        return emptyFields;
    }

    const lines = rawText
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    let genericName = extractLabeledValue(
        lines,
        FIELD_PATTERNS.genericName
    );

    // Extract the ingredient when OCR recognizes a composition section.
    if (
        !genericName ||
        /^\s*(?:COMPOSITION|ACTIVE INGREDIENTS?)\b/i.test(genericName)
    ) {
        genericName = extractCompositionIngredient(lines) || genericName;
    } else {
        genericName = simplifyIngredient(genericName);
    }

    const explicitCategory = extractLabeledValue(
        lines,
        FIELD_PATTERNS.category
    );

    const inferredCategory =
        /\bcapsules?\b/i.test(lines.join("\n"))
            ? "Capsule"
            : /\btablets?\b/i.test(lines.join("\n"))
                ? "Tablet"
                : "";

    return {
        ...emptyFields,

        name: findPossibleMedicineName(lines),

        genericName,

        manufacturer: extractLabeledValue(
            lines,
            FIELD_PATTERNS.manufacturer
        ),

        category: explicitCategory || inferredCategory,

        batchNumber: extractLabeledValue(
            lines,
            FIELD_PATTERNS.batchNumber
        ),

        expiryText: extractLabeledValue(
            lines,
            FIELD_PATTERNS.expiryText
        ),

        barcode: "",
    };
}

export default parseMedicineText;
