// Mock frontend for the "Document Approval Queue" blind-practice exercise.
// In-memory state only — restart the process (or POST /debug/reset) to
// start over.

const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

const PORT = process.env.PORT || 4100;

const APPROVERS = {
  appr_jo: "Jo Tan",
  appr_lee: "Lee Wong",
};

const seedDocuments = () => [
  { id: "doc_101", title: "Q3 Budget Request", assignedTo: "appr_jo", status: "pending", decidedAt: null },
  { id: "doc_102", title: "Vendor Contract Renewal", assignedTo: "appr_lee", status: "approved", decidedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "doc_103", title: "Office Lease Amendment", assignedTo: "appr_jo", status: "pending", decidedAt: null },
  { id: "doc_104", title: "Marketing Campaign Plan", assignedTo: "appr_lee", status: "pending", decidedAt: null },
  { id: "doc_105", title: "New Hire Equipment", assignedTo: "appr_jo", status: "rejected", decidedAt: new Date(Date.now() - 3600000).toISOString() },
];

let documents = seedDocuments();

// sessionId -> approverId
const sessions = new Map();

function getApproverId(req) {
  const sid = req.cookies.sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function layout(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 40px auto; color: #222; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    .error { color: #b00020; }
    .notice { color: #0a7d2c; }
    form.inline { display: inline; }
    button { cursor: pointer; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/", (req, res) => {
  const approverId = getApproverId(req);
  res.redirect(approverId ? "/queue" : "/login");
});

app.get("/login", (req, res) => {
  const options = Object.entries(APPROVERS)
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join("");
  res.send(
    layout(
      "Log in",
      `<h1>Document Approval Queue</h1>
       <form id="login-form" method="post" action="/login">
         <label for="approverId">I am:</label>
         <select id="approverId" name="approverId">${options}</select>
         <button type="submit" id="login-submit">Log in</button>
       </form>`
    )
  );
});

app.post("/login", (req, res) => {
  const approverId = req.body.approverId;
  if (!APPROVERS[approverId]) {
    res.status(400).send(layout("Log in", `<p class="error" id="login-error">Unknown approver.</p>`));
    return;
  }
  const sid = crypto.randomUUID();
  sessions.set(sid, approverId);
  res.cookie("sid", sid, { httpOnly: true });
  res.redirect("/queue");
});

app.get("/logout", (req, res) => {
  const sid = req.cookies.sid;
  if (sid) sessions.delete(sid);
  res.clearCookie("sid");
  res.redirect("/login");
});

app.get("/queue", (req, res) => {
  const approverId = getApproverId(req);
  if (!approverId) {
    res.redirect("/login");
    return;
  }

  const mine = documents.filter((d) => d.assignedTo === approverId && d.status === "pending");
  const msg = req.query.msg ? `<p class="notice" id="flash-notice">${req.query.msg}</p>` : "";
  const err = req.query.err ? `<p class="error" id="flash-error">${req.query.err}</p>` : "";

  const rows = mine
    .map(
      (d) => `<tr class="doc-row" data-doc-id="${d.id}">
        <td>${d.title}</td>
        <td>
          <form class="inline" method="post" action="/documents/${d.id}/approve">
            <button type="submit" class="approve-btn" data-doc-id="${d.id}">Approve</button>
          </form>
          <form class="inline" method="post" action="/documents/${d.id}/reject">
            <button type="submit" class="reject-btn" data-doc-id="${d.id}">Reject</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  const empty = mine.length === 0 ? `<p id="empty-queue">Nothing waiting on you right now.</p>` : "";

  res.send(
    layout(
      "My queue",
      `<h1>Hi, ${APPROVERS[approverId]}</h1>
       ${msg}${err}
       <p><a href="/logout" id="logout-link">Log out</a></p>
       ${empty}
       <table id="queue-table"><tbody>${rows}</tbody></table>`
    )
  );
});

function decide(req, res, outcome) {
  const approverId = getApproverId(req);
  if (!approverId) {
    res.redirect("/login");
    return;
  }

  const doc = documents.find((d) => d.id === req.params.id);
  if (!doc) {
    res.redirect(`/queue?err=${encodeURIComponent("Document not found.")}`);
    return;
  }
  if (doc.assignedTo !== approverId) {
    res.redirect(`/queue?err=${encodeURIComponent("That document isn't assigned to you.")}`);
    return;
  }
  if (doc.status !== "pending") {
    res.redirect(`/queue?err=${encodeURIComponent("This document has already been decided.")}`);
    return;
  }

  doc.status = outcome;
  doc.decidedAt = new Date().toISOString();
  res.redirect(`/queue?msg=${encodeURIComponent(`"${doc.title}" ${outcome}.`)}`);
}

app.post("/documents/:id/approve", (req, res) => decide(req, res, "approved"));
app.post("/documents/:id/reject", (req, res) => decide(req, res, "rejected"));

app.get("/debug/documents", (req, res) => res.json(documents));

app.post("/debug/reset", (req, res) => {
  documents = seedDocuments();
  sessions.clear();
  res.json({ status: "reset" });
});

app.listen(PORT, () => {
  console.log(`document-approval-mock listening on :${PORT}`);
});
