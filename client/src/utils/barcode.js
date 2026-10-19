
import {
    BarcodeFormat,
    BrowserMultiFormatOneDReader,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { normalizeMedicineImage } from "./medicineImage";

// The medicine catalog stores numeric retail identifiers. Restrict ZXing to
// the UPC/EAN formats that produce those identifiers; QR, Micro QR, Data
// Matrix, and unrelated industrial formats are not accepted by this workflow.
const SUPPORTED_FORMATS = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
];

function createReader() {
    const hints = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS],
    ]);

    return new BrowserMultiFormatOneDReader(hints);
}

function isNotFoundException(error) {
    return (
        error?.name === "NotFoundException" ||
        error?.getKind?.() === "NotFoundException"
    );
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Unable to read the uploaded image."));
        };

        image.src = url;
    });
}

async function tryDecode(reader, source) {
    try {
        const result = await reader.decodeFromImageUrl(source);
        const text =
            typeof result.getText === "function"
                ? result.getText()
                : result.text;

        return String(text ?? "").trim();
    } catch (error) {
        // ZXing signals an ordinary unsuccessful search with this exception.
        // Let image, decoder, format, and checksum failures reach the caller.
        if (isNotFoundException(error)) return "";
        throw error;
    }
}

function createCropDataUrl(image, x, y, width, height) {
    const cropX = Math.max(0, Math.floor(x));
    const cropY = Math.max(0, Math.floor(y));
    const cropWidth = Math.min(
        image.naturalWidth - cropX,
        Math.floor(width)
    );
    const cropHeight = Math.min(
        image.naturalHeight - cropY,
        Math.floor(height)
    );

    if (cropWidth <= 0 || cropHeight <= 0) {
        return "";
    }

    // Enlarge small barcode regions for better decoding.
    const scale = Math.max(
        1,
        Math.min(3, 1800 / cropWidth)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropWidth * scale);
    canvas.height = Math.round(cropHeight * scale);

    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Unable to prepare the image for barcode scanning.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return canvas.toDataURL("image/png");
}

/**
 * Reads a barcode from an uploaded medicine-package image.
 *
 * Returns the decoded barcode string, or an empty string when no supported
 * UPC/EAN barcode is present. Unexpected image and decoder errors are thrown.
 */
export async function decodeBarcodeFromImage(file) {
    const imageFile = await normalizeMedicineImage(file);

    const reader = createReader();
    const originalUrl = URL.createObjectURL(imageFile);

    try {
        // Attempt 1: Decode the complete original image.
        const originalResult = await tryDecode(reader, originalUrl);

        if (originalResult) {
            return originalResult;
        }
    } finally {
        URL.revokeObjectURL(originalUrl);
    }

    const image = await loadImage(imageFile);
    const { naturalWidth: width, naturalHeight: height } = image;

    // Attempt 2 onwards: Check the complete image and likely
    // barcode regions, including the bottom and lower-right.
    // The full image was already checked. These two focused lower-package
    // crops help when the barcode is small without decoding the same full
    // image twice or probing multiple overlapping regions.
    const regions = [
        [width * 0.15, height * 0.40, width * 0.85, height * 0.60],
        [0, height * 0.50, width, height * 0.50],
    ];

    for (const [x, y, cropWidth, cropHeight] of regions) {
        const dataUrl = createCropDataUrl(
            image,
            x,
            y,
            cropWidth,
            cropHeight
        );

        if (!dataUrl) continue;

        const result = await tryDecode(reader, dataUrl);

        if (result) {
            return result;
        }
    }

    return "";
}

export default decodeBarcodeFromImage;
