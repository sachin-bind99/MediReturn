
import { createWorker, PSM } from "tesseract.js";

const SUPPORTED_TYPES = ["image/jpeg", "image/png"];

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
                const scale = Math.max(
                    1,
                    Math.min(
                        2.5,
                        2200 / image.naturalWidth,
                        3200 / image.naturalHeight
                    )
                );

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

/**
 * Extract text from an uploaded medicine-package image.
 *
 * onProgress receives:
 * { status: string, progress: number }
 *
 * Returns the selected OCR text as a string.
 */
export async function extractTextFromImage(file, onProgress, { signal } = {}) {
    if (!file || !SUPPORTED_TYPES.includes(file.type)) {
        throw new Error("Please select a JPG, JPEG, or PNG image.");
    }

    if (file.size === 0) {
        throw new Error("The selected image is empty.");
    }

    let canvas;
    let worker;
    let activePass = 0;
    let terminationPromise;
    let terminationError;
    let scanError;
    let recognizedText = "";

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

        canvas = await preprocessImage(file);

        reportProgress("Initializing OCR...", 5);

        if (signal?.aborted) throw abortError();

        worker = await createWorker("eng", 1, {
            logger: (message) => {
                const base = activePass === 0 ? 6 : 52;

                if (message.status === "recognizing text") {
                    const span = 40;
                    const fraction = Number(message.progress) || 0;

                    reportProgress(
                        `Recognizing text (pass ${activePass + 1} of 2)...`,
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
                index === 0 ? 6 : 52
            );

            await worker.setParameters({
                tessedit_pageseg_mode: candidate.mode,
                preserve_interword_spaces: "1",
            });

            const result = await worker.recognize(canvas);
            const text = result.data.text ?? "";

            results.push({
                text,
                score: scoreText(text),
            });
        }

        const bestResult = results.reduce((best, current) =>
            current.score > best.score ? current : best
        );

        reportProgress("OCR completed.", 100);

        recognizedText = bestResult.text.trim();
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
    }

    if (scanError && terminationError) {
        throw new AggregateError(
            [scanError, terminationError],
            "OCR failed and its worker could not be closed cleanly."
        );
    }

    if (scanError) throw scanError;
    if (terminationError) throw terminationError;

    return recognizedText;
}

export default extractTextFromImage;
