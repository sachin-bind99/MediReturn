
const MONTHS = {
    JAN: 1, JANUARY: 1,
    FEB: 2, FEBRUARY: 2,
    MAR: 3, MARCH: 3,
    APR: 4, APRIL: 4,
    MAY: 5,
    JUN: 6, JUNE: 6,
    JUL: 7, JULY: 7,
    AUG: 8, AUGUST: 8,
    SEP: 9, SEPT: 9, SEPTEMBER: 9,
    OCT: 10, OCTOBER: 10,
    NOV: 11, NOVEMBER: 11,
    DEC: 12, DECEMBER: 12,
};

function invalid(error) {
    return { date: "", error };
}

function formatDate(year, month, day) {
    return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
    ].join("-");
}

export function normalizeExpiryDate(rawValue) {
    let value = String(rawValue ?? "").trim();

    if (!value) {
        return { date: "", error: "" };
    }

    // Remove an optional expiry label.
    value = value.replace(
        /^(?:(?:EXP\.?(?:IRY|IRATION)?\.?|USE BEFORE|BEST BEFORE)\s*(?:DATE|DT)?\s*[:=-]?\s*)/i,
        ""
    ).trim();

    let match;
    let year;
    let month;
    let day;

    // Accept: DEC 2026, DEC-2026, December 2026.
    match = value.match(/^([A-Za-z]{3,9})\.?[\s./-]+(\d{4})$/);

    if (match) {
        const monthName = match[1].toUpperCase();
        month = MONTHS[monthName];
        year = Number(match[2]);

        if (!month) {
            return invalid("Unrecognized month name.");
        }

        if (year < 1) {
            return invalid("Enter a valid year.");
        }

        day = new Date(Date.UTC(year, month, 0)).getUTCDate();

        return {
            date: formatDate(year, month, day),
            error: "",
        };
    }

    // Accept: 08/2027, 08-2027, 08.2027.
    match = value.match(/^(\d{1,2})[./-](\d{4})$/);

    if (match) {
        month = Number(match[1]);
        year = Number(match[2]);

        if (month < 1 || month > 12 || year < 1) {
            return invalid("Enter a valid month and year.");
        }

        day = new Date(Date.UTC(year, month, 0)).getUTCDate();

        return {
            date: formatDate(year, month, day),
            error: "",
        };
    }

    // Accept: YYYY-MM-DD.
    match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else {
        // Accept: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY.
        match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

        if (!match) {
            return invalid(
                "Unsupported format. Use MM/YYYY, DEC 2026, DD/MM/YYYY, or YYYY-MM-DD."
            );
        }

        day = Number(match[1]);
        month = Number(match[2]);
        year = Number(match[3]);
    }

    const daysInMonth =
        month >= 1 && month <= 12
            ? new Date(Date.UTC(year, month, 0)).getUTCDate()
            : 0;

    if (
        year < 1 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth
    ) {
        return invalid("Enter a valid calendar date.");
    }

    return {
        date: formatDate(year, month, day),
        error: "",
    };
}

export default normalizeExpiryDate;
