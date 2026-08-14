require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session'); // 1. Import express-session

const routes = require('./modules/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 2. Add Session Middleware BEFORE app.use(routes)
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to true if running over HTTPS in production
    maxAge: 24 * 60 * 60 * 1000 // Session lasts 24 hours
  }
}));

// Routes (Must come AFTER session middleware so req.session works)
app.use(routes);

app.listen(PORT, () => {
  console.log(`✅ [LOCAL DEV] Server đang chạy tại http://localhost:${PORT}`);
  console.log(`   Mở: http://localhost:${PORT}/Login.html`);
});