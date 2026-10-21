function ResponsiveTableHint({ hideAt = "xl:hidden" }) {
    return (
        <div className={`flex items-center justify-between gap-3 border-b border-line bg-panel-muted/40 px-4 py-2 text-xs text-muted ${hideAt}`}>
            <span>Swipe or scroll horizontally to view all columns.</span>
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" aria-hidden="true">
                <path d="M4 12h16m-5-5 5 5-5 5M4 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

export default ResponsiveTableHint;
