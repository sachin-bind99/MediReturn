import { useEffect, useRef, useState } from "react";

import { Link } from "react-router-dom";
import api from "../lib/api";

import MedicineForm from "../components/medicine/MedicineForm";

const inputClass = "h-12 w-full rounded-xl border border-line bg-panel px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:ring-4 focus:ring-mint-100";

function Medicines() {

    const [medicines, setMedicines] = useState([]);

    const [search, setSearch] = useState("");

    const [category, setCategory] = useState("All Categories");

    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);

    const [selectedMedicine, setSelectedMedicine] = useState(null);

    const medicineFormRef = useRef(null);

    const [medicineToDelete, setMedicineToDelete] = useState(null);

    const [deleting, setDeleting] = useState(false);

    const [error, setError] = useState("");

    const fetchMedicines = async () => {

        try {

            setLoading(true);

            setError("");

            const response = await api.get("/medicines");

            const data = response.data;

            setMedicines(data.medicines || []);

        } catch (error) {

            console.error("Fetch medicines error:", error);

            setError(

                error.response?.data?.message ||

                    error.message ||

                    "Failed to fetch medicines"

            );

        } finally {

            setLoading(false);

        }

    };

    // Load the initial catalog asynchronously. Keep the initial loading state
    // true until the request settles, rather than setting state synchronously
    // from inside this effect.
    useEffect(() => {
        const controller = new AbortController();

        const loadInitialMedicines = async () => {
            try {
                const response = await api.get("/medicines", {
                    signal: controller.signal,
                });

                setMedicines(response.data.medicines || []);
            } catch (requestError) {
                if (controller.signal.aborted) return;

                console.error("Fetch medicines error:", requestError);
                setError(
                    requestError.response?.data?.message ||
                        requestError.message ||
                        "Failed to fetch medicines"
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        loadInitialMedicines();

        return () => controller.abort();
    }, []);

    // Bring the form into view after Add or Edit is selected.
    useEffect(() => {
        if (!showForm || !medicineFormRef.current) return;

        medicineFormRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }, [showForm, selectedMedicine]);

    // Derive category options from the catalog so custom categories appear too.

    const categories = [

        ...new Set(

            medicines

                .map((medicine) => medicine.category?.trim())

                .filter(Boolean)

        ),

    ].sort((a, b) => a.localeCompare(b));

    const filteredMedicines = medicines.filter((medicine) => {

        const searchText = search.trim().toLowerCase();

        const matchesSearch =

            medicine.name?.toLowerCase().includes(searchText) ||

            medicine.genericName?.toLowerCase().includes(searchText) ||

            medicine.manufacturer?.toLowerCase().includes(searchText) ||

            medicine.category?.toLowerCase().includes(searchText) ||

            String(medicine.barcode ?? "").toLowerCase().includes(searchText);

        const matchesCategory =

            category === "All Categories" ||

            medicine.category?.toLowerCase() === category.toLowerCase();

        return matchesSearch && matchesCategory;

    });

    const handleAddMedicine = () => {

        setSelectedMedicine(null);

        setShowForm(true);

    };

    const handleEditMedicine = (medicine) => {

        setSelectedMedicine(medicine);

        setShowForm(true);

    };

    const handleMedicineAdded = () => {

        setShowForm(false);

        setSelectedMedicine(null);

        fetchMedicines();

    };

    const handleMedicineUpdated = () => {

        setShowForm(false);

        setSelectedMedicine(null);

        fetchMedicines();

    };

    const handleCancel = () => {

        setShowForm(false);

        setSelectedMedicine(null);

    };

    const handleDeleteMedicine = async () => {

        if (!medicineToDelete) return;

        try {

            setDeleting(true);

            setError("");

            await api.delete(`/medicines/${medicineToDelete._id}`);

            setMedicineToDelete(null);

            await fetchMedicines();

        } catch (error) {

            console.error("Delete medicine error:", error);

            setError(

                error.response?.data?.message ||

                    error.message ||

                    "Failed to delete medicine"

            );

        } finally {

            setDeleting(false);

        }

    };

    const handleCancelDelete = () => {

        if (!deleting) setMedicineToDelete(null);

    };

    return (

        <div className="min-h-screen bg-canvas text-slate-800">

            <header className="border-b border-navbar-ink/20 bg-navbar text-navbar-ink shadow-sm backdrop-blur-xl">

                <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-7 lg:px-10">

                    <Link className="flex shrink-0 items-center gap-3 font-semibold tracking-tight text-navbar-ink" to="/dashboard">

                        <span className="grid size-10 place-items-center rounded-2xl bg-mint-100 text-mint-700" aria-hidden="true">

                            <svg viewBox="0 0 24 24" className="size-5" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>

                        </span>

                        <span className="text-lg">Medi<span className="text-navbar-ink">Return</span></span>

                    </Link>

                    <nav className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-4" aria-label="Main navigation">

                        <Link className="rounded-lg px-2.5 py-2 text-sm font-medium text-navbar-ink transition hover:bg-panel/60 hover:text-navbar-ink sm:px-3" to="/dashboard">Overview</Link>

                        <Link className="rounded-lg px-2.5 py-2 text-sm font-medium text-navbar-ink transition hover:bg-panel/60 hover:text-navbar-ink sm:px-3" to="/inventory">Inventory</Link>

                        <Link className="rounded-lg px-2.5 py-2 text-sm font-medium text-navbar-ink transition hover:bg-panel/60 hover:text-navbar-ink sm:px-3" to="/suppliers">Suppliers</Link>

                        <span className="rounded-lg bg-mint-50 px-2.5 py-2 text-sm font-semibold text-mint-800 sm:px-3" aria-current="page">Medicines</span>

                    </nav>

                </div>

            </header>

            <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12">

                <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">

                    <div>

                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">

                            <Link className="transition hover:text-mint-700" to="/dashboard">Workspace</Link>

                            <span aria-hidden="true">/</span>

                            <span className="text-mint-700">Medicine catalog</span>

                        </div>

                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Medicines</h1>

                        <p className="mt-2 text-sm leading-6 text-muted sm:text-base">Keep your catalog tidy and easy for your team to search.</p>

                    </div>

                    <button type="button" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-mint-700 px-4 text-sm font-semibold text-white shadow-lg shadow-mint-900/10 transition hover:bg-mint-800 sm:w-auto" onClick={handleAddMedicine}>

                        <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>

                        Add medicine

                    </button>

                </div>

                <div className="mb-5 flex flex-wrap items-center gap-3">

                    <div className="inline-flex items-center gap-2 rounded-xl border border-line/80 bg-panel px-3.5 py-2.5 text-sm shadow-sm shadow-slate-900/[0.02]">

                        <span className="grid size-8 place-items-center rounded-lg bg-mint-50 text-mint-700"><svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M6.8 4.2a3.5 3.5 0 0 1 5 0l4 4a3.5 3.5 0 0 1-5 5l-4-4a3.5 3.5 0 0 1 0-5Z" stroke="currentColor" strokeWidth="1.5"/><path d="m7.5 11.4 6.9-6.9" stroke="currentColor" strokeWidth="1.5"/></svg></span>

                        <span><span className="font-semibold text-slate-800">{medicines.length}</span> <span className="text-muted">{medicines.length === 1 ? "medicine" : "medicines"}</span></span>

                    </div>

                    {!loading && !error && <span className="text-sm text-slate-400">Showing {filteredMedicines.length} of {medicines.length}</span>}

                </div>

                {showForm && (

                    <div
                        ref={medicineFormRef}
                        className="mb-6 scroll-mt-6"
                    >

                        <MedicineForm
                            key={selectedMedicine?._id ?? "new"}
                            medicine={selectedMedicine}

                            onMedicineAdded={handleMedicineAdded}

                            onMedicineUpdated={handleMedicineUpdated}

                            onCancel={handleCancel}

                        />

                    </div>

                )}

                <section className="mb-5 rounded-2xl border border-line/80 bg-panel p-4 shadow-sm shadow-slate-900/[0.02] sm:p-5" aria-label="Search and filter medicines">

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">

                        <label className="relative block">

                            <span className="sr-only">Search medicines</span>

                            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" fill="none" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3" stroke="currentColor" strokeWidth="1.6"/><path d="m12.7 12.7 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>

                            <input className={`${inputClass} pl-11`} type="search" placeholder="Search by name, manufacturer or barcode" value={search} onChange={(event) => setSearch(event.target.value)} />

                        </label>

                        <label>

                            <span className="sr-only">Filter by category</span>

                            <select className={`${inputClass} cursor-pointer`} value={category} onChange={(event) => setCategory(event.target.value)}>

                                <option value="All Categories">All categories</option>

                                {categories.map((categoryOption) => (

                                    <option key={categoryOption} value={categoryOption}>

                                        {categoryOption}

                                    </option>

                                ))}

                            </select>

                        </label>

                    </div>

                </section>

                {error && (

                    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between" role="alert">

                        <div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-rose-600"><svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M10 6v4m0 3h.01M8.3 3.8 2.7 14a1.5 1.5 0 0 0 1.3 2.2h12a1.5 1.5 0 0 0 1.3-2.2L11.7 3.8a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>{error}</span></div>

                        <button className="w-fit rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100" type="button" onClick={fetchMedicines}>Try again</button>

                    </div>

                )}

                {loading && (

                    <div className="grid min-h-64 place-items-center rounded-2xl border border-line/80 bg-panel p-8 shadow-sm shadow-slate-900/[0.02]" role="status">

                        <div className="flex flex-col items-center text-center"><span className="size-9 animate-spin rounded-full border-[3px] border-mint-100 border-t-mint-700"/><p className="mt-4 text-sm font-semibold text-slate-700">Loading your catalog</p><p className="mt-1 text-xs text-slate-400">Just a moment…</p></div>

                    </div>

                )}

                {!loading && !error && (

                    <section className="overflow-hidden rounded-2xl border border-line/80 bg-panel shadow-sm shadow-slate-900/[0.03]" aria-label="Medicine catalog">

                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">

                            <div><h2 className="text-sm font-semibold text-slate-900">Catalog</h2><p className="mt-0.5 text-xs text-muted">Medicine details and actions</p></div>

                            <span className="hidden rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-muted sm:inline-flex">{filteredMedicines.length} results</span>

                        </div>

                        <div className="overflow-x-auto">

                            <table className="w-full min-w-[720px] text-left">

                                <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">

                                    <tr><th className="px-6 py-3.5">Medicine</th><th className="px-6 py-3.5">Manufacturer</th><th className="px-6 py-3.5">Category</th><th className="px-6 py-3.5">Barcode</th><th className="px-6 py-3.5 text-right">Actions</th></tr>

                                </thead>

                                <tbody className="divide-y divide-slate-100">

                                    {filteredMedicines.length > 0 ? filteredMedicines.map((medicine, index) => (

                                        <tr className="transition hover:bg-mint-50/35" key={medicine._id}>

                                            <td className="px-6 py-4">

                                                <div className="flex items-center gap-3">

                                                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${["bg-mint-50 text-mint-700", "bg-amber-50 text-amber-700", "bg-sage-light/60 text-mint-800", "bg-mint-100 text-mint-800"][index % 4]}`} aria-hidden="true"><svg viewBox="0 0 20 20" className="size-5" fill="none"><path d="M6.8 4.2a3.5 3.5 0 0 1 5 0l4 4a3.5 3.5 0 0 1-5 5l-4-4a3.5 3.5 0 0 1 0-5Z" stroke="currentColor" strokeWidth="1.5"/><path d="m7.5 11.4 6.9-6.9" stroke="currentColor" strokeWidth="1.5"/></svg></span>

                                                    <div>

                                                        <Link

                                                            to={`/medicines/${medicine._id}`}

                                                            aria-label={`View details for ${medicine.name}`}

                                                            className="rounded-sm font-semibold text-slate-800 transition hover:text-mint-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500"

                                                        >

                                                            {medicine.name}

                                                        </Link>

                                                        <p className="mt-0.5 text-xs text-muted">

                                                            {medicine.genericName}

                                                        </p>

                                                    </div>

                                                </div>

                                            </td>

                                            <td className="px-6 py-4 text-sm text-slate-600">{medicine.manufacturer}</td>

                                            <td className="px-6 py-4"><span className="inline-flex rounded-full bg-mint-50 px-2.5 py-1 text-xs font-semibold text-mint-800">{medicine.category}</span></td>

                                            <td className="px-6 py-4 font-mono text-xs text-muted">{medicine.barcode || "—"}</td>

                                            <td className="px-6 py-4"><div className="flex justify-end gap-2">

                                                <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-mint-300 hover:bg-mint-50 hover:text-mint-800" onClick={() => handleEditMedicine(medicine)}>Edit</button>

                                                <button type="button" className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50" onClick={() => setMedicineToDelete(medicine)}>Delete</button>

                                            </div></td>

                                        </tr>

                                    )) : (

                                        <tr><td colSpan="5" className="px-6 py-16 text-center">

                                            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-50 text-slate-400"><svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3" stroke="currentColor" strokeWidth="1.6"/><path d="m12.7 12.7 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>

                                            <p className="mt-4 font-semibold text-slate-800">No medicines found</p>

                                            <p className="mt-1 text-sm text-muted">Try another search or add a medicine to your catalog.</p>

                                            {medicines.length === 0 && <button type="button" className="mt-4 text-sm font-semibold text-mint-700 hover:text-mint-800" onClick={handleAddMedicine}>Add your first medicine</button>}

                                        </td></tr>

                                    )}

                                </tbody>

                            </table>

                        </div>

                    </section>

                )}

            </main>

            {medicineToDelete && (

                <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCancelDelete(); }}>

                    <section className="w-full max-w-md rounded-3xl border border-white/60 bg-panel p-6 shadow-2xl shadow-slate-950/25 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="delete-title">

                        <span className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.5 0 .6 10h6.8l.6-10M8 6V4h4v2m-3 3v4m2-4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>

                        <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-900" id="delete-title">Delete this medicine?</h2>

                        <p className="mt-2 text-sm leading-6 text-muted">This will remove the medicine from your catalog.</p>

                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">

                            <p className="font-semibold text-slate-800">{medicineToDelete.name}</p>

                            <p className="mt-1 text-sm text-muted">{medicineToDelete.genericName}</p>

                            <p className="mt-1 text-xs text-slate-400">{medicineToDelete.manufacturer}</p>

                        </div>

                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

                            <button type="button" className="h-11 rounded-xl border border-line px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50" onClick={handleCancelDelete} disabled={deleting}>Keep medicine</button>

                            <button type="button" className="h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50" onClick={handleDeleteMedicine} disabled={deleting}>{deleting ? "Deleting…" : "Delete medicine"}</button>

                        </div>

                    </section>

                </div>

            )}

        </div>

    );

}

export default Medicines;
