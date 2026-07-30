const crypto = require('crypto');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 443;
const DOMAIN = process.env.DOMAIN || `https://shds.tmts.io.vn${PORT == 443 ? '' : `:${PORT}`}`;

const activationTokens = new Map();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function generateAndSendActivationEmail(email, fullName) {
  for (const [key, value] of activationTokens.entries()) {
    if (value.email === email) {
      activationTokens.delete(key);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  activationTokens.set(token, { email, expiresAt });

  setTimeout(() => {
    if (activationTokens.has(token)) {
      activationTokens.delete(token);
    }
  }, 10 * 60 * 1000);

  const activationLink = `${DOMAIN}/api/activate?key=${token}`;

  const mailOptions = {
    from: `"TMTS System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Xác nhận kích hoạt tài khoản Admin',
    html: `
      <h3>Xin chào ${fullName},</h3>
      <p>Bạn vừa yêu cầu kích hoạt tài khoản Admin trên hệ thống.</p>
      <p>Vui lòng bấm vào liên kết dưới đây để kích hoạt tài khoản (Liên kết có hiệu lực trong <b>10 phút</b>):</p>
      <p><a href="${activationLink}" style="padding: 10px 15px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Kích Hoạt Tài Khoản</a></p>
      <p>Link trực tiếp: <a href="${activationLink}">${activationLink}</a></p>
    `
  };

  await transporter.sendMail(mailOptions);
  return token;
}

module.exports = {
  activationTokens,
  generateAndSendActivationEmail,
  DOMAIN
};