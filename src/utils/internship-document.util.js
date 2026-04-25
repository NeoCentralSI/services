/**
 * Converts a number into Indonesian words (Terbilang).
 * @param {number} n 
 * @returns {string}
 */
export function terbilang(n) {
    const words = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    let result = "";

    if (n < 12) {
        result = words[n];
    } else if (n < 20) {
        result = terbilang(n - 10) + " belas";
    } else if (n < 100) {
        result = terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10);
    } else if (n < 200) {
        result = "seratus " + terbilang(n - 100);
    } else if (n < 1000) {
        result = terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
    } else if (n < 2000) {
        result = "seribu " + terbilang(n - 1000);
    } else if (n < 1000000) {
        result = terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
    }

    return result.trim().replace(/\s+/g, " ");
}

/**
 * Formats a date into a long Indonesian format.
 * Example: "Senin, 24 April 2026"
 * @param {Date|string} date 
 * @returns {string}
 */
export function formatLongIndonesianDate(date) {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

/**
 * Gets Indonesian day name from date.
 * @param {Date|string} date 
 * @returns {string}
 */
export function getIndonesianDayName(date) {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("id-ID", { weekday: "long" });
}

/**
 * Gets Indonesian month name from date.
 * @param {Date|string} date 
 * @returns {string}
 */
export function getIndonesianMonthName(date) {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("id-ID", { month: "long" });
}
