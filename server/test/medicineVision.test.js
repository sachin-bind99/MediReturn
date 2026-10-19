import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_VISION_MODEL,
    MAX_MEDICINE_IMAGE_BYTES,
    MEDICINE_VISION_SCHEMA,
    MedicineVisionError,
    requestMedicineVisionAnalysis,
    validateMedicineVisionImage,
    validateMedicineVisionResult,
} from "../utils/medicineVision.js";

const fieldNames = [
    "name",
    "genericName",
    "manufacturer",
    "category",
    "batchNumber",
    "expiryDate",
    "barcode",
];

const notFoundResult = () => ({
    fields: Object.fromEntries(
        fieldNames.map((name) => [
            name,
            { value: null, status: "not_found", evidence: null },
        ])
    ),
});

test("AI response schema contains only the seven medicine scanner fields", () => {
    assert.deepEqual(
        Object.keys(MEDICINE_VISION_SCHEMA.properties.fields.properties),
        fieldNames
    );
});

const providerResponse = (result) =>
    new Response(
        JSON.stringify({
            status: "completed",
            output: [
                {
                    type: "message",
                    content: [
                        {
                            type: "output_text",
                            text: typeof result === "string"
                                ? result
                                : JSON.stringify(result),
                        },
                    ],
                },
            ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );

test("validates JPG and PNG signatures, MIME types, and image size", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    assert.equal(validateMedicineVisionImage(jpeg, "image/jpeg"), null);
    assert.equal(validateMedicineVisionImage(png, "image/png"), null);
    assert.equal(validateMedicineVisionImage(jpeg, "image/png").statusCode, 415);
    assert.equal(validateMedicineVisionImage(Buffer.from("not an image"), "image/jpeg").statusCode, 415);
    assert.equal(validateMedicineVisionImage(Buffer.alloc(0), "image/jpeg").statusCode, 400);
    assert.equal(
        validateMedicineVisionImage(Buffer.alloc(MAX_MEDICINE_IMAGE_BYTES + 1), "image/jpeg").statusCode,
        413
    );
});

test("returns explicit missing fields without fabricating values", () => {
    const result = validateMedicineVisionResult(notFoundResult());

    for (const name of fieldNames) {
        assert.deepEqual(result.fields[name], {
            value: null,
            status: "not_found",
            evidence: null,
        });
    }
});

test("preserves an uncertain printed date instead of normalizing or guessing it", () => {
    const result = notFoundResult();
    result.fields.expiryDate = {
        value: "13/2027",
        status: "uncertain",
        evidence: "Exp. label; first digit unclear",
    };

    assert.deepEqual(
        validateMedicineVisionResult(result).fields.expiryDate,
        result.fields.expiryDate
    );
});

test("rejects incomplete or inconsistent structured model results", () => {
    const incomplete = notFoundResult();
    delete incomplete.fields.batchNumber;
    assert.throws(
        () => validateMedicineVisionResult(incomplete),
        (error) => error instanceof MedicineVisionError && error.code === "INVALID_MODEL_RESPONSE"
    );

    const guessed = notFoundResult();
    guessed.fields.expiryDate = {
        value: "12/2027",
        status: "not_found",
        evidence: null,
    };
    assert.throws(() => validateMedicineVisionResult(guessed), /invalid/);

    const unsupportedStatus = notFoundResult();
    unsupportedStatus.fields.name = {
        value: "Brand",
        status: "confident",
        evidence: "Brand label",
    };
    assert.throws(() => validateMedicineVisionResult(unsupportedStatus), /invalid/);
});

test("requests strict structured vision output using the configurable model", async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    let requestUrl;
    let requestOptions;
    const result = notFoundResult();
    result.fields.batchNumber = {
        value: "AB-2403",
        status: "read",
        evidence: "BATCH NO: AB-2403",
    };

    const analysis = await requestMedicineVisionAnalysis({
        image,
        mimeType: "image/jpeg",
        apiKey: "server-test-key",
        model: "vision-test-model",
        fetchImpl: async (url, options) => {
            requestUrl = url;
            requestOptions = options;
            return providerResponse(result);
        },
    });

    assert.equal(requestUrl, "https://api.openai.com/v1/responses");
    assert.equal(analysis.fields.batchNumber.value, "AB-2403");
    const body = JSON.parse(requestOptions.body);
    assert.equal(body.model, "vision-test-model");
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.match(body.input[1].content[1].image_url, /^data:image\/jpeg;base64,/);
    assert.equal(requestOptions.headers.Authorization, "Bearer server-test-key");

    assert.equal(DEFAULT_VISION_MODEL, "gpt-6-luna");
});

test("reports malformed provider JSON as a validation error", async () => {
    await assert.rejects(
        requestMedicineVisionAnalysis({
            image: Buffer.from([0xff, 0xd8, 0xff]),
            mimeType: "image/jpeg",
            apiKey: "server-test-key",
            fetchImpl: async () => providerResponse("{not-json"),
        }),
        (error) => error instanceof MedicineVisionError && error.code === "INVALID_MODEL_RESPONSE"
    );
});

test("returns a user-safe rate-limit error when the vision provider fails", async () => {
    await assert.rejects(
        requestMedicineVisionAnalysis({
            image: Buffer.from([0xff, 0xd8, 0xff]),
            mimeType: "image/jpeg",
            apiKey: "server-test-key",
            fetchImpl: async () =>
                new Response("upstream diagnostic with secret details", { status: 429 }),
        }),
        (error) =>
            error instanceof MedicineVisionError &&
            error.code === "VISION_RATE_LIMITED" &&
            !error.message.includes("secret")
    );
});

test("distinguishes provider credentials, access, model, quota, and service failures", async (t) => {
    const cases = [
        {
            name: "invalid API key",
            status: 401,
            body: { error: { code: "invalid_api_key", message: "invalid secret-key-value" } },
            code: "VISION_INVALID_CREDENTIALS",
            safeMessage: "OPENAI_API_KEY",
        },
        {
            name: "inaccessible API feature",
            status: 403,
            body: { error: { code: "permission_error", message: "project lacks access" } },
            code: "VISION_ACCESS_DENIED",
            safeMessage: "permissions",
        },
        {
            name: "unavailable model",
            status: 404,
            body: { error: { code: "model_not_found", message: "unknown model" } },
            code: "VISION_MODEL_UNAVAILABLE",
            safeMessage: "OPENAI_VISION_MODEL",
        },
        {
            name: "exhausted quota",
            status: 429,
            body: { error: { code: "insufficient_quota", message: "billing limit" } },
            code: "VISION_QUOTA_EXHAUSTED",
            safeMessage: "billing",
        },
        {
            name: "provider outage",
            status: 503,
            body: { error: { code: "internal_error", message: "private diagnostic" } },
            code: "VISION_PROVIDER_UNAVAILABLE",
            safeMessage: "temporarily unavailable",
        },
    ];

    for (const scenario of cases) {
        await t.test(scenario.name, async () => {
            await assert.rejects(
                requestMedicineVisionAnalysis({
                    image: Buffer.from([0xff, 0xd8, 0xff]),
                    mimeType: "image/jpeg",
                    apiKey: "server-test-key",
                    fetchImpl: async () => new Response(JSON.stringify(scenario.body), {
                        status: scenario.status,
                        headers: { "Content-Type": "application/json" },
                    }),
                }),
                (error) =>
                    error instanceof MedicineVisionError &&
                    error.code === scenario.code &&
                    error.message.toLowerCase().includes(scenario.safeMessage.toLowerCase()) &&
                    !error.message.includes("secret-key-value") &&
                    !error.message.includes("private diagnostic")
            );
        });
    }
});

test("fails clearly when the server API key is not configured", async () => {
    await assert.rejects(
        requestMedicineVisionAnalysis({
            image: Buffer.from([0xff, 0xd8, 0xff]),
            mimeType: "image/jpeg",
            apiKey: "",
            fetchImpl: async () => {
                throw new Error("must not call the provider");
            },
        }),
        (error) => error instanceof MedicineVisionError && error.statusCode === 503
    );
});
