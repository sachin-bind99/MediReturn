
import { generateInventoryAlerts } from "./utils/alertGenerator.js";

const currentUserId = "user123";
const otherUserId = "user456";

// Add calendar days to a date.
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Get today's date at midnight.
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// Assumption:
// returnDeadline = expiryDate - returnWindowDays
function createBatch({
  batchNumber,
  quantity = 10,
  expiryDays,
  deadlineDays,
  userId = currentUserId,
}) {
  const today = startOfToday();

  // Derive the return window so the deadline matches
  // the requested number of days from today.
  const returnWindowDays = expiryDays - deadlineDays;

  return {
    _id: batchNumber,
    batchNumber,
    createdBy: userId,
    expiryDate: addDays(today, expiryDays),
    returnWindowDays,
    quantity,
  };
}

const tests = [
  {
    name: "1. Return due and expiring soon",
    batch: createBatch({
      batchNumber: "B001",
      deadlineDays: 3,
      expiryDays: 20,
    }),
    expected: ["RETURN_DUE", "EXPIRING_SOON"],
  },
  {
    name: "2. Return overdue; expiry is in the future",
    batch: createBatch({
      batchNumber: "B002",
      deadlineDays: -5,
      expiryDays: 20,
    }),
    expected: ["RETURN_OVERDUE", "EXPIRING_SOON"],
  },
  {
    name: "3. Expired batch with overdue return",
    batch: createBatch({
      batchNumber: "B003",
      deadlineDays: -5,
      expiryDays: -2,
    }),
    expected: ["EXPIRED", "RETURN_OVERDUE"],
  },
  {
    name: "4. Zero quantity",
    batch: createBatch({
      batchNumber: "B004",
      quantity: 0,
      deadlineDays: 3,
      expiryDays: 20,
    }),
    expected: [],
  },
  {
    name: "5. Batch belongs to another user",
    batch: createBatch({
      batchNumber: "B005",
      deadlineDays: 3,
      expiryDays: 20,
      userId: otherUserId,
    }),
    expected: [],
  },
];

let passed = 0;

for (const test of tests) {
  const alerts = generateInventoryAlerts(
    [test.batch],
    currentUserId
  );

  const actual = alerts
    .map((alert) => alert.type)
    .sort();

  const expected = [...test.expected].sort();

  const success =
    JSON.stringify(actual) === JSON.stringify(expected);

  console.log(
    `${success ? "PASS" : "FAIL"}: ${test.name}`
  );

  console.log("Expected:", expected);
  console.log("Actual:  ", actual);
  console.log("-----------------------------");

  if (success) passed++;
}

console.log(`RESULT: ${passed}/${tests.length} tests passed`);
