require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Added this!
const path = require('path');

const routes = require('./modules/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Added this!
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use(routes);

app.listen(PORT, () => {
  console.log(`✅ [LOCAL DEV] Server đang chạy tại http://localhost:${PORT}`);
  console.log(`   Mở: http://localhost:${PORT}/Student/Student.html`);
});