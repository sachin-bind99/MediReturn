const IMAGE_SIGNATURES = [
    {
        type: "image/jpeg",
        extension: "jpg",
        matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    },
    {
        type: "image/png",
        extension: "png",
        matches: (bytes) =>
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47 &&
            bytes[4] === 0x0d &&
            bytes[5] === 0x0a &&
            bytes[6] === 0x1a &&
            bytes[7] === 0x0a,
    },
];

/**
 * Validate image bytes and normalize browser-provided MIME metadata.
 * File inputs on some mobile browsers can provide a valid image with an empty
 * or nonstandard type; downstream OCR and barcode readers need canonical MIME.
 */
export async function normalizeMedicineImage(file) {
    if (typeof Blob === "undefined" || !(file instanceof Blob)) {
        throw new Error("Choose a JPG, JPEG, or PNG image file.");
    }

    if (file.size === 0) {
        throw new Error("The selected image is empty.");
    }

    let bytes;
    try {
        bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    } catch {
        throw new Error("The selected image could not be read. Choose another file.");
    }

    const format = IMAGE_SIGNATURES.find((candidate) => candidate.matches(bytes));
    if (!format) {
        throw new Error("The selected file does not contain a valid JPG or PNG image.");
    }

    const originalName =
        typeof file.name === "string" && file.name.trim()
            ? file.name.trim()
            : "medicine-image";
    const extensionIndex = originalName.lastIndexOf(".");
    const baseName = extensionIndex > 0
        ? originalName.slice(0, extensionIndex)
        : originalName;
    const normalizedName = `${baseName}.${format.extension}`;
    const correctExtension = format.extension === "jpg"
        ? /\.(?:jpe?g)$/i.test(originalName)
        : /\.png$/i.test(originalName);

    if (
        typeof File !== "undefined" &&
        file instanceof File &&
        file.type === format.type &&
        correctExtension
    ) {
        return file;
    }

    if (typeof File === "undefined") {
        throw new Error("This browser cannot prepare the selected image for scanning.");
    }

    try {
        return new File([file], normalizedName, {
            type: format.type,
            lastModified: file.lastModified || Date.now(),
        });
    } catch {
        throw new Error("The selected image could not be prepared for scanning.");
    }
}
