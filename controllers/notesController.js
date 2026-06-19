//CRUD operations filtered by owner

const Note = require("../models/Note");

const VALID_CATEGORIES = ["personal", "work", "study", "other"];

// GET /all notes
const getNotes = async (req, res) => {
  try {
    const notes = await Note.find({ owner: req.userId }).sort({
      isPinned: -1,
      updatedAt: -1, //pinned notes first then most recently updated
    });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: "Could not retrieve notes" });
  }
};

// GET notes by id
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

// POST notes
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

// PUT update
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

// DELETE
const deleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!note) return res.status(404).json({ error: "Note not found" }); //If the note doesn't exist or belongs to someone else
    res.json({ message: "Note deleted successfully", id: req.params.id });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ error: "Invalid note ID" });
    res.status(500).json({ error: "Could not delete note" });
  }
};

module.exports = { getNotes, getNoteById, createNote, updateNote, deleteNote };
