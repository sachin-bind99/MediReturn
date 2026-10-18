const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_EXPIRING_SOON_DAYS = 30;

// ----------------------------------------
// Expiry statuses
// ----------------------------------------
export const EXPIRY_STATUS = {
    NORMAL: "NORMAL",
    EXPIRING_SOON: "EXPIRING_SOON",
    EXPIRED: "EXPIRED",
};

// ----------------------------------------
// Return statuses
// ----------------------------------------
export const RETURN_STATUS = {
    NORMAL: "NORMAL",
    RETURN_DUE: "RETURN_DUE",
    RETURN_OVERDUE: "RETURN_OVERDUE",
};

// ----------------------------------------
// Convert a value into a date-only UTC date
// This prevents time/timezone from affecting
// calculations based on calendar dates.
// ----------------------------------------
const toDateOnly = (value) => {
    if (!value) {
        return null;
    }

    // Date object
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }

        return new Date(
            Date.UTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate()
            )
        );
    }

    // YYYY-MM-DD or ISO date string
    if (typeof value === "string") {
        const match = value.match(
            /^(\d{4})-(\d{2})-(\d{2})/
        );

        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]) - 1;
            const day = Number(match[3]);

            const date = new Date(
                Date.UTC(year, month, day)
            );

            // Validate actual calendar date
            if (
                date.getUTCFullYear() !== year ||
                date.getUTCMonth() !== month ||
                date.getUTCDate() !== day
            ) {
                return null;
            }

            return date;
        }
    }

    // Fallback for other date values
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    return new Date(
        Date.UTC(
            parsedDate.getUTCFullYear(),
            parsedDate.getUTCMonth(),
            parsedDate.getUTCDate()
        )
    );
};

// ----------------------------------------
// Get today's date without time
// ----------------------------------------
const getToday = () => {
    const now = new Date();

    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
        )
    );
};

// ----------------------------------------
// Validate return window
// ----------------------------------------
const normalizeReturnWindowDays = (
    returnWindowDays
) => {
    const days = Number(returnWindowDays);

    if (
        !Number.isFinite(days) ||
        days < 0
    ) {
        return null;
    }

    return days;
};

// ----------------------------------------
// 1. Calculate Return Deadline
//
// Formula:
//
// returnDeadline = expiryDate - returnWindowDays
//
// Example:
//
// Expiry: 20 Dec 2026
// Return window: 90 days
//
// Result:
// 21 Sep 2026
// ----------------------------------------
export const calculateReturnDeadline = (
    expiryDate,
    returnWindowDays
) => {
    const expiry = toDateOnly(expiryDate);

    const days = normalizeReturnWindowDays(
        returnWindowDays
    );

    if (!expiry || days === null) {
        return null;
    }

    const returnDeadline = new Date(expiry);

    returnDeadline.setUTCDate(
        returnDeadline.getUTCDate() - days
    );

    return returnDeadline;
};

// ----------------------------------------
// 2. Calculate Days Until Expiry
//
// Positive:
// expiry is in the future
//
// 0:
// expires today
//
// Negative:
// already expired
// ----------------------------------------
export const getDaysUntilExpiry = (
    expiryDate,
    fromDate = getToday()
) => {
    const expiry = toDateOnly(expiryDate);
    const today = toDateOnly(fromDate);

    if (!expiry || !today) {
        return null;
    }

    return Math.round(
        (expiry.getTime() - today.getTime()) /
            ONE_DAY_MS
    );
};

// ----------------------------------------
// 3. Calculate Days Until Return Deadline
//
// Positive:
// return deadline is in future
//
// 0:
// return deadline is today
//
// Negative:
// return deadline has passed
// ----------------------------------------
export const getDaysUntilReturnDeadline = (
    expiryDate,
    returnWindowDays,
    fromDate = getToday()
) => {
    const returnDeadline =
        calculateReturnDeadline(
            expiryDate,
            returnWindowDays
        );

    const today = toDateOnly(fromDate);

    if (!returnDeadline || !today) {
        return null;
    }

    return Math.round(
        (returnDeadline.getTime() -
            today.getTime()) /
            ONE_DAY_MS
    );
};

// ----------------------------------------
// 4. Calculate Expiry Status
//
// Rules:
//
// expiry < today
//     EXPIRED
//
// expiry <= today + 30 days
//     EXPIRING_SOON
//
// otherwise
//     NORMAL
//
// Default threshold = 30 days
// ----------------------------------------
export const getExpiryStatus = (
    expiryDate,
    expiringSoonDays = DEFAULT_EXPIRING_SOON_DAYS,
    fromDate = getToday()
) => {
    const daysUntilExpiry =
        getDaysUntilExpiry(
            expiryDate,
            fromDate
        );

    if (daysUntilExpiry === null) {
        return null;
    }

    if (daysUntilExpiry < 0) {
        return EXPIRY_STATUS.EXPIRED;
    }

    if (
        daysUntilExpiry <=
        expiringSoonDays
    ) {
        return EXPIRY_STATUS.EXPIRING_SOON;
    }

    return EXPIRY_STATUS.NORMAL;
};

// ----------------------------------------
// 5. Calculate Return Status
//
// Rules:
//
// today < returnDeadline
//     NORMAL
//
// today === returnDeadline
//     RETURN_DUE
//
// today > returnDeadline
//     RETURN_OVERDUE
// ----------------------------------------
export const getReturnStatus = (
    expiryDate,
    returnWindowDays,
    fromDate = getToday()
) => {
    const daysUntilReturn =
        getDaysUntilReturnDeadline(
            expiryDate,
            returnWindowDays,
            fromDate
        );

    if (daysUntilReturn === null) {
        return null;
    }

    // Return deadline is in the future
    if (daysUntilReturn > 0) {
        return RETURN_STATUS.NORMAL;
    }

    // Return deadline is today
    if (daysUntilReturn === 0) {
        return RETURN_STATUS.RETURN_DUE;
    }

    // Return deadline has passed
    return RETURN_STATUS.RETURN_OVERDUE;
};