/**
 * Seed Data for Task Management Module
 * Run this to populate initial test data
 */

const seedTasks = [
  {
    title: "Review KYC Documents - Q1",
    description: "Review and validate all pending KYC documents for new clients onboarded in Q1 2026. Ensure all documents are verified and properly filed.",
    category: "KYC",
    priority: "High",
    status: "In Progress",
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
  {
    title: "Follow up with Pending Clients",
    description: "Follow up with clients who have pending document submissions. Send reminders and schedule calls where necessary.",
    category: "Follow-up",
    priority: "Medium",
    status: "Pending",
    due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
  {
    title: "Monthly Compliance Audit",
    description: "Conduct monthly audit of all client records to ensure compliance with regulatory requirements.",
    category: "Compliance",
    priority: "High",
    status: "Pending",
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
  {
    title: "Update Client Database",
    description: "Update all client contact information and verify accuracy of stored records.",
    category: "Internal",
    priority: "Low",
    status: "On Hold",
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
  {
    title: "Process Withdrawals",
    description: "Process all pending withdrawal requests and update payment records accordingly.",
    category: "Documentation",
    priority: "Urgent",
    status: "Pending",
    due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
];

const seedChecklistItems = {
  "Review KYC Documents - Q1": [
    "Collect all Q1 client documents",
    "Verify Aadhaar and PAN details",
    "Check bank statement validity",
    "Flag missing documents",
    "Send reminder to pending clients",
  ],
  "Monthly Compliance Audit": [
    "Review all active client files",
    "Check for missing signatures",
    "Verify address proofs",
    "Update compliance checklist",
    "Submit report to management",
  ],
};

const seedComments = {
  "Follow up with Pending Clients": [
    {
      comment: "Called Mr. Sharma - he will submit documents by Friday",
    },
    {
      comment: "Sent email reminder to Ms. Patel",
    },
  ],
};

module.exports = { seedTasks, seedChecklistItems, seedComments };