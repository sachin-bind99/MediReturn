import { useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import parseMedicineText from "../utils/parseMedicineText";

import { normalizeExpiryDate } from "../utils/expiryDate";

import api from "../lib/api";

const initialFields = {

    name: "",

    genericName: "",

    manufacturer: "",

    category: "",

    batchNumber: "",

    expiryText: "",

    barcode: "",

};

const SUPPORTED_TYPES = ["image/jpeg", "image/png"];

const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png"];

const normalizeMedicineValue = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function MedicineScanner() {

    const navigate = useNavigate();

    const [selectedFile, setSelectedFile] = useState(null);

    const [previewUrl, setPreviewUrl] = useState("");

    const [rawText, setRawText] = useState("");

    const [fields, setFields] = useState(initialFields);

    const [scanning, setScanning] = useState(false);

    const [saving, setSaving] = useState(false);

    const [progress, setProgress] = useState(0);

    const [progressStatus, setProgressStatus] = useState("");

    const [error, setError] = useState("");

    const [success, setSuccess] = useState("");

    const scanInProgressRef = useRef(false);

    const mountedRef = useRef(false);

    const previewUrlRef = useRef("");

    const ocrControllerRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            ocrControllerRef.current?.abort();
        };
    }, []);

    // Preserve the expiry text as printed while showing its normalized date.
    const expiryNormalization = normalizeExpiryDate(fields.expiryText);

    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = "";
            }
        };
    }, []);

    const updatePreview = (file) => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = "";
        }

        if (!file) {
            setPreviewUrl("");
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
    };

    const handleFileChange = (event) => {

        const file = event.target.files?.[0];

        setError("");

        setSuccess("");

        setRawText("");

        setProgress(0);

        setProgressStatus("");

        setFields(initialFields);

        updatePreview(null);

        if (!file) {

            setSelectedFile(null);

            return;

        }

        const extension = file.name

            ?.split(".")

            .pop()

            ?.toLowerCase();

        const validExtension =

            SUPPORTED_EXTENSIONS.includes(extension);

        const validMimeType =

            SUPPORTED_TYPES.includes(file.type);

        if (

            (file.type && !validMimeType) ||

            (!file.type && !validExtension)

        ) {

            setSelectedFile(null);

            setError(

                "Unsupported file type. Please select a JPG, JPEG, or PNG image."

            );

            // Allow the same file to be selected again.

            event.target.value = "";

            return;

        }

        if (file.size === 0) {

            setSelectedFile(null);

            setError("The selected image is empty.");

            event.target.value = "";

            return;

        }

        setSelectedFile(file);

        updatePreview(file);

    };

    const handleScanImage = async () => {

        if (!selectedFile) {

            setError("Please upload a medicine image first.");

            return;

        }

        // State updates disable the button after a render. This synchronous
        // guard also prevents a second scan from starting before that render.
        if (scanInProgressRef.current) return;

        scanInProgressRef.current = true;

        const scanController = new AbortController();
        ocrControllerRef.current = scanController;

        setScanning(true);
        setError("");
        setSuccess("");
        setRawText("");
        setProgress(0);
        setProgressStatus("Starting OCR and barcode scanning...");

        // Run OCR and barcode decoding independently. A missing barcode
        // should not cause text recognition to fail, and vice versa.
        const ocrPromise = import("../utils/ocr").then(
            ({ default: extractTextFromImage }) =>
                extractTextFromImage(
                    selectedFile,
                    ({ status, progress: currentProgress }) => {
                        if (!mountedRef.current) return;
                        setProgress(currentProgress);
                        setProgressStatus(status);
                    },
                    { signal: scanController.signal }
                )
        );

        const barcodePromise = import("../utils/barcode").then(
            ({ default: decodeBarcodeFromImage }) =>
                decodeBarcodeFromImage(selectedFile)
        );

        try {
            const [ocrResult, barcodeResult] = await Promise.allSettled([
                ocrPromise,
                barcodePromise,
            ]);

            const decodedBarcode =
                barcodeResult.status === "fulfilled"
                    ? String(barcodeResult.value ?? "").replace(/\D/g, "")
                    : "";

            const barcodeFailure =
                barcodeResult.status === "rejected"
                    ? barcodeResult.reason
                    : null;

            if (!mountedRef.current) return;

            if (barcodeFailure) {
                console.error("Medicine barcode error:", barcodeFailure);
            }

            if (ocrResult.status === "rejected") {
                if (decodedBarcode) {
                    setFields((previous) => ({
                        ...previous,
                        barcode: decodedBarcode,
                    }));
                }

                console.error("Medicine OCR error:", ocrResult.reason);
                setError(
                    `Text recognition failed: ${ocrResult.reason?.message || "Please try another image."}` +
                    (decodedBarcode
                        ? ` A barcode was decoded (${decodedBarcode}); enter the other medicine details manually.`
                        : "") +
                    (barcodeFailure
                        ? ` Barcode scanning also failed: ${barcodeFailure.message || "Please try another image."}`
                        : "")
                );
                return;
            }

            const recognizedText = String(ocrResult.value ?? "").trim();
            setRawText(recognizedText);

            if (recognizedText) {
                const parsedFields = parseMedicineText(recognizedText);
                const nonEmptyParsedFields = Object.fromEntries(
                    Object.entries(parsedFields).filter(
                        ([, value]) => Boolean(value)
                    )
                );

                setFields((previous) => ({
                    ...previous,
                    ...nonEmptyParsedFields,
                    // Prefer a barcode decoded from the actual barcode pattern
                    // over digits that OCR may have misread in surrounding text.
                    ...(decodedBarcode ? { barcode: decodedBarcode } : {}),
                }));
            } else if (decodedBarcode) {
                setFields((previous) => ({
                    ...previous,
                    barcode: decodedBarcode,
                }));
            }

            if (!recognizedText && !decodedBarcode) {
                setError(
                    "No readable text or supported UPC/EAN barcode was detected. Try a closer, sharper image with the label and barcode clearly visible." +
                    (barcodeFailure
                        ? ` Barcode scanning failed: ${barcodeFailure.message || "Please try another image."}`
                        : "")
                );
                return;
            }

            if (!recognizedText && decodedBarcode) {
                setError(
                    `Barcode detected (${decodedBarcode}), but no readable label text was found. Enter the medicine details manually.`
                );
                return;
            }

            if (decodedBarcode) {
                setSuccess(
                    `Text extracted and barcode decoded (${decodedBarcode}). Review every field against the package before continuing.`
                );
            } else if (barcodeFailure) {
                setError(
                    `Barcode scanning failed: ${barcodeFailure.message || "Please try another image."} OCR text was extracted and is available to review; enter or correct the barcode manually.`
                );
                setSuccess(
                    "Text extracted. Review every field against the package before continuing."
                );
            } else {
                setSuccess(
                    "Text extracted. No supported UPC/EAN barcode was found, so verify or enter the barcode manually. Review every field against the package before continuing."
                );
            }
        } catch (scanError) {
            // Promise.allSettled should capture individual OCR/barcode failures,
            // but this guard handles unexpected errors in the integration itself.
            if (mountedRef.current) {
                console.error("Medicine scan integration error:", scanError);
                setError(
                    scanError.message ||
                        "Unable to scan this image. Please try again."
                );
            }
        } finally {
            scanInProgressRef.current = false;
            if (ocrControllerRef.current === scanController) {
                ocrControllerRef.current = null;
            }
            if (mountedRef.current) setScanning(false);
        }
    };

    const handleFieldChange = (event) => {

        const { name, value } = event.target;

        setFields((previous) => ({

            ...previous,

            [name]: value,

        }));

    };

    const handleParseTextAgain = () => {
        setError("");
        setSuccess("");

        if (!rawText.trim()) {
            setError("There is no extracted text to parse yet.");
            return;
        }

        const parsedFields = parseMedicineText(rawText);
        const nonEmptyFields = Object.fromEntries(
            Object.entries(parsedFields).filter(
                ([, value]) => Boolean(value)
            )
        );

        setFields((previous) => ({
            ...previous,
            ...nonEmptyFields,
        }));

        if (Object.keys(nonEmptyFields).length === 0) {
            setError(
                "No labelled medicine details were recognized. Enter the values manually and verify them against the package."
            );
            return;
        }

        setSuccess(
            "Text parsed again. Review the updated fields carefully against the package."
        );
    };

    const handleSaveAndContinue = async () => {
        setError("");
        setSuccess("");

        if (scanning || saving) return;

        const name = fields.name.trim();
        const genericName = fields.genericName.trim();
        const manufacturer = fields.manufacturer.trim();
        const category = fields.category.trim();
        const barcode = fields.barcode.trim();
        const batchNumber = fields.batchNumber.trim();

        if (!name || !genericName || !manufacturer || !category) {
            setError(
                "Medicine name, generic name, manufacturer, and category are required. Review the OCR fields and fill in any missing values."
            );
            return;
        }

        if (!batchNumber) {
            setError("Batch number is required before continuing to inventory.");
            return;
        }

        if (!fields.expiryText.trim()) {
            setError("Expiry date is required before continuing to inventory.");
            return;
        }

        if (!expiryNormalization.date) {
            setError(
                expiryNormalization.error || "Enter a valid expiry date before continuing."
            );
            return;
        }

        if (barcode && !/^\d+$/.test(barcode)) {
            setError("Barcode must contain digits only. Correct the OCR result before continuing.");
            return;
        }

        setSaving(true);

        try {
            // Use the existing shared Axios client so the configured API URL
            // and Bearer-token interceptor are reused.
            const catalogResponse = await api.get("/medicines");
            const catalog = Array.isArray(catalogResponse.data?.medicines)
                ? catalogResponse.data.medicines
                : [];

            let medicine = null;

            // Barcode is the strongest available identifier in this UI.
            if (barcode) {
                medicine = catalog.find(
                    (item) => String(item.barcode ?? "").trim() === barcode
                ) || null;
            }

            // When no barcode was read, exact matches on all core descriptive
            // fields can safely reuse a catalog entry. If the barcode differs,
            // ask for manual review instead of silently creating a duplicate.
            const sameCoreDetails = (item) =>
                normalizeMedicineValue(item.name) === normalizeMedicineValue(name) &&
                normalizeMedicineValue(item.genericName) === normalizeMedicineValue(genericName) &&
                normalizeMedicineValue(item.manufacturer) === normalizeMedicineValue(manufacturer) &&
                normalizeMedicineValue(item.category) === normalizeMedicineValue(category);

            const identityMatches = catalog.filter(sameCoreDetails);

            if (!medicine && identityMatches.length > 0) {
                const sameBarcodeMatch = barcode
                    ? identityMatches.find(
                        (item) => String(item.barcode ?? "").trim() === barcode
                    )
                    : null;

                if (sameBarcodeMatch) {
                    medicine = sameBarcodeMatch;
                } else if (!barcode && identityMatches.length === 1) {
                    medicine = identityMatches[0];
                } else {
                    setError(
                        "A medicine with the same name, generic name, manufacturer, and category already exists, but its barcode does not match or the match is ambiguous. Check the Medicines catalog and correct the barcode before continuing."
                    );
                    return;
                }
            }

            if (!medicine) {
                // MedicineForm requires a numeric barcode for new catalog entries.
                if (!barcode) {
                    setError(
                        "Barcode is required to create a new medicine in your current catalog. Enter the package barcode, or ensure an exact matching medicine already exists."
                    );
                    return;
                }

                const createResponse = await api.post("/medicines", {
                    name,
                    genericName,
                    manufacturer,
                    category,
                    barcode,
                    description: "",
                });

                medicine = createResponse.data?.medicine;
            }

            if (!medicine?._id) {
                throw new Error(
                    "The medicine API did not return a medicine ID. Check the API response before continuing."
                );
            }

            navigate("/inventory", {
                state: {
                    scannerPrefill: {
                        medicine: medicine._id,
                        batchNumber,
                        expiryDate: expiryNormalization.date,
                    },
                    scannerMessage: "Medicine details are ready. Complete the remaining inventory fields and verify the expiry date before saving.",
                },
            });
        } catch (saveError) {
            console.error("Scanner medicine integration error:", saveError);
            setError(
                saveError.response?.data?.message ||
                    saveError.message ||
                    "Could not connect the scanned details to the medicine catalog. Please try again."
            );
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {

        if (scanning) return;

        setSelectedFile(null);

        updatePreview(null);

        setRawText("");

        setFields(initialFields);

        setProgress(0);

        setProgressStatus("");

        setError("");

        setSuccess("");

        // Resetting also allows re-selecting the same image.

        const input = document.getElementById(

            "medicine-image-input"

        );

        if (input) input.value = "";

    };

    return (

        <div className="min-h-screen bg-canvas text-slate-800">

            {/* Header */}

            <header className="border-b border-line bg-navbar text-navbar-ink shadow-sm">

                <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">

                    <div>

                        <p className="text-sm font-semibold text-navbar-ink">

                            MediReturn

                        </p>

                        <h1 className="mt-1 text-2xl font-bold text-navbar-ink">

                            Smart Medicine Scanner

                        </h1>

                        <p className="mt-1 text-sm text-navbar-ink">

                            Extract medicine details from package images.

                        </p>

                    </div>

                    <div className="flex flex-wrap gap-3">

                        <Link

                            to="/dashboard"

                            className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"

                        >

                            Dashboard

                        </Link>

                        <Link

                            to="/inventory"

                            className="rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"

                        >

                            Inventory

                        </Link>

                    </div>

                </div>

            </header>

            <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">

                {/* Messages */}

                {error && (

                    <div

                        role="alert"

                        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"

                    >

                        {error}

                    </div>

                )}

                {success && (

                    <div

                        role="status"

                        className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"

                    >

                        {success}

                    </div>

                )}

                {/* Upload and preview */}

                <section className="grid gap-6 lg:grid-cols-2">

                    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm sm:p-6">

                        <h2 className="text-lg font-semibold text-slate-900">

                            1. Upload medicine image

                        </h2>

                        <p className="mt-1 text-sm text-muted">

                            Choose a clear JPG, JPEG, or PNG image

                            of the medicine package or label.

                        </p>

                        <label

                            htmlFor="medicine-image-input"

                            className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-mint-600 hover:bg-mint-50"

                        >

                            <span className="text-3xl" aria-hidden="true">

                                ↑

                            </span>

                            <span className="mt-2 font-semibold text-slate-800">

                                Choose an image

                            </span>

                            <span className="mt-1 text-xs text-muted">

                                JPG, JPEG, or PNG

                            </span>

                            <input

                                id="medicine-image-input"

                                type="file"

                                accept="image/jpeg,image/png,.jpg,.jpeg,.png"

                                onChange={handleFileChange}

                                disabled={scanning}

                                className="sr-only"

                            />

                        </label>

                        {selectedFile && (

                            <p className="mt-3 break-all text-sm text-slate-600">

                                Selected: {selectedFile.name}

                            </p>

                        )}

                        {previewUrl ? (

                            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-slate-50 p-3">

                                <img

                                    src={previewUrl}

                                    alt="Preview of uploaded medicine packaging"

                                    className="mx-auto max-h-80 w-full object-contain"

                                />

                            </div>

                        ) : (

                            <div className="mt-5 grid min-h-48 place-items-center rounded-xl bg-slate-50 text-sm text-slate-400">

                                Your image preview will appear here.

                            </div>

                        )}

                        <div className="mt-5 flex flex-wrap gap-3">

                            <button

                                type="button"

                                onClick={handleScanImage}

                                disabled={!selectedFile || scanning}

                                className="rounded-xl bg-mint-700 px-5 py-3 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50"

                            >

                                {scanning ? "Scanning..." : "Scan Image"}

                            </button>

                            <button

                                type="button"

                                onClick={handleClear}

                                disabled={scanning}

                                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"

                            >

                                Clear

                            </button>

                        </div>

                        {/* OCR progress */}

                        {scanning && (

                            <div

                                className="mt-5"

                                role="status"

                                aria-live="polite"

                            >

                                <div className="mb-2 flex justify-between gap-3 text-sm text-slate-600">

                                    <span>{progressStatus}</span>

                                    <span>{progress}%</span>

                                </div>

                                <div

                                    className="h-2 overflow-hidden rounded-full bg-slate-200"

                                    role="progressbar"

                                    aria-valuemin={0}

                                    aria-valuemax={100}

                                    aria-valuenow={progress}

                                >

                                    <div

                                        className="h-full rounded-full bg-mint-600 transition-all"

                                        style={{ width: `${progress}%` }}

                                    />

                                </div>

                            </div>

                        )}

                    </div>

                    {/* Raw OCR text */}

                    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm sm:p-6">

                        <h2 className="text-lg font-semibold text-slate-900">

                            2. Extracted text

                        </h2>

                        <p className="mt-1 text-sm text-muted">

                            Review the text recognized from the package.

                        </p>

                        <textarea

                            value={rawText}

                            onChange={(event) =>

                                setRawText(event.target.value)

                            }

                            rows={15}

                            placeholder="Recognized package text will appear here after you click Scan Image. You can correct OCR mistakes."

                            aria-label="Extracted OCR text"

                            className="mt-5 w-full rounded-xl border border-slate-300 p-4 text-sm leading-6 outline-none focus:border-mint-600"

                        />

                        <button
                            type="button"
                            onClick={handleParseTextAgain}
                            disabled={!rawText.trim() || scanning}
                            className="mt-3 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Parse Text Again
                        </button>

                        <p className="mt-2 text-xs text-muted">

                            OCR results may contain errors. Verify all

                            values against the physical package.

                        </p>

                    </div>

                </section>

                {/* Editable details */}

                <section className="rounded-2xl border border-line bg-panel p-5 shadow-sm sm:p-6">

                    <h2 className="text-lg font-semibold text-slate-900">

                        3. Review medicine details

                    </h2>

                    <p className="mt-1 text-sm text-muted">

                        These fields are editable and are pre-filled when the parser

                        recognizes values. Verify them against the package

                        before continuing.

                    </p>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

                        <div>

                            <label

                                htmlFor="medicine-name"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Medicine name

                            </label>

                            <input

                                id="medicine-name"

                                name="name"

                                value={fields.name}

                                onChange={handleFieldChange}

                                placeholder="e.g. Sample Tablets"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                        </div>

                        <div>

                            <label

                                htmlFor="generic-name"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Generic name

                            </label>

                            <input

                                id="generic-name"

                                name="genericName"

                                value={fields.genericName}

                                onChange={handleFieldChange}

                                placeholder="Generic name"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                        </div>

                        <div>

                            <label

                                htmlFor="manufacturer"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Manufacturer

                            </label>

                            <input

                                id="manufacturer"

                                name="manufacturer"

                                value={fields.manufacturer}

                                onChange={handleFieldChange}

                                placeholder="Manufacturer name"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                        </div>

                        <div>

                            <label

                                htmlFor="category"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Category

                            </label>

                            <input

                                id="category"

                                name="category"

                                value={fields.category}

                                onChange={handleFieldChange}

                                placeholder="e.g. Tablet"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                        </div>

                        <div>

                            <label

                                htmlFor="batch-number"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Batch number

                            </label>

                            <input

                                id="batch-number"

                                name="batchNumber"

                                value={fields.batchNumber}

                                onChange={handleFieldChange}

                                placeholder="e.g. BT2401"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                        </div>

                        <div>

                            <label

                                htmlFor="expiry-text"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Expiry date as printed

                            </label>

                            <input

                                id="expiry-text"

                                name="expiryText"

                                value={fields.expiryText}

                                onChange={handleFieldChange}

                                placeholder="e.g. 08/2027"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                            <p className="mt-1 text-xs text-muted">

                                Keep month/year values exactly as printed.

                            </p>

                            {fields.expiryText.trim() && (
                                expiryNormalization.date ? (
                                    <p className="mt-2 text-xs text-green-700">
                                        Normalized date: {expiryNormalization.date}
                                    </p>
                                ) : (
                                    <p className="mt-2 text-xs text-red-600" role="alert">
                                        {expiryNormalization.error}
                                    </p>
                                )
                            )}

                        </div>

                        <div>

                            <label

                                htmlFor="barcode"

                                className="mb-1.5 block text-sm font-medium text-slate-700"

                            >

                                Barcode

                            </label>

                            <input

                                id="barcode"

                                name="barcode"

                                value={fields.barcode}

                                onChange={handleFieldChange}

                                placeholder="Barcode, if readable"

                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-mint-600"

                            />

                            <p className="mt-1 text-xs text-muted">
                                Use digits only. A barcode is required to create a new catalog medicine; a matching existing medicine may be reused without one.
                            </p>

                        </div>

                    </div>

                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">

                        <strong>Manual verification required.</strong>{" "}

                        Confirm every field against the physical package. Continuing checks the medicine catalog, reuses an existing match when safe, or creates a medicine through your existing API. It then opens the inventory form; the batch is not saved until you submit that form.

                    </div>

                    <div className="mt-5">

                        <button

                            type="button"

                            onClick={handleSaveAndContinue}

                            disabled={scanning || saving}

                            className="rounded-xl bg-mint-700 px-5 py-3 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50"

                        >

                            {saving ? "Connecting medicine..." : "Save / Continue to Inventory"}

                        </button>

                        <p className="mt-2 text-xs text-muted">

                            Inventory still requires a supplier, quantity, purchase price, return window, and location before the batch can be saved.

                        </p>

                    </div>

                </section>

            </main>

        </div>

    );

}

export default MedicineScanner;
