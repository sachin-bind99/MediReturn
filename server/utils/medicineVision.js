export const MAX_MEDICINE_IMAGE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_VISION_MODEL = "gpt-6-luna";

const FIELD_NAMES = [
    "name",
    "genericName",
    "manufacturer",
    "category",
    "batchNumber",
    "expiryDate",
    "barcode",
];

const fieldSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        value: { type: ["string", "null"] },
        status: {
            type: "string",
            enum: ["read", "uncertain", "not_found"],
        },
        evidence: { type: ["string", "null"] },
    },
    required: ["value", "status", "evidence"],
};

export const MEDICINE_VISION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        fields: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
                FIELD_NAMES.map((name) => [name, fieldSchema])
            ),
            required: FIELD_NAMES,
        },
    },
    required: ["fields"],
};

export class MedicineVisionError extends Error {
    constructor(message, { code = "VISION_ERROR", statusCode = 502 } = {}) {
        super(message);
        this.name = "MedicineVisionError";
        this.code = code;
        this.statusCode = statusCode;
    }
}

export function validateMedicineVisionImage(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { statusCode: 400, message: "Choose a JPG or PNG image to analyze." };
    }

    if (buffer.length > MAX_MEDICINE_IMAGE_BYTES) {
        return { statusCode: 413, message: "Images must be 8 MB or smaller." };
    }

    const isJpeg =
        mimeType === "image/jpeg" &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;
    const isPng =
        mimeType === "image/png" &&
        buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );

    if (!isJpeg && !isPng) {
        return {
            statusCode: 415,
            message: "Only valid JPG and PNG images can be analyzed.",
        };
    }

    return null;
}

export function validateMedicineVisionResult(input) {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        !input.fields ||
        typeof input.fields !== "object" ||
        Array.isArray(input.fields)
    ) {
        throw new MedicineVisionError("The image analysis response was invalid.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    const receivedFields = Object.keys(input.fields);
    if (
        receivedFields.length !== FIELD_NAMES.length ||
        FIELD_NAMES.some((name) => !Object.hasOwn(input.fields, name))
    ) {
        throw new MedicineVisionError("The image analysis response was incomplete.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    const fields = {};
    for (const name of FIELD_NAMES) {
        const candidate = input.fields[name];
        if (
            !candidate ||
            typeof candidate !== "object" ||
            Array.isArray(candidate) ||
            Object.keys(candidate).length !== 3 ||
            !Object.hasOwn(candidate, "value") ||
            !Object.hasOwn(candidate, "status") ||
            !Object.hasOwn(candidate, "evidence") ||
            !["read", "uncertain", "not_found"].includes(candidate.status)
        ) {
            throw new MedicineVisionError("The image analysis response was invalid.", {
                code: "INVALID_MODEL_RESPONSE",
            });
        }

        const value =
            typeof candidate.value === "string" ? candidate.value.trim() : candidate.value;
        const evidence =
            typeof candidate.evidence === "string"
                ? candidate.evidence.trim()
                : candidate.evidence;

        if (
            (value !== null && typeof value !== "string") ||
            (evidence !== null && typeof evidence !== "string") ||
            (typeof value === "string" && (!value || value.length > 200)) ||
            (typeof evidence === "string" && evidence.length > 240) ||
            (candidate.status === "read" && (!value || !evidence)) ||
            (candidate.status === "not_found" && value !== null)
        ) {
            throw new MedicineVisionError("The image analysis response was invalid.", {
                code: "INVALID_MODEL_RESPONSE",
            });
        }

        fields[name] = {
            value,
            status: candidate.status,
            evidence: evidence || null,
        };
    }

    return { fields };
}

function extractStructuredText(responseBody) {
    if (!Array.isArray(responseBody?.output)) {
        throw new MedicineVisionError("The image analysis response was empty.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    const content = responseBody.output
        .filter((item) => item?.type === "message")
        .flatMap((item) => item.content ?? []);
    const refusal = content.find((item) => item?.type === "refusal");
    if (refusal) {
        throw new MedicineVisionError(
            "The image could not be analyzed. Try a clearer package photo.",
            { code: "MODEL_REFUSAL" }
        );
    }

    const outputText = content.find(
        (item) => item?.type === "output_text" && typeof item.text === "string"
    )?.text;

    if (typeof outputText !== "string" || !outputText.trim()) {
        throw new MedicineVisionError("The image analysis response was empty.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    try {
        return JSON.parse(outputText);
    } catch {
        throw new MedicineVisionError("The image analysis response was not valid JSON.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }
}

const EXTRACTION_INSTRUCTIONS = [
    "Read only text that is actually visible on this medicine package image.",
    "Do not use outside knowledge, a medicine database, or another image to fill a gap.",
    "Return the medicine or brand name only when legible.",
    "Return a generic name only when it is explicitly printed, such as in a readable composition or active-ingredients section.",
    "Return the manufacturer only when its name is explicitly visible. Return a category only when the printed package clearly supports it.",
    "Copy the batch number and expiry date exactly as printed. Never calculate, normalize, complete, or guess digits in a date or batch number.",
    "Mark a field read only when the visible characters support the full value. If any important character is unclear, use status uncertain and value null (or include the tentative visible text as uncertain). Use not_found and null when the field is not visible.",
    "For a barcode, return digits only when the human-readable barcode digits are clearly legible. Do not infer digits from the barcode pattern.",
    "Focus on one medicine package. If several products are visible or photos appear to show different medicines, do not combine their details; mark conflicting fields uncertain or not_found.",
    "Give short evidence tied to visible text, such as the nearby printed label. Do not include advice or inferred facts.",
].join(" ");

function providerErrorDetails(responseBody) {
    const providerError = responseBody?.error;
    if (!providerError || typeof providerError !== "object") {
        return { code: "", type: "", message: "" };
    }

    return {
        code: String(providerError.code ?? "").toLowerCase(),
        type: String(providerError.type ?? "").toLowerCase(),
        message: String(providerError.message ?? "").toLowerCase(),
    };
}

function mapProviderError(status, responseBody) {
    const details = providerErrorDetails(responseBody);
    const classification = `${details.code} ${details.type} ${details.message}`;

    if (
        status === 401 ||
        /invalid_api_key|authentication_error|incorrect api key/.test(classification)
    ) {
        return new MedicineVisionError(
            "AI image analysis credentials are invalid. Check OPENAI_API_KEY in the server environment.",
            { code: "VISION_INVALID_CREDENTIALS", statusCode: 503 }
        );
    }

    if (
        status === 403 ||
        /insufficient_permissions|permission_error|does not have access|not authorized|access denied/.test(
            classification
        )
    ) {
        return new MedicineVisionError(
            "This server API project does not have access to the requested vision feature or model. Check its API permissions and model access.",
            { code: "VISION_ACCESS_DENIED", statusCode: 503 }
        );
    }

    if (
        /insufficient_quota|billing_hard_limit_reached|quota|billing limit/.test(classification)
    ) {
        return new MedicineVisionError(
            "The server API project has no available OpenAI quota. Check its billing and usage limits.",
            { code: "VISION_QUOTA_EXHAUSTED", statusCode: 503 }
        );
    }

    if (
        status === 404 ||
        /model_not_found|model_not_available|unknown_model/.test(classification)
    ) {
        return new MedicineVisionError(
            "The configured vision model is unavailable. Check OPENAI_VISION_MODEL and confirm the model is available to this API project.",
            { code: "VISION_MODEL_UNAVAILABLE", statusCode: 503 }
        );
    }

    if (status === 429) {
        return new MedicineVisionError(
            "The OpenAI API is rate limiting image analysis. Try again later.",
            { code: "VISION_RATE_LIMITED", statusCode: 503 }
        );
    }

    if (status >= 500) {
        return new MedicineVisionError(
            "The OpenAI image analysis service is temporarily unavailable. Try again later.",
            { code: "VISION_PROVIDER_UNAVAILABLE", statusCode: 503 }
        );
    }

    return new MedicineVisionError(
        "The OpenAI image analysis request was rejected. Check the server model and request configuration.",
        { code: "VISION_PROVIDER_FAILURE", statusCode: 502 }
    );
}

export async function requestMedicineVisionAnalysis({
    image,
    mimeType,
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL,
    fetchImpl = globalThis.fetch,
}) {
    if (!apiKey) {
        throw new MedicineVisionError("AI image analysis is not configured on the server.", {
            code: "VISION_NOT_CONFIGURED",
            statusCode: 503,
        });
    }

    if (typeof fetchImpl !== "function") {
        throw new MedicineVisionError("AI image analysis is temporarily unavailable.", {
            code: "VISION_UNAVAILABLE",
            statusCode: 503,
        });
    }

    const imageDataUrl =
        "data:" + mimeType + ";base64," + image.toString("base64");
    let providerResponse;

    try {
        providerResponse = await fetchImpl("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                Authorization: "Bearer " + apiKey,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(45_000),
            body: JSON.stringify({
                model,
                store: false,
                input: [
                    {
                        role: "system",
                        content: EXTRACTION_INSTRUCTIONS,
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: "Inspect this medicine package. Extract only the supported fields and evidence.",
                            },
                            {
                                type: "input_image",
                                image_url: imageDataUrl,
                                detail: "high",
                            },
                        ],
                    },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "medicine_package_extraction",
                        strict: true,
                        schema: MEDICINE_VISION_SCHEMA,
                    },
                },
            }),
        });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        throw new MedicineVisionError(
            timedOut
                ? "AI image analysis timed out. Try again with a smaller or clearer image."
                : "AI image analysis is temporarily unavailable. Try again later.",
            {
                code: timedOut ? "VISION_TIMEOUT" : "VISION_UNAVAILABLE",
                statusCode: timedOut ? 504 : 503,
            }
        );
    }

    if (!providerResponse?.ok) {
        let errorBody = null;
        try {
            errorBody = await providerResponse.json();
        } catch {
            // Keep the provider response body private and use status-only mapping.
        }
        throw mapProviderError(providerResponse?.status ?? 0, errorBody);
    }

    let responseBody;
    try {
        responseBody = await providerResponse.json();
    } catch {
        throw new MedicineVisionError("The image analysis response could not be read.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    if (
        !responseBody ||
        typeof responseBody !== "object" ||
        Array.isArray(responseBody) ||
        (responseBody.status && responseBody.status !== "completed")
    ) {
        throw new MedicineVisionError("The image analysis did not complete. Try again.", {
            code: "INVALID_MODEL_RESPONSE",
        });
    }

    return validateMedicineVisionResult(extractStructuredText(responseBody));
}
