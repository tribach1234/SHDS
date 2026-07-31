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
  // Xóa các token cũ của email này nếu có
  for (const [key, value] of activationTokens.entries()) {
    if (value.email === email) {
      activationTokens.delete(key);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 phút

  activationTokens.set(token, { email, expiresAt });

  // Tự động xóa token khỏi RAM sau 10 phút
  setTimeout(() => {
    if (activationTokens.has(token)) {
      activationTokens.delete(token);
    }
  }, 10 * 60 * 1000);

  const activationLink = `${DOMAIN}/api/activate?key=${token}`;

  const mailOptions = {
    from: `"TMTS System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Xác nhận kích hoạt tài khoản Admin - TMTS System',
    html: `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Xác nhận thông tin</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        
          <!-- Wrapper Table -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f8; padding: 20px 0;">
              <tr>
                  <td align="center">
                      
                      <!-- Main Card Container -->
                      <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: 100%;">
                          
                          <!-- Header / Banner -->
                          <tr>
                              <td align="center" style="background-color: #b9dc9c; padding: 24px; color: #ffffff;">
                                  <h1 style="margin: 0; font-size: 24px; font-weight: bold;">TMTS System</h1>
                              </td>
                          </tr>
        
                          <!-- Content Body -->
                          <tr>
                              <td style="padding: 32px; color: #333333; line-height: 1.6;">
                                  
                                  <!-- Lời chào -->
                                  <h2 style="margin-top: 0; color: #111827; font-size: 20px; text-align: center;">Xin chào ${fullName},</h2>
                                  
                                  <!-- Đoạn văn bản yêu cầu -->
                                  <p style="margin-bottom: 20px; font-size: 15px;">
                                      Hệ thống vừa nhận được yêu cầu kích hoạt tài khoản Admin của bạn. Để hoàn tất quá trình này, vui lòng xác nhận bằng cách nhấn vào nút bên dưới (liên kết có hiệu lực trong <b>10 phút</b>):
                                  </p>
        
                                  <!-- Nút nhấn (Button CTA chuẩn HTML Email) -->
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                                      <tr>
                                          <td align="center">
                                              <table border="0" cellpadding="0" cellspacing="0">
                                                  <tr>
                                                      <td align="center" style="border-radius: 6px; background-color: #b9dc9c;">
                                                          <a href="${activationLink}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 6px;">
                                                              Xác nhận tài khoản
                                                          </a>
                                                      </td>
                                                  </tr>
                                              </table>
                                          </td>
                                      </tr>
                                  </table>
        
                                  <!-- Liên kết / Link phụ -->
                                  <p style="font-size: 13px; color: #6B7280; margin-bottom: 0;">
                                      Nếu nút trên không hoạt động, bạn cũng có thể truy cập trực tiếp qua đường dẫn sau:<br>
                                      <a href="${activationLink}" style="color: #4F46E5; word-break: break-all;">${activationLink}</a>
                                  </p>
        
                              </td>
                          </tr>
        
                          <!-- Footer -->
                          <tr>
                              <td align="center" style="background-color: #f9fafb; padding: 20px; font-size: 12px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                                  <p style="margin: 0;">Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email này.</p>
                                  <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} TMTS Team. All rights reserved.</p>
                              </td>
                          </tr>
        
                      </table>
        
                  </td>
              </tr>
          </table>
      </body>
      </html>
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