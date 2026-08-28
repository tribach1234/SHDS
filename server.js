require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const session = require('express-session');

const routes = require('./modules/routes');
const { DOMAIN } = require('./modules/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

let sslOptions = null;
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'ssl.key')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'ssl.pem'))
  };
} catch (err) {
  console.log('Không tìm thấy SSL Key/Cert, chạy dưới dạng HTTP (thích hợp cho Render/Vercel).');
}

// Middleware
app.set('trust proxy', 1); // Trust first proxy (Render/Vercel)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use(routes);

if (sslOptions) {
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server HTTPS đang chạy tại ${DOMAIN} (Port ${PORT})`);
  });
} else {
  const http = require('http');
  http.createServer(app).listen(PORT, () => {
    console.log(`Server HTTP đang chạy tại port ${PORT}`);
  });
}