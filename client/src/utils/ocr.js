
import { createWorker, PSM } from "tesseract.js";
import { normalizeMedicineImage } from "./medicineImage";

/**
 * Enlarge the image and improve contrast while preserving
 * the original image proportions.
 */
function preprocessImage(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);

        image.onload = () => {
            try {
                const longestSide = Math.max(
                    image.naturalWidth,
                    image.naturalHeight
                );
                const scale = Math.min(2.5, 2800 / longestSide);

                const canvas = document.createElement("canvas");
                canvas.width = Math.round(image.naturalWidth * scale);
                canvas.height = Math.round(image.naturalHeight * scale);

                const context = canvas.getContext("2d", {
                    willReadFrequently: true,
                });

                if (!context) {
                    throw new Error("Unable to process the uploaded image.");
                }

                // Use a white background.
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);

                context.drawImage(
                    image,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                // Convert to grayscale and increase contrast moderately.
                const imageData = context.getImageData(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                const pixels = imageData.data;
                const contrast = 1.2;

                for (let i = 0; i < pixels.length; i += 4) {
                    const gray =
                        0.299 * pixels[i] +
                        0.587 * pixels[i + 1] +
                        0.114 * pixels[i + 2];

                    const adjusted = Math.max(
                        0,
                        Math.min(255, (gray - 128) * contrast + 128)
                    );

                    pixels[i] = adjusted;
                    pixels[i + 1] = adjusted;
                    pixels[i + 2] = adjusted;
                    pixels[i + 3] = 255;
                }

                context.putImageData(imageData, 0, 0);

                resolve(canvas);
            } catch (error) {
                reject(error);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Unable to read the uploaded image."));
        };

        image.src = objectUrl;
    });
}

/**
 * Prefer text that contains readable words and recognizable
 * medicine-label information.
 *
 * This is only a heuristic, not a true OCR confidence score.
 */
function scoreText(text) {
    const value = String(text ?? "").trim();

    if (!value) return -Infinity;

    const compact = value.replace(/\s/g, "");
    const readableCharacters =
        compact.match(/[A-Za-z0-9₹%.,:/+-]/g) ?? [];

    const readableRatio =
        compact.length > 0
            ? readableCharacters.length / compact.length
            : 0;

    const words = value.match(/[A-Za-z]{2,}|\d{2,}/g) ?? [];

    const medicineTerms =
        value.match(
            /\b(batch|mfg|manufactur\w*|expiry|expir\w*|date|mrp|tablet\w*|mg|barcode|paracetamol)\b/gi
        ) ?? [];

    return (
        readableRatio * 10 +
        Math.min(words.length, 60) * 0.15 +
        medicineTerms.length * 1.5
    );
}

function isBetterRecognition(candidate, incumbent) {
    const candidateHasConfidence = Number.isFinite(candidate.confidence);
    const incumbentHasConfidence = Number.isFinite(incumbent.confidence);

    if (candidateHasConfidence && incumbentHasConfidence && candidate.confidence !== incumbent.confidence) {
        return candidate.confidence > incumbent.confidence;
    }

    if (candidateHasConfidence !== incumbentHasConfidence) {
        return candidateHasConfidence;
    }

    // Use the existing text heuristic only when Tesseract scores tie or are
    // unavailable. This prevents a longer sparse-text pass from winning on
    // token count alone.
    return scoreText(candidate.text) > scoreText(incumbent.text);
}

function getRecognizedLines(data) {
    return (data.blocks ?? []).flatMap((block) =>
        (block.paragraphs ?? []).flatMap((paragraph) =>
            (paragraph.lines ?? []).map((line) => ({
                text: line.text ?? "",
                confidence:
                    typeof line.confidence === "number" &&
                    Number.isFinite(line.confidence)
                        ? line.confidence
                        : null,
                bbox: line.bbox && {
                    x0: line.bbox.x0,
                    y0: line.bbox.y0,
                    x1: line.bbox.x1,
                    y1: line.bbox.y1,
                },
            }))
        )
    );
}

const FOCUSED_LABELS = [
    { key: "batch", pattern: /\b(?:BATCH|B\.?\s*NO\.?|LOT)\b|(?:बैच|लॉट)/i },
    { key: "manufacturing", pattern: /\b(?:MFG\.?|MFD\.?|MANUFACTURING|MANUFACTURED)\b|(?:निर्माण|निर्मित)/i },
    { key: "expiry", pattern: /\b(?:EXP\.?(?:IRY|IRATION)?|USE\s+BEFORE|BEST\s+BEFORE)\b|(?:समाप्ति|उपयोग)/i },
    { key: "mrp", pattern: /\b(?:M\s*\.?\s*R\s*\.?\s*P\.?|MAXIMUM\s+RETAIL\s+PRICE)\b|(?:एम\s*\.?\s*आर\s*\.?\s*पी|अधिकतम\s+खुदरा\s+मूल्य)/i },
];

function createFocusedLabelRegions(canvas, lines) {
    const regions = [];
    const seenLabels = new Set();

    for (const line of lines) {
        const label = FOCUSED_LABELS.find((candidate) =>
            candidate.pattern.test(String(line.text ?? ""))
        );
        const box = line.bbox;

        if (
            !label ||
            seenLabels.has(label.key) ||
            !box ||
            ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)
        ) {
            continue;
        }

        seenLabels.add(label.key);
        const lineHeight = Math.max(12, box.y1 - box.y0);
        const cropX = Math.max(
            0,
            Math.floor(
                box.x0 - Math.max(lineHeight * 6, canvas.width * 0.35)
            )
        );
        const cropY = Math.max(0, Math.floor(box.y0 - lineHeight * 0.6));
        const cropRight = canvas.width;
        const cropBottom = Math.min(
            canvas.height,
            Math.ceil(box.y1 + lineHeight * 2.2)
        );
        const cropWidth = cropRight - cropX;
        const cropHeight = cropBottom - cropY;

        if (cropWidth < 80 || cropHeight < 18) continue;

        const scale = Math.min(2, 1800 / cropWidth);
        const region = document.createElement("canvas");
        region.width = Math.max(1, Math.round(cropWidth * scale));
        region.height = Math.max(1, Math.round(cropHeight * scale));
        const context = region.getContext("2d");

        if (!context) continue;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(
            canvas,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            region.width,
            region.height
        );
        regions.push({ key: label.key, canvas: region });
    }

    return regions;
}

/**
 * Extract text from an uploaded medicine-package image.
 *
 * onProgress receives:
 * { status: string, progress: number }
 *
 * Returns the selected OCR text as a string.
 */
export async function extractTextFromImage(
    file,
    onProgress,
    { signal, returnDetails = false } = {}
) {
    const imageFile = await normalizeMedicineImage(file);

    let canvas;
    let worker;
    let activePass = 0;
    let terminationPromise;
    let terminationError;
    let scanError;
    let recognizedText = "";
    let selectedConfidence = null;
    let selectedLines = [];
    let focusedRegions = [];

    const terminateWorker = async () => {
        if (!worker) return;

        if (!terminationPromise) {
            terminationPromise = worker.terminate().catch((error) => {
                terminationError = error;
            });
        }

        await terminationPromise;
    };

    const abortError = () => {
        const error = new Error("OCR processing was cancelled.");
        error.name = "AbortError";
        return error;
    };

    const handleAbort = () => {
        // Terminating the worker stops a recognition pass promptly if the
        // scanner unmounts. Any termination failure remains observable below.
        void terminateWorker();
    };

    if (signal?.aborted) throw abortError();
    signal?.addEventListener("abort", handleAbort, { once: true });

    const reportProgress = (status, progress) => {
        if (typeof onProgress === "function") {
            onProgress({
                status,
                progress: Math.max(0, Math.min(100, Math.round(progress))),
            });
        }
    };

    try {
        reportProgress("Preparing image...", 2);

        canvas = await preprocessImage(imageFile);

        reportProgress("Initializing OCR...", 5);

        if (signal?.aborted) throw abortError();

        const languages =
            import.meta.env?.VITE_TESSERACT_LANGUAGES || "eng+hin";
        worker = await createWorker(languages, 1, {
            logger: (message) => {
                const base = activePass < 2
                    ? (activePass === 0 ? 6 : 46)
                    : 82 + (activePass - 2) * 3;

                if (message.status === "recognizing text") {
                    const span = activePass < 2 ? 35 : 2;
                    const fraction = Number(message.progress) || 0;

                    reportProgress(
                        activePass < 2
                            ? "Recognizing text (pass " + (activePass + 1) + " of 2)..."
                            : "Reading text beside printed labels...",
                        base + fraction * span
                    );
                } else {
                    reportProgress(
                        message.status || "Preparing OCR...",
                        base
                    );
                }
            },
        });

        if (signal?.aborted) throw abortError();

        const candidates = [
            {
                name: "automatic layout",
                mode: PSM.AUTO,
            },
            {
                name: "sparse text layout",
                mode: PSM.SPARSE_TEXT,
            },
        ];

        const results = [];

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            activePass = index;

            reportProgress(
                `Trying ${candidate.name}...`,
                index === 0 ? 6 : 46
            );

            await worker.setParameters({
                tessedit_pageseg_mode: candidate.mode,
                preserve_interword_spaces: "1",
            });

            const result = await worker.recognize(canvas, {}, {
                text: true,
                blocks: true,
            });
            const text = result.data.text ?? "";
            const confidence =
                typeof result.data.confidence === "number" &&
                Number.isFinite(result.data.confidence)
                    ? result.data.confidence
                    : null;

            results.push({
                text,
                confidence,
                lines: getRecognizedLines(result.data),
            });
        }

        const bestResult = results.reduce((best, current) =>
            isBetterRecognition(current, best) ? current : best
        );

        recognizedText = bestResult.text.trim();
        selectedConfidence = bestResult.confidence;
        selectedLines = bestResult.lines;

        focusedRegions = createFocusedLabelRegions(canvas, selectedLines);
        const focusedTexts = [];
        const focusedLines = [];

        for (let index = 0; index < focusedRegions.length; index += 1) {
            if (signal?.aborted) throw abortError();

            activePass = index + 2;
            const region = focusedRegions[index];
            await worker.setParameters({
                tessedit_pageseg_mode: PSM.SPARSE_TEXT,
                preserve_interword_spaces: "1",
            });
            const focusedResult = await worker.recognize(region.canvas, {}, {
                text: true,
                blocks: true,
            });
            const focusedText = String(focusedResult.data.text ?? "").trim();
            if (focusedText) focusedTexts.push(focusedText);
            focusedLines.push(...getRecognizedLines(focusedResult.data));
            region.canvas.width = 0;
            region.canvas.height = 0;
        }

        recognizedText = [recognizedText, ...focusedTexts]
            .filter(Boolean)
            .join("\n");
        selectedLines = [...selectedLines, ...focusedLines];
        reportProgress("OCR and focused label checks completed.", 100);
    } catch (error) {
        scanError = error;
    } finally {
        signal?.removeEventListener("abort", handleAbort);

        if (worker) {
            await terminateWorker();
        }

        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }

        focusedRegions.forEach((region) => {
            region.canvas.width = 0;
            region.canvas.height = 0;
        });
    }

    if (scanError && terminationError) {
        throw new AggregateError(
            [scanError, terminationError],
            "OCR failed and its worker could not be closed cleanly."
        );
    }

    if (scanError) throw scanError;
    if (terminationError) throw terminationError;

    if (returnDetails) {
        return {
            text: recognizedText,
            confidence: selectedConfidence,
            lines: selectedLines,
        };
    }

    return recognizedText;
}

export default extractTextFromImage;
