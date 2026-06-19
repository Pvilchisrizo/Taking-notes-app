NOTE TAKING APP

A full-stack note-taking application with user authentication built with:
Node.js
Express
MongoDB
HTML/CSS/JS

REQUISITES
Node.js
MongoDB

PACKAGES  
Install the following packages:
express
mongoDB  
mongoose
cors
passwordjs
dotenv

START SERVER
npm start

BROWSER
http://localhost:3000

STRUCTURE

Taking-notes-app/
├── controllers/
│ ├── authController.js # Register, login, profile endpoints
│ └── notesController.js # CRUD operations for notes
├── frontend/
│ ├── index.html # Single-page app layout
│ ├── style.css # Styling
│ └── app.js # Client-side logic
├── middleware/
│ └── auth.js # User ID validation middleware
├── models/
│ ├── User.js # User schema with password hashing
│ └── Note.js # Note schema linked to users
├── routes/
│ ├── auth.js # Auth route definitions
│ └── notes.js # Notes route definitions
├── server.js # App entry point
├── .env # Environment variables (not committed)
└── package.json
