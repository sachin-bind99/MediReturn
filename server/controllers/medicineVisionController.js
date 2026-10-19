import {
    MedicineVisionError,
    requestMedicineVisionAnalysis,
    validateMedicineVisionImage,
} from "../utils/medicineVision.js";

export async function analyzeMedicineImage(req, res) {
    const mimeType = String(req.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    const image = req.body;
    const inputError = validateMedicineVisionImage(image, mimeType);

    if (inputError) {
        return res.status(inputError.statusCode).json({
            message: inputError.message,
        });
    }

    try {
        const analysis = await requestMedicineVisionAnalysis({
            image,
            mimeType,
        });

        return res.status(200).json({ analysis });
    } catch (error) {
        if (error instanceof MedicineVisionError) {
            return res.status(error.statusCode).json({
                message: error.message,
            });
        }

        return res.status(502).json({
            message: "AI image analysis failed. Try again later.",
        });
    }
}

export function handleMedicineVisionUploadError(error, req, res, next) {
    if (error?.type === "entity.too.large") {
        return res.status(413).json({
            message: "Images must be 8 MB or smaller.",
        });
    }

    if (error?.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "The image upload could not be read.",
        });
    }

    return next(error);
}
