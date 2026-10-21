import { useCallback, useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";



import api from "../lib/api";
import ResponsiveTableHint from "../components/ResponsiveTableHint.jsx";



function Suppliers() {

    // -----------------------------

    // Suppliers

    // -----------------------------

    const [suppliers, setSuppliers] = useState([]);



    // -----------------------------

    // Search

    // -----------------------------

    const [search, setSearch] = useState("");



    // -----------------------------

    // Loading / Error

    // -----------------------------

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState("");



    // -----------------------------

    // Form

    // -----------------------------

    const [showForm, setShowForm] = useState(false);

    const [selectedSupplier, setSelectedSupplier] = useState(null);

    const [formLoading, setFormLoading] = useState(false);



    const [formData, setFormData] = useState({

        name: "",

        companyName: "",

        phone: "",

        email: "",

        address: "",

        returnPolicy: "",
        defaultReturnWindowDays: "",
        defaultInventoryLocation: ""

    });



    // -----------------------------

    // Delete

    // -----------------------------

    const [supplierToDelete, setSupplierToDelete] = useState(null);

    const [deleting, setDeleting] = useState(false);



    // -----------------------------

    // Navigation

    // -----------------------------

    const navigate = useNavigate();



    // --------------------------------

    // Fetch suppliers

    // --------------------------------

    const fetchSuppliers = useCallback(async () => {

        try {

            setLoading(true);

            setError("");



            const response = await api.get("/suppliers");



            setSuppliers(response.data.suppliers || []);

        } catch (error) {

            console.error("Fetch suppliers error:", error);



            setError(

                error.response?.data?.message ||

                    "Failed to load suppliers"

            );

        } finally {

            setLoading(false);

        }

    }, []);



    // --------------------------------

    // Initial fetch

    // --------------------------------

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            void fetchSuppliers();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchSuppliers]);



    // --------------------------------

    // Search suppliers

    // --------------------------------

    const searchText = search.trim().toLowerCase();



    const filteredSuppliers = suppliers.filter((supplier) => {

        const name = supplier.name?.toLowerCase() || "";



        const companyName =

            supplier.companyName?.toLowerCase() || "";



        const phone =

            supplier.phone?.toLowerCase() || "";



        const email =

            supplier.email?.toLowerCase() || "";



        const address =

            supplier.address?.toLowerCase() || "";



        return (

            name.includes(searchText) ||

            companyName.includes(searchText) ||

            phone.includes(searchText) ||

            email.includes(searchText) ||

            address.includes(searchText)

        );

    });



    // --------------------------------

    // Open Add Form

    // --------------------------------

    const handleAddSupplier = () => {

        setSelectedSupplier(null);



        setFormData({

            name: "",

            companyName: "",

            phone: "",

            email: "",

            address: "",

            returnPolicy: "",
            defaultReturnWindowDays: "",
            defaultInventoryLocation: ""

        });



        setError("");

        setShowForm(true);

    };



    // --------------------------------

    // Open Edit Form

    // --------------------------------

    const handleEditSupplier = (supplier) => {

        setSelectedSupplier(supplier);



        setFormData({

            name: supplier.name || "",

            companyName: supplier.companyName || "",

            phone: supplier.phone || "",

            email: supplier.email || "",

            address: supplier.address || "",

            returnPolicy: supplier.returnPolicy || "",
            defaultReturnWindowDays: supplier.defaultReturnWindowDays ?? "",
            defaultInventoryLocation: supplier.defaultInventoryLocation || ""

        });



        setError("");

        setShowForm(true);

    };



    // --------------------------------

    // View Supplier Details

    // --------------------------------

    const handleViewSupplier = (supplier) => {

        navigate(`/suppliers/${supplier._id}`);

    };



    // --------------------------------

    // Form input handler

    // --------------------------------

    const handleChange = (e) => {

        const { name, value } = e.target;



        // Keep phone number numeric

        if (name === "phone") {

            const numericValue = value.replace(/\D/g, "");



            setFormData((prev) => ({

                ...prev,

                phone: numericValue

            }));



            return;

        }



        setFormData((prev) => ({

            ...prev,

            [name]: value

        }));

    };



    // --------------------------------

    // Validate form

    // --------------------------------

    const validateForm = () => {

        const {

            name,

            companyName,

            phone,

            email,

            address,

            returnPolicy

        } = formData;



        if (!name.trim()) {

            return "Contact name is required";

        }



        if (!companyName.trim()) {

            return "Company name is required";

        }



        if (!/^\d{10}$/.test(phone)) {

            return "Phone number must contain exactly 10 digits";

        }



        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

            return "Please enter a valid email address";

        }



        if (!address.trim()) {

            return "Address is required";

        }



        if (!returnPolicy.trim()) {

            return "Return policy is required";

        }

        if (
            formData.defaultReturnWindowDays !== "" &&
            (!Number.isFinite(Number(formData.defaultReturnWindowDays)) ||
                Number(formData.defaultReturnWindowDays) < 0)
        ) {
            return "Default return window must be a valid non-negative number";
        }



        return "";

    };



    // --------------------------------

    // Add / Update supplier

    // --------------------------------

    const handleSubmit = async (e) => {

        e.preventDefault();



        const validationError = validateForm();



        if (validationError) {

            setError(validationError);

            return;

        }



        try {

            setFormLoading(true);

            setError("");



            const payload = {

                name: formData.name.trim(),

                companyName: formData.companyName.trim(),

                phone: formData.phone.trim(),

                email: formData.email.trim().toLowerCase(),

                address: formData.address.trim(),

                returnPolicy: formData.returnPolicy.trim(),
                defaultReturnWindowDays:
                    formData.defaultReturnWindowDays === ""
                        ? null
                        : Number(formData.defaultReturnWindowDays),
                defaultInventoryLocation: formData.defaultInventoryLocation.trim()

            };



            if (selectedSupplier) {

                // UPDATE

                const response = await api.put(

                    `/suppliers/${selectedSupplier._id}`,

                    payload

                );



                const updatedSupplier =

                    response.data.supplier;



                setSuppliers((prev) =>

                    prev.map((supplier) =>

                        supplier._id === selectedSupplier._id

                            ? updatedSupplier

                            : supplier

                    )

                );

            } else {

                // CREATE

                const response = await api.post(

                    "/suppliers",

                    payload

                );



                const newSupplier =

                    response.data.supplier;



                setSuppliers((prev) => [

                    newSupplier,

                    ...prev

                ]);

            }



            // Close form

            setShowForm(false);

            setSelectedSupplier(null);



            setFormData({

                name: "",

                companyName: "",

                phone: "",

                email: "",

                address: "",

                returnPolicy: "",
                defaultReturnWindowDays: "",
                defaultInventoryLocation: ""

            });

        } catch (error) {

            console.error(

                "Save supplier error:",

                error

            );



            setError(

                error.response?.data?.message ||

                    "Failed to save supplier"

            );

        } finally {

            setFormLoading(false);

        }

    };



    // --------------------------------

    // Delete supplier

    // --------------------------------

    const handleDeleteSupplier = async () => {

        if (!supplierToDelete) {

            return;

        }



        try {

            setDeleting(true);

            setError("");



            await api.delete(

                `/suppliers/${supplierToDelete._id}`

            );



            setSuppliers((prev) =>

                prev.filter(

                    (supplier) =>

                        supplier._id !==

                        supplierToDelete._id

                )

            );



            setSupplierToDelete(null);

        } catch (error) {

            console.error(

                "Delete supplier error:",

                error

            );



            setError(

                error.response?.data?.message ||

                    "Failed to delete supplier"

            );

        } finally {

            setDeleting(false);

        }

    };



    // --------------------------------

    // Cancel form

    // --------------------------------

    const handleCancelForm = () => {

        if (formLoading) {

            return;

        }



        setShowForm(false);

        setSelectedSupplier(null);



        setFormData({

            name: "",

            companyName: "",

            phone: "",

            email: "",

            address: "",

            returnPolicy: "",
            defaultReturnWindowDays: "",
            defaultInventoryLocation: ""

        });



        setError("");

    };



    return (

        <div className="min-h-screen bg-canvas px-4 py-5 sm:p-6">

            <div className="mx-auto max-w-7xl">



                <nav className="mb-6 hidden flex-wrap gap-1 rounded-xl border border-navbar-ink/20 bg-navbar p-1.5 shadow-sm xl:flex" aria-label="Main navigation">

                    <Link className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink" to="/dashboard">Overview</Link>

                    <Link className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink" to="/medicines">Medicines</Link>

                    <Link className="rounded-lg px-3 py-2 text-sm font-medium text-navbar-ink hover:bg-panel/60 hover:text-navbar-ink" to="/inventory">Inventory</Link>

                    <span className="rounded-lg bg-mint-50 px-3 py-2 text-sm font-semibold text-mint-700" aria-current="page">Suppliers</span>

                </nav>



                {/* =========================

                    Header

                ========================== */}

                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                        <h1 className="text-3xl font-bold text-gray-900">

                            Suppliers

                        </h1>



                        <p className="mt-1 text-sm text-muted">

                            Manage your medicine suppliers

                        </p>

                    </div>



                    <button

                        type="button"

                        onClick={handleAddSupplier}

                        className="min-h-11 w-full rounded-lg bg-mint-700 px-4 py-2 font-medium text-white hover:bg-mint-800 sm:w-auto"

                    >

                        + Add Supplier

                    </button>

                </div>



                {/* =========================

                    Search

                ========================== */}

                <div className="mb-6">

                    <input

                        type="text"

                        placeholder="🔍 Search by company, contact, email or phone..."

                        value={search}
                        aria-label="Search suppliers by company, contact, email, or phone"

                        onChange={(e) =>

                            setSearch(e.target.value)

                        }

                        className="w-full rounded-lg border border-gray-300 bg-panel px-4 py-3 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100"

                    />

                </div>



                {/* =========================

                    Error

                ========================== */}

                {error && (

                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-4 text-red-600">

                        <span className="min-w-0 flex-1">{error}</span>



                        <button

                            type="button"

                            onClick={() => setError("")}

                            className="min-h-11 min-w-11 shrink-0 font-bold text-red-500 hover:text-red-700"

                        >

                            ×

                        </button>

                    </div>

                )}



                {/* =========================

                    Loading / Table

                ========================== */}

                {loading ? (

                    <div className="rounded-lg bg-panel p-6 text-center shadow-sm">

                        Loading suppliers...

                    </div>

                ) : (

                    <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-sm">
                        <div className="divide-y divide-line lg:hidden">
                            {filteredSuppliers.length > 0 ? (
                                filteredSuppliers.map((supplier) => (
                                    <article key={supplier._id} className="space-y-4 p-4">
                                        <div className="min-w-0">
                                            <Link
                                                to={`/suppliers/${supplier._id}`}
                                                aria-label={`View details for ${supplier.companyName || supplier.name || "supplier"}`}
                                                className="block break-normal text-base font-semibold text-gray-900 hover:text-mint-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-600"
                                            >
                                                {supplier.companyName || "N/A"}
                                            </Link>
                                            <p className="mt-1 break-normal text-sm text-muted">
                                                Contact: {supplier.name || "N/A"}
                                            </p>
                                        </div>

                                        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 min-[430px]:grid-cols-2">
                                            <div className="min-w-0">
                                                <dt className="text-xs font-medium text-muted">Phone</dt>
                                                <dd className="mt-1 whitespace-nowrap text-sm tabular-nums text-gray-800">
                                                    {supplier.phone || "N/A"}
                                                </dd>
                                            </div>
                                            <div className="min-w-0">
                                                <dt className="text-xs font-medium text-muted">Email</dt>
                                                <dd className="mt-1 break-words text-sm text-gray-800">
                                                    {supplier.email || "N/A"}
                                                </dd>
                                            </div>
                                            <div className="min-w-0">
                                                <dt className="text-xs font-medium text-muted">Address</dt>
                                                <dd className="mt-1 break-normal text-sm text-gray-800">
                                                    {supplier.address || "N/A"}
                                                </dd>
                                            </div>
                                            <div className="min-w-0">
                                                <dt className="text-xs font-medium text-muted">Return policy</dt>
                                                <dd className="mt-1 break-normal text-sm text-gray-800">
                                                    {supplier.returnPolicy || "N/A"}
                                                </dd>
                                            </div>
                                        </dl>

                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleViewSupplier(supplier)}
                                                className="min-h-11 rounded-lg border border-mint-500 px-2 text-sm font-medium text-mint-700 hover:bg-mint-50"
                                            >
                                                View
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleEditSupplier(supplier)}
                                                className="min-h-11 rounded-lg border border-mint-500 px-2 text-sm font-medium text-mint-700 hover:bg-mint-50"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSupplierToDelete(supplier)}
                                                className="min-h-11 rounded-lg border border-red-500 px-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </article>
                                ))
                            ) : (
                                <p className="px-4 py-10 text-center text-sm text-muted">
                                    {search.trim()
                                        ? "No suppliers match your search."
                                        : "No suppliers found."}
                                </p>
                            )}
                        </div>
                        <div className="hidden lg:block">
                        <ResponsiveTableHint />
                        <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" role="region" tabIndex={0} aria-label="Suppliers, horizontally scrollable table">

                            <table className="w-full min-w-[1280px] table-auto">



                                <thead className="bg-gray-100">

                                    <tr>

                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Company

                                        </th>



                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Contact

                                        </th>



                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Phone

                                        </th>



                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Email

                                        </th>



                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Address

                                        </th>



                                        <th className="whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Return Policy

                                        </th>



                                        <th className="min-w-[140px] whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-gray-700">

                                            Actions

                                        </th>

                                    </tr>

                                </thead>



                                <tbody>

                                    {filteredSuppliers.length > 0 ? (

                                        filteredSuppliers.map(

                                            (supplier) => (

                                                <tr

                                                    key={supplier._id}

                                                    className="border-t border-line hover:bg-gray-50"

                                                >

                                                    {/* Company */}

                                                    <td className="px-6 py-4">

                                                        <Link
                                                        to={`/suppliers/${supplier._id}`}
                                                        aria-label={`View details for ${supplier.companyName || supplier.name || "supplier"}`}
                                                        className="break-normal font-medium text-gray-900 transition hover:text-mint-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-600"
                                                    >
                                                        {supplier.companyName || "N/A"}
                                                    </Link>

                                                    </td>



                                                    {/* Contact */}

                                                    <td className="px-6 py-4">

                                                        <div className="font-medium text-gray-900">

                                                            {supplier.name ||

                                                                "N/A"}

                                                        </div>

                                                    </td>



                                                    {/* Phone */}

                                                    <td className="whitespace-nowrap px-6 py-4 tabular-nums text-gray-700">

                                                        {supplier.phone ||

                                                            "N/A"}

                                                    </td>



                                                    {/* Email */}

                                                    <td className="break-words px-6 py-4 text-gray-700">

                                                        {supplier.email ||

                                                            "N/A"}

                                                    </td>



                                                    {/* Address */}

                                                    <td className="max-w-xs px-6 py-4 text-gray-700">

                                                        <div className="break-normal">

                                                            {supplier.address ||

                                                                "N/A"}

                                                        </div>

                                                    </td>



                                                    {/* Return Policy */}

                                                    <td className="max-w-xs px-6 py-4 text-gray-700">

                                                        <div className="break-normal">

                                                            {supplier.returnPolicy ||

                                                                "N/A"}

                                                        </div>

                                                    </td>



                                                    {/* Actions */}

                                                    <td className="min-w-[140px] px-6 py-4">

                                                        <div className="flex flex-col gap-2">



                                                            {/* View */}

                                                            <button

                                                                type="button"

                                                                onClick={() =>

                                                                    handleViewSupplier(

                                                                        supplier

                                                                    )

                                                                }

                                                                className="w-full whitespace-nowrap rounded-lg border border-mint-500 px-3 py-1 text-sm font-medium text-mint-700 hover:bg-mint-50"

                                                            >

                                                                View

                                                            </button>



                                                            {/* Edit */}

                                                            <button

                                                                type="button"

                                                                onClick={() =>

                                                                    handleEditSupplier(

                                                                        supplier

                                                                    )

                                                                }

                                                                className="w-full whitespace-nowrap rounded-lg border border-mint-500 px-3 py-1 text-sm font-medium text-mint-700 hover:bg-mint-50"

                                                            >

                                                                Edit

                                                            </button>



                                                            {/* Delete */}

                                                            <button

                                                                type="button"

                                                                onClick={() =>

                                                                    setSupplierToDelete(

                                                                        supplier

                                                                    )

                                                                }

                                                                className="w-full whitespace-nowrap rounded-lg border border-red-500 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"

                                                            >

                                                                Delete

                                                            </button>



                                                        </div>

                                                    </td>

                                                </tr>

                                            )

                                        )

                                    ) : (

                                        <tr>

                                            <td

                                                colSpan="7"

                                                className="px-6 py-10 text-center text-muted"

                                            >

                                                {search.trim()

                                                    ? "No suppliers match your search."

                                                    : "No suppliers found."}

                                            </td>

                                        </tr>

                                    )}

                                </tbody>



                            </table>

                        </div>

                        </div>

                    </div>

                )}



                {/* =========================

                    Add / Edit Modal

                ========================== */}

                {showForm && (

                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4" role="presentation">

                        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title">



                            {/* Modal Header */}

                            <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">

                                <div>

                                    <h2 id="supplier-form-title" className="text-xl font-semibold text-gray-900">

                                        {selectedSupplier

                                            ? "Edit Supplier"

                                            : "Add Supplier"}

                                    </h2>



                                    <p className="mt-1 text-sm text-muted">

                                        {selectedSupplier

                                            ? "Update supplier information."

                                            : "Enter supplier information."}

                                    </p>

                                </div>



                                <button

                                    type="button"

                                    onClick={handleCancelForm}

                                    disabled={formLoading}

                                    className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed"

                                >

                                    ×

                                </button>

                            </div>



                            {/* Modal Body */}

                            <form

                                onSubmit={handleSubmit}

                                className="space-y-5 p-4 sm:p-6"

                            >



                                {/* Contact Name */}

                                <div>

                                    <label htmlFor="supplier-contact-name" className="mb-2 block text-sm font-medium text-gray-700">

                                        Contact Name

                                    </label>



                                    <input

                                        type="text"

                                        id="supplier-contact-name"
                                        name="name"

                                        value={formData.name}

                                        onChange={handleChange}

                                        placeholder="Enter contact name"

                                        disabled={formLoading}

                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                    />

                                </div>



                                {/* Company Name */}

                                <div>

                                    <label htmlFor="supplier-company-name" className="mb-2 block text-sm font-medium text-gray-700">

                                        Company Name

                                    </label>



                                    <input

                                        type="text"

                                        id="supplier-company-name"
                                        name="companyName"

                                        value={formData.companyName}

                                        onChange={handleChange}

                                        placeholder="Enter company name"

                                        disabled={formLoading}

                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                    />

                                </div>



                                {/* Phone + Email */}

                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">



                                    {/* Phone */}

                                    <div>

                                        <label htmlFor="supplier-phone" className="mb-2 block text-sm font-medium text-gray-700">

                                            Phone

                                        </label>



                                        <input

                                            type="text"

                                            id="supplier-phone"
                                            name="phone"

                                            value={formData.phone}

                                            onChange={handleChange}

                                            placeholder="10-digit phone number"

                                            maxLength={10}

                                            disabled={formLoading}

                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                        />

                                    </div>



                                    {/* Email */}

                                    <div>

                                        <label htmlFor="supplier-email" className="mb-2 block text-sm font-medium text-gray-700">

                                            Email

                                        </label>



                                        <input

                                            type="email"

                                            id="supplier-email"
                                            name="email"

                                            value={formData.email}

                                            onChange={handleChange}

                                            placeholder="supplier@example.com"

                                            disabled={formLoading}

                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                        />

                                    </div>

                                </div>



                                {/* Address */}

                                <div>

                                    <label htmlFor="supplier-address" className="mb-2 block text-sm font-medium text-gray-700">

                                        Address

                                    </label>



                                    <textarea

                                        id="supplier-address"
                                        name="address"

                                        value={formData.address}

                                        onChange={handleChange}

                                        placeholder="Enter supplier address"

                                        rows={3}

                                        disabled={formLoading}

                                        className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                    />

                                </div>



                                {/* Return Policy */}

                                <div>

                                    <label htmlFor="supplier-return-policy" className="mb-2 block text-sm font-medium text-gray-700">

                                        Return Policy

                                    </label>



                                    <textarea

                                        id="supplier-return-policy"
                                        name="returnPolicy"

                                        value={formData.returnPolicy}

                                        onChange={handleChange}

                                        placeholder="Example: Returns accepted within 90 days for damaged or expired stock."

                                        rows={3}

                                        disabled={formLoading}

                                        className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"

                                    />

                                </div>



                                {/* Optional defaults for new inventory batches */}
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div>
                                        <label htmlFor="supplier-default-return-window" className="mb-2 block text-sm font-medium text-gray-700">
                                            Default Return Window (days)
                                        </label>
                                        <input
                                            type="number"
                                            id="supplier-default-return-window"
                                            name="defaultReturnWindowDays"
                                            value={formData.defaultReturnWindowDays}
                                            onChange={handleChange}
                                            min="0"
                                            step="any"
                                            placeholder="Optional"
                                            disabled={formLoading}
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="supplier-default-inventory-location" className="mb-2 block text-sm font-medium text-gray-700">
                                            Default Inventory Location
                                        </label>
                                        <input
                                            type="text"
                                            id="supplier-default-inventory-location"
                                            name="defaultInventoryLocation"
                                            value={formData.defaultInventoryLocation}
                                            onChange={handleChange}
                                            placeholder="Optional shelf or rack"
                                            disabled={formLoading}
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100 disabled:bg-gray-100"
                                        />
                                    </div>
                                </div>
                                <p className="-mt-3 text-xs text-muted">
                                    These optional defaults prefill new inventory batches. The location is a shop storage location, separate from the supplier address.
                                </p>

                                {/* Buttons */}

                                <div className="flex flex-col gap-3 border-t pt-5 min-[420px]:flex-row min-[420px]:justify-end">



                                    <button

                                        type="button"

                                        onClick={handleCancelForm}

                                        disabled={formLoading}

                                        className="min-h-11 w-full rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 min-[420px]:w-auto"

                                    >

                                        Cancel

                                    </button>



                                    <button

                                        type="submit"

                                        disabled={formLoading}

                                        className="min-h-11 w-full rounded-lg bg-mint-700 px-5 py-2 font-medium text-white hover:bg-mint-800 disabled:cursor-not-allowed disabled:opacity-50 min-[420px]:w-auto"

                                    >

                                        {formLoading

                                            ? "Saving..."

                                            : selectedSupplier

                                            ? "Update Supplier"

                                            : "Save Supplier"}

                                    </button>



                                </div>

                            </form>

                        </div>

                    </div>

                )}



                {/* =========================

                    Delete Confirmation Modal

                ========================== */}

                {supplierToDelete && (

                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4" role="presentation">

                        <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-4 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="supplier-delete-title">



                            <h2 id="supplier-delete-title" className="text-xl font-semibold text-gray-900">

                                Delete Supplier

                            </h2>



                            <p className="mt-3 text-sm leading-6 text-gray-600">

                                Are you sure you want to delete{" "}

                                <span className="break-normal font-semibold text-gray-900">

                                    {supplierToDelete.companyName}

                                </span>

                                ?

                                <br />

                                This action cannot be undone.

                            </p>



                            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:justify-end">



                                <button

                                    type="button"

                                    onClick={() =>

                                        setSupplierToDelete(null)

                                    }

                                    disabled={deleting}

                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 min-[420px]:w-auto"

                                >

                                    Cancel

                                </button>



                                <button

                                    type="button"

                                    onClick={handleDeleteSupplier}

                                    disabled={deleting}

                                    className="min-h-11 w-full rounded-lg bg-danger-button px-4 py-2 font-medium text-white hover:bg-danger-button-hover disabled:cursor-not-allowed disabled:opacity-50 min-[420px]:w-auto"

                                >

                                    {deleting

                                        ? "Deleting..."

                                        : "Delete Supplier"}

                                </button>



                            </div>

                        </div>

                    </div>

                )}



            </div>

        </div>

    );

}



export default Suppliers;
