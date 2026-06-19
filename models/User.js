//User.js: Defines the user account in the database and handles password.

const mongoose = require("mongoose");
const pwd = require("passwordjs");

// Defines: `username`, `email`, `password`
const userSchema = new mongoose.Schema(
  {
    userName: {
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
  //pre-save hook
  if (!this.isModified("password")) return; //checks if the password changed. If the user only updated their username, we skip hashing
  this.password = await pwd.encrypt(this.password, "bcrypt");
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return pwd.compare(candidatePassword, this.password, "bcrypt");
};

module.exports = mongoose.model("User", userSchema); //creates and exports the model. Mongoose creates a collection
