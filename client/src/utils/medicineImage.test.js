import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMedicineImage } from "./medicineImage.js";
import {
    mergeMedicineScanResults,
    splitMedicineFormCandidates,
} from "./medicineScanResults.js";
import parseMedicineText from "./parseMedicineText.js";
import { normalizeExpiryDate } from "./expiryDate.js";

test("normalizes a JPEG with missing MIME metadata from its bytes", async () => {
    const image = new File(
        [Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00)],
        "medicine-capture.jpg",
        { type: "" }
    );

    const normalized = await normalizeMedicineImage(image);

    assert.equal(normalized.type, "image/jpeg");
    assert.equal(normalized.name, "medicine-capture.jpg");
    assert.ok(normalized.size > 0);
});

test("normalizes a PNG with incorrect MIME metadata from its bytes", async () => {
    const image = new File(
        [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
        "package.jpg",
        { type: "image/jpeg" }
    );

    const normalized = await normalizeMedicineImage(image);

    assert.equal(normalized.type, "image/png");
    assert.equal(normalized.name, "package.png");
    assert.ok(normalized.size > 0);
});

test("rejects empty and unsupported image data", async () => {
    await assert.rejects(
        normalizeMedicineImage(new File([], "empty.jpg", { type: "image/jpeg" })),
        /empty/
    );
    await assert.rejects(
        normalizeMedicineImage(new File(["not an image"], "package.jpg", { type: "image/jpeg" })),
        /valid JPG or PNG/
    );
    await assert.rejects(normalizeMedicineImage(null), /Choose a JPG/);
});

test("combines OCR text, deduplicates repeated lines and equivalent values", () => {
    const merged = mergeMedicineScanResults(
        [
            {
                recognizedText: "NAME: Paracare\nBATCH NO: B-1\nEXPIRY: DEC 2027",
                confidence: 91,
                decodedBarcode: "8901234567890",
            },
            {
                recognizedText: "NAME: Paracare\nBATCH NO: B-1\nEXPIRY: 12/2027",
                confidence: 89,
                decodedBarcode: "8901234567890",
            },
        ],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.combinedText.split("NAME: Paracare").length - 1, 1);
    assert.equal(merged.fields.name, "Paracare");
    assert.equal(merged.fields.batchNumber, "B-1");
    assert.equal(merged.fields.expiryText, "DEC 2027");
    assert.equal(merged.fields.barcode, "8901234567890");
    assert.deepEqual(merged.decodedBarcodes, ["8901234567890"]);
    assert.deepEqual(merged.conflicts, []);
});

test("keeps low-confidence batch fragments for review without auto-filling them", () => {
    const recognizedText = "Batch No\nCIRRRiC:\nBE\nMfg. Date\n0\nAED";
    const parsingText = [
        "Batch No",
        "UNTRUSTED OCR LINE",
        "UNTRUSTED OCR LINE",
        "Mfg. Date",
        "UNTRUSTED OCR LINE",
        "UNTRUSTED OCR LINE",
    ].join("\n");
    const merged = mergeMedicineScanResults(
        [{ recognizedText, parsingText, confidence: 69 }],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.match(merged.combinedText, /CIRRRiC:/);
    assert.equal(merged.fields.batchNumber, "");
    assert.equal(merged.fields.manufacturingDate, undefined);
    assert.deepEqual(merged.conflicts, []);
});

test("parses an MRP candidate for review without adding a saved scanner field", () => {
    const parsed = parseMedicineText("MRP ₹75.00");

    assert.equal(parsed.mrpText, "75.00");
    assert.equal(Object.hasOwn(parsed, "mrp"), false);
});

test("flags conflicting batch, expiry and barcode values without choosing one", () => {
    const merged = mergeMedicineScanResults(
        [
            {
                recognizedText: "NAME: Paracare\nBATCH NO: B-1\nEXPIRY: DEC 2027",
                confidence: 91,
                decodedBarcode: "8901234567890",
            },
            {
                recognizedText: "NAME: Paracare\nBATCH NO: B-2\nEXPIRY: DEC 2028",
                confidence: 89,
                decodedBarcode: "8901234567891",
            },
        ],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.fields.batchNumber, "");
    assert.equal(merged.fields.expiryText, "");
    assert.equal(merged.fields.barcode, "");
    assert.deepEqual(
        merged.conflicts.map((conflict) => conflict.field),
        ["batchNumber", "expiryText", "barcode"]
    );
});

test("preserves protected form values when later scan results disagree", () => {
    const currentFields = {
        name: "",
        genericName: "",
        manufacturer: "",
        category: "",
        batchNumber: "Manually checked batch",
        expiryText: "",
        barcode: "",
    };
    const merged = mergeMedicineScanResults(
        [{ recognizedText: "BATCH NO: OCR-BATCH", confidence: 90, decodedBarcode: "" }],
        currentFields,
        new Set(["batchNumber"])
    );

    assert.equal(merged.fields.batchNumber, "Manually checked batch");
    assert.equal(merged.conflicts[0].field, "batchNumber");
});

test("does not promote unrelated OCR words to a medicine name", () => {
    const parsed = parseMedicineText("Bigs\nWwe\nJad");

    assert.equal(parsed.name, "");
});

test("only considers an unlabelled name candidate beside a medicine strength", () => {
    assert.equal(parseMedicineText("Medixa\n500 mg").name, "");
    assert.equal(
        parseMedicineText("Medixa\n500 mg", { allowUnlabelledName: true }).name,
        "Medixa"
    );
    assert.equal(
        parseMedicineText("Bigs\nWwe\nJad").name,
        ""
    );
});

test("keeps manufacturing and expiry dates in separate labeled fields", () => {
    const parsed = parseMedicineText(
        "BATCH NO: AB-123\nMfg Date: 03/2024\nExp. Date: DEC 2026"
    );

    assert.equal(parsed.batchNumber, "AB-123");
    assert.equal(parsed.manufacturingDate, "03/2024");
    assert.equal(parsed.expiryText, "DEC 2026");
    assert.equal(normalizeExpiryDate(parsed.expiryText).date, "2026-12-31");
    assert.equal(normalizeExpiryDate("Exp. 08/2027").date, "2027-08-31");
});

test("keeps barcode results when OCR confidence is too low to fill fields", () => {
    const merged = mergeMedicineScanResults(
        [
            {
                recognizedText: "NAME: Paracare\nBATCH NO: B-1",
                confidence: 28,
                decodedBarcode: "8901234567890",
            },
        ],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.fields.name, "");
    assert.equal(merged.fields.batchNumber, "");
    assert.equal(merged.fields.barcode, "8901234567890");
    assert.deepEqual(merged.conflicts, []);
});

test("requires the same unlabelled product-like name in two clear photos", () => {
    const currentFields = {
        name: "",
        genericName: "",
        manufacturer: "",
        category: "",
        batchNumber: "",
        expiryText: "",
        barcode: "",
    };
    const single = mergeMedicineScanResults(
        [{ photoId: "one", recognizedText: "Medixa\n500 mg", confidence: 90 }],
        currentFields
    );
    const repeated = mergeMedicineScanResults(
        [
            { photoId: "one", recognizedText: "Medixa\n500 mg", confidence: 90 },
            { photoId: "two", recognizedText: "Medixa\n500 mg", confidence: 86 },
        ],
        currentFields
    );

    assert.equal(single.fields.name, "");
    assert.equal(repeated.fields.name, "Medixa");
});

test("does not auto-fill or conflict on an invalid labeled expiry date", () => {
    const merged = mergeMedicineScanResults(
        [{ recognizedText: "EXP: 13/2027", confidence: 90 }],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.fields.expiryText, "");
    assert.deepEqual(merged.conflicts, []);
});

test("keeps invalid parsed expiry text for review without adding it to form candidates", () => {
    const parsedFields = parseMedicineText(
        "NAME: Paracare\nBATCH NO: B-1\nEXPIRY: 13/2027"
    );
    const candidates = splitMedicineFormCandidates(parsedFields);

    assert.equal(candidates.fields.name, "Paracare");
    assert.equal(candidates.fields.batchNumber, "B-1");
    assert.equal(Object.hasOwn(candidates.fields, "expiryText"), false);
    assert.deepEqual(candidates.uncertainFields, [
        {
            field: "expiryText",
            label: "expiry date",
            candidate: "13/2027",
        },
    ]);
    assert.equal(parsedFields.expiryText, "13/2027");
});

test("keeps near-matching OCR name readings for review without a false conflict", () => {
    const merged = mergeMedicineScanResults(
        [
            { recognizedText: "BRAND: Paracare", confidence: 91 },
            { recognizedText: "BRAND: Paracaree", confidence: 87 },
        ],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.fields.name, "");
    assert.deepEqual(merged.conflicts, []);
});

test("does not treat package instructions as a batch number", () => {
    const parsed = parseMedicineText(
        "BATCH NO:\nDO NOT FREEZE\nMfg. Date: 03/2024\nExp. Date: DEC 2026"
    );

    assert.equal(parsed.batchNumber, "");
    assert.equal(parsed.manufacturingDate, "03/2024");
    assert.equal(parsed.expiryText, "DEC 2026");
});

test("reads a batch value printed on the line after its label", () => {
    const parsed = parseMedicineText("Batch No.\nAB-2403");

    assert.equal(parsed.batchNumber, "AB-2403");
});

test("parses supported Hindi package labels", () => {
    const parsed = parseMedicineText(
        "दवा का नाम: मेडिसिन ए\nसंघटन: पैरासिटामोल 500 mg\nनिर्माता: उदाहरण फार्मा\nबैच नं: AB-2403\nनिर्माण तिथि: 03/2024\nसमाप्ति तिथि: 12/2026\nएमआरपी ₹125.00"
    );

    assert.equal(parsed.name, "मेडिसिन ए");
    assert.equal(parsed.genericName, "पैरासिटामोल");
    assert.equal(parsed.manufacturer, "उदाहरण फार्मा");
    assert.equal(parsed.batchNumber, "AB-2403");
    assert.equal(parsed.manufacturingDate, "03/2024");
    assert.equal(parsed.expiryText, "12/2026");
    assert.equal(parsed.mrpText, "125.00");
});

test("uses trusted focused-label confidence when the full-page score is low", () => {
    const merged = mergeMedicineScanResults(
        [
            {
                recognizedText: "Batch No: AB-2403",
                parsingText: "Batch No: AB-2403",
                confidence: 31,
                fieldConfidence: 82,
            },
        ],
        {
            name: "",
            genericName: "",
            manufacturer: "",
            category: "",
            batchNumber: "",
            expiryText: "",
            barcode: "",
        }
    );

    assert.equal(merged.fields.batchNumber, "AB-2403");
});
