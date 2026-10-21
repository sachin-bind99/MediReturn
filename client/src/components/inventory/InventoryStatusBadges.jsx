const badgeStyles = {
    lowStock: "bg-orange-50 text-orange-700",
    expired: "bg-red-50 text-red-700",
    expiringSoon: "bg-amber-50 text-amber-700",
    returnOverdue: "bg-red-50 text-red-700",
    returnDue: "bg-orange-50 text-orange-700",
    normal: "bg-green-50 text-green-700",
};

function InventoryStatusBadges({ inventory }) {
    const badges = [];

    if (Number(inventory.quantity) <= 10) {
        badges.push({ key: "low-stock", label: "Low stock", style: badgeStyles.lowStock });
    }
    if (inventory.expiryStatus === "EXPIRED") {
        badges.push({ key: "expired", label: "Expired", style: badgeStyles.expired });
    }
    if (inventory.expiryStatus === "EXPIRING_SOON") {
        badges.push({ key: "expiring-soon", label: "Expiring soon", style: badgeStyles.expiringSoon });
    }
    if (inventory.returnStatus === "RETURN_OVERDUE") {
        badges.push({ key: "return-overdue", label: "Return overdue", style: badgeStyles.returnOverdue });
    }
    if (inventory.returnStatus === "RETURN_DUE") {
        badges.push({ key: "return-due", label: "Return due", style: badgeStyles.returnDue });
    }
    if (
        inventory.expiryStatus === "NORMAL" &&
        inventory.returnStatus === "NORMAL" &&
        Number(inventory.quantity) > 10
    ) {
        badges.push({ key: "normal", label: "Normal", style: badgeStyles.normal });
    }

    if (badges.length === 0) return null;

    return (
        <div
            className="flex min-w-[150px] flex-col items-start gap-1.5"
            role="list"
            aria-label="Inventory status"
        >
            {badges.map((badge) => (
                <span
                    key={badge.key}
                    className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${badge.style}`}
                    role="listitem"
                >
                    {badge.label}
                </span>
            ))}
        </div>
    );
}

export default InventoryStatusBadges;
