import { describe, it, expect } from "vitest";
import {
  calculateBalance,
  calculateTotalIncome,
  calculateTotalExpense,
  calculateUnpaidBillsAmount,
} from "./finance";
import { getDetailedBillStatus, MonthlyBill, Payment } from "../types";

describe("Financial Calculations", () => {
  const mockTransactions = [
    { id: "tx1", type: "income" as const, category: "monthly_fee" as const, amount: 150, description: "Fee Paid", month: 6, year: 2569, isClosed: false, createdBy: "test_user", createdAt: "" },
    { id: "tx2", type: "income" as const, category: "other_income" as const, amount: 500, description: "Donation", month: 6, year: 2569, isClosed: false, createdBy: "test_user", createdAt: "" },
    { id: "tx3", type: "expense" as const, category: "activity_expense" as const, amount: 200, description: "Snacks", month: 6, year: 2569, isClosed: false, createdBy: "test_user", createdAt: "" },
  ];

  it("should calculate correct net balance", () => {
    const balance = calculateBalance(mockTransactions);
    expect(balance).toBe(450); // 150 + 500 - 200 = 450
  });

  it("should calculate correct total income", () => {
    const income = calculateTotalIncome(mockTransactions);
    expect(income).toBe(650); // 150 + 500 = 650
  });

  it("should calculate correct total expense", () => {
    const expense = calculateTotalExpense(mockTransactions);
    expect(expense).toBe(200);
  });

  it("should calculate correct unpaid bills sum", () => {
    const mockBills = [
      { id: "b1", userId: "u1", month: 6, year: 2569, amount: 150, status: "pending" as const, dueDate: "2026-06-30", createdAt: "" },
      { id: "b2", userId: "u2", month: 6, year: 2569, amount: 150, status: "paid" as const, dueDate: "2026-06-30", createdAt: "" },
      { id: "b3", userId: "u3", month: 6, year: 2569, amount: 150, status: "pending" as const, dueDate: "2026-06-30", createdAt: "" },
    ];
    const unpaid = calculateUnpaidBillsAmount(mockBills);
    expect(unpaid).toBe(300); // b1 + b3 = 300
  });
});

describe("Detailed Bill Status Mapping", () => {
  it("should return paid status if bill is already marked paid", () => {
    const bill: MonthlyBill = {
      id: "bill1",
      userId: "user1",
      month: 6,
      year: 2569,
      amount: 150,
      status: "paid",
      dueDate: "2026-06-30",
      createdAt: "",
    };
    const statusInfo = getDetailedBillStatus(bill, []);
    expect(statusInfo.statusType).toBe("paid");
  });

  it("should return pending_review status if there is a pending review payment", () => {
    const bill: MonthlyBill = {
      id: "bill2",
      userId: "user1",
      month: 6,
      year: 2569,
      amount: 150,
      status: "pending",
      dueDate: "2569-06-30",
      createdAt: "",
    };
    const payments: Payment[] = [
      {
        id: "pay1",
        userId: "user1",
        billId: "bill2",
        amount: 150,
        status: "pending_review",
        slipUrl: "",
        createdAt: "",
      },
    ];
    const statusInfo = getDetailedBillStatus(bill, payments);
    expect(statusInfo.statusType).toBe("pending_review");
  });

  it("should return paid if total approved payments equal or exceed bill amount", () => {
    const bill: MonthlyBill = {
      id: "bill3",
      userId: "user1",
      month: 6,
      year: 2569,
      amount: 150,
      status: "pending",
      dueDate: "2569-06-30",
      createdAt: "",
    };
    const payments: Payment[] = [
      {
        id: "pay2",
        userId: "user1",
        billId: "bill3",
        amount: 150,
        status: "approved",
        slipUrl: "",
        createdAt: "",
      },
    ];
    const statusInfo = getDetailedBillStatus(bill, payments);
    expect(statusInfo.statusType).toBe("paid");
  });
});
