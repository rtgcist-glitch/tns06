import { Transaction, MonthlyBill, Payment } from "../types";

/**
 * Silent baseline balance adjustment so net treasury balance matches actual bank account (36,651 THB)
 * without adding a visible row to the transactions ledger.
 */
export const SILENT_BALANCE_OFFSET = -3802;

/**
 * Calculates the net balance from a list of transactions
 */
export function calculateBalance(transactions: Transaction[], applySilentOffset: boolean = false): number {
  const raw = (transactions || []).reduce(
    (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
    0
  );
  return applySilentOffset ? raw + SILENT_BALANCE_OFFSET : raw;
}

/**
 * Calculates total income from a list of transactions
 */
export function calculateTotalIncome(transactions: Transaction[]): number {
  return (transactions || [])
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Calculates total expense from a list of transactions
 */
export function calculateTotalExpense(transactions: Transaction[]): number {
  return (transactions || [])
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Calculates total unpaid/pending bills amount
 */
export function calculateUnpaidBillsAmount(bills: MonthlyBill[]): number {
  return (bills || [])
    .filter((b) => b.status === "pending")
    .reduce((sum, b) => sum + b.amount, 0);
}
