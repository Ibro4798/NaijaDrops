// NaijaDrops Wallet: limits and labels shared by the wallet page, payment page and API.
// The limits are enforced on the screen; the database enforces the money rules
// (never negative, no double credit, immutable ledger).
export const MIN_TOPUP = 500;
export const MAX_TOPUP = 100000;
export const QUICK_TOPUPS = [2000, 5000, 10000];

export const naira = (n) =>
  "\u20A6" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const LABELS = {
  topup: "Wallet top-up",
  order_payment: "Delivery payment",
  refund: "Refund",
  bonus: "Bonus",
  adjustment: "Adjustment",
};
export const ledgerLabel = (row) => LABELS[row?.category] || "Wallet activity";
