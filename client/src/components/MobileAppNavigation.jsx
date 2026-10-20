import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const navigationItems = [
    { label: "Overview", to: "/dashboard", marker: "O" },
    { label: "Medicines", to: "/medicines", marker: "M" },
    { label: "Medicine scanner", to: "/medicine-scanner", marker: "S" },
    { label: "Inventory", to: "/inventory", marker: "I" },
    { label: "Suppliers", to: "/suppliers", marker: "P" },
    { label: "Returns", to: "/returns", marker: "R" },
    { label: "Alerts", to: "/alerts", marker: "A" },
];

function MobileAppNavigation() {
    const [isOpen, setIsOpen] = useState(false);
    const dialogRef = useRef(null);
    const firstLinkRef = useRef(null);
    const { pathname } = useLocation();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return undefined;

        if (isOpen) {
            if (!dialog.open) dialog.showModal();
            firstLinkRef.current?.focus();
        } else if (dialog.open) {
            dialog.close();
        }

        return () => {
            if (dialog.open) dialog.close();
        };
    }, [isOpen]);

    useEffect(() => {
        const desktopViewport = window.matchMedia("(min-width: 64rem)");
        const closeOnDesktop = () => {
            if (desktopViewport.matches) setIsOpen(false);
        };

        desktopViewport.addEventListener("change", closeOnDesktop);
        return () => desktopViewport.removeEventListener("change", closeOnDesktop);
    }, []);

    const closeMenu = () => setIsOpen(false);

    return (
        <div className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-navbar-ink/20 bg-navbar px-4 text-navbar-ink lg:hidden">
            <Link
                className="rounded font-semibold tracking-tight text-navbar-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-200"
                to="/dashboard"
            >
                MediReturn
            </Link>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls="mobile-app-navigation"
                onClick={() => setIsOpen(true)}
                className="inline-flex h-10 min-w-11 items-center justify-center gap-2 rounded-xl border border-navbar-ink/25 bg-panel/30 px-3 text-sm font-semibold text-navbar-ink transition hover:bg-panel/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-200"
            >
                <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                Menu
            </button>

            <dialog
                id="mobile-app-navigation"
                ref={dialogRef}
                aria-labelledby="mobile-app-navigation-title"
                onCancel={closeMenu}
                onClose={closeMenu}
                onClick={(event) => {
                    if (event.target === dialogRef.current) closeMenu();
                }}
                className="fixed inset-0 z-[80] m-0 h-dvh max-h-dvh w-full max-w-full overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-slate-950/55 lg:hidden"
            >
                <div className="flex h-full w-[min(21rem,calc(100vw-1rem))] max-w-full flex-col border-r border-line bg-panel shadow-2xl">
                    <div className="flex min-h-16 items-center justify-between border-b border-line px-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                                MediReturn
                            </p>
                            <h2 id="mobile-app-navigation-title" className="mt-0.5 font-semibold text-slate-900">
                                Workspace menu
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={closeMenu}
                            aria-label="Close navigation menu"
                            className="grid size-11 place-items-center rounded-xl border border-line text-xl text-slate-700 transition hover:bg-panel-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    </div>
                    <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto p-3">
                        <ul className="space-y-1">
                            {navigationItems.map((item, index) => {
                                const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
                                return (
                                    <li key={item.to}>
                                        <Link
                                            ref={index === 0 ? firstLinkRef : undefined}
                                            to={item.to}
                                            onClick={closeMenu}
                                            aria-current={isActive ? "page" : undefined}
                                            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                                isActive
                                                    ? "bg-mint-50 text-mint-800 ring-1 ring-inset ring-mint-100"
                                                    : "text-slate-700 hover:bg-panel-muted"
                                            }`}
                                        >
                                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint-100 text-xs font-bold text-mint-800" aria-hidden="true">
                                                {item.marker}
                                            </span>
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                </div>
            </dialog>
        </div>
    );
}

export default MobileAppNavigation;
