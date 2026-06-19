# NoteKeeper App — Code & Logic Guide

This document walks you through every file in the NoteKeeper app.
For each file, you'll find: **what to create**, **why you need it**, and the **exact code** to write.

---

## STEP 1 — Project Setup

### 1.1 Initialize the project

Open your terminal, create a project folder, and initialize it:

```bash
mkdir note-taking-app
cd note-taking-app
npm init -y
```

`npm init -y` creates `package.json` — the ID card for your project that tracks its name, version, and all installed packages.

### 1.2 Install dependencies

```bash
npm install express mongoose cors dotenv passwordjs
```

| Package      | What it does                                      | Why you need it                                  |
| ------------ | ------------------------------------------------- | ------------------------------------------------ |
| `express`    | Creates your web server and handles HTTP routes   | The backbone of your backend                     |
| `mongoose`   | Connects to MongoDB, lets you define data schemas | Makes DB interaction structured                  |
| `cors`       | Allows the browser to talk to your server         | Without it, browsers block cross-origin requests |
| `dotenv`     | Loads secret config from a `.env` file            | Keeps passwords/keys out of your code            |
| `passwordjs` | Hashes and compares passwords using bcrypt        | You must NEVER store plain-text passwords        |

### 1.3 Create the folder structure

```
note-taking-app/
├── controllers/
├── middleware/
├── models/
├── routes/
├── frontend/
├── server.js
└── .env
```

Run this in your terminal:

```bash
mkdir controllers middleware models routes frontend
```

### 1.4 Create the `.env` file

Create a file called `.env` in the root. This stores your secrets:

```
PORT=3000
MONGODB_URI=your_mongodb_connection_string_here
```

Also create `.gitignore` so secrets and `node_modules` are never pushed to GitHub:

```
node_modules
.env
```

### 1.5 Your `package.json` should look like this

```json
{
  "name": "note-taking-app",
  "version": "1.0.0",
  "description": "Full-stack note-taking app with auth",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "mongoose": "^9.7.0",
    "passwordjs": "^0.1.1"
  }
}
```

---

## STEP 2 — Database Models

Models are blueprints for your data. They tell MongoDB what fields a document has, what type each field is, and what rules to enforce.

---

### 2.1 Create `models/User.js`

**Purpose:** Define the shape of every user account in the database and handle password security.

**What this achieves:**

- Defines user fields: `username`, `email`, `password`
- Automatically hashes passwords before saving (so plain text never reaches the database)
- Provides a `comparePassword` method used at login time to check credentials

**Code:**

```js
const mongoose = require("mongoose");
const pwd = require("passwordjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await pwd.encrypt(this.password, "bcrypt");
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return pwd.compare(candidatePassword, this.password, "bcrypt");
};

module.exports = mongoose.model("User", userSchema);
```

**How this code works:**

- `mongoose.Schema({...}, { timestamps: true })` — defines the fields and their rules. `timestamps: true` auto-adds `createdAt` and `updatedAt`
- `unique: true` — prevents two users from having the same username or email
- `lowercase: true` on email — auto-converts "John@Email.com" to "john@email.com" so duplicates are caught
- `trim: true` — removes whitespace from both ends of the string
- `userSchema.pre("save", ...)` — this is a **pre-save hook**. It runs automatically BEFORE every `.save()` call:
  - `this.isModified("password")` checks if the password changed. If the user only updated their username, we skip hashing
  - `pwd.encrypt(this.password, "bcrypt")` transforms the plain password into a scrambled hash like `$2b$12$abc123xyz...` that cannot be reversed
- `userSchema.methods.comparePassword` — adds a method to every user document. At login, we call `user.comparePassword(typedPassword)` to check if it matches the stored hash
- `module.exports = mongoose.model("User", userSchema)` — creates and exports the model. Mongoose auto-creates a `users` collection

---

### 2.2 Create `models/Note.js`

**Purpose:** Define the shape of every note in the database and link each note to its owner.

**What this achieves:**

- Defines note fields: `title`, `content`, `category`, `isPinned`
- Links each note to a user through the `owner` field (a reference to the User model)
- This owner link is what keeps users' notes private from each other

**Code:**

```js
const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["personal", "work", "study", "other"],
      default: "other",
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Note", noteSchema);
```

**How this code works:**

- `enum: ["personal", "work", "study", "other"]` — the category MUST be one of these values. If someone sends "homework", MongoDB rejects it
- `default: "other"` — if no category is provided, it defaults to "other"
- `isPinned: { default: false }` — notes start unpinned
- `owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" }` — this is the **document reference**. It stores the `_id` of the user who owns this note. MongoDB doesn't have SQL JOINs; instead, you store another document's `_id`. When saving a note, you set `owner: req.userId`. When fetching notes, you filter `owner: req.userId` so users only see their own

---

## STEP 3 — Auth Middleware

### 3.1 Create `middleware/auth.js`

**Purpose:** Protect routes by validating the userId before any controller runs.

**What this achieves:**

- Reads the `userId` from the request (body for POST/PUT/DELETE, query string for GET)
- Validates it's a real MongoDB ObjectId format
- Attaches it to `req.userId` so controllers can use it
- Blocks the request with a 401 if the userId is missing or invalid

**How middleware works:**

```
Request  -->  [protect middleware]  -->  [Route Handler]  -->  Response
                 |
                 If invalid: sends 401 and STOPS here
```

**Code:**

```js
const mongoose = require("mongoose");

const protect = (req, res, next) => {
  const rawId = req.body.userId || req.query.userId;

  if (!rawId) {
    return res
      .status(401)
      .json({ error: "Not authorized — no user ID provided" });
  }

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    return res.status(401).json({ error: "Not authorized — invalid user ID" });
  }

  req.userId = new mongoose.Types.ObjectId(rawId);
  next();
};

module.exports = { protect };
```

**How this code works:**

- `req.body.userId || req.query.userId` — reads userId from the body (POST/PUT/DELETE) or query string (GET). One line covers both cases
- `if (!rawId)` — if no userId was sent, respond 401 and stop. The `return` prevents the rest of the code from running
- `mongoose.Types.ObjectId.isValid(rawId)` — checks if the string looks like a valid MongoDB ObjectId. Without this, sending "abc" as userId would crash Mongoose with a `CastError` (500 error). This gives a clean 401 instead
- `req.userId = new mongoose.Types.ObjectId(rawId)` — converts the string to an actual ObjectId and attaches it to the request object
- `next()` — passes control to the next function in the chain (the route handler)

---

## STEP 4 — Controllers

Controllers handle what happens when a route is hit. They receive `req` and `res`, interact with the database, and return JSON responses.

---

### 4.1 Create `controllers/authController.js`

**Purpose:** Handle user registration, login, profile retrieval, and profile updates.

**What this achieves:**

- `register` — creates a new user account with validation and duplicate checking
- `login` — authenticates a user by checking email and password
- `getMe` — returns the current user's profile (requires auth)
- `updateProfile` — lets a user change their username and/or password (requires auth + current password verification)

**Code:**

```js
const User = require("../models/User");

// POST /api/auth/register
const register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email, and password are required" });
  }
  if (username.trim().length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? "Email" : "Username";
      return res.status(409).json({ error: `${field} is already in use` });
    }

    const user = await new User({ username, email, password }).save();

    res.status(201).json({
      message: "Account created successfully",
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
      message: "Logged in successfully",
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
};

// GET /api/auth/me — requires userId in query string
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  const { currentPassword, newUserName, newPassword } = req.body;

  if (!currentPassword) {
    return res
      .status(400)
      .json({ error: "Current password is required to make changes" });
  }

  if (!newUserName && !newPassword) {
    return res
      .status(400)
      .json({ error: "Provide a new username or new password to update" });
  }

  if (newUserName && newUserName.trim().length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters" });
  }

  if (newPassword && newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    if (newUserName) {
      const taken = await User.findOne({
        userName: newUserName.trim(),
        _id: { $ne: user._id },
      });
      if (taken) {
        return res.status(409).json({ error: "Username is already in use" });
      }
      user.userName = newUserName.trim();
    }

    if (newPassword) {
      user.password = newPassword;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: { id: user._id, userName: user.userName, email: user.email },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Server error during profile update" });
  }
};

module.exports = { register, login, getMe, updateProfile };
```

**How each function works:**

**`register`:**

1. Extracts `username`, `email`, `password` from the request body
2. Validates all fields are present, username >= 3 chars, password >= 6 chars
3. Checks if the email or username already exists using `$or` query. If yes, responds 409 (Conflict)
4. Creates a new User and calls `.save()`. The pre-save hook in User.js automatically hashes the password
5. Responds 201 with user info — the password is NEVER sent back

**`login`:**

1. Finds the user by email (lowercased + trimmed to match how it's stored)
2. If no user found, responds 401 with "Invalid email or password" — deliberately vague so attackers can't tell if the email exists
3. Calls `user.comparePassword()` to check the typed password against the stored hash
4. If no match, responds with the SAME vague 401 message
5. If match, responds with user info (id, username, email)

**`getMe`:**

1. `req.userId` was already validated by the protect middleware
2. Looks up the user, using `.select("-password")` to exclude the password from the response
3. Responds with user info

**`updateProfile`:**

1. Requires `currentPassword` — the user must prove they know their current password before changing anything. This prevents unauthorized changes if someone gets access to a logged-in session
2. Accepts `newUserName` and/or `newPassword` — at least one must be provided
3. Validates the new values (username >= 3 chars, password >= 6 chars)
4. Calls `user.comparePassword(currentPassword)` to verify identity
5. If changing username, checks that the new name isn't already taken by another user (`_id: { $ne: user._id }` excludes the current user from the duplicate check)
6. If changing password, sets `user.password = newPassword` — the raw plain text. This is safe because `.save()` triggers the pre-save hook, which detects `isModified("password")` and hashes it automatically
7. Calls `user.save()` — this is where the pre-save hook runs. If only the username changed, `isModified("password")` returns `false` and hashing is skipped
8. Responds with updated user info

---

### 4.2 Create `controllers/notesController.js`

**Purpose:** Handle all note CRUD operations (Create, Read, Update, Delete).

**What this achieves:**

- Five functions: `getNotes`, `getNoteById`, `createNote`, `updateNote`, `deleteNote`
- Every function filters by `owner: req.userId` — a user can NEVER see, edit, or delete another user's notes

**Code:**

```js
const Note = require("../models/Note");

const VALID_CATEGORIES = ["personal", "work", "study", "other"];

// GET /api/notes
const getNotes = async (req, res) => {
  try {
    const notes = await Note.find({ owner: req.userId }).sort({
      isPinned: -1,
      updatedAt: -1,
    });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: "Could not retrieve notes" });
  }
};

// GET /api/notes/:id
const getNoteById = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.userId });
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json(note);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ error: "Invalid note ID" });
    res.status(500).json({ error: "Could not retrieve note" });
  }
};

// POST /api/notes
const createNote = async (req, res) => {
  const { title, content, category, isPinned } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }
  if (title.trim().length > 100) {
    return res
      .status(400)
      .json({ error: "Title cannot exceed 100 characters" });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  try {
    const note = await new Note({
      title,
      content,
      category,
      isPinned,
      owner: req.userId,
    }).save();
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: "Could not create note" });
  }
};

// PUT /api/notes/:id
const updateNote = async (req, res) => {
  const { title, content, category, isPinned } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }
  if (title.trim().length > 100) {
    return res
      .status(400)
      .json({ error: "Title cannot exceed 100 characters" });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { title, content, category, isPinned },
      { new: true, runValidators: true }
    );
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json(note);
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ error: "Invalid note ID" });
    res.status(500).json({ error: "Could not update note" });
  }
};

// DELETE /api/notes/:id
const deleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ message: "Note deleted successfully", id: req.params.id });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ error: "Invalid note ID" });
    res.status(500).json({ error: "Could not delete note" });
  }
};

module.exports = { getNotes, getNoteById, createNote, updateNote, deleteNote };
```

**How each function works:**

**`getNotes`** — Gets all notes for the logged-in user:

- `Note.find({ owner: req.userId })` — the `owner` filter ensures you only get YOUR notes
- `.sort({ isPinned: -1, updatedAt: -1 })` — pinned notes first, then most recently updated

**`getNoteById`** — Gets a single note:

- Requires BOTH the note ID AND the correct owner. Even if you know someone else's note ID, the owner doesn't match so it returns `null`
- The `CastError` catch handles invalid ID formats like `/api/notes/abc`

**`createNote`** — Creates a new note:

- Validates title, content, and category before touching the database
- Sets `owner: req.userId` to stamp the note with the logged-in user's ID
- Responds 201 (Created)

**`updateNote`** — Updates an existing note:

- `findOneAndUpdate({ _id: ..., owner: req.userId }, ...)` — the owner filter prevents editing someone else's note
- `{ new: true }` — returns the updated document, not the old one
- `{ runValidators: true }` — re-checks schema rules on the updated data

**`deleteNote`** — Deletes a note:

- Same owner protection. If the note doesn't exist or belongs to someone else, responds 404

---

## STEP 5 — Routes

Routes map a URL + HTTP method to a controller function. They should be thin — no logic, just wiring.

---

### 5.1 Create `routes/auth.js`

**Purpose:** Define the four auth-related URLs and connect each to its controller.

**What this achieves:**

- `POST /register` and `POST /login` — public routes, no auth needed
- `GET /me` — protected route (the `protect` middleware runs first)
- `PUT /profile` — protected route for updating username/password

**Code:**

```js
const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);

module.exports = router;
```

**How this code works:**

- `express.Router()` — creates a mini-router you can attach routes to
- `router.post("/register", register)` — POST requests to `/register` run the `register` controller
- `router.get("/me", protect, getMe)` — GET requests to `/me` run `protect` FIRST, then `getMe`. Express runs middleware left to right
- `router.put("/profile", protect, updateProfile)` — PUT requests to `/profile` run `protect` first (validates userId), then `updateProfile`. Uses PUT because it updates an existing resource
- These routes get mounted at `/api/auth` in server.js, so the full URLs become:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `PUT /api/auth/profile`

---

### 5.2 Create `routes/notes.js`

**Purpose:** Define all five CRUD endpoints for notes. ALL routes are protected.

**What this achieves:**

- `router.use(protect)` applies auth middleware to EVERY route in this file automatically
- Maps each URL + method to its controller function

**Code:**

```js
const express = require("express");
const {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
} = require("../controllers/notesController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.get("/", getNotes);
router.get("/:id", getNoteById);
router.post("/", createNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);

module.exports = router;
```

**How this code works:**

- `router.use(protect)` — applies the protect middleware to ALL routes below. Every request must include a valid userId
- `/:id` — a URL parameter. Express puts it in `req.params.id`. So `/api/notes/abc123` makes `req.params.id = "abc123"`
- Mounted at `/api/notes` in server.js, the full URLs become:
  - `GET /api/notes` — get all notes
  - `GET /api/notes/:id` — get one note
  - `POST /api/notes` — create a note
  - `PUT /api/notes/:id` — update a note
  - `DELETE /api/notes/:id` — delete a note

---

## STEP 6 — The Server Entry Point

### 6.1 Create `server.js`

**Purpose:** Wire everything together — create the Express app, register middleware, mount routes, and connect to MongoDB.

**What this achieves:**

- Sets up CORS, JSON parsing, and static file serving
- Mounts auth and notes routes
- Adds a 404 handler and global error handler
- Connects to MongoDB, then starts the server

**Important: the order of middleware matters!** If you put routes before `express.json()`, `req.body` will be `undefined`.

**Code:**

```js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);

app.use("/api/{*path}", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "An unexpected server error occurred" });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
```

**How this code works:**

- `require("dotenv").config()` — loads `.env` variables into `process.env`
- `path` — Node.js built-in for building OS-safe file paths
- **Middleware order (this matters!):**
  1. `cors()` — first, so cross-origin requests are allowed
  2. `express.json()` — parses JSON bodies so `req.body` works
  3. `express.static(...)` — serves your frontend files. `path.join(__dirname, "frontend")` builds the absolute path to the `frontend/` folder
  4. Route handlers
  5. 404 catch-all — uses Express 5 syntax `{*path}` (not the old `*`)
  6. Global error handler — LAST, has 4 params so Express recognizes it as an error handler
- `mongoose.connect().then(() => app.listen(...))` — connects to MongoDB FIRST, then starts the server. No point accepting requests if the database is down

---

## STEP 7 — The Frontend

The frontend uses vanilla HTML, CSS, and JavaScript with no frameworks. It communicates with the backend using the `fetch` API.

---

### 7.1 Create `frontend/index.html`

**Purpose:** The HTML structure — a single page with two screens (auth and app), plus a modal for creating/editing notes.

**What this achieves:**

- Auth screen with login/register tab switching
- App screen with navbar, sidebar (filters + search), and notes grid
- A reusable modal for creating and editing notes
- A profile settings modal for changing username/password
- JavaScript toggles which screen is visible using CSS classes

**Code:**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NoteKeeper</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <!-- AUTH SCREEN: shown when user is not logged in -->
    <div id="auth-screen" class="screen">
      <div class="auth-card">
        <h1 class="logo">NoteKeeper</h1>

        <div class="auth-tabs">
          <button class="tab-btn active" onclick="switchTab('login')">
            Log In
          </button>
          <button class="tab-btn" onclick="switchTab('register')">
            Register
          </button>
        </div>

        <form id="login-form" class="auth-form" onsubmit="handleLogin(event)">
          <input type="email" id="login-email" placeholder="Email" required />
          <input
            type="password"
            id="login-password"
            placeholder="Password"
            required
          />
          <button type="submit" class="btn-primary">Log In</button>
        </form>

        <form
          id="register-form"
          class="auth-form hidden"
          onsubmit="handleRegister(event)"
        >
          <input
            type="text"
            id="reg-username"
            placeholder="Username (min 3 chars)"
            required
          />
          <input type="email" id="reg-email" placeholder="Email" required />
          <input
            type="password"
            id="reg-password"
            placeholder="Password (min 6 chars)"
            required
          />
          <button type="submit" class="btn-primary">Create Account</button>
        </form>

        <p id="auth-error" class="error-msg hidden"></p>
      </div>
    </div>

    <!-- APP SCREEN: shown after login -->
    <div id="app-screen" class="screen hidden">
      <nav class="navbar">
        <span class="logo">NoteKeeper</span>
        <div class="nav-right">
          <span id="welcome-msg"></span>
          <button class="btn-ghost" onclick="openProfileModal()">
            Settings
          </button>
          <button class="btn-ghost" onclick="logout()">Log Out</button>
        </div>
      </nav>

      <main class="main-layout">
        <aside class="sidebar">
          <button class="btn-primary full-width" onclick="openModal()">
            + New Note
          </button>

          <div class="filter-group">
            <label>Category</label>
            <select id="filter-category" onchange="renderNotes()">
              <option value="all">All</option>
              <option value="personal">Personal</option>
              <option value="work">Work</option>
              <option value="study">Study</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Search</label>
            <input
              type="text"
              id="search-input"
              placeholder="Search notes..."
              oninput="renderNotes()"
            />
          </div>
        </aside>

        <section class="notes-area">
          <div id="notes-grid" class="notes-grid"></div>
          <p id="empty-msg" class="empty-msg hidden">
            No notes yet — create one!
          </p>
        </section>
      </main>
    </div>

    <!-- MODAL: reused for create and edit -->
    <div
      id="modal-overlay"
      class="modal-overlay hidden"
      onclick="closeModalOnOverlay(event)"
    >
      <div class="modal">
        <h2 id="modal-title">New Note</h2>
        <form id="note-form" onsubmit="handleNoteSubmit(event)">
          <input
            type="text"
            id="note-title"
            placeholder="Title"
            required
            maxlength="100"
          />
          <textarea
            id="note-content"
            placeholder="Write your note here..."
            required
            rows="6"
          ></textarea>
          <div class="form-row">
            <select id="note-category">
              <option value="other">Other</option>
              <option value="personal">Personal</option>
              <option value="work">Work</option>
              <option value="study">Study</option>
            </select>
            <label class="pin-label">
              <input type="checkbox" id="note-pinned" /> Pin note
            </label>
          </div>
          <p id="note-error" class="error-msg hidden"></p>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" onclick="closeModal()">
              Cancel
            </button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- PROFILE SETTINGS MODAL -->
    <div
      id="profile-overlay"
      class="modal-overlay hidden"
      onclick="closeProfileOnOverlay(event)"
    >
      <div class="modal">
        <h2>Account Settings</h2>
        <form id="profile-form" onsubmit="handleProfileSubmit(event)">
          <label class="field-label"
            >New Username (leave blank to keep current)</label
          >
          <input
            type="text"
            id="profile-username"
            placeholder="New username"
            minlength="3"
          />
          <label class="field-label"
            >New Password (leave blank to keep current)</label
          >
          <input
            type="password"
            id="profile-new-password"
            placeholder="New password (min 6 chars)"
            minlength="6"
          />
          <hr class="divider" />
          <label class="field-label"
            >Current Password (required to save changes)</label
          >
          <input
            type="password"
            id="profile-current-password"
            placeholder="Current password"
            required
          />
          <p id="profile-error" class="error-msg hidden"></p>
          <p id="profile-success" class="success-msg hidden"></p>
          <div class="modal-actions">
            <button
              type="button"
              class="btn-ghost"
              onclick="closeProfileModal()"
            >
              Cancel
            </button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <script src="app.js"></script>
  </body>
</html>
```

**Key concepts:**

- **Two screens, one page:** `#auth-screen` and `#app-screen` are both in the HTML. The `hidden` class controls which is visible. JavaScript toggles it — no page reloads
- **`onsubmit="handleLogin(event)"`** — when the form submits, JavaScript intercepts it with `e.preventDefault()` to stop the page from reloading
- **Sidebar filters** call `renderNotes()` on every change for instant client-side filtering
- **Reusable modal** — same modal for create and edit. JavaScript changes the title and pre-fills fields when editing
- **Profile settings modal** — a separate modal for account changes. Both username and password fields are optional, but the current password is always required for security. The `<hr class="divider">` visually separates "what you want to change" from "prove it's you"

---

### 7.2 Create `frontend/style.css`

**Purpose:** All the visual styling — layout, colors, buttons, cards, modal, and responsive design.

**Code:**

```css
:root {
  --golden: #946e1c;
  --navy: #263d69;
  --blue: #1c4694;
  --brown: #614e26;
  --cream: #ffeec9;
  --light-blue: #b0ccff;
  --dark: #212b3f;
  --yellow: #fada93;
  --pale-cream: #fff0cf;
  --pale-blue: #dae7ff;

  --bg: var(--light-blue);
  --surface: var(--navy);
  --input-bg: var(--pale-cream);
  --input-border: var(--golden);
  --btn-bg: var(--navy);
  --btn-text: var(--pale-blue);
  --btn-hover: var(--blue);
  --text-dark: var(--dark);
  --text-light: var(--pale-cream);
  --muted: rgba(255, 255, 255, 0.55);
  --radius: 10px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg);
  color: var(--text-dark);
  font-family: system-ui, sans-serif;
  font-size: 16px;
  min-height: 100vh;
}

/* -- Utility -- */
.hidden {
  display: none !important;
}

.error-msg {
  color: #c0392b;
  font-size: 13px;
  margin-top: 6px;
  background: #fdecea;
  padding: 8px 12px;
  border-radius: 6px;
}

.success-msg {
  color: #1e7e34;
  font-size: 13px;
  margin-top: 6px;
  background: #d4edda;
  padding: 8px 12px;
  border-radius: 6px;
}

/* -- Buttons -- */
.btn-primary {
  background: var(--btn-bg);
  border: none;
  border-radius: 6px;
  color: var(--btn-text);
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  padding: 12px 22px;
  transition: background 0.2s, transform 0.1s;
}
.btn-primary:hover {
  background: var(--btn-hover);
}
.btn-primary:active {
  transform: scale(0.97);
}
.full-width {
  width: 100%;
}

.btn-ghost {
  background: transparent;
  border: 1.5px solid var(--pale-blue);
  border-radius: 6px;
  color: var(--pale-blue);
  cursor: pointer;
  font-size: 14px;
  padding: 8px 16px;
  transition: background 0.2s;
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* -- AUTH SCREEN -- */
.screen {
  min-height: 100vh;
}

.auth-card {
  background: var(--surface);
  border-radius: var(--radius);
  max-width: 400px;
  margin: 80px auto 0;
  padding: 40px 36px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
}

.logo {
  color: var(--pale-cream);
  font-size: 1.8rem;
  text-align: center;
  margin-bottom: 28px;
}

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.12);
}

.tab-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  padding: 10px 20px;
  transition: color 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.tab-btn.active {
  color: var(--yellow);
  border-bottom-color: var(--yellow);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-form input {
  background: var(--input-bg);
  border: 2px solid var(--input-border);
  border-radius: 6px;
  color: var(--text-dark);
  font-size: 15px;
  padding: 12px 16px;
  outline: none;
  transition: border-color 0.2s;
}
.auth-form input:focus {
  border-color: var(--blue);
}

/* -- NAVBAR -- */
.navbar {
  background: var(--navy);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 60px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.navbar .logo {
  color: var(--pale-cream);
  font-size: 1.2rem;
  font-weight: 700;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--muted);
  font-size: 14px;
}

/* -- MAIN LAYOUT -- */
.main-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 0;
  height: calc(100vh - 60px);
}

/* -- SIDEBAR -- */
.sidebar {
  background: var(--surface);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.filter-group select,
.filter-group input {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: var(--pale-cream);
  font-size: 14px;
  padding: 8px 12px;
  outline: none;
  width: 100%;
}

.filter-group input::placeholder {
  color: var(--muted);
}

/* -- NOTES AREA -- */
.notes-area {
  padding: 28px;
  overflow-y: auto;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}

.empty-msg {
  color: var(--dark);
  text-align: center;
  margin-top: 80px;
  font-size: 15px;
  opacity: 0.7;
}

/* -- NOTE CARD -- */
.note-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s, box-shadow 0.15s;
  border-top: 3px solid var(--golden);
  position: relative;
}
.note-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
.note-card.pinned {
  border-top-color: var(--yellow);
}

.note-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.note-card-title {
  color: var(--pale-cream);
  font-size: 16px;
  font-weight: 700;
  flex: 1;
  word-break: break-word;
}

.pin-icon {
  font-size: 14px;
  opacity: 0.8;
}

.note-card-content {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 100px;
  overflow: hidden;
}

.note-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.category-badge {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  color: var(--pale-blue);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 3px 10px;
  text-transform: uppercase;
}

.note-date {
  color: var(--muted);
  font-size: 11px;
}

.note-card-actions {
  display: flex;
  gap: 8px;
}

.btn-card {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: var(--pale-blue);
  cursor: pointer;
  font-size: 13px;
  padding: 5px 12px;
  transition: background 0.15s;
}
.btn-card:hover {
  background: rgba(255, 255, 255, 0.1);
}
.btn-card.btn-delete:hover {
  background: rgba(192, 57, 43, 0.35);
  color: #e8a09a;
  border-color: rgba(192, 57, 43, 0.5);
}

/* -- MODAL -- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.modal {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 36px;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 16px 60px rgba(0, 0, 0, 0.35);
}

.modal h2 {
  color: var(--pale-cream);
  font-size: 1.3rem;
  margin-bottom: 20px;
}

.modal input[type="text"],
.modal input[type="password"],
.modal textarea,
.modal select {
  background: var(--input-bg);
  border: 2px solid var(--input-border);
  border-radius: 6px;
  color: var(--text-dark);
  font-family: inherit;
  font-size: 15px;
  padding: 12px 16px;
  width: 100%;
  outline: none;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}
.modal input:focus,
.modal textarea:focus {
  border-color: var(--blue);
}
.modal textarea {
  resize: vertical;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.form-row select {
  width: auto;
  margin-bottom: 0;
  flex: 1;
}

.pin-label {
  color: var(--pale-cream);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.pin-label input {
  width: auto;
  accent-color: var(--yellow);
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.field-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
  display: block;
}

.divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 16px 0;
}

/* -- Responsive -- */
@media (max-width: 640px) {
  .main-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .sidebar {
    flex-direction: row;
    flex-wrap: wrap;
    height: auto;
    padding: 12px;
    gap: 12px;
  }
  .notes-area {
    padding: 16px;
  }
}
```

**Key CSS concepts:**

- **CSS variables (`:root`)** — define colors once, reuse everywhere with `var(--name)`. Change the whole color scheme by editing `:root`
- **`.hidden`** — the utility class JavaScript uses to show/hide elements
- **CSS Grid** — `grid-template-columns: 220px 1fr` creates a fixed sidebar + flexible content area. The notes grid uses `repeat(auto-fill, minmax(260px, 1fr))` for responsive wrapping columns
- **`@media (max-width: 640px)`** — on small screens, sidebar stacks on top instead of beside the notes

---

### 7.3 Create `frontend/app.js`

**Purpose:** All client-side behavior — authentication, API communication, note rendering, search, filtering, CRUD operations, and profile settings.

**How frontend auth works:**

1. User logs in/registers -> server returns user object (id, userName, email)
2. `id` is stored in `localStorage` as `"nk_user_id"`
3. Every API request includes userId automatically via the `apiFetch` helper
4. On logout, `localStorage` is cleared
5. On page load, if userId exists in `localStorage`, skip login screen
6. User can update their username/password via the Settings modal, which sends a PUT to `/api/auth/profile`

**Code:**

```js
const API = "/api";

let allNotes = [];
let editingNoteId = null;

// -- Helpers --

function getUserId() {
  return localStorage.getItem("nk_user_id");
}

function setUserId(id) {
  localStorage.setItem("nk_user_id", id);
}

function clearUser() {
  localStorage.removeItem("nk_user_id");
  localStorage.removeItem("nk_user");
}

async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const userId = getUserId();
  let url = `${API}${path}`;

  if (method === "GET") {
    if (userId) url += `${url.includes("?") ? "&" : "?"}userId=${userId}`;
  } else if (userId) {
    const existing = options.body ? JSON.parse(options.body) : {};
    options = { ...options, body: JSON.stringify({ ...existing, userId }) };
  }

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// -- Auth UI --

function switchTab(tab) {
  document
    .getElementById("login-form")
    .classList.toggle("hidden", tab !== "login");
  document
    .getElementById("register-form")
    .classList.toggle("hidden", tab !== "register");
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    btn.classList.toggle(
      "active",
      (i === 0 && tab === "login") || (i === 1 && tab === "register")
    );
  });
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAuthError() {
  document.getElementById("auth-error").classList.add("hidden");
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setUserId(data.user.id);
    localStorage.setItem("nk_user", JSON.stringify(data.user));
    enterApp(data.user);
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAuthError();
  const username = document.getElementById("reg-username").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    setUserId(data.user.id);
    localStorage.setItem("nk_user", JSON.stringify(data.user));
    enterApp(data.user);
  } catch (err) {
    showAuthError(err.message);
  }
}

function logout() {
  clearUser();
  allNotes = [];
  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("login-form").reset();
}

// -- App shell --

function enterApp(user) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("welcome-msg").textContent = `Hi, ${user.username}`;
  loadNotes();
}

// -- Notes: data fetching --

async function loadNotes() {
  try {
    allNotes = await apiFetch("/notes");
    renderNotes();
  } catch (err) {
    if (err.message.includes("authorized")) {
      clearUser();
      logout();
    }
  }
}

// -- Notes: rendering --

function renderNotes() {
  const category = document.getElementById("filter-category").value;
  const search = document.getElementById("search-input").value.toLowerCase();

  const filtered = allNotes.filter((note) => {
    const matchCategory = category === "all" || note.category === category;
    const matchSearch =
      note.title.toLowerCase().includes(search) ||
      note.content.toLowerCase().includes(search);
    return matchCategory && matchSearch;
  });

  const grid = document.getElementById("notes-grid");
  const emptyMsg = document.getElementById("empty-msg");

  if (filtered.length === 0) {
    grid.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  grid.innerHTML = filtered
    .map(
      (note) => `
    <div class="note-card ${note.isPinned ? "pinned" : ""}">
      <div class="note-card-header">
        <span class="note-card-title">${escapeHtml(note.title)}</span>
        ${
          note.isPinned ? '<span class="pin-icon" title="Pinned">📌</span>' : ""
        }
      </div>
      <p class="note-card-content">${escapeHtml(note.content)}</p>
      <div class="note-card-footer">
        <span class="category-badge">${note.category}</span>
        <span class="note-date">${formatDate(note.updatedAt)}</span>
      </div>
      <div class="note-card-actions">
        <button class="btn-card" onclick="openEditModal('${
          note._id
        }')">Edit</button>
        <button class="btn-card btn-delete" onclick="deleteNote('${
          note._id
        }')">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// -- Modal: open / close --

function openModal() {
  editingNoteId = null;
  document.getElementById("modal-title").textContent = "New Note";
  document.getElementById("note-form").reset();
  hideNoteError();
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function openEditModal(id) {
  const note = allNotes.find((n) => n._id === id);
  if (!note) return;

  editingNoteId = id;
  document.getElementById("modal-title").textContent = "Edit Note";
  document.getElementById("note-title").value = note.title;
  document.getElementById("note-content").value = note.content;
  document.getElementById("note-category").value = note.category;
  document.getElementById("note-pinned").checked = note.isPinned;
  hideNoteError();
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
}

function showNoteError(msg) {
  const el = document.getElementById("note-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideNoteError() {
  document.getElementById("note-error").classList.add("hidden");
}

// -- Notes: CRUD --

async function handleNoteSubmit(e) {
  e.preventDefault();
  hideNoteError();

  const body = {
    title: document.getElementById("note-title").value.trim(),
    content: document.getElementById("note-content").value.trim(),
    category: document.getElementById("note-category").value,
    isPinned: document.getElementById("note-pinned").checked,
  };

  try {
    if (editingNoteId) {
      const updated = await apiFetch(`/notes/${editingNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      allNotes = allNotes.map((n) => (n._id === editingNoteId ? updated : n));
    } else {
      const created = await apiFetch("/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      allNotes.unshift(created);
    }

    closeModal();
    renderNotes();
  } catch (err) {
    showNoteError(err.message);
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;
  try {
    await apiFetch(`/notes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    allNotes = allNotes.filter((n) => n._id !== id);
    renderNotes();
  } catch (err) {
    alert(err.message);
  }
}

// -- Profile Settings Modal --

function openProfileModal() {
  document.getElementById("profile-form").reset();
  hideProfileError();
  hideProfileSuccess();
  document.getElementById("profile-overlay").classList.remove("hidden");
}

function closeProfileModal() {
  document.getElementById("profile-overlay").classList.add("hidden");
}

function closeProfileOnOverlay(e) {
  if (e.target === document.getElementById("profile-overlay"))
    closeProfileModal();
}

function showProfileError(msg) {
  const el = document.getElementById("profile-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideProfileError() {
  document.getElementById("profile-error").classList.add("hidden");
}

function showProfileSuccess(msg) {
  const el = document.getElementById("profile-success");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideProfileSuccess() {
  document.getElementById("profile-success").classList.add("hidden");
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  hideProfileError();
  hideProfileSuccess();

  const currentPassword = document.getElementById(
    "profile-current-password"
  ).value;
  const newUserName = document.getElementById("profile-username").value.trim();
  const newPassword = document.getElementById("profile-new-password").value;

  if (!newUserName && !newPassword) {
    showProfileError("Enter a new username or new password to update.");
    return;
  }

  const body = { currentPassword };
  if (newUserName) body.newUserName = newUserName;
  if (newPassword) body.newPassword = newPassword;

  try {
    const data = await apiFetch("/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    localStorage.setItem("nk_user", JSON.stringify(data.user));
    document.getElementById(
      "welcome-msg"
    ).textContent = `Hi, ${data.user.userName}`;
    showProfileSuccess("Profile updated successfully!");
    document.getElementById("profile-form").reset();
  } catch (err) {
    showProfileError(err.message);
  }
}

// -- Bootstrap --

(function init() {
  const userId = getUserId();
  const user = JSON.parse(localStorage.getItem("nk_user") || "null");
  if (userId && user) {
    enterApp(user);
  }
})();
```

**How the key parts work:**

**`apiFetch(path, options)`** — The most important helper. Wraps the browser's `fetch` and automatically injects the userId:

- For GET requests: appends `?userId=...` to the URL
- For POST/PUT/DELETE: merges `userId` into the JSON body
- Checks `res.ok` and throws an error if the status is not 200-299

**`escapeHtml(str)`** — XSS prevention. Creates a temporary `<div>`, sets `textContent` (which escapes HTML), then reads back the safe `innerHTML`. This prevents `<script>` tags in note content from executing

**`renderNotes()`** — Filters the `allNotes` array by category and search text using `.filter()`, then builds HTML cards. Filtering happens client-side — instant, no server request needed

**`handleNoteSubmit(e)`** — Handles both create and edit:

- If `editingNoteId` is set: sends PUT, replaces the note in `allNotes` with `.map()`
- If not: sends POST, adds the new note to the front with `.unshift()`
- This is an **optimistic UI update** — updating the local array instead of re-fetching everything

**`handleProfileSubmit(e)`** — Handles username and/or password changes:

- Reads the three form fields: current password, new username, new password
- Client-side validation: at least one of username/password must be filled in
- Builds the request body dynamically — only includes `newUserName`/`newPassword` if they have values
- On success: updates `localStorage` with the new user data, updates the navbar welcome message, and shows a green success message
- On error: shows the server's error message (wrong password, username taken, etc.)
- Resets the form after success so passwords aren't left in the inputs

**`(function init() {...})()`** — Runs on page load. Checks if userId exists in `localStorage`. If yes, skips login and enters the app. This is how "stay logged in" works

---

## The Profile Update Request Flow

```
1. User clicks "Settings" in the navbar

2. frontend/app.js
   -> openProfileModal() shows the profile modal

3. User fills in current password + new username and/or new password, clicks "Save Changes"

4. frontend/app.js
   -> handleProfileSubmit() -> apiFetch("/auth/profile", { method: "PUT", body: {...} })
   -> apiFetch automatically injects userId into the body

5. Express receives PUT /api/auth/profile

6. routes/auth.js
   -> router.put("/profile", protect, updateProfile)

7. middleware/auth.js
   -> protect validates userId, sets req.userId

8. controllers/authController.js
   -> updateProfile verifies currentPassword against stored hash
   -> updates user.userName and/or user.password
   -> calls user.save()

9. models/User.js
   -> pre-save hook runs: if password was changed, isModified("password")
      returns true and the new password gets hashed

10. MongoDB stores the updated user document

11. Server responds 200 with updated user info

12. frontend/app.js
    -> updates localStorage and navbar welcome message
    -> shows "Profile updated successfully!"
```

---

## The Complete Request Flow

When stuck, trace the request through the entire stack:

```
1. User clicks "Save" on a new note

2. frontend/app.js
   -> handleNoteSubmit() -> apiFetch("/notes", { method: "POST", body: {...} })
   -> apiFetch automatically injects userId into the body

3. Express receives POST /api/notes

4. server.js
   -> app.use("/api/notes", notesRoutes) -> routes to routes/notes.js

5. routes/notes.js
   -> router.use(protect) runs FIRST

6. middleware/auth.js
   -> protect reads userId from req.body, validates it, sets req.userId

7. routes/notes.js
   -> router.post("/", createNote) runs

8. controllers/notesController.js
   -> createNote validates title/content/category
   -> creates a new Note with owner: req.userId and saves it

9. MongoDB stores the note document

10. Server responds 201 with the saved note JSON

11. frontend/app.js
    -> apiFetch returns the data
    -> allNotes.unshift(created)
    -> renderNotes()

12. User sees the new note card appear in the grid
```

---

## HTTP Status Codes Used

| Code | Meaning      | Where it's used                                                      |
| ---- | ------------ | -------------------------------------------------------------------- |
| 200  | OK           | Successful GET, PUT, DELETE (including profile update)               |
| 201  | Created      | Successful POST (register, create note)                              |
| 400  | Bad Request  | Invalid data (missing fields, title too long, no changes to make)    |
| 401  | Unauthorized | No userId, invalid userId, wrong credentials, wrong current password |
| 404  | Not Found    | Note or user doesn't exist                                           |
| 409  | Conflict     | Email/username already in use (register or profile update)           |
| 500  | Server Error | Something crashed on the server                                      |
