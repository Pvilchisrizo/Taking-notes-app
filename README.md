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
CONTROLLERS
authController.js -- Register, login and profile endpoints
notesController.js --CRUD
FRONTEND
index.html
style.css
app.js
MIDLEWARE
auth.js -- User ID validation
MODELS
User.js -- User schema and password hashing
Note.js -- Note schema linked to users routes
auth.js -- Auth route definitions
notes.js -- Notes route definitions
server.js
