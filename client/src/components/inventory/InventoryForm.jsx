import { useCallback, useEffect, useRef, useState } from "react";

import api from "../../lib/api";
import {
  applyAvailableSuggestions,
  clearAutomaticSuggestions,
  findDuplicateBatch,
  getSupplierAddress,
  getLatestBatchSuggestions,
  getSupplierDefaultSuggestions,
  MEDICINE_SUGGESTION_FIELDS,
  SUPPLIER_SUGGESTION_FIELDS,
} from "../../utils/inventorySuggestions.js";




const EMPTY_FORM_DATA = {

  medicine: "",

  supplier: "",

  batchNumber: "",

  quantity: "",

  purchasePrice: "",

  expiryDate: "",

  returnWindowDays: "",

  location: "",

};



// Convert a date value to YYYY-MM-DD for <input type="date" />.

const normalizeExpiryDate = (value) => {

  if (!value) return "";



  // Preserve date-only strings as-is to avoid timezone date shifts.

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {

    return value;

  }



  // ISO timestamps that begin with a calendar date can also be safely

  // displayed using their date portion.

  if (

    typeof value === "string" &&

    /^\d{4}-\d{2}-\d{2}T/.test(value)

  ) {

    return value.slice(0, 10);

  }



  const date = new Date(value);



  if (Number.isNaN(date.getTime())) {

    return "";

  }



  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");



  return `${year}-${month}-${day}`;

};



const getId = (value) => value?._id || value || "";

function getInitialFormData(inventory, initialValues) {
  if (inventory) {
    return {
      medicine: getId(inventory.medicine),
      supplier: getId(inventory.supplier),
      batchNumber: inventory.batchNumber || "",
      quantity: inventory.quantity ?? "",
      purchasePrice: inventory.purchasePrice ?? "",
      expiryDate: normalizeExpiryDate(inventory.expiryDate),
      returnWindowDays: inventory.returnWindowDays ?? "",
      location: inventory.location || "",
    };
  }

  return {
    ...EMPTY_FORM_DATA,
    medicine: getId(initialValues?.medicine),
    supplier: getId(initialValues?.supplier),
    batchNumber: initialValues?.batchNumber || "",
    quantity: initialValues?.quantity ?? "",
    purchasePrice: initialValues?.purchasePrice ?? "",
    expiryDate: normalizeExpiryDate(initialValues?.expiryDate),
    returnWindowDays: initialValues?.returnWindowDays ?? "",
    location: initialValues?.location || "",
  };
}



function InventoryForm({

  inventory,

  initialValues = null,

  onInventoryAdded,

  onInventoryUpdated,

  onCancel,

  onOpenExistingBatch,

}) {

  const [medicines, setMedicines] = useState([]);

  const [suppliers, setSuppliers] = useState([]);



  const initialFormData = getInitialFormData(inventory, initialValues);
  const [formData, setFormData] = useState(initialFormData);
  const formDataRef = useRef(initialFormData);
  const manualFieldsRef = useRef(new Set());
  const automaticValuesRef = useRef({});
  const medicineRequestVersionRef = useRef(0);
  const initialMedicineIdRef = useRef(getId(initialValues?.medicine));
  const initialValuesRef = useRef(initialValues || {});
  const [automaticValues, setAutomaticValues] = useState({});
  const [fieldSuggestions, setFieldSuggestions] = useState({});
  const [existingMedicineBatches, setExistingMedicineBatches] = useState([]);
  const [loadingBatchSuggestions, setLoadingBatchSuggestions] = useState(() =>
    Boolean(initialFormData.medicine && !inventory)
  );
  const [batchSuggestionError, setBatchSuggestionError] = useState("");



  const [loadingMedicines, setLoadingMedicines] = useState(true);

  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const selectedSupplier = suppliers.find(
    (supplier) => supplier._id === formData.supplier
  );

  const commitFormData = useCallback((nextValues) => {
    formDataRef.current = nextValues;
    setFormData(nextValues);
  }, []);

  const applyFormSuggestions = useCallback((suggestions) => {
    const result = applyAvailableSuggestions({
      currentValues: formDataRef.current,
      suggestions,
      manuallyEditedFields: manualFieldsRef.current,
      automaticValues: automaticValuesRef.current,
    });
    automaticValuesRef.current = result.automaticValues;
    setAutomaticValues(result.automaticValues);
    commitFormData(result.values);
  }, [commitFormData]);



  // --------------------------------

  // Load medicines

  // --------------------------------

  useEffect(() => {

    const fetchMedicines = async () => {

      try {

        setLoadingMedicines(true);



        const response = await api.get("/medicines");

        setMedicines(response.data.medicines || []);

      } catch (error) {

        console.error("Fetch medicines error:", error);



        setError(

          error.response?.data?.message || "Failed to load medicines"

        );

      } finally {

        setLoadingMedicines(false);

      }

    };



    fetchMedicines();

  }, []);



  // --------------------------------

  // Load suppliers

  // --------------------------------

  useEffect(() => {

    const fetchSuppliers = async () => {

      try {

        setLoadingSuppliers(true);



        const response = await api.get("/suppliers");

        setSuppliers(response.data.suppliers || []);

      } catch (error) {

        console.error("Fetch suppliers error:", error);



        setError(

          error.response?.data?.message || "Failed to load suppliers"

        );

      } finally {

        setLoadingSuppliers(false);

      }

    };



    fetchSuppliers();

  }, []);



  // Load this user's batches for the selected medicine. The inventory API
  // scopes results to the authenticated account and returns the newest batch
  // first when sorted by creation date.
  useEffect(() => {
    const medicineId = formData.medicine;
    if (inventory || !medicineId) {
      return undefined;
    }

    let active = true;
    const requestVersion = medicineRequestVersionRef.current;

    const fetchMedicineBatches = async () => {
      try {
        const response = await api.get("/inventory", {
          params: {
            medicineId,
            sortBy: "createdAt",
            order: "desc",
          },
        });
        if (!active || requestVersion !== medicineRequestVersionRef.current) return;

        const batches = response.data?.data ?? response.data?.inventories ?? [];
        const safeBatches = Array.isArray(batches) ? batches : [];
        setExistingMedicineBatches(safeBatches);

        const values = getLatestBatchSuggestions(safeBatches);
        const normalizedValues = Object.fromEntries(
          Object.entries(values).map(([field, value]) => [
            field,
            field === "expiryDate" ? normalizeExpiryDate(value) : String(value),
          ])
        );
        setFieldSuggestions((current) => {
          const next = { ...current };
          for (const field of MEDICINE_SUGGESTION_FIELDS) delete next[field];
          for (const [field, value] of Object.entries(normalizedValues)) {
            next[field] = { value, source: "previous batch" };
          }
          return next;
        });
        applyFormSuggestions(normalizedValues);
      } catch (requestError) {
        if (!active || requestVersion !== medicineRequestVersionRef.current) return;
        setExistingMedicineBatches([]);
        setBatchSuggestionError(
          requestError.response?.data?.message ||
            "Previous batch suggestions could not be loaded."
        );
      } finally {
        if (active && requestVersion === medicineRequestVersionRef.current) {
          setLoadingBatchSuggestions(false);
        }
      }
    };

    fetchMedicineBatches();
    return () => {
      active = false;
    };
  }, [applyFormSuggestions, formData.medicine, inventory]);



  // --------------------------------

  // Handle input changes

  // --------------------------------

  const handleChange = (e) => {
    const { name, value } = e.target;
    manualFieldsRef.current.add(name);

    if (automaticValuesRef.current[name] !== undefined) {
      const nextAutomaticValues = { ...automaticValuesRef.current };
      delete nextAutomaticValues[name];
      automaticValuesRef.current = nextAutomaticValues;
      setAutomaticValues(nextAutomaticValues);
    }

    commitFormData({ ...formDataRef.current, [name]: value });
  };

  const handleMedicineChange = (e) => {
    const medicineId = e.target.value;
    const previousMedicineId = formDataRef.current.medicine;
    if (medicineId === previousMedicineId) return;
    medicineRequestVersionRef.current += 1;

    const cleared = clearAutomaticSuggestions({
      currentValues: formDataRef.current,
      automaticValues: automaticValuesRef.current,
      fields: MEDICINE_SUGGESTION_FIELDS,
      manuallyEditedFields: manualFieldsRef.current,
    });
    const nextValues = { ...cleared.values, medicine: medicineId };

    // Scanner values belong to the medicine selected in the scanner. Clear
    // untouched batch-specific values if the user changes that medicine.
    if (
      previousMedicineId &&
      medicineId !== previousMedicineId &&
      initialMedicineIdRef.current === previousMedicineId
    ) {
      for (const field of MEDICINE_SUGGESTION_FIELDS) {
        const initialValue = initialValuesRef.current[field];
        const normalizedInitialValue = field === "expiryDate"
          ? normalizeExpiryDate(initialValue)
          : initialValue == null ? "" : String(initialValue);
        if (
          !manualFieldsRef.current.has(field) &&
          normalizedInitialValue !== "" &&
          String(nextValues[field] ?? "") === normalizedInitialValue
        ) {
          nextValues[field] = "";
        }
      }
    }

    automaticValuesRef.current = cleared.automaticValues;
    setAutomaticValues(cleared.automaticValues);
    commitFormData(nextValues);
    setExistingMedicineBatches([]);
    setLoadingBatchSuggestions(Boolean(medicineId));
    setBatchSuggestionError("");
    setFieldSuggestions((current) => {
      const next = { ...current };
      for (const field of MEDICINE_SUGGESTION_FIELDS) delete next[field];
      return next;
    });
  };

  const handleSupplierChange = (e) => {
    const supplierId = e.target.value;
    const cleared = clearAutomaticSuggestions({
      currentValues: formDataRef.current,
      automaticValues: automaticValuesRef.current,
      fields: SUPPLIER_SUGGESTION_FIELDS,
      manuallyEditedFields: manualFieldsRef.current,
    });
    automaticValuesRef.current = cleared.automaticValues;
    setAutomaticValues(cleared.automaticValues);
    commitFormData({ ...cleared.values, supplier: supplierId });

    const supplier = suppliers.find((item) => item._id === supplierId);
    const values = Object.fromEntries(
      Object.entries(getSupplierDefaultSuggestions(supplier)).map(([field, value]) => [
        field,
        String(value),
      ])
    );
    setFieldSuggestions((current) => {
      const next = { ...current };
      for (const field of SUPPLIER_SUGGESTION_FIELDS) delete next[field];
      for (const [field, value] of Object.entries(values)) {
        next[field] = { value, source: "supplier default" };
      }
      return next;
    });
    applyFormSuggestions(values);
  };

  const handleUseSuggestion = (field) => {
    const suggestion = fieldSuggestions[field];
    if (!suggestion) return;

    manualFieldsRef.current.delete(field);
    const nextValue = suggestion.value;
    const nextAutomaticValues = {
      ...automaticValuesRef.current,
      [field]: nextValue,
    };
    automaticValuesRef.current = nextAutomaticValues;
    setAutomaticValues(nextAutomaticValues);
    commitFormData({ ...formDataRef.current, [field]: nextValue });
  };

  const renderSuggestion = (field) => {
    const suggestion = fieldSuggestions[field];
    if (!suggestion) return null;

    const isApplied = automaticValues[field] !== undefined &&
      String(formData[field] ?? "") === automaticValues[field];
    if (isApplied) {
      return (
        <p className="mt-1 text-xs text-amber-700">
          Suggested from a {suggestion.source}; verify this value for the new batch.
        </p>
      );
    }

    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-700">
        <span>
          {suggestion.source === "previous batch" ? "Previous batch" : "Supplier default"} suggestion: {suggestion.value}. Verify before using.
        </span>
        <button
          type="button"
          onClick={() => handleUseSuggestion(field)}
          disabled={loading}
          className="font-semibold underline disabled:opacity-50"
        >
          Use suggestion
        </button>
      </div>
    );
  };



  // --------------------------------

  // Frontend validation

  // --------------------------------

  const validateForm = () => {

    if (!formData.medicine) {

      return "Please select a medicine.";

    }



    if (!formData.supplier) {

      return "Please select a supplier.";

    }



    if (!formData.batchNumber.trim()) {

      return "Batch number is required.";

    }



    if (formData.quantity === "") {

      return "Quantity is required.";

    }



    if (!Number.isFinite(Number(formData.quantity))) {

      return "Quantity must be a valid number.";

    }



    if (Number(formData.quantity) < 0) {

      return "Quantity cannot be negative.";

    }



    if (formData.purchasePrice === "") {

      return "Purchase price is required.";

    }



    if (!Number.isFinite(Number(formData.purchasePrice))) {

      return "Purchase price must be a valid number.";

    }



    if (Number(formData.purchasePrice) < 0) {

      return "Purchase price cannot be negative.";

    }



    if (!formData.expiryDate) {

      return "Expiry date is required.";

    }



    if (formData.returnWindowDays === "") {

      return "Return window is required.";

    }



    if (!Number.isFinite(Number(formData.returnWindowDays))) {

      return "Return window must be a valid number.";

    }



    if (Number(formData.returnWindowDays) < 0) {

      return "Return window cannot be negative.";

    }



    if (!formData.location.trim()) {

      return "Location is required.";

    }



    return null;

  };



  // --------------------------------

  // Submit

  // --------------------------------

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");

    if (duplicateInventory) {
      setError("This medicine already has a batch with that number. Open the existing batch to update it.");
      return;
    }



    const validationError = validateForm();



    if (validationError) {

      setError(validationError);

      return;

    }



    try {

      setLoading(true);



      const payload = {

        medicine: formData.medicine,

        supplier: formData.supplier,

        batchNumber: formData.batchNumber.trim(),

        quantity: Number(formData.quantity),

        purchasePrice: Number(formData.purchasePrice),

        expiryDate: formData.expiryDate,

        returnWindowDays: Number(formData.returnWindowDays),

        location: formData.location.trim(),

      };



      let response;



      // --------------------------------

      // EDIT

      // --------------------------------

      if (inventory) {

        response = await api.put(`/inventory/${inventory._id}`, payload);



        if (onInventoryUpdated) {

          onInventoryUpdated(response.data.inventory);

        }

      } else {

        // --------------------------------

        // ADD

        // --------------------------------

        response = await api.post("/inventory", payload);



        if (onInventoryAdded) {

          onInventoryAdded(response.data.inventory);

        }

      }

    } catch (error) {

      console.error("Inventory save error:", error);



      setError(

        error.response?.data?.message || "Failed to save inventory"

      );

    } finally {

      setLoading(false);

    }

  };



  const duplicateInventory = !inventory
    ? findDuplicateBatch(
        existingMedicineBatches,
        formData.medicine,
        formData.batchNumber
      )
    : null;

  const formIsLoading =
    loading || loadingMedicines || loadingSuppliers || loadingBatchSuggestions;



  return (

    <div className="rounded-lg border border-line bg-panel p-6 shadow-sm">

      {/* Heading */}

      <h2 className="mb-6 text-xl font-semibold text-gray-900">

        {inventory ? "Edit Inventory Batch" : "Add Inventory Batch"}

      </h2>



      {/* Error */}

      {error && (

        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">

          {error}

        </div>

      )}

      {duplicateInventory && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p>
            Batch {duplicateInventory.batchNumber} already exists for this medicine. Open the saved batch to review or update it instead of creating a duplicate.
          </p>
          {onOpenExistingBatch && (
            <button
              type="button"
              onClick={() => onOpenExistingBatch(duplicateInventory)}
              className="mt-2 font-semibold underline"
            >
              Open existing batch
            </button>
          )}
        </div>
      )}

      {batchSuggestionError && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
          {batchSuggestionError} The server will still check for duplicate batches when you save.
        </p>
      )}

      {loadingBatchSuggestions && (
        <p className="mb-4 text-sm text-muted" role="status">
          Checking your saved batches for suggestions…
        </p>
      )}

      {!inventory &&
        formData.medicine &&
        !loadingBatchSuggestions &&
        !batchSuggestionError &&
        existingMedicineBatches.length === 0 && (
          <p className="mb-4 text-sm text-muted" role="status">
            No previous batch is saved for this medicine. Batch number, price, and expiry suggestions are left empty.
          </p>
        )}



      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Medicine */}

        <div>

          <label

            htmlFor="medicine"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Medicine

          </label>



          <select

            id="medicine"

            name="medicine"

            value={formData.medicine}

            onChange={handleMedicineChange}

            disabled={Boolean(inventory) || loadingMedicines || loading}

            className="w-full rounded-lg border border-gray-300 bg-panel px-3 py-2 outline-none focus:border-mint-500 disabled:bg-gray-100"

          >

            <option value="">

              {loadingMedicines ? "Loading medicines..." : "Select Medicine"}

            </option>



            {medicines.map((medicine) => (

              <option key={medicine._id} value={medicine._id}>

                {medicine.name}

              </option>

            ))}

          </select>



          {inventory && (

            <p className="mt-1 text-xs text-muted">

              Medicine cannot be changed after the batch is created.

            </p>

          )}

        </div>



        {/* Supplier */}

        <div>

          <label

            htmlFor="supplier"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Supplier

          </label>



          <select

            id="supplier"

            name="supplier"

            value={formData.supplier}

            onChange={handleSupplierChange}

            disabled={Boolean(inventory) || loadingSuppliers || loading}

            className="w-full rounded-lg border border-gray-300 bg-panel px-3 py-2 outline-none focus:border-mint-500 disabled:bg-gray-100"

          >

            <option value="">

              {loadingSuppliers ? "Loading suppliers..." : "Select Supplier"}

            </option>



            {suppliers.map((supplier) => (

              <option key={supplier._id} value={supplier._id}>

                {supplier.companyName || supplier.name}

              </option>

            ))}

          </select>



          {selectedSupplier && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
              <p className="text-xs font-semibold text-slate-600">Supplier address</p>
              <p className="mt-0.5 text-slate-700">
                {getSupplierAddress(selectedSupplier) || "No supplier address recorded."}
              </p>
              <p className="mt-1 text-xs text-muted">
                This postal address is separate from the pharmacy storage location.
              </p>
            </div>
          )}



          {inventory && (

            <p className="mt-1 text-xs text-muted">

              Supplier cannot be changed after the batch is created.

            </p>

          )}

        </div>



        {/* Batch Number */}

        <div>

          <label

            htmlFor="batchNumber"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Batch Number

          </label>



          <input

            id="batchNumber"

            type="text"

            name="batchNumber"

            value={formData.batchNumber}

            onChange={handleChange}

            placeholder="e.g. PCM001"

            disabled={Boolean(inventory) || loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500 disabled:bg-gray-100"

          />



          {inventory && (

            <p className="mt-1 text-xs text-muted">

              Batch number cannot be changed after creation.

            </p>

          )}

          {renderSuggestion("batchNumber")}

        </div>



        {/* Quantity */}

        <div>

          <label

            htmlFor="quantity"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Quantity

          </label>



          <input

            id="quantity"

            type="number"

            name="quantity"

            value={formData.quantity}

            onChange={handleChange}

            min="0"

            placeholder="e.g. 100"

            disabled={loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500"

          />

        </div>



        {/* Purchase Price */}

        <div>

          <label

            htmlFor="purchasePrice"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Purchase Price

          </label>



          <input

            id="purchasePrice"

            type="number"

            name="purchasePrice"

            value={formData.purchasePrice}

            onChange={handleChange}

            min="0"

            step="0.01"

            placeholder="e.g. 20"

            disabled={loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500"

          />

          {renderSuggestion("purchasePrice")}

        </div>



        {/* Expiry Date */}

        <div>

          <label

            htmlFor="expiryDate"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Expiry Date

          </label>



          <input

            id="expiryDate"

            type="date"

            name="expiryDate"

            value={formData.expiryDate}

            onChange={handleChange}

            disabled={loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500"

          />

          {renderSuggestion("expiryDate")}

        </div>



        {/* Return Window */}

        <div>

          <label

            htmlFor="returnWindowDays"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Return Window (days)

          </label>



          <input

            id="returnWindowDays"

            type="number"

            name="returnWindowDays"

            value={formData.returnWindowDays}

            onChange={handleChange}

            min="0"

            placeholder="e.g. 90"

            disabled={loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500"

          />

          {renderSuggestion("returnWindowDays")}

        </div>



        {/* Location */}

        <div>

          <label

            htmlFor="location"

            className="mb-1 block text-sm font-medium text-gray-700"

          >

            Location

          </label>



          <input

            id="location"

            type="text"

            name="location"

            value={formData.location}

            onChange={handleChange}

            placeholder="e.g. Shelf A-12"

            disabled={loading}

            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-mint-500"

          />

          {renderSuggestion("location")}

        </div>



        {/* Buttons */}

        <div className="flex gap-3 pt-2">

          <button

            type="submit"

            disabled={formIsLoading || Boolean(duplicateInventory)}

            className="rounded-lg bg-mint-700 px-5 py-2 font-medium text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50"

          >

            {loading

              ? inventory

                ? "Saving..."

                : "Adding..."

              : inventory

                ? "Save Changes"

                : "Add Batch"}

          </button>



          <button

            type="button"

            onClick={onCancel}

            disabled={loading}

            className="rounded-lg border border-gray-300 px-5 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"

          >

            Cancel

          </button>

        </div>

      </form>

    </div>

  );

}



export default InventoryForm;
