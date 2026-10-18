import { useEffect, useState } from "react";

import api from "../../lib/api";




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

}) {

  const [medicines, setMedicines] = useState([]);

  const [suppliers, setSuppliers] = useState([]);



  const [formData, setFormData] = useState(() =>
    getInitialFormData(inventory, initialValues)
  );



  const [loadingMedicines, setLoadingMedicines] = useState(true);

  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");



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



  // --------------------------------

  // Handle input changes

  // --------------------------------

  const handleChange = (e) => {

    const { name, value } = e.target;



    setFormData((prev) => ({

      ...prev,

      [name]: value,

    }));

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



  const formIsLoading =

    loading || loadingMedicines || loadingSuppliers;



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

            onChange={handleChange}

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

            onChange={handleChange}

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

        </div>



        {/* Buttons */}

        <div className="flex gap-3 pt-2">

          <button

            type="submit"

            disabled={formIsLoading}

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
