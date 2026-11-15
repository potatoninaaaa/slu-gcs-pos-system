// Rounds to 2 decimals, matching how the database rounds line totals
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100