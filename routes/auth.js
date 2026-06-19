const express = require("express");
const {
  register,
  login,
  getMe,
  updateProfile,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();
//full URLs
router.post("/register", register); //POST /api/auth/register
router.post("/login", login); //POST /api/auth/login
router.get("/me", protect, getMe); //GET /api/auth/me
router.put("/profile", protect, updateProfile); //PUT /api/auth/profile

module.exports = router;
