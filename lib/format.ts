// Numbers as Indonesians write them: a comma for decimals, a dot between thousands.
export const num = (n: number, digits = 0) => n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
