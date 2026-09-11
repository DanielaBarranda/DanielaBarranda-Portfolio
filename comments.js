// ============================================================
// Comments CRUD — talks to the Express API.
//
// Locally (127.0.0.1 / localhost), the frontend is served by
// Live Server on one port (e.g. 5500) while the API runs on
// its own port (3001) — so we need the FULL URL to reach it.
//
// On EC2, there's no Nginx/Apache reverse proxy in front of the
// Node process — the static site and the API are just two ports
// on the same box (e.g. site on :8081, API on :3001). So we
// reuse whatever hostname/IP is in the address bar and just
// swap the port to 3001. If you later put a real reverse proxy
// in front of /api on the same origin, switch this back to the
// simple relative path: const API_BASE = "/api";
// ============================================================
const isLocalTesting = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const API_BASE = isLocalTesting
    ? "http://localhost:3001/api"
    : `${window.location.protocol}//${window.location.hostname}:3001/api`;

const OWNERSHIP_KEY = "dbarranda_comment_tokens";

function getOwnedTokens() {
    try {
        return JSON.parse(localStorage.getItem(OWNERSHIP_KEY)) || {};
    } catch {
        return {};
    }
}

function saveOwnedToken(id, token) {
    const owned = getOwnedTokens();
    owned[id] = token;
    localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(owned));
}

function removeOwnedToken(id) {
    const owned = getOwnedTokens();
    delete owned[id];
    localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(owned));
}

function timeAgo(isoString) {
    const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
    const units = [
        ["year", 31536000], ["month", 2592000], ["day", 86400],
        ["hour", 3600], ["minute", 60]
    ];
    for (const [label, secondsInUnit] of units) {
        const count = Math.floor(seconds / secondsInUnit);
        if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
    }
    return "just now";
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

async function loadComments() {
    const listEl = document.getElementById("comments-list");
    try {
        const res = await fetch(`${API_BASE}/comments`);
        if (!res.ok) throw new Error("Failed to load comments");
        const comments = await res.json();
        renderComments(comments);
    } catch (err) {
        listEl.innerHTML = `<p class="comments-error">Couldn't load comments right now. Please try again later.</p>`;
        console.error(err);
    }
}

function renderComments(comments) {
    const listEl = document.getElementById("comments-list");
    const owned = getOwnedTokens();

    if (comments.length === 0) {
        listEl.innerHTML = `<p class="comments-empty">No comments yet — be the first to leave one!</p>`;
        return;
    }

    listEl.innerHTML = comments.map((c) => {
        const isOwner = Boolean(owned[c.id]);
        const editedTag = c.updatedAt ? `<span class="comment-edited">(edited)</span>` : "";

        return `
            <div class="comment-card" data-id="${c.id}">
                <div class="comment-header">
                    <span class="comment-name">${escapeHTML(c.name)}</span>
                    <span class="comment-time">${timeAgo(c.createdAt)} ${editedTag}</span>
                </div>
                <p class="comment-message">${escapeHTML(c.message)}</p>
                ${isOwner ? `
                    <div class="comment-owner-actions">
                        <button class="comment-action-btn" data-action="edit">Edit</button>
                        <button class="comment-action-btn comment-action-delete" data-action="delete">Delete</button>
                    </div>
                ` : ""}
            </div>
        `;
    }).join("");
}

async function handleSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById("comment-name");
    const messageInput = document.getElementById("comment-message");
    const statusEl = document.getElementById("comment-form-status");
    const submitBtn = e.target.querySelector(".comment-submit-btn");

    const name = nameInput.value.trim();
    const message = messageInput.value.trim();
    if (!name || !message) return;

    submitBtn.disabled = true;
    statusEl.textContent = "Posting…";
    statusEl.className = "comment-form-status";

    try {
        const res = await fetch(`${API_BASE}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, message })
        });
        if (!res.ok) throw new Error("Failed to post comment");
        const created = await res.json();
        saveOwnedToken(created.id, created.ownerToken);

        nameInput.value = "";
        messageInput.value = "";
        statusEl.textContent = "Posted!";
        statusEl.className = "comment-form-status comment-form-status-success";
        loadComments();
    } catch (err) {
        statusEl.textContent = "Something went wrong. Please try again.";
        statusEl.className = "comment-form-status comment-form-status-error";
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        setTimeout(() => { statusEl.textContent = ""; }, 4000);
    }
}

async function handleListClick(e) {
    const btn = e.target.closest(".comment-action-btn");
    if (!btn) return;

    const card = btn.closest(".comment-card");
    const id = card.dataset.id;
    const owned = getOwnedTokens();
    const ownerToken = owned[id];
    if (!ownerToken) return;

    if (btn.dataset.action === "delete") {
        if (!confirm("Delete this comment?")) return;
        try {
            const res = await fetch(`${API_BASE}/comments/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ownerToken })
            });
            if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
            removeOwnedToken(id);
            loadComments();
        } catch (err) {
            alert("Couldn't delete comment. Please try again.");
            console.error(err);
        }
    }

    if (btn.dataset.action === "edit") {
        const messageEl = card.querySelector(".comment-message");
        const currentText = messageEl.textContent;

        const textarea = document.createElement("textarea");
        textarea.className = "comment-edit-textarea";
        textarea.value = currentText;
        textarea.maxLength = 500;

        const saveBtn = document.createElement("button");
        saveBtn.className = "comment-action-btn comment-save-btn";
        saveBtn.textContent = "Save";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "comment-action-btn";
        cancelBtn.textContent = "Cancel";

        const controls = document.createElement("div");
        controls.className = "comment-owner-actions";
        controls.appendChild(saveBtn);
        controls.appendChild(cancelBtn);

        messageEl.replaceWith(textarea);
        card.querySelector(".comment-owner-actions").replaceWith(controls);

        cancelBtn.addEventListener("click", () => loadComments());

        saveBtn.addEventListener("click", async () => {
            const newMessage = textarea.value.trim();
            if (!newMessage) return;
            try {
                const res = await fetch(`${API_BASE}/comments/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: newMessage, ownerToken })
                });
                if (!res.ok) throw new Error("Failed to update");
                loadComments();
            } catch (err) {
                alert("Couldn't save changes. Please try again.");
                console.error(err);
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadComments();
    document.getElementById("comment-form").addEventListener("submit", handleSubmit);
    document.getElementById("comments-list").addEventListener("click", handleListClick);
});