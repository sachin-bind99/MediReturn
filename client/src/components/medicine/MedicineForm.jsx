
import { useState } from "react";
import api from "../../lib/api";

const emptyForm = {
    name: "",
    genericName: "",
    manufacturer: "",
    category: "",
    barcode: "",
    description: "",
};

const fieldClass =
    "h-11 w-full rounded-xl border border-line bg-panel px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:ring-4 focus:ring-mint-100";

function MedicineForm({
    medicine,
    onMedicineAdded,
    onMedicineUpdated,
    onCancel,
}) {
    const [formData, setFormData] = useState(() => ({
        ...emptyForm,
        ...(medicine
            ? {
                  name: medicine.name || "",
                  genericName: medicine.genericName || "",
                  manufacturer: medicine.manufacturer || "",
                  category: medicine.category || "",
                  barcode: medicine.barcode || "",
                  description: medicine.description || "",
              }
            : {}),
    }));

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const validateForm = () => {
        const name = formData.name.trim();
        const genericName = formData.genericName.trim();
        const manufacturer = formData.manufacturer.trim();
        const category = formData.category.trim();
        const barcode = formData.barcode.trim();

        if (!name) return "Medicine name is required.";
        if (!genericName) return "Generic name is required.";
        if (!manufacturer) return "Manufacturer is required.";
        if (!category) return "Category is required.";
        if (!barcode) return "Barcode is required.";

        if (!/^\d+$/.test(barcode)) {
            return "Barcode must contain only numbers.";
        }

        return null;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setLoading(true);

            const cleanData = {
                name: formData.name.trim(),
                genericName: formData.genericName.trim(),
                manufacturer: formData.manufacturer.trim(),
                category: formData.category.trim(),
                barcode: formData.barcode.trim(),
                description: formData.description.trim(),
            };

            if (medicine) {
                const response = await api.put(
                    `/medicines/${medicine._id}`,
                    cleanData
                );

                onMedicineUpdated?.(response.data.medicine);
            } else {
                const response = await api.post(
                    "/medicines",
                    cleanData
                );

                onMedicineAdded?.(response.data.medicine);
            }
        } catch (requestError) {
            console.error("Medicine save error:", requestError);

            setError(
                requestError.response?.data?.message ||
                    "Failed to save medicine."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <section
            className="overflow-hidden rounded-2xl border border-line/80 bg-panel shadow-sm shadow-slate-900/[0.03]"
            aria-labelledby="medicine-form-title"
        >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
                <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint-50 text-mint-700">
                        <svg
                            viewBox="0 0 20 20"
                            className="size-5"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M10 4v12M4 10h12"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                            />
                        </svg>
                    </span>

                    <div>
                        <h2
                            className="text-lg font-semibold tracking-tight text-slate-900"
                            id="medicine-form-title"
                        >
                            {medicine ? "Edit medicine" : "Add a medicine"}
                        </h2>

                        <p className="mt-1 text-sm text-muted">
                            Add the key details your team needs to find it.
                        </p>
                    </div>
                </div>

                <button
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    aria-label="Close form"
                >
                    <svg
                        viewBox="0 0 20 20"
                        className="size-4"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="m5 5 10 10M15 5 5 15"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div>

            <form className="p-5 sm:p-7" onSubmit={handleSubmit}>
                {error && (
                    <p
                        className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
                        role="alert"
                    >
                        {error}
                    </p>
                )}

                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <div>
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-name"
                        >
                            Medicine name <span className="text-rose-500">*</span>
                        </label>

                        <input
                            className={fieldClass}
                            id="medicine-name"
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="e.g. Paracetamol 500 mg"
                            required
                        />
                    </div>

                    <div>
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-generic-name"
                        >
                            Generic name <span className="text-rose-500">*</span>
                        </label>

                        <input
                            className={fieldClass}
                            id="medicine-generic-name"
                            type="text"
                            name="genericName"
                            value={formData.genericName}
                            onChange={handleChange}
                            placeholder="e.g. Paracetamol"
                            required
                        />
                    </div>

                    <div>
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-manufacturer"
                        >
                            Manufacturer <span className="text-rose-500">*</span>
                        </label>

                        <input
                            className={fieldClass}
                            id="medicine-manufacturer"
                            type="text"
                            name="manufacturer"
                            value={formData.manufacturer}
                            onChange={handleChange}
                            placeholder="e.g. ABC Pharma"
                            required
                        />
                    </div>

                    <div>
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-category"
                        >
                            Category <span className="text-rose-500">*</span>
                        </label>

                        <input
                            className={fieldClass}
                            id="medicine-category"
                            type="text"
                            name="category"
                            value={formData.category}
                            onChange={handleChange}
                            placeholder="e.g. Painkiller"
                            required
                        />
                    </div>

                    <div>
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-barcode"
                        >
                            Barcode <span className="text-rose-500">*</span>
                        </label>

                        <input
                            className={fieldClass}
                            id="medicine-barcode"
                            type="text"
                            inputMode="numeric"
                            name="barcode"
                            value={formData.barcode}
                            onChange={handleChange}
                            placeholder="e.g. 8901234567890"
                            required
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label
                            className="mb-2 block text-sm font-semibold text-slate-700"
                            htmlFor="medicine-description"
                        >
                            Description{" "}
                            <span className="font-normal text-slate-400">
                                (optional)
                            </span>
                        </label>

                        <textarea
                            className={`${fieldClass} h-auto min-h-24 resize-y py-3`}
                            id="medicine-description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Add a short note about this medicine"
                            rows="3"
                        />
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                    <button
                        className="h-11 rounded-xl border border-line px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </button>

                    <button
                        className="h-11 rounded-xl bg-mint-700 px-5 text-sm font-semibold text-white shadow-md shadow-mint-900/10 transition hover:bg-mint-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint-200 disabled:cursor-wait disabled:opacity-60"
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? medicine
                                ? "Saving changes…"
                                : "Adding medicine…"
                            : medicine
                              ? "Save changes"
                              : "Add medicine"}
                    </button>
                </div>
            </form>
        </section>
    );
}

export default MedicineForm;
