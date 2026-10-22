import { useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import parseMedicineText from "../utils/parseMedicineText";

import { normalizeExpiryDate } from "../utils/expiryDate";

import { normalizeMedicineImage } from "../utils/medicineImage";

import {
    mergeMedicineScanResults,
    MIN_AUTOFILL_CONFIDENCE,
    splitMedicineFormCandidates,
} from "../utils/medicineScanResults";

import {
    confirmVisionFieldValue,
    createVisionReviewState,
    getVisionCandidateOptions,
    invalidateVisionFieldConfirmation,
    isValidGs1Barcode,
    mergeMedicineVisionResults,
    revokeVisionFieldConfirmation,
    restoreAcceptedVisionFields,
} from "../utils/medicineVision";

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

const normalizeMedicineValue = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const OCR_REVIEW_FIELD_RULES = [
    {
        field: "batchNumber",
        label: "Batch",
        labelPattern: /\b(?:BATCH(?:\s*(?:NO\.?|NUMBER|#))?|LOT(?:\s*(?:NO\.?|NUMBER|#))?)\b/i,
    },
    {
        field: "expiryText",
        label: "Expiry date",
        labelPattern: /\b(?:EXP\.?|EXPIRY|EXPIRATION|USE\s+BEFORE|BEST\s+BEFORE)(?:\s+(?:DATE|DT))?\b/i,
    },
];

function MedicineScanner() {

    const navigate = useNavigate();

    const [photos, setPhotos] = useState([]);
    const [photoScanResults, setPhotoScanResults] = useState({});

    const [visionResult, setVisionResult] = useState(null);

    const [aiAnalyzing, setAiAnalyzing] = useState(false);

    const [aiPrivacyAccepted, setAiPrivacyAccepted] = useState(false);

    const [aiSelectedCandidates, setAiSelectedCandidates] = useState({});

    const [aiConfirmationRequiredFields, setAiConfirmationRequiredFields] = useState(new Set());

    const [aiConfirmedFields, setAiConfirmedFields] = useState(new Set());

    const [aiAcceptedValues, setAiAcceptedValues] = useState({});

    const [conflicts, setConflicts] = useState([]);

    const [scanCompleted, setScanCompleted] = useState(false);

    const [rawText, setRawText] = useState("");

    const [fields, setFields] = useState(initialFields);

    const [scanning, setScanning] = useState(false);

    const [saving, setSaving] = useState(false);

    const [progress, setProgress] = useState(0);

    const [progressStatus, setProgressStatus] = useState("");

    const [error, setError] = useState("");

    const [success, setSuccess] = useState("");

    const [cameraActive, setCameraActive] = useState(false);

    const [cameraReady, setCameraReady] = useState(false);

    const [cameraBusy, setCameraBusy] = useState(false);

    const [cameraDevices, setCameraDevices] = useState([]);

    const scanInProgressRef = useRef(false);

    const mountedRef = useRef(false);

    const fieldsRef = useRef(initialFields);

    const ocrControllerRef = useRef(null);

    const photosRef = useRef([]);

    const photoIdRef = useRef(0);

    const editedFieldsRef = useRef(new Set());

    const cameraStreamRef = useRef(null);

    const videoRef = useRef(null);

    const cameraRequestInProgressRef = useRef(false);

    const cameraRequestIdRef = useRef(0);

    const captureInProgressRef = useRef(false);

    const resetVisionReview = (fieldResults = [], currentFields = fieldsRef.current) => {
        const restoredFields = restoreAcceptedVisionFields(currentFields, aiAcceptedValues);
        if (
            Object.keys(restoredFields).some(
                (field) => restoredFields[field] !== currentFields[field]
            )
        ) {
            fieldsRef.current = restoredFields;
            setFields(restoredFields);
        }
        const reviewState = createVisionReviewState(fieldResults, restoredFields);
        setAiSelectedCandidates(reviewState.selectedCandidates);
        setAiConfirmationRequiredFields(reviewState.confirmationRequiredFields);
        setAiConfirmedFields(reviewState.confirmedFields);
        setAiAcceptedValues(reviewState.acceptedValues);
    };

    const updatePhotos = (nextPhotos) => {
        photosRef.current = nextPhotos;
        setPhotos(nextPhotos);
    };

    const createPhotoEntry = (file) => ({
        id: `photo-${photoIdRef.current++}`,
        file,
        previewUrl: URL.createObjectURL(file),
    });

    const appendPhotos = (files) => {
        const additions = files.map(createPhotoEntry);
        updatePhotos([...photosRef.current, ...additions]);
        setScanCompleted(false);
        setVisionResult(null);
        resetVisionReview();
        setAiPrivacyAccepted(false);
    };

    const updateFields = (updater) => {
        const nextFields = typeof updater === "function"
            ? updater(fieldsRef.current)
            : updater;
        fieldsRef.current = nextFields;
        setFields(nextFields);
    };

    const clearPhotos = () => {
        photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        updatePhotos([]);
    };

    function stopCamera({ preserveDevices = false } = {}) {
        cameraRequestIdRef.current += 1;
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setCameraActive(false);
        setCameraReady(false);

        if (!preserveDevices) setCameraDevices([]);
    }

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            ocrControllerRef.current?.abort();
            cameraRequestIdRef.current += 1;
            cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
            cameraStreamRef.current = null;
            photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
            photosRef.current = [];
        };
    }, []);

    useEffect(() => {
        if (!cameraActive || !videoRef.current || !cameraStreamRef.current) return;

        const video = videoRef.current;
        video.srcObject = cameraStreamRef.current;
        video.play().catch(() => {
            if (mountedRef.current) {
                setError("The camera opened, but its preview could not start. Stop the camera and try again.");
            }
        });

        return () => {
            video.pause();
            video.srcObject = null;
        };
    }, [cameraActive]);

    // Preserve the expiry text as printed while showing its normalized date.
    const expiryNormalization = normalizeExpiryDate(fields.expiryText);

    const handleFileChange = async (event) => {
        const input = event.target;
        const selectedFiles = Array.from(input.files ?? []);
        input.value = "";

        if (selectedFiles.length === 0) return;

        const normalizedFiles = [];
        const rejectedFiles = [];

        for (const file of selectedFiles) {
            try {
                normalizedFiles.push(await normalizeMedicineImage(file));
            } catch (fileError) {
                rejectedFiles.push(`${file.name || "Selected file"}: ${fileError.message}`);
            }
        }

        if (!mountedRef.current) return;

        if (normalizedFiles.length > 0) appendPhotos(normalizedFiles);

        setError(
            rejectedFiles.length > 0
                ? `Some images were skipped. ${rejectedFiles.join(" ")}`
                : ""
        );
        setSuccess("");
    };

    const handleScanAllPhotos = async () => {
        if (aiAnalyzing) return;

        const photosToScan = photosRef.current;
        if (photosToScan.length === 0) {
            setError("Capture or select at least one medicine image first.");
            return;
        }

        // The ref closes the gap before React disables the button after render.
        if (scanInProgressRef.current) return;

        scanInProgressRef.current = true;
        const scanController = new AbortController();
        ocrControllerRef.current = scanController;

        setScanning(true);
        setVisionResult(null);
        resetVisionReview();
        setAiPrivacyAccepted(false);
        setError("");
        setSuccess("");
        setProgress(0);
        setProgressStatus("Checking selected images...");

        try {
            const preparedPhotos = await Promise.all(
                photosToScan.map(async (photo, index) => {
                    try {
                        return {
                            photo,
                            index,
                            file: await normalizeMedicineImage(photo.file),
                            error: null,
                        };
                    } catch (fileError) {
                        return { photo, index, file: null, error: fileError };
                    }
                })
            );

            const issues = preparedPhotos
                .filter((item) => item.error)
                .map((item) => `Photo ${item.index + 1} could not be read: ${item.error.message}`);
            const validPhotos = preparedPhotos.filter((item) => item.file);

            if (validPhotos.length === 0) {
                if (mountedRef.current) {
                    setError(issues.join(" ") || "No valid JPG or PNG images are available to scan.");
                }
                return;
            }

            const imageResults = [];

            for (let index = 0; index < validPhotos.length; index += 1) {
                if (!mountedRef.current || scanController.signal.aborted) return;

                const item = validPhotos[index];
                const photoNumber = item.index + 1;
                setProgressStatus(`Scanning photo ${photoNumber} of ${photosToScan.length}...`);

                const ocrPromise = import("../utils/ocr").then(
                    ({ default: extractTextFromImage }) =>
                        extractTextFromImage(
                            item.file,
                            ({ status, progress: imageProgress }) => {
                                if (!mountedRef.current) return;
                                const totalProgress =
                                    ((index + imageProgress / 100) / validPhotos.length) * 100;
                                setProgress(Math.round(totalProgress));
                                setProgressStatus(`Photo ${photoNumber} of ${photosToScan.length}: ${status}`);
                            },
                            { signal: scanController.signal, returnDetails: true }
                        )
                );

                const barcodePromise = import("../utils/barcode").then(
                    ({ default: decodeBarcodeFromImage }) =>
                        decodeBarcodeFromImage(item.file)
                );

                const [ocrResult, barcodeResult] = await Promise.allSettled([
                    ocrPromise,
                    barcodePromise,
                ]);

                const ocrDetails = ocrResult.status === "fulfilled" &&
                    ocrResult.value && typeof ocrResult.value === "object"
                    ? ocrResult.value
                    : {
                        text: ocrResult.status === "fulfilled" ? ocrResult.value : "",
                        confidence: null,
                    };
                const recognizedText = String(ocrDetails.text ?? "").trim();
                const hasLineConfidence =
                    Array.isArray(ocrDetails.lines) && ocrDetails.lines.length > 0;
                const parsingText = hasLineConfidence
                    ? ocrDetails.lines
                        .map((line) =>
                            Number.isFinite(line.confidence) &&
                            line.confidence >= MIN_AUTOFILL_CONFIDENCE
                                ? String(line.text ?? "").trim()
                                : "UNTRUSTED OCR LINE"
                        )
                        .join("\n")
                    : recognizedText;
                const confidence = Number.isFinite(ocrDetails.confidence)
                    ? ocrDetails.confidence
                    : null;
                const lineConfidences = Array.isArray(ocrDetails.lines)
                    ? ocrDetails.lines
                        .map((line) => line.confidence)
                        .filter(Number.isFinite)
                    : [];
                const fieldConfidence = Math.max(
                    ...(confidence === null ? [] : [confidence]),
                    ...lineConfidences
                );
                const decodedBarcode = barcodeResult.status === "fulfilled"
                    ? String(barcodeResult.value ?? "").replace(/\D/g, "")
                    : "";

                if (ocrResult.status === "rejected") {
                    console.error("Medicine OCR error:", ocrResult.reason);
                    issues.push(
                        `Photo ${photoNumber} text recognition failed: ${ocrResult.reason?.message || "Please try another image."}`
                    );
                }
                if (barcodeResult.status === "rejected") {
                    console.error("Medicine barcode error:", barcodeResult.reason);
                    issues.push(
                        `Photo ${photoNumber} barcode scanning failed: ${barcodeResult.reason?.message || "Please try another image."}`
                    );
                }

                if (
                    (!Number.isFinite(fieldConfidence) ||
                        fieldConfidence < MIN_AUTOFILL_CONFIDENCE) &&
                    recognizedText
                ) {
                    issues.push(
                        `Photo ${photoNumber} text is unclear (Tesseract score ${Math.round(confidence)}/100). Improve focus and lighting, then rescan; its text was kept for review but not used to fill fields.`
                    );
                }

                imageResults.push({
                    photoId: item.photo.id,
                    recognizedText,
                    parsingText,
                    confidence,
                    fieldConfidence: Number.isFinite(fieldConfidence)
                        ? fieldConfidence
                        : null,
                    decodedBarcode,
                    ocrError: ocrResult.status === "rejected"
                        ? ocrResult.reason?.message || "Text recognition failed."
                        : "",
                    barcodeError: barcodeResult.status === "rejected"
                        ? barcodeResult.reason?.message || "Barcode scanning failed."
                        : "",
                });
            }

            if (!mountedRef.current) return;

            const mergedResult = mergeMedicineScanResults(
                imageResults,
                fieldsRef.current,
                editedFieldsRef.current
            );
            updateFields(mergedResult.fields);
            setPhotoScanResults(Object.fromEntries(imageResults.map((result) => [
                result.photoId,
                (() => {
                    const parsedFields = parseMedicineText(
                        result.parsingText ?? result.recognizedText
                    );
                    const rawParsedFields = parseMedicineText(
                        result.recognizedText
                    );
                    const uncertainFields = OCR_REVIEW_FIELD_RULES
                        .flatMap(({ field, label, labelPattern }) => {
                            const candidate = rawParsedFields[field];
                            const accepted = parsedFields[field];
                            if (
                                accepted &&
                                (field !== "expiryText" ||
                                    normalizeExpiryDate(accepted).date) &&
                                (!candidate ||
                                    normalizeMedicineValue(accepted) ===
                                        normalizeMedicineValue(candidate))
                            ) return [];
                            if (!candidate && !labelPattern.test(result.recognizedText)) {
                                return [];
                            }
                            return [{ field, label, candidate }];
                        });

                    return {
                        ...result,
                        parsedFields,
                        uncertainFields,
                    };
                })(),
            ])));
            setConflicts(mergedResult.conflicts);
            setRawText(mergedResult.combinedText);
            setScanCompleted(true);
            setProgress(100);
            setProgressStatus("All valid photos have been scanned.");

            const hasBarcode = mergedResult.decodedBarcodes.length > 0;
            const hasText = Boolean(mergedResult.combinedText);
            if (!hasText && !hasBarcode) {
                issues.push(
                    "No readable text or supported UPC/EAN barcode was detected. Try clearer photos with the label and barcode in focus."
                );
            }

            if (issues.length > 0) setError(issues.join(" "));

            if (hasText && hasBarcode) {
                setSuccess(
                    `Scanned ${validPhotos.length} photo${validPhotos.length === 1 ? "" : "s"}; text and ${mergedResult.decodedBarcodes.length} unique barcode${mergedResult.decodedBarcodes.length === 1 ? " were" : "s were"} detected. Review every field against the package.`
                );
            } else if (hasText) {
                setSuccess(
                    `Scanned ${validPhotos.length} photo${validPhotos.length === 1 ? "" : "s"}; text was extracted. No supported barcode was decoded. Review the fields and enter the barcode if needed.`
                );
            } else if (hasBarcode) {
                setSuccess(
                    `Scanned ${validPhotos.length} photo${validPhotos.length === 1 ? "" : "s"}; barcode${mergedResult.decodedBarcodes.length === 1 ? " was" : "s were"} detected, but no readable label text was found. Enter the other details manually.`
                );
            }
        } catch (scanError) {
            if (mountedRef.current) {
                console.error("Medicine scan integration error:", scanError);
                setError(scanError.message || "Unable to scan these images. Please try again.");
            }
        } finally {
            scanInProgressRef.current = false;
            if (ocrControllerRef.current === scanController) {
                ocrControllerRef.current = null;
            }
            if (mountedRef.current) setScanning(false);
        }
    };

    const handleImproveWithAI = async () => {
        if (aiAnalyzing || scanning) return;

        if (!scanCompleted) {
            setError("Run the local scan first, then choose whether to send photos for AI review.");
            return;
        }

        if (!aiPrivacyAccepted) {
            setError("Review the privacy notice and confirm before sending photos for AI analysis.");
            return;
        }

        const photosToAnalyze = photosRef.current.slice();
        if (photosToAnalyze.length === 0) {
            setError("Add and scan at least one medicine photo first.");
            return;
        }

        setAiAnalyzing(true);
        setVisionResult(null);
        resetVisionReview();
        setError("");
        setSuccess("");

        const analyses = [];
        const failures = [];

        for (let index = 0; index < photosToAnalyze.length; index += 1) {
            if (!mountedRef.current) return;
            const photo = photosToAnalyze[index];

            if (photo.file.size > 8 * 1024 * 1024) {
                failures.push("Photo " + (index + 1) + ": images must be 8 MB or smaller.");
                continue;
            }

            try {
                const response = await api.post(
                    "/medicines/vision-analysis",
                    photo.file,
                    {
                        headers: { "Content-Type": photo.file.type },
                        timeout: 50_000,
                    }
                );
                const analysis = response.data?.analysis;
                if (!analysis?.fields || typeof analysis.fields !== "object") {
                    throw new Error("The server returned an incomplete AI result.");
                }
                analyses.push(analysis);
            } catch (requestError) {
                failures.push(
                    "Photo " + (index + 1) + ": " +
                        (requestError.response?.data?.message ||
                            requestError.message ||
                            "AI analysis failed.")
                );
            }
        }

        if (mountedRef.current && analyses.length > 0) {
            const mergedResult = mergeMedicineVisionResults(analyses);
            setVisionResult(mergedResult);
            resetVisionReview(mergedResult.fieldResults, fieldsRef.current);
            setSuccess(
                "AI review finished. Choose and confirm each value you want to use."
            );
        }

        if (mountedRef.current && failures.length > 0) {
            if (import.meta.env.DEV) {
                console.warn("Medicine vision analysis diagnostics:", failures);
            }
            setError(
                analyses.length > 0
                    ? "Some photos could not be analyzed. Review the available results or try again."
                    : "AI review is unavailable. Try again later or continue with manual entry."
            );
        } else if (mountedRef.current && analyses.length === 0 && photosToAnalyze.length > 0) {
            setError("AI review is unavailable. Try again later or continue with manual entry.");
        }

        if (mountedRef.current) setAiAnalyzing(false);
    };

    const getCameraErrorMessage = (cameraError) => {
        if (cameraError?.name === "NotAllowedError" || cameraError?.name === "SecurityError") {
            return "Camera access was denied. Allow camera permission for this site in your browser settings, then try again.";
        }

        if (cameraError?.name === "NotFoundError" || cameraError?.name === "DevicesNotFoundError") {
            return "No camera was found. Connect or enable a camera, or choose an image file instead.";
        }

        if (cameraError?.name === "NotReadableError" || cameraError?.name === "TrackStartError") {
            return "The camera is unavailable or being used by another app. Close other camera apps and try again.";
        }

        if (cameraError?.name === "OverconstrainedError" || cameraError?.name === "ConstraintNotSatisfiedError") {
            return "That camera could not be selected. Try another camera or use image upload.";
        }

        return "The camera could not be started. Check your browser and camera settings, or choose an image file instead.";
    };

    const startCamera = async (deviceId = "") => {
        if (cameraRequestInProgressRef.current || scanning) return;

        if (!window.isSecureContext) {
            setError("Camera access requires a secure page. Use localhost during development or HTTPS in production, or choose an image file.");
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setError("This browser does not support camera access. Update your browser or choose an image file instead.");
            return;
        }

        if (!deviceId && cameraActive) return;

        cameraRequestInProgressRef.current = true;
        setCameraBusy(true);
        setError("");
        setSuccess("");

        if (cameraActive) stopCamera({ preserveDevices: Boolean(deviceId) });

        const requestId = ++cameraRequestIdRef.current;

        try {
            const video = deviceId
                ? { deviceId: { exact: deviceId } }
                : { facingMode: { ideal: "environment" } };
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video,
            });

            if (!mountedRef.current || requestId !== cameraRequestIdRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            cameraStreamRef.current = stream;
            setCameraActive(true);
            setCameraReady(false);
            setCameraBusy(false);

            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (mountedRef.current && requestId === cameraRequestIdRef.current) {
                    setCameraDevices(
                        devices.filter((item) => item.kind === "videoinput")
                    );
                }
            } catch {
                if (mountedRef.current && requestId === cameraRequestIdRef.current) {
                    setCameraDevices([]);
                }
            }
        } catch (cameraError) {
            if (mountedRef.current && requestId === cameraRequestIdRef.current) {
                setError(getCameraErrorMessage(cameraError));
            }
        } finally {
            cameraRequestInProgressRef.current = false;
            if (mountedRef.current) setCameraBusy(false);
        }
    };

    const switchCamera = () => {
        const switchableDevices = cameraDevices.filter((device) => device.deviceId);
        if (switchableDevices.length < 2 || cameraBusy || scanning) return;

        const activeDeviceId =
            cameraStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
        const activeIndex = switchableDevices.findIndex(
            (device) => device.deviceId === activeDeviceId
        );
        const nextIndex = (activeIndex + 1) % switchableDevices.length;
        startCamera(switchableDevices[nextIndex].deviceId);
    };

    const capturePhoto = async () => {
        if (captureInProgressRef.current || scanning || !cameraReady) return;

        const video = videoRef.current;
        if (!video?.videoWidth || !video?.videoHeight) {
            setError("The camera preview is not ready yet. Wait a moment and try again.");
            return;
        }

        captureInProgressRef.current = true;
        setCameraBusy(true);
        setError("");
        setSuccess("");

        let capturedFile = null;

        try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");
            if (!context) throw new Error("Unable to prepare the camera image.");

            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageBlob = await new Promise((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.92)
            );

            if (!imageBlob) throw new Error("The camera image could not be captured. Try again.");

            capturedFile = new File(
                [imageBlob],
                "medicine-capture.jpg",
                { type: "image/jpeg" }
            );
        } catch (captureError) {
            setError(captureError.message || "The camera image could not be captured. Try again.");
        } finally {
            captureInProgressRef.current = false;
            if (mountedRef.current) setCameraBusy(false);
        }

        if (!capturedFile || !mountedRef.current) return;

        try {
            const normalizedFile = await normalizeMedicineImage(capturedFile);
            if (!mountedRef.current) return;
            appendPhotos([normalizedFile]);
            setError("");
            setSuccess("Photo added. Capture another side or scan all selected photos when ready.");
        } catch (captureError) {
            setError(captureError.message || "The captured photo could not be prepared for scanning.");
        }
    };

    const removePhoto = (photoId) => {
        const photo = photosRef.current.find((item) => item.id === photoId);
        if (!photo) return;

        URL.revokeObjectURL(photo.previewUrl);
        updatePhotos(photosRef.current.filter((item) => item.id !== photoId));
        setScanCompleted(false);
        setVisionResult(null);
        resetVisionReview();
        setAiPrivacyAccepted(false);
        setPhotoScanResults((previous) => {
            const next = { ...previous };
            delete next[photoId];
            return next;
        });
    };

    const handleFieldChange = (event) => {

        const { name } = event.target;
        const value = name === "barcode"
            ? event.target.value.replace(/\D/g, "")
            : event.target.value;

        editedFieldsRef.current.add(name);
        updateFields((previous) => ({
            ...previous,
            [name]: value,
        }));

        if (visionResult?.fieldResults.some((result) => result.target === name)) {
            const invalidated = invalidateVisionFieldConfirmation({
                target: name,
                confirmedFields: aiConfirmedFields,
                selectedCandidates: aiSelectedCandidates,
                value,
            });
            setAiConfirmedFields(invalidated.confirmedFields);
            setAiSelectedCandidates(invalidated.selectedCandidates);
        }

    };

    const handleAiCandidateSelection = (target, value) => {
        setAiSelectedCandidates((previous) => ({ ...previous, [target]: value }));
        setAiConfirmedFields((previous) => {
            const next = new Set(previous);
            next.delete(target);
            return next;
        });
    };

    const handleAiFieldConfirmation = (result, checked) => {
        const target = result.target;
        if (!target) return;

        if (!checked) {
            const revoked = revokeVisionFieldConfirmation({
                target,
                fields: fieldsRef.current,
                confirmationRequiredFields: aiConfirmationRequiredFields,
                confirmedFields: aiConfirmedFields,
                acceptedValues: aiAcceptedValues,
            });
            updateFields(revoked.fields);
            setAiConfirmationRequiredFields(revoked.confirmationRequiredFields);
            setAiConfirmedFields(revoked.confirmedFields);
            setAiAcceptedValues(revoked.acceptedValues);
            setError("");
            return;
        }

        const selectedValue = aiSelectedCandidates[target] ||
            (result.status === "read" ? result.value : "");
        const confirmation = {
            fieldResult: result,
            target,
            value: selectedValue,
            fields: fieldsRef.current,
            confirmationRequiredFields: aiConfirmationRequiredFields,
            confirmedFields: aiConfirmedFields,
            acceptedValues: aiAcceptedValues,
        };
        let applied = confirmVisionFieldValue(confirmation);

        if (applied.reason === "replacement_confirmation_required") {
            const shouldReplace = window.confirm(
                `This field already contains “${applied.existing}”. Replace it with “${applied.candidate}”?`
            );
            if (!shouldReplace) return;
            applied = confirmVisionFieldValue({ ...confirmation, replaceExisting: true });
        }

        if (!applied.ok) {
            const messages = {
                select_candidate: "Select a readable candidate before confirming it.",
                invalid_expiry: "That expiry candidate is not a valid date. Review it against the package.",
                invalid_barcode: "Barcode must use a supported format and have a valid check digit.",
            };
            setError(messages[applied.reason] || "This AI candidate cannot be confirmed.");
            return;
        }

        updateFields(applied.fields);
        setAiConfirmationRequiredFields(applied.confirmationRequiredFields);
        setAiConfirmedFields(applied.confirmedFields);
        setAiAcceptedValues(applied.acceptedValues);
        setError("");
    };

    const handleParseTextAgain = () => {
        setError("");
        setSuccess("");

        if (!rawText.trim()) {
            setError("There is no extracted text to parse yet.");
            return;
        }

        const parsedFields = parseMedicineText(rawText);
        const { fields: nonEmptyFields, uncertainFields } =
            splitMedicineFormCandidates(parsedFields);

        const conflictedFields = new Set(conflicts.map((item) => item.field));
        updateFields((previous) => {
            const next = { ...previous };
            for (const [field, value] of Object.entries(nonEmptyFields)) {
                if (
                    !next[field]?.trim() &&
                    !editedFieldsRef.current.has(field) &&
                    !conflictedFields.has(field)
                ) {
                    next[field] = value;
                }
            }
            return next;
        });

        if (Object.keys(nonEmptyFields).length === 0) {
            setError(
                uncertainFields.length > 0
                    ? `The OCR expiry candidate “${uncertainFields[0].candidate}” is not a valid date, so it was kept in the extracted text for review and not added to the expiry field.`
                    : "No labelled medicine details were recognized. Enter the values manually and verify them against the package."
            );
            return;
        }

        setSuccess(
            uncertainFields.length > 0
                ? `Text parsed again where fields were empty and unambiguous. The OCR expiry candidate “${uncertainFields[0].candidate}” remains in the extracted text for review and was not added to the expiry field.`
                : "Text parsed again where fields were empty and unambiguous. Review all values against the package."
        );
    };

    const handleSaveAndContinue = async () => {
        setError("");
        setSuccess("");

        if (scanning || saving || aiAnalyzing) return;

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

        const aiFieldLabels = {
            name: "medicine name",
            genericName: "generic name",
            manufacturer: "manufacturer",
            category: "category",
            batchNumber: "batch number",
            expiryText: "expiry date",
            barcode: "barcode",
        };
        const unverifiedAiFields = [...aiConfirmationRequiredFields].filter(
            (field) => !aiConfirmedFields.has(field)
        );
        if (unverifiedAiFields.length > 0) {
            setError(
                "Confirm the AI-read " +
                    unverifiedAiFields.map((field) => aiFieldLabels[field]).join(", ") +
                    " against the physical package before continuing."
            );
            return;
        }

        if (barcode && !isValidGs1Barcode(barcode)) {
            setError("Barcode must use a supported format and have a valid check digit. Correct it before continuing.");
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

        if (scanning || aiAnalyzing) return;

        stopCamera();

        clearPhotos();

        setPhotoScanResults({});

        setVisionResult(null);

        resetVisionReview();

        setAiPrivacyAccepted(false);

        setRawText("");

        editedFieldsRef.current.clear();
        updateFields(initialFields);

        setConflicts([]);
        setScanCompleted(false);

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

    const missingReviewFields = [
        ["name", "medicine name"],
        ["genericName", "generic name"],
        ["manufacturer", "manufacturer"],
        ["category", "category"],
        ["batchNumber", "batch number"],
        ["expiryText", "expiry date"],
        ["barcode", "barcode"],
    ].filter(([field]) => !String(fields[field] ?? "").trim());

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

                {conflicts.length > 0 && (
                    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-semibold">Different photos contain conflicting values. Verify these against the package:</p>
                        <ul className="mt-2 list-inside list-disc space-y-1">
                            {conflicts.map((conflict) => (
                                <li key={conflict.field}>
                                    <span className="font-semibold">{conflict.label}:</span> {conflict.values.join(" / ")}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {scanCompleted && missingReviewFields.length > 0 && (
                    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <span className="font-semibold">Still missing:</span>{" "}
                        {missingReviewFields.map(([, label]) => label).join(", ")}. Add another photo and scan again, or enter these values manually.
                    </div>
                )}

                {/* Upload and preview */}

                <section className="grid gap-6 lg:grid-cols-2">

                    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm sm:p-6">

                        <h2 className="text-lg font-semibold text-slate-900">

                            1. Capture or upload medicine photos

                        </h2>

                        <p className="mt-1 text-sm text-muted">

                            Capture clear JPG, JPEG, or PNG photos from different sides

                            of the same medicine package.

                        </p>

                        <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4">
                            <h3 className="font-semibold text-slate-800">
                                Use a camera
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                                Camera images stay on this device during local scanning. They are sent externally only if you choose AI review and confirm below.
                            </p>

                            {cameraActive && (
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    onLoadedMetadata={() => setCameraReady(true)}
                                    aria-label="Live medicine package camera preview"
                                    className="mt-4 max-h-80 w-full rounded-lg bg-slate-900 object-contain"
                                />
                            )}

                            <div className="mt-4 flex flex-wrap gap-3">
                                {!cameraActive ? (
                                    <button
                                        type="button"
                                        onClick={() => startCamera()}
                                        disabled={cameraBusy || scanning || aiAnalyzing}
                                        className="rounded-xl border border-mint-700 px-5 py-3 text-sm font-semibold text-mint-800 hover:bg-mint-50 disabled:cursor-wait disabled:opacity-50"
                                    >
                                        {cameraBusy ? "Opening Camera..." : "Start Camera"}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={capturePhoto}
                                            disabled={!cameraReady || cameraBusy || scanning || aiAnalyzing}
                                            className="rounded-xl bg-mint-700 px-5 py-3 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-wait disabled:opacity-50"
                                        >
                                            {cameraBusy
                                                ? "Capturing..."
                                                : photos.length > 0
                                                  ? "Capture Another Photo"
                                                  : "Capture Photo"}
                                        </button>
                                        {cameraDevices.filter((device) => device.deviceId).length > 1 && (
                                            <button
                                                type="button"
                                                onClick={switchCamera}
                                                disabled={cameraBusy || scanning || aiAnalyzing}
                                                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-panel-muted disabled:cursor-wait disabled:opacity-50"
                                            >
                                                Switch Camera
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => stopCamera()}
                                            disabled={cameraBusy || aiAnalyzing}
                                            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-panel-muted disabled:cursor-wait disabled:opacity-50"
                                        >
                                            Stop Camera
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <label
                            htmlFor="medicine-image-input"

                            className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-mint-600 hover:bg-mint-50"

                        >

                            <span className="text-3xl" aria-hidden="true">

                                ↑

                            </span>

                            <span className="mt-2 font-semibold text-slate-800">

                                Choose images

                            </span>

                            <span className="mt-1 text-xs text-muted">

                                Select one or more JPG, JPEG, or PNG files

                            </span>

                            <input

                                id="medicine-image-input"
                                type="file"
                                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                multiple
                                onChange={handleFileChange}
                                disabled={scanning || aiAnalyzing}
                                className="sr-only"

                            />

                        </label>

                        <div className="mt-5">
                            <p className="text-sm font-semibold text-slate-700" aria-live="polite">
                                {photos.length} photo{photos.length === 1 ? "" : "s"} captured or selected
                            </p>
                            {photos.length > 0 ? (
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {photos.map((photo, index) => (
                                        <figure
                                            key={photo.id}
                                            className="overflow-hidden rounded-xl border border-line bg-slate-50 p-2"
                                        >
                                            <img
                                                src={photo.previewUrl}
                                                alt={`Medicine package photo ${index + 1}`}
                                                className="h-32 w-full rounded-lg object-contain"
                                            />
                                            <figcaption className="mt-2 flex items-center justify-between gap-2">
                                                <span className="min-w-0 break-words text-xs text-slate-600">
                                                    {photo.file.name}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removePhoto(photo.id)}
                                                    disabled={scanning || aiAnalyzing}
                                                    aria-label={`Remove photo ${index + 1}`}
                                                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-panel-muted disabled:opacity-50"
                                                >
                                                    Remove
                                                </button>
                                            </figcaption>
                                            {photoScanResults[photo.id] && (
                                                <details className="mt-2 rounded-lg border border-slate-200 bg-panel p-2 text-xs text-slate-700">
                                                    <summary className="cursor-pointer font-semibold">
                                                        Recognition details
                                                    </summary>
                                                    <p className="mt-2">
                                                        Tesseract score: {photoScanResults[photo.id].confidence === null
                                                            ? "unavailable"
                                                            : `${Math.round(photoScanResults[photo.id].confidence)}/100`}
                                                    </p>
                                                    {photoScanResults[photo.id].ocrError && (
                                                        <p className="mt-1 text-red-700">
                                                            Text: {photoScanResults[photo.id].ocrError}
                                                        </p>
                                                    )}
                                                    {photoScanResults[photo.id].barcodeError && (
                                                        <p className="mt-1 text-red-700">
                                                            Barcode: {photoScanResults[photo.id].barcodeError}
                                                        </p>
                                                    )}
                                                    <ul className="mt-2 space-y-1">
                                                        {[
                                                            ["Medicine name", "name"],
                                                            ["Generic / ingredients", "genericName"],
                                                            ["Manufacturer", "manufacturer"],
                                                            ["Category", "category"],
                                                            ["Batch", "batchNumber"],
                                                            ["Expiry text", "expiryText"],
                                                        ].filter(([, field]) => photoScanResults[photo.id].parsedFields[field])
                                                            .map(([label, field]) => (
                                                                <li key={field}>
                                                                    <span className="font-medium">{label}:</span>{" "}
                                                                    {photoScanResults[photo.id].parsedFields[field]}
                                                                </li>
                                                            ))}
                                                    </ul>
                                                    {photoScanResults[photo.id].uncertainFields?.length > 0 && (
                                                        <div className="mt-2 rounded-md bg-amber-50 p-2 text-amber-900">
                                                            <p className="font-semibold">Uncertain OCR fields — review against the package</p>
                                                            <ul className="mt-1 space-y-1">
                                                                {photoScanResults[photo.id].uncertainFields.map((item) => (
                                                                    <li key={item.field}>
                                                                        {item.label}: {item.candidate || "No reliable value read"}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    <p className="mt-2 font-medium">Recognized text</p>
                                                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-normal">
                                                        {photoScanResults[photo.id].recognizedText || "No readable text was returned."}
                                                    </pre>
                                                    <p className="mt-2">
                                                        Barcode: {photoScanResults[photo.id].decodedBarcode || "No supported barcode decoded."}
                                                    </p>
                                                </details>
                                            )}
                                        </figure>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-3 grid min-h-32 place-items-center rounded-xl bg-slate-50 text-sm text-slate-400">
                                    Captured and selected photos will appear here.
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">

                            <button

                                type="button"

                                onClick={handleScanAllPhotos}

                                disabled={photos.length === 0 || scanning || aiAnalyzing}

                                className="rounded-xl bg-mint-700 px-5 py-3 text-sm font-semibold text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50"

                            >

                                {scanning ? "Scanning Photos..." : "Scan All Photos"}

                            </button>

                            <button

                                type="button"

                                onClick={handleClear}

                                disabled={scanning || cameraBusy || aiAnalyzing}

                                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"

                            >

                                Clear All Photos

                            </button>

                        </div>

                        {scanCompleted && photos.length > 0 && (
                            <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-labelledby="ai-review-title">
                                <h3 id="ai-review-title" className="font-semibold text-sky-950">
                                    Optional AI image review
                                </h3>
                                <p className="mt-1 text-sm leading-6 text-sky-900">
                                    Local OCR and barcode scanning run on this device. If you confirm and click Improve with AI, the selected medicine photos will be sent to OpenAI through the MediReturn server for image analysis. AI can misread packaging; check every result against the physical pack. Photos are never sent automatically.
                                </p>
                                <label className="mt-3 flex items-start gap-2 text-sm text-sky-950">
                                    <input
                                        type="checkbox"
                                        checked={aiPrivacyAccepted}
                                        onChange={(event) => {
                                            setAiPrivacyAccepted(event.target.checked);
                                            setError("");
                                        }}
                                        disabled={aiAnalyzing}
                                        className="mt-1"
                                    />
                                    <span>I understand and want to send these selected photos to OpenAI for analysis.</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleImproveWithAI}
                                    disabled={!aiPrivacyAccepted || aiAnalyzing || scanning}
                                    className="mt-3 rounded-xl border border-sky-700 px-5 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {aiAnalyzing ? "Analyzing selected photos..." : "Improve with AI"}
                                </button>
                            </section>
                        )}

                        {visionResult && (
                            <section className="mt-5 rounded-xl border border-sky-200 bg-panel p-4" aria-labelledby="ai-results-title">
                                <h3 id="ai-results-title" className="font-semibold text-slate-900">
                                    AI review — confirm each value you use
                                </h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    AI readings are suggestions. Confirm each selected value against the package before using it.
                                </p>
                                {visionResult.identityConflicts.length > 0 && (
                                    <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
                                        Photos contain conflicting {visionResult.identityConflicts.join(", ")} readings. They may show different medicines. Remove unrelated photos or resolve each difference manually before continuing.
                                    </p>
                                )}
                                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {visionResult.fieldResults.map((result) => {
                                        const target = result.target;
                                        const currentValue = target
                                            ? String(fields[target] ?? "").trim()
                                            : "";
                                        const options = getVisionCandidateOptions(result, currentValue);
                                        const selectedValue = aiSelectedCandidates[target] ??
                                            (result.status === "read" ? result.value ?? "" : "");
                                        const confirmed = Boolean(
                                            target &&
                                            aiConfirmedFields.has(target) &&
                                            aiAcceptedValues[target]?.value === currentValue
                                        );
                                        const normalizedDate = target === "expiryText"
                                            ? normalizeExpiryDate(selectedValue).date
                                            : "";

                                        return (
                                            <li key={result.source} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                                <p className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="font-semibold text-slate-800">{result.label}</span>
                                                    <span className={
                                                        result.status === "read"
                                                            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"
                                                            : result.status === "uncertain"
                                                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                                                              : "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700"
                                                    }>
                                                        {result.status === "read"
                                                            ? "Read"
                                                            : result.status === "uncertain"
                                                              ? "Uncertain"
                                                              : "Not found"}
                                                    </span>
                                                </p>
                                                {options.length === 0 ? (
                                                    <p className="mt-3 text-slate-600">
                                                        {result.status === "not_found"
                                                            ? "Not detected. Enter this value manually if it is visible on the package."
                                                            : "No reliable candidate detected. Enter this value manually after checking the package."}
                                                    </p>
                                                ) : (
                                                    <>
                                                        {result.status === "read" && result.value && target !== "expiryText" && (
                                                            <p className="mt-3 break-normal text-slate-900">
                                                                Candidate: {result.value}
                                                            </p>
                                                        )}
                                                        {(result.status === "uncertain" || options.length > 1 || (currentValue && !options.includes(result.value))) && (
                                                            <label className="mt-3 block">
                                                                <span className="mb-1 block text-xs font-medium text-slate-600">
                                                                    {result.status === "uncertain" ? "Select a possible reading" : "Selected value"}
                                                                </span>
                                                                <select
                                                                    value={selectedValue}
                                                                    onChange={(event) => handleAiCandidateSelection(target, event.target.value)}
                                                                    className="w-full rounded-lg border border-slate-300 bg-input px-2.5 py-2 text-sm"
                                                                >
                                                                    {result.status === "uncertain" && (
                                                                        <option value="">Choose a candidate…</option>
                                                                    )}
                                                                    {options.map((option) => (
                                                                        <option key={option} value={option}>
                                                                            {result.candidates.includes(option) || option === result.value
                                                                                ? option
                                                                                : `Current form value: ${option}`}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                        )}
                                                        {target === "expiryText" && selectedValue && (
                                                            <p className="mt-2 break-normal text-slate-700">
                                                                Expiry date as printed: {selectedValue}
                                                                {normalizedDate && (
                                                                    <span className="block text-xs text-slate-600">
                                                                        Normalized date: {normalizedDate}
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                        <label className="mt-3 flex items-start gap-2 text-slate-800">
                                                            <input
                                                                type="checkbox"
                                                                checked={confirmed}
                                                                disabled={!selectedValue}
                                                                onChange={(event) => handleAiFieldConfirmation(result, event.target.checked)}
                                                                className="mt-0.5"
                                                            />
                                                            <span>I checked this value against the package</span>
                                                        </label>
                                                        {aiConfirmationRequiredFields.has(target) && !confirmed && (
                                                            <p className="mt-1 text-xs font-medium text-amber-800">
                                                                Confirmation is needed again for the current form value.
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

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

                            placeholder="Recognized package text will appear here after you scan the selected photos. You can correct OCR mistakes."

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
                                Use a supported numeric barcode with a valid check digit. A barcode is required to create a new catalog medicine; a matching existing medicine may be reused without one.
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

                            disabled={scanning || saving || aiAnalyzing}

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
