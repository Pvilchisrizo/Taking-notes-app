//validated the userId before controllers run.

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
  next(); // passes control the route handler.
};

module.exports = { protect };
