const functions = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

/**
 * addTask — Siri / iPhone Shortcut endpoint
 *
 * Validates x-siri-token header against firms/{firmId}.siriToken,
 * then creates either a task or a sticky note.
 *
 * Body: { action: "addTask" | "addNote", text: "..." }
 */
exports.addTask = functions.onRequest(
  { region: "australia-southeast1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const token = req.headers["x-siri-token"];
    if (!token) {
      res.status(401).json({ error: "Missing x-siri-token header" });
      return;
    }

    // Look up firm by siriToken
    const firmsSnap = await db
      .collection("firms")
      .where("siriToken", "==", token)
      .limit(1)
      .get();

    if (firmsSnap.empty) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    const firmDoc = firmsSnap.docs[0];
    const firmId = firmDoc.id;
    const { action, text } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Missing or empty text field" });
      return;
    }

    const now = new Date().toISOString();

    if (action === "addTask") {
      const taskId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const taskData = {
        client: "",
        description: text.trim(),
        jobType: "Tax Return",
        status: "Not Started",
        dueDate: "",
        priority: "Medium",
        billable: true,
        completed: false,
        seconds: 0,
        notes: "",
        items: [],
        schedules: [],
        team: [],
        teamMemberUids: [],
        assignedTo: null,
        createdBy: "siri",
        createdAt: now,
        archivedAt: null,
        isRecurring: false,
        recurrencePattern: null,
        nextOccurrence: null,
        parentTaskId: null,
        dependsOn: [],
        sortOrder: 0,
      };

      await db
        .collection("firms")
        .doc(firmId)
        .collection("tasks")
        .doc(taskId)
        .set(taskData);

      res.status(200).json({ ok: true, action: "addTask", taskId });
    } else if (action === "addNote") {
      const noteRef = db
        .collection("firms")
        .doc(firmId)
        .collection("notes")
        .doc();

      await noteRef.set({
        text: text.trim(),
        createdBy: "siri",
        createdAt: now,
      });

      res
        .status(200)
        .json({ ok: true, action: "addNote", noteId: noteRef.id });
    } else {
      res
        .status(400)
        .json({ error: 'Invalid action. Use "addTask" or "addNote".' });
    }
  }
);
