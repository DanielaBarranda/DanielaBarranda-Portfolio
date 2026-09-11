const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'comments.json');

app.use(cors());
app.use(express.json());

function readComments() {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return raw ? JSON.parse(raw) : [];
}

function writeComments(comments) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(comments, null, 2));
}

function stripToken(comment) {
    const { token, ...publicFields } = comment;
    return publicFields;
}

// READ — list all comments, newest first. Owner tokens are never sent here.
app.get('/api/comments', (req, res) => {
    const comments = readComments()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(stripToken);
    res.json(comments);
});

// CREATE — add a new comment. Returns an ownerToken the browser
// stores locally so it alone can edit/delete this comment later.
app.post('/api/comments', (req, res) => {
    const { name, message } = req.body || {};

    if (!name || !message || !name.trim() || !message.trim()) {
        return res.status(400).json({ error: 'Name and message are required.' });
    }

    const comments = readComments();
    const newComment = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 60),
        message: message.trim().slice(0, 500),
        createdAt: new Date().toISOString(),
        token: crypto.randomUUID()
    };

    comments.push(newComment);
    writeComments(comments);

    res.status(201).json({ ...stripToken(newComment), ownerToken: newComment.token });
});

// UPDATE — edit a comment's message. Requires the matching ownerToken.
app.put('/api/comments/:id', (req, res) => {
    const { id } = req.params;
    const { message, ownerToken } = req.body || {};

    const comments = readComments();
    const target = comments.find((c) => c.id === id);

    if (!target) return res.status(404).json({ error: 'Comment not found.' });
    if (target.token !== ownerToken) return res.status(403).json({ error: 'Not authorized to edit this comment.' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });

    target.message = message.trim().slice(0, 500);
    target.updatedAt = new Date().toISOString();
    writeComments(comments);

    res.json(stripToken(target));
});

// DELETE — remove a comment. Requires the matching ownerToken.
app.delete('/api/comments/:id', (req, res) => {
    const { id } = req.params;
    const { ownerToken } = req.body || {};

    const comments = readComments();
    const target = comments.find((c) => c.id === id);

    if (!target) return res.status(404).json({ error: 'Comment not found.' });
    if (target.token !== ownerToken) return res.status(403).json({ error: 'Not authorized to delete this comment.' });

    writeComments(comments.filter((c) => c.id !== id));
    res.status(204).end();
});

app.listen(PORT, () => {
    console.log(`Comments API running on port ${PORT}`);
});