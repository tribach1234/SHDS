const express = require('express');
const router = express.Router();

const { dbGet, dbRun } = require('./db');
const { hashPassword, verifyPassword } = require('./auth');
const { formatEmail, checkEmailExists } = require('./helpers');
const { activationTokens, generateAndSendActivationEmail, DOMAIN } = require('./mailer');

// Route kiểm tra / thử lại gửi mail
router.get('/retry', async (req, res) => {
  const testEmail = 'tommi2k10@gmail.com';
  try {
    const token = await generateAndSendActivationEmail(testEmail, 'Tommi Test User');
    return res.send(`
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: #28a745;">✅ Đã gửi lại email kích hoạt thử nghiệm thành công!</h2>
        <p>Email nhận: <b>${testEmail}</b></p>
        <p>Domain sử dụng: <b>${DOMAIN}</b></p>
        <p>Token kích hoạt mới lưu trong RAM: <code>${token}</code></p>
        <p>Vui lòng kiểm tra Hòm thư (Inbox / Spam) của Gmail.</p>
      </div>
    `);
  } catch (err) {
    return res.status(500).send(`
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: #dc3545;">❌ Gửi email thất bại!</h2>
        <p><b>Chi tiết lỗi từ SMTP:</b> ${err.message}</p>
      </div>
    `);
  }
});

// Route đăng ký Admin
router.post('/api/register-admin', async (req, res) => {
  try {
    const { fullName, email, pass } = req.body;

    if (!fullName || !email || !pass) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ Họ tên, Email và Mật khẩu!' });
    }

    const fullEmail = formatEmail(email);

    const isExist = await checkEmailExists(fullEmail);
    if (isExist) {
      return res.status(400).json({ success: false, message: `Email ${fullEmail} đã tồn tại trong hệ thống!` });
    }

    const hashedPass = await hashPassword(pass);

    await dbRun(
      `INSERT INTO admins (id, fullName, email, pass, activate) VALUES (?, ?, ?, ?, 'false')`,
      [fullEmail, fullName, fullEmail, hashedPass]
    );

    await generateAndSendActivationEmail(fullEmail, fullName);

    return res.json({
      success: true,
      message: 'Đăng ký Admin thành công! Vui lòng kiểm tra email để kích hoạt tài khoản trong vòng 10 phút.',
      data: { fullName, email: fullEmail, activate: 'false' }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Route kích hoạt tài khoản
router.get('/api/activate', async (req, res) => {
  try {
    const { key } = req.query;

    if (!key || !activationTokens.has(key)) {
      return res.status(400).send(`
        <div style="text-align: center; margin-top: 50px; font-family: Arial;">
          <h2 style="color: #dc3545;">Mã kích hoạt không tồn tại hoặc đã được sử dụng!</h2>
        </div>
      `);
    }

    const tokenData = activationTokens.get(key);
    const now = Date.now();

    if (now > tokenData.expiresAt) {
      activationTokens.delete(key);
      const admin = await dbGet(`SELECT * FROM admins WHERE email = ?`, [tokenData.email]);

      if (admin && admin.activate === 'false') {
        await generateAndSendActivationEmail(admin.email, admin.fullName);
        return res.send(`
          <div style="text-align: center; margin-top: 50px; font-family: Arial;">
            <h2 style="color: #dc3545;">Mã kích hoạt đã hết hạn!</h2>
            <p>Hệ thống đã tự động gửi một email kích hoạt mới đến <b>${admin.email}</b>.</p>
          </div>
        `);
      }
    }

    await dbRun(`UPDATE admins SET activate = 'true' WHERE email = ?`, [tokenData.email]);
    activationTokens.delete(key);

    return res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial;">
        <h2 style="color: #28a745;">Kích hoạt tài khoản thành công!</h2>
        <p>Trạng thái <b>activate</b> đã được đổi thành <b>true</b>. Bạn có thể đăng nhập ngay bây giờ.</p>
      </div>
    `);
  } catch (err) {
    return res.status(500).send(`Server Error: ${err.message}`);
  }
});

// Route đăng nhập
router.post('/api/login', async (req, res) => {
  try {
    const { email, pass } = req.body;

    if (!email || !pass) {
      return res.status(400).json({ success: false, message: 'Thiếu Email hoặc Mật khẩu!' });
    }

    const fullEmail = formatEmail(email);

    const tables = [
      { name: 'admins', role: 'ADMIN' },
      { name: 'teachers', role: 'TEACHER' },
      { name: 'tas', role: 'TA' },
      { name: 'students', role: 'STUDENT' }
    ];

    let matchedUser = null;
    let matchedRole = '';

    for (const t of tables) {
      const user = await dbGet(`SELECT * FROM ${t.name} WHERE email = ?`, [fullEmail]);
      if (user) {
        matchedUser = user;
        matchedRole = t.role;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại!' });
    }

    const isPassValid = await verifyPassword(pass, matchedUser.pass);
    if (!isPassValid) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
    }

    if (matchedRole === 'ADMIN') {
      if (matchedUser.activate === 'false') {
        let activeToken = null;
        for (const [k, v] of activationTokens.entries()) {
          if (v.email === fullEmail) {
            activeToken = v;
            break;
          }
        }

        const now = Date.now();

        if (!activeToken || now > activeToken.expiresAt) {
          await generateAndSendActivationEmail(matchedUser.email, matchedUser.fullName);
          return res.status(403).json({
            success: false,
            message: 'Tài khoản chưa kích hoạt và mã cũ đã hết hạn! Hệ thống đã gửi lại email kích hoạt mới.'
          });
        } else {
          return res.status(403).json({
            success: false,
            message: 'Tài khoản chưa kích hoạt! Vui lòng kiểm tra email để kích hoạt (Mã cũ vẫn còn hạn).'
          });
        }
      }
    }

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: {
        fullName: matchedUser.fullName,
        email: matchedUser.email,
        role: matchedRole,
        activate: matchedUser.activate || 'true'
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Route Admin khởi tạo User
router.post('/api/admin/create-user', async (req, res) => {
  try {
    const { adminEmail, fullName, email, pass, role } = req.body;

    if (!adminEmail || !fullName || !email || !pass || !role) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin!' });
    }

    const fullAdminEmail = formatEmail(adminEmail);
    const fullUserEmail = formatEmail(email);

    const admin = await dbGet(`SELECT * FROM admins WHERE email = ?`, [fullAdminEmail]);
    if (!admin || admin.activate !== 'true') {
      return res.status(403).json({ success: false, message: 'Email Admin không hợp lệ hoặc chưa được kích hoạt!' });
    }

    const isExist = await checkEmailExists(fullUserEmail);
    if (isExist) {
      return res.status(400).json({ success: false, message: `Tài khoản với email ${fullUserEmail} đã tồn tại!` });
    }

    const tableMap = { TEACHER: 'teachers', TA: 'tas', STUDENT: 'students' };
    const targetTable = tableMap[role];

    if (!targetTable) {
      return res.status(400).json({ success: false, message: 'Role không hợp lệ!' });
    }

    const hashedPass = await hashPassword(pass);
    await dbRun(
      `INSERT INTO ${targetTable} (id, fullName, email, pass) VALUES (?, ?, ?, ?)`,
      [fullUserEmail, fullName, fullUserEmail, hashedPass]
    );

    return res.json({ success: true, message: `Đã tạo ${role} (${fullUserEmail}) thành công!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;