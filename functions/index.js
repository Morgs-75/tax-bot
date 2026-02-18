const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Job type alias mapping (lowercase key → canonical job type)
const JOB_TYPE_ALIASES = {
  "tax": "Tax Return",
  "tax return": "Tax Return",
  "itr": "Tax Return",
  "income tax": "Tax Return",
  "bas": "BAS",
  "activity statement": "BAS",
  "advice": "Advisory",
  "advice letter": "Advisory",
  "advisory": "Advisory",
  "financials": "Financial Statements",
  "financial statements": "Financial Statements",
  "financial statement": "Financial Statements",
  "accounts": "Financial Statements",
  "audit": "Audit",
  "review": "Audit",
  "bookkeeping": "Bookkeeping",
  "bk": "Bookkeeping",
  "books": "Bookkeeping",
  "payroll": "Payroll",
  "smsf": "SMSF",
  "super fund": "SMSF",
  "self managed super": "SMSF",
  "company": "Company Return",
  "company return": "Company Return",
  "trust": "Trust Return",
  "trust return": "Trust Return",
  "partnership": "Partnership Return",
  "partnership return": "Partnership Return",
  "fbt": "FBT",
  "fringe benefits": "FBT",
  "other": "Other",
};

/**
 * Parse Australian date format DD/MM/YYYY to ISO YYYY-MM-DD
 */
function parseAUDate(dateStr) {
  if (!dateStr) return "";
  const str = dateStr.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3];
    // Validate the date
    const d = new Date(`${year}-${month}-${day}`);
    if (!isNaN(d.getTime())) {
      return `${year}-${month}-${day}`;
    }
  }

  return "";
}

/**
 * Resolve job type from user input using alias table.
 * Returns { jobType, matched } where matched=false means it fell back to "Other".
 */
function resolveJobType(input) {
  if (!input) return { jobType: "Other", matched: false };
  const key = input.trim().toLowerCase();
  if (JOB_TYPE_ALIASES[key]) {
    return { jobType: JOB_TYPE_ALIASES[key], matched: true };
  }
  // Partial / fuzzy match: check if any alias key starts with or contains input
  for (const [alias, canonical] of Object.entries(JOB_TYPE_ALIASES)) {
    if (alias.startsWith(key) || key.startsWith(alias)) {
      return { jobType: canonical, matched: true };
    }
  }
  return { jobType: "Other", matched: false };
}

/**
 * HTTP Cloud Function: addTask
 * POST with JSON body: { client, jobType, dueDate, priority?, notes? }
 * Header: x-siri-token
 */
exports.addTask = onRequest(
  { region: "australia-southeast1", cors: true },
  async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    // Validate token
    const token = req.headers["x-siri-token"];
    if (!token) {
      res.status(401).json({ success: false, error: "Missing x-siri-token header" });
      return;
    }

    try {
      const tokenDoc = await db.collection("siriTokens").doc(token).get();
      if (!tokenDoc.exists) {
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }

      const uid = tokenDoc.data().uid;
      if (!uid) {
        res.status(401).json({ success: false, error: "Token has no associated user" });
        return;
      }

      // Parse request body
      const { client, jobType, dueDate, priority, notes } = req.body;

      if (!client) {
        res.status(400).json({ success: false, error: "Client name is required" });
        return;
      }

      // Resolve job type
      const resolved = resolveJobType(jobType);
      const finalJobType = resolved.jobType;

      // Parse due date (AU format)
      const parsedDueDate = parseAUDate(dueDate);

      // Build description
      let description = "";
      if (!resolved.matched && jobType) {
        description = `Siri: ${jobType}`;
      }
      if (notes) {
        description = description ? `${description} | ${notes}` : notes;
      }

      // Build task matching backfillTask() schema
      const now = new Date().toISOString();
      const taskId = `siri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const task = {
        client: client.trim(),
        description: description,
        jobType: finalJobType,
        status: "Not Started",
        dueDate: parsedDueDate,
        priority: priority || "Medium",
        billable: true,
        completed: false,
        seconds: 0,
        notes: "",
        items: [],
        schedules: [],
        createdAt: now,
        archivedAt: null,
        isRecurring: false,
        recurrencePattern: null,
        nextOccurrence: null,
        parentTaskId: null,
        dependsOn: [],
        sortOrder: 0,
        team: [{
          uid: uid,
          jobRole: "Preparer",
          addedAt: now,
          addedBy: uid,
        }],
        teamMemberUids: [uid],
        assignedTo: uid,
        createdBy: uid,
      };

      // Determine storage path: check if user belongs to a firm
      const userDoc = await db.collection("users").doc(uid).get();
      const firmId = userDoc.exists ? userDoc.data().firmId : null;

      let taskRef;
      if (firmId) {
        taskRef = db.collection("firms").doc(firmId).collection("tasks").doc(taskId);
      } else {
        taskRef = db.collection("users").doc(uid).collection("tasks").doc(taskId);
      }

      await taskRef.set(task);

      // Build summary
      const summary = [
        `Task added: ${finalJobType} for ${client.trim()}`,
        parsedDueDate ? `Due: ${parsedDueDate}` : "No due date",
        !resolved.matched && jobType ? `(Job type "${jobType}" mapped to Other)` : "",
      ].filter(Boolean).join(". ");

      res.status(200).json({
        success: true,
        taskId: taskId,
        summary: summary,
        storagePath: firmId ? `firms/${firmId}/tasks/${taskId}` : `users/${uid}/tasks/${taskId}`,
        task: {
          client: task.client,
          jobType: task.jobType,
          dueDate: task.dueDate,
          priority: task.priority,
        },
      });
    } catch (err) {
      console.error("addTask error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);
