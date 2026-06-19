const User = require("../models/User");
// handles what happens when a route is hit.

//creates a new user with validation and duplicate checking
const register = async (req, res) => {
  const { userName, email, password } = req.body;

  if (!userName || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email, and password are required" });
  }
  if (userName.trim().length < 3) {
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
    const existing = await User.findOne({ $or: [{ email }, { userName }] });
    if (existing) {
      const field = existing.email === email ? "Email" : "Username";
      return res.status(409).json({ error: `${field} is already in use` });
    }

    const user = await new User({ userName, email, password }).save();

    res.status(201).json({
      message: "Account created successfully",
      user: { id: user._id, userName: user.userName, email: user.email },
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
};

//authenticates the user via email and password
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
      user: { id: user._id, userName: user.userName, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
};

// current user's profile
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      user: { id: user._id, userName: user.userName, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

//  lets a user change their username and/or password (requires auth + current password verification)
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
