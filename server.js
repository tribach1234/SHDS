require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const routes = require('./modules/routes');
const { DOMAIN } = require('./modules/mailer');

const app = express();
const PORT = process.env.PORT || 443;

let sslOptions = {};
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'ssl.key')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'ssl.pem'))
  };
} catch (err) {
  console.error('Lỗi đọc SSL Key/Cert:', err.message);
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(routes);

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Server đang chạy tại ${DOMAIN}`);
});