const express = require('express');
const router = express.Router();
const StudentService = require("./hocsinh/StudentService");
const TeacherClassService = require("../public/Teacher/teacher-classservice");

const { dbGet, dbRun, dbAll } = require("./db");
const { hashPassword, verifyPassword } = require('./auth');
const { formatEmail, checkEmailExists } = require('./helpers');
const { activationTokens, generateAndSendActivationEmail, DOMAIN } = require('./mailer');

// Lightweight "session" — since this app has no express-session, admin
// pages send their id via the X-Admin-Id header (set once in
// admin-shared.js) instead of a real cookie session.
async function requireAdmin(req, res, next) {
  const adminId = req.headers['x-admin-id'];
  if (!adminId) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  }
  const admin = await dbGet(`SELECT id, fullName, email, activate FROM users.admins WHERE id = ?`, [adminId]);
  if (!admin || admin.activate !== 'true') {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ!' });
  }
  req.admin = admin;
  next();
}

// GET /api/me — used by admin-shared.js's verifyAdminSession()
router.get('/api/me', async (req, res) => {
  // 1. Grab the ID and Role from headers (keeping x-admin-id as a fallback so we don't break existing admin logic)
  const userId = req.headers['x-user-id'] || req.headers['x-admin-id'];
  const userRole = req.headers['x-user-role']; 

  if (!userId || !userRole) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc thiếu thông tin vai trò!' });
  }

  try {
    // 2. Route logic based on Role
    if (userRole === 'ADMIN') {
      const admin = await dbGet(`SELECT id, fullName, email, activate FROM users.admins WHERE id = ?`, [userId]);
      if (!admin || admin.activate !== 'true') {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập admin không hợp lệ!' });
      }
      return res.json({ success: true, user: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN' } });
    }

    if (userRole === 'TEACHER') {
      const teacher = await dbGet(`SELECT id, fullName, email FROM users.teachers WHERE id = ?`, [userId]);
      if (!teacher) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập giáo viên không hợp lệ!' });
      }
      return res.json({ success: true, user: { id: teacher.id, fullName: teacher.fullName, email: teacher.email, role: 'TEACHER' } });
    }

    if (userRole === 'STUDENT') {
      const student = await dbGet(`SELECT id, fullName, email FROM users.students WHERE id = ?`, [userId]);
      if (!student) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập học sinh không hợp lệ!' });
      }
      return res.json({ success: true, user: { id: student.id, fullName: student.fullName, email: student.email, role: 'STUDENT' } });
    }

    // Catch-all for invalid roles
    return res.status(401).json({ success: false, message: 'Vai trò (role) không hợp lệ!' });

  } catch (error) {
    console.error("Error in /api/me:", error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});
// POST /api/logout — no real server session to destroy, just acknowledge
router.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

// IDOR & Session Protection Guard
async function requireTeacher(req, res, next) {
  try {
    const teacherId = req.params.teacherId;
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Thiếu ID giáo viên!" });
    }

    // Lookup the teacher directly in the DB using the URL parameter
    const teacher = await dbGet(`SELECT id FROM users.teachers WHERE id = ?`, [teacherId]);
    
    if (!teacher) {
      return res.status(403).json({ success: false, message: "Truy cập bị từ chối hoặc giáo viên không tồn tại!" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "Lỗi máy chủ khi xác thực giáo viên." });
  }
}

function helper(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req, res);
      res.json({ success: true, data });
    } catch (err) {
      console.error("[studentRoutes]", err);
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || "Đã có lỗi xảy ra, vui lòng thử lại.",
      });
    }
  };
}

/// AUTHENTICATION ROUTES

// Get current session user

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
      `INSERT INTO users.admins (id, fullName, email, pass, activate) VALUES (?, ?, ?, ?, 'true')`,
      [fullEmail, fullName, fullEmail, hashedPass]
    );

    return res.json({
      success: true,
      message: 'Đăng ký Admin thành công! Tài khoản đã được kích hoạt, bạn có thể đăng nhập ngay.',
      data: { fullName, email: fullEmail, activate: 'true' }
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
      const admin = await dbGet(`SELECT * FROM users.admins WHERE email = ?`, [tokenData.email]);

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

    await dbRun(`UPDATE users.admins SET activate = 'true' WHERE email = ?`, [tokenData.email]);
    activationTokens.delete(key);

    return res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial;">
        <h2 style="color: #28a745;">Kích hoạt tài khoản thành công!</h2>
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
      { name: 'users.admins', role: 'ADMIN' },
      { name: 'users.teachers', role: 'TEACHER' },
      { name: 'users.tas', role: 'TA' },
      { name: 'users.students', role: 'STUDENT' }
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

    const isPassValid = (pass === matchedUser.pass) || await verifyPassword(pass, matchedUser.pass);
    if (!isPassValid) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
    }

    if (matchedRole === 'ADMIN' && matchedUser.activate === 'false') {
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
          message: 'Tài khoản chưa kích hoạt! Vui lòng kiểm tra email để kích hoạt.'
        });
      }
    }

const userData = {
      id: matchedUser.id,
      fullName: matchedUser.fullName,
      email: matchedUser.email,
      role: matchedRole,
      activate: matchedUser.activate || 'true'
    };

    // Only attempt to set the session if express-session actually exists
    if (req.session) {
      req.session.user = userData;
    }

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: userData
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

    const admin = await dbGet(`SELECT * FROM users.admins WHERE email = ?`, [fullAdminEmail]);
    if (!admin || admin.activate !== 'true') {
      return res.status(403).json({ success: false, message: 'Email Admin không hợp lệ hoặc chưa được kích hoạt!' });
    }

    const isExist = await checkEmailExists(fullUserEmail);
    if (isExist) {
      return res.status(400).json({ success: false, message: `Tài khoản với email ${fullUserEmail} đã tồn tại!` });
    }

    const tableMap = { TEACHER: 'users.teachers', TA: 'users.tas', STUDENT: 'users.students' };
    const targetTable = tableMap[role];

    if (!targetTable) {
      return res.status(400).json({ success: false, message: 'Role không hợp lệ!' });
    }

    const hashedPass = await hashPassword(pass);
    const ownerAdminId = req.body.adminId || 'admin-001';

    await dbRun(
      `INSERT INTO ${targetTable} (id, fullName, email, pass, adminId) VALUES (?, ?, ?, ?, ?)`,
      [fullUserEmail, fullName, fullUserEmail, hashedPass, ownerAdminId]
    );

    return res.json({ success: true, message: `Đã tạo ${role} (${fullUserEmail}) thành công!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/// STUDENT PAGE
router.get("/api/students/:studentId/classes", helper((req) => StudentService.getMyClasses(req.params.studentId)));
router.get("/api/classes/:classId/homeworks", helper((req) => StudentService.getHomeworkByClass(req.params.classId)));
router.get("/api/students/:studentId/dashboard", helper((req) => StudentService.getAllHomeworks(req.params.studentId)));
router.get("/api/homeworks/:homeworkId", helper((req) => StudentService.getHomeworkDetail(req.params.homeworkId)));
router.get("/api/homeworks/:homeworkId/submission", helper((req) => StudentService.getOneSubmission(req.params.homeworkId, req.query.studentId)));
router.get("/api/students/:studentId/submissions", helper((req) => StudentService.getSubmissions(req.params.studentId)));
router.post("/api/homeworks/:homeworkId/submit", helper((req) => StudentService.submitHomework({
  homeworkId: req.params.homeworkId,
  studentId: req.body.studentId,
  fileLink: req.body.fileLink,
})));

/// TEACHER ASSIGNMENT & OVERVIEW ROUTES (PROTECTED WITH requireTeacher)

// GET: Fetch assignments mapped dynamically to a specific account ID
router.get("/api/assignments/:teacherId", requireTeacher, async (req, res) => {
    try {
        const teacherId = req.params.teacherId; 

        const rows = await dbAll(`
            SELECT
                homeworkId AS id,
                classId    AS className,
                title      AS title,
                note       AS description,
                deadline   AS deadline,
                joinLink   AS materialUrl,
                points     AS points,
                status     AS status,
                createdAt  AS createdAt
            FROM hw.homeworks
            WHERE teacherId = ?
            ORDER BY deadline ASC
        `, [teacherId]);

        const assignments = rows.map((r) => {
            const d = r.deadline ? new Date(r.deadline) : null;
            const valid = d && !isNaN(d.getTime());
            return {
                ...r,
                dueDate: valid ? d.toISOString().slice(0, 10) : "",
                dueTime: valid ? d.toISOString().slice(11, 16) : "23:59",
            };
        });

        res.json(assignments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Create or Update an assignment
router.post("/api/assignments/:teacherId", requireTeacher, async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
        const {
            id,
            className,
            title,
            description,
            dueDate,
            dueTime,
            materialUrl,
            points,
            status,
            createdAt
        } = req.body;

        if (!id || !title || !className || !dueDate) {
            return res.status(400).json({ error: "Thiếu thông tin bắt buộc (tên bài tập, lớp, ngày đến hạn)." });
        }

        const deadline = new Date(`${dueDate}T${dueTime || "23:59"}:00`).toISOString();

        const existing = await dbGet(
            `SELECT homeworkId FROM hw.homeworks WHERE homeworkId = ? AND teacherId = ?`,
            [id, teacherId]
        );

        if (existing) {
            await dbRun(`
                UPDATE hw.homeworks
                SET classId=?, title=?, note=?, deadline=?, joinLink=?, points=?, status=?
                WHERE homeworkId=? AND teacherId=?
            `, [className, title, description, deadline, materialUrl, points, status, id, teacherId]);
        } else {
            await dbRun(`
                INSERT INTO hw.homeworks (homeworkId, teacherId, classId, title, note, deadline, createdAt, joinLink, points, status)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            `, [id, teacherId, className, title, description, deadline, createdAt || new Date().toISOString(), materialUrl, points, status]);
        }

        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove an assignment
router.delete("/api/assignments/:teacherId/:id", requireTeacher, async (req, res) => {
    try {
        await dbRun(`DELETE FROM hw.homeworks WHERE homeworkId=? AND teacherId=?`, [
            req.params.id,
            req.params.teacherId
        ]);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/teacher/:teacherId/assignments/:homeworkId', requireTeacher, helper((req) =>
    StudentService.getAssignmentDetail(req.params.teacherId, req.params.homeworkId)
));

router.get('/api/teacher/:teacherId/assignments/:homeworkId/submissions', requireTeacher, helper((req) =>
    StudentService.getAssignmentSubmissions(req.params.teacherId, req.params.homeworkId)
));

router.get('/api/teacher/:teacherId/phuckhao', requireTeacher, helper((req) =>
    StudentService.getPhucKhaoRequests(req.params.teacherId)
));

router.post('/api/teacher/:teacherId/submissions/:submissionId/grade', requireTeacher, helper((req) =>
    StudentService.gradeSubmission({
        submissionId: req.params.submissionId,
        teacherId: req.params.teacherId,
        score: req.body.score,
        comment: req.body.comment,
        appealStatus: req.body.appealStatus,
    })
));

router.post('/api/submissions/:submissionId/regrade', helper((req) =>
    StudentService.requestRegrade({
        submissionId: req.params.submissionId,
        studentId: req.body.studentId,
        reason: req.body.reason,
    })
));

// GET: Overview dashboard stats
router.get("/api/teacher/:teacherId/overview", requireTeacher, async (req, res) => {
    try {
        const teacherId = req.params.teacherId;

        const pendingGradingRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.submissions s
            JOIN hw.homeworks h ON h.homeworkId = s.homeworkId
            WHERE h.teacherId = ? AND s.score IS NULL
        `, [teacherId]);

        const dueSoonRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.homeworks
            WHERE teacherId = ?
              AND status != 'draft'
              AND deadline > datetime('now')
              AND deadline <= datetime('now', '+3 days')
        `, [teacherId]);

        const overdueRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.homeworks
            WHERE teacherId = ?
              AND status != 'draft'
              AND deadline < datetime('now')
        `, [teacherId]);

        const submissionRows = await dbAll(`
            SELECT
                h.homeworkId,
                COUNT(DISTINCT cm.userId) AS expected,
                COUNT(DISTINCT s.studentId) AS submitted
            FROM hw.homeworks h
            LEFT JOIN class_members cm ON cm.classId = h.classId AND cm.role = 'student'
            LEFT JOIN hw.submissions s ON s.homeworkId = h.homeworkId
            WHERE h.teacherId = ?
            GROUP BY h.homeworkId
        `, [teacherId]);

        let totalExpected = 0;
        let totalSubmitted = 0;
        for (const row of submissionRows) {
            totalExpected += row.expected || 0;
            totalSubmitted += row.submitted || 0;
        }
        const submissionRate = totalExpected > 0
            ? Math.round((totalSubmitted / totalExpected) * 100)
            : null;

        const todoRows = await dbAll(`
            SELECT
                s.id, s.studentId, s.submittedAt,
                h.title, h.classId, h.homeworkId,
                st.fullName AS studentName
            FROM hw.submissions s
            JOIN hw.homeworks h ON h.homeworkId = s.homeworkId
            LEFT JOIN users.students st ON st.id = s.studentId
            WHERE h.teacherId = ? AND s.score IS NULL
            ORDER BY s.submittedAt DESC
            LIMIT 5
        `, [teacherId]);

        res.json({
            success: true,
            data: {
                pendingGrading: pendingGradingRow?.cnt || 0,
                dueSoon: dueSoonRow?.cnt || 0,
                overdue: overdueRow?.cnt || 0,
                submissionRate,
                todo: todoRows,
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get("/api/teacher/:teacherId/submissions", requireTeacher, async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
 
        const rows = await dbAll(`
            SELECT
                s.id            AS id,
                s.homeworkId    AS homeworkId,
                s.studentId     AS studentId,
                s.fileLink      AS fileLink,
                s.submittedAt   AS submittedAt,
                s.score         AS score,
                s.comment       AS comment,
                h.title         AS homeworkTitle,
                h.classId       AS classId,
                h.points        AS maxPoints,
                h.deadline      AS deadline,
                st.fullName     AS studentName,
                st.email        AS studentEmail
            FROM hw.submissions s
            JOIN hw.homeworks h ON h.homeworkId = s.homeworkId
            LEFT JOIN users.students st ON st.id = s.studentId
            WHERE h.teacherId = ?
            ORDER BY s.submittedAt DESC
        `, [teacherId]);
 
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
 
// POST: save/update submission score + comment
router.post("/api/submissions/:id/grade", async (req, res) => {
    try {
        const { id } = req.params;
        const { score, comment } = req.body;
 
        if (score === undefined || score === null || score === "" || isNaN(Number(score))) {
            return res.status(400).json({ success: false, error: "Điểm không hợp lệ." });
        }
 
        const existing = await dbGet(`SELECT id FROM hw.submissions WHERE id = ?`, [id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: "Không tìm thấy bài nộp." });
        }
 
        await dbRun(
            `UPDATE hw.submissions SET score = ?, comment = ? WHERE id = ?`,
            [Number(score), comment ?? null, id]
        );
 
        const updated = await dbGet(`SELECT * FROM hw.submissions WHERE id = ?`, [id]);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Teacher Class Management
router.get("/api/teacher/:teacherId/classes", requireTeacher, async (req, res, next) => {
  try {
    const data = await TeacherClassService.getClassesByTeacher(req.params.teacherId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/api/classes/:classId/sessions", async (req, res, next) => {
  try {
    const data = await TeacherClassService.getClassSessions(req.params.classId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/api/classes/:classId/roster", async (req, res, next) => {
  try {
    const { homeworkId } = req.query;
    const data = await TeacherClassService.getClassRoster(req.params.classId, homeworkId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/api/classes/:classId/attendance", async (req, res, next) => {
  try {
    const { homeworkId, records } = req.body;
    const data = await TeacherClassService.saveAttendance({
      classId: req.params.classId,
      homeworkId,
      records,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/api/students/:studentId/profile",
  helper((req) =>
    TeacherClassService.getStudentProfile(
      req.params.studentId,
      req.query.classId,
      req.query.limit
    )
  )
);

// ════════════════════════════════════════════════════════════
// ADMIN ROUTES — scoped by adminId (each admin only sees/manages
// the teachers, students, and classes they created)
// ════════════════════════════════════════════════════════════

const { randomUUID } = require('crypto');

async function logActivity(adminId, adminName, { action, targetType, targetId, targetName }) {
  try {
    await dbRun(
      `INSERT INTO users.admin_activity (id, adminId, adminName, action, targetType, targetId, targetName, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), adminId, adminName, action, targetType, targetId || '', targetName || '', new Date().toISOString()]
    );
  } catch (err) {
    console.error('[activity log]', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD STATS (scoped to this admin only)
// ─────────────────────────────────────────────────────────────
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id; // Extracted automatically by requireAdmin
    const [studentCount, teacherCount, classCount, activeClassCount] = await Promise.all([
      dbGet(`SELECT COUNT(*) AS cnt FROM users.students WHERE adminId = ?`, [adminId]),
      dbGet(`SELECT COUNT(*) AS cnt FROM users.teachers WHERE adminId = ?`, [adminId]),
      dbGet(`SELECT COUNT(*) AS cnt FROM classes WHERE adminId = ?`, [adminId]),
      dbGet(`SELECT COUNT(*) AS cnt FROM classes WHERE adminId = ? AND status = 'active'`, [adminId]),
    ]);
    const recentAccounts = await dbAll(`
      SELECT 'student' AS role, id, fullName, email, createdAt FROM users.students WHERE adminId = ?
      UNION ALL
      SELECT 'teacher' AS role, id, fullName, email, createdAt FROM users.teachers WHERE adminId = ?
      ORDER BY createdAt DESC LIMIT 8
    `, [adminId, adminId]);
    const recentClasses = await dbAll(`SELECT * FROM classes WHERE adminId = ? ORDER BY rowid DESC LIMIT 5`, [adminId]);

    return res.json({
      success: true, 
      data: {
        students: studentCount?.cnt || 0,
        teachers: teacherCount?.cnt || 0,
        classes: classCount?.cnt || 0,
        activeClasses: activeClassCount?.cnt || 0,
        recentAccounts,
        recentClasses,
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
router.get('/api/admin/all-classes', requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const classes = await dbAll(`SELECT classId, className FROM classes WHERE adminId = ?`, [adminId]);
    return res.json({ success: true, data: classes });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// STUDENT MANAGEMENT
// ─────────────────────────────────────────────────────────────
router.get('/api/admin/students',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { search = '', classId = '', sort = 'fullName', order = 'asc', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const allowedSorts = ['fullName', 'email', 'id', 'createdAt'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'fullName';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';
    const searchParam = `%${search}%`;

    let query = `
      SELECT s.id, s.fullName, s.email, s.createdAt,
        GROUP_CONCAT(cm.classId) AS classes
      FROM users.students s
      LEFT JOIN class_members cm ON cm.userId = s.id AND cm.role = 'student'
      WHERE s.adminId = ? AND (s.fullName LIKE ? OR s.email LIKE ? OR s.id LIKE ?)
    `;
    const params = [adminId, searchParam, searchParam, searchParam];

    if (classId && classId !== 'all') {
      query += ` AND cm.classId = ?`;
      params.push(classId);
    }
    query += ` GROUP BY s.id ORDER BY s.${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const rows = await dbAll(query, params);

    const total = await dbGet(
      `SELECT COUNT(*) AS cnt FROM users.students WHERE adminId = ? AND (fullName LIKE ? OR email LIKE ? OR id LIKE ?)`,
      [adminId, searchParam, searchParam, searchParam]
    );

    return res.json({ success: true, data: rows, total: total?.cnt || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/admin/students',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id, fullName, email, pass, classId } = req.body;
    if (!id || !fullName || !email || !pass) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
    }
    const fullEmail = formatEmail(email);
    const existEmail = await checkEmailExists(fullEmail);
    if (existEmail) return res.status(400).json({ success: false, message: `Email ${fullEmail} đã tồn tại!` });
    const existId = await dbGet(`SELECT id FROM users.students WHERE id = ?`, [id]);
    if (existId) return res.status(400).json({ success: false, message: `Mã học sinh "${id}" đã tồn tại!` });

    const hashed = await hashPassword(pass);
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO users.students (id, fullName, email, pass, adminId, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fullName, fullEmail, hashed, adminId, now]
    );

    // Only allow assigning into a class this admin also owns.
    if (classId) {
      const cls = await dbGet(`SELECT className FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
      if (cls) {
        await dbRun(
          `INSERT OR IGNORE INTO class_members (classId, userId, fullName, role) VALUES (?, ?, ?, 'student')`,
          [classId, id, fullName]
        );
      }
    }

    await logActivity(adminId, adminId, { action: 'Tạo học sinh', targetType: 'student', targetId: id, targetName: fullName });
    return res.json({ success: true, message: `Đã tạo học sinh ${fullName} thành công!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/api/admin/students/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const student = await dbGet(`SELECT id, fullName, email, createdAt FROM users.students WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh (hoặc không thuộc quyền quản lý của bạn)!' });
    const classes = await dbAll(`
      SELECT cm.classId, c.className FROM class_members cm
      JOIN classes c ON c.classId = cm.classId
      WHERE cm.userId = ? AND cm.role = 'student'`, [id]);
    return res.json({ success: true, data: { ...student, classes } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/admin/students/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const { fullName, email, pass } = req.body;
    const student = await dbGet(`SELECT * FROM users.students WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh (hoặc không thuộc quyền quản lý của bạn)!' });

    const newEmail = email ? formatEmail(email) : student.email;
    if (email && newEmail !== student.email) {
      const existEmail = await checkEmailExists(newEmail);
      if (existEmail) return res.status(400).json({ success: false, message: `Email ${newEmail} đã tồn tại!` });
    }
    const newPass = pass ? await hashPassword(pass) : student.pass;
    const newName = fullName || student.fullName;

    await dbRun(`UPDATE users.students SET fullName = ?, email = ?, pass = ? WHERE id = ?`, [newName, newEmail, newPass, id]);
    await dbRun(`UPDATE class_members SET fullName = ? WHERE userId = ?`, [newName, id]);

    await logActivity(adminId, adminId, { action: 'Cập nhật học sinh', targetType: 'student', targetId: id, targetName: newName });
    return res.json({ success: true, message: 'Cập nhật học sinh thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/admin/students/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const student = await dbGet(`SELECT * FROM users.students WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh (hoặc không thuộc quyền quản lý của bạn)!' });

    await dbRun(`DELETE FROM class_members WHERE userId = ?`, [id]);
    await dbRun(`DELETE FROM users.students WHERE id = ?`, [id]);

    await logActivity(adminId, adminId, { action: 'Xóa học sinh', targetType: 'student', targetId: id, targetName: student.fullName });
    return res.json({ success: true, message: 'Đã xóa học sinh thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// TEACHER MANAGEMENT (same pattern — one block only, adminId-scoped)
// ─────────────────────────────────────────────────────────────
router.get('/api/admin/teachers',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { search = '', sort = 'fullName', order = 'asc', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const allowedSorts = ['fullName', 'email', 'id', 'createdAt'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'fullName';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';
    const searchParam = `%${search}%`;

    const rows = await dbAll(`
      SELECT t.id, t.fullName, t.email, t.createdAt,
        GROUP_CONCAT(cm.classId) AS classes
      FROM users.teachers t
      LEFT JOIN class_members cm ON cm.userId = t.id AND cm.role = 'teacher'
      WHERE t.adminId = ? AND (t.fullName LIKE ? OR t.email LIKE ? OR t.id LIKE ?)
      GROUP BY t.id ORDER BY t.${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [adminId, searchParam, searchParam, searchParam, parseInt(limit), offset]);

    const total = await dbGet(
      `SELECT COUNT(*) AS cnt FROM users.teachers WHERE adminId = ? AND (fullName LIKE ? OR email LIKE ? OR id LIKE ?)`,
      [adminId, searchParam, searchParam, searchParam]
    );

    return res.json({ success: true, data: rows, total: total?.cnt || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/admin/teachers',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { id, fullName, email, pass } = req.body;
    if (!id || !fullName || !email || !pass) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
    }
    const fullEmail = formatEmail(email);
    const existEmail = await checkEmailExists(fullEmail);
    if (existEmail) return res.status(400).json({ success: false, message: `Email ${fullEmail} đã tồn tại!` });
    const existId = await dbGet(`SELECT id FROM users.teachers WHERE id = ?`, [id]);
    if (existId) return res.status(400).json({ success: false, message: `Mã giáo viên "${id}" đã tồn tại!` });

    const hashed = await hashPassword(pass);
    await dbRun(
      `INSERT INTO users.teachers (id, fullName, email, pass, adminId, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fullName, fullEmail, hashed, adminId, new Date().toISOString()]
    );

    await logActivity(adminId, adminId, { action: 'Tạo giáo viên', targetType: 'teacher', targetId: id, targetName: fullName });
    return res.json({ success: true, message: `Đã tạo giáo viên ${fullName} thành công!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/api/admin/teachers/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const teacher = await dbGet(`SELECT id, fullName, email, createdAt FROM users.teachers WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giáo viên (hoặc không thuộc quyền quản lý của bạn)!' });
    const classes = await dbAll(`
      SELECT cm.classId, c.className FROM class_members cm
      JOIN classes c ON c.classId = cm.classId
      WHERE cm.userId = ? AND cm.role = 'teacher'`, [id]);
    return res.json({ success: true, data: { ...teacher, classes } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/admin/teachers/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const { fullName, email, pass } = req.body;
    const teacher = await dbGet(`SELECT * FROM users.teachers WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giáo viên (hoặc không thuộc quyền quản lý của bạn)!' });

    const newEmail = email ? formatEmail(email) : teacher.email;
    if (email && newEmail !== teacher.email) {
      const existEmail = await checkEmailExists(newEmail);
      if (existEmail) return res.status(400).json({ success: false, message: `Email ${newEmail} đã tồn tại!` });
    }
    const newPass = pass ? await hashPassword(pass) : teacher.pass;
    const newName = fullName || teacher.fullName;

    await dbRun(`UPDATE users.teachers SET fullName = ?, email = ?, pass = ? WHERE id = ?`, [newName, newEmail, newPass, id]);
    await dbRun(`UPDATE class_members SET fullName = ? WHERE userId = ?`, [newName, id]);

    await logActivity(adminId, adminId, { action: 'Cập nhật giáo viên', targetType: 'teacher', targetId: id, targetName: newName });
    return res.json({ success: true, message: 'Cập nhật giáo viên thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/admin/teachers/:id',requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const teacher = await dbGet(`SELECT * FROM users.teachers WHERE id = ? AND adminId = ?`, [id, adminId]);
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giáo viên (hoặc không thuộc quyền quản lý của bạn)!' });

    await dbRun(`DELETE FROM class_members WHERE userId = ?`, [id]);
    await dbRun(`DELETE FROM users.teachers WHERE id = ?`, [id]);

    await logActivity(adminId, adminId, { action: 'Xóa giáo viên', targetType: 'teacher', targetId: id, targetName: teacher.fullName });
    return res.json({ success: true, message: 'Đã xóa giáo viên thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// CLASS MANAGEMENT (single, correct block — uses classId/className,
// matching modules/db.js; the second conflicting block is deleted)
// ─────────────────────────────────────────────────────────────
router.get('/api/admin/classes',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { search = '', sort = 'className', order = 'asc', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const allowedSorts = ['className', 'classId', 'status'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'className';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';
    const searchParam = `%${search}%`;

    const rows = await dbAll(`
      SELECT c.classId, c.className, c.description, c.status, c.note,
        COUNT(DISTINCT CASE WHEN cm.role = 'student' THEN cm.userId END) AS studentCount,
        COUNT(DISTINCT CASE WHEN cm.role = 'teacher' THEN cm.userId END) AS teacherCount
      FROM classes c
      LEFT JOIN class_members cm ON cm.classId = c.classId
      WHERE c.adminId = ? AND (c.className LIKE ? OR c.classId LIKE ? OR c.description LIKE ?)
      GROUP BY c.classId ORDER BY c.${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [adminId, searchParam, searchParam, searchParam, parseInt(limit), offset]);

    const total = await dbGet(
      `SELECT COUNT(*) AS cnt FROM classes WHERE adminId = ? AND (className LIKE ? OR classId LIKE ?)`,
      [adminId, searchParam, searchParam]
    );

    return res.json({ success: true, data: rows, total: total?.cnt || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/admin/classes',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { classId, className, description, status, note, teacherId, schedule } = req.body;
    if (!classId || !className) {
      return res.status(400).json({ success: false, message: 'Mã lớp và tên lớp là bắt buộc!' });
    }
    const exist = await dbGet(`SELECT classId FROM classes WHERE classId = ?`, [classId]);
    if (exist) return res.status(400).json({ success: false, message: `Mã lớp "${classId}" đã tồn tại!` });

    try {
      await dbRun(`ALTER TABLE classes ADD COLUMN schedule TEXT`);
    } catch (e) {}

    await dbRun(
      `INSERT INTO classes (classId, className, description, status, note, schedule, adminId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [classId, className, description || '', status || 'active', note || '', schedule || '', adminId, new Date().toISOString()]
    );

    if (teacherId) {
      const teacher = await dbGet(`SELECT fullName FROM users.teachers WHERE id = ?`, [teacherId]);
      if (teacher) {
        await dbRun(`INSERT INTO class_members (classId, userId, fullName, role) VALUES (?, ?, ?, 'teacher')`, [classId, teacherId, teacher.fullName]);
      }
    }

    await logActivity(adminId, adminId, { action: 'Tạo lớp học', targetType: 'class', targetId: classId, targetName: className });
    return res.json({ success: true, message: `Đã tạo lớp ${className} thành công!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/api/admin/classes/:classId',requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const adminId = req.admin.id;
    const cls = await dbGet(`SELECT * FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
    if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học (hoặc không thuộc quyền quản lý của bạn)!' });

    const members = await dbAll(`
      SELECT cm.userId, cm.fullName, cm.role,
        COALESCE(s.email, t.email) AS email
      FROM class_members cm
      LEFT JOIN users.students s ON s.id = cm.userId AND cm.role = 'student'
      LEFT JOIN users.teachers t ON t.id = cm.userId AND cm.role = 'teacher'
      WHERE cm.classId = ? ORDER BY cm.role, cm.fullName`, [classId]);

    return res.json({ success: true, data: { ...cls, members } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/admin/classes/:classId',requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const adminId = req.admin.id;
    const { className, description, status, note, teacherId, schedule } = req.body;
    const cls = await dbGet(`SELECT * FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
    if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học (hoặc không thuộc quyền quản lý của bạn)!' });

    try {
      await dbRun(`ALTER TABLE classes ADD COLUMN schedule TEXT`);
    } catch (e) {}

    await dbRun(`UPDATE classes SET className = ?, description = ?, status = ?, note = ?, schedule = ? WHERE classId = ?`,
      [className || cls.className, description ?? cls.description, status || cls.status, note ?? cls.note, schedule ?? cls.schedule, classId]);

    if (teacherId !== undefined) {
      await dbRun(`DELETE FROM class_members WHERE classId = ? AND role = 'teacher'`, [classId]);
      if (teacherId) {
        const teacher = await dbGet(`SELECT fullName FROM users.teachers WHERE id = ?`, [teacherId]);
        if (teacher) {
          await dbRun(`INSERT INTO class_members (classId, userId, fullName, role) VALUES (?, ?, ?, 'teacher')`, [classId, teacherId, teacher.fullName]);
        }
      }
    }

    await logActivity(adminId, adminId, { action: 'Cập nhật lớp học', targetType: 'class', targetId: classId, targetName: className || cls.className });
    return res.json({ success: true, message: 'Cập nhật lớp học thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/admin/classes/:classId',requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const adminId = req.admin.id;
    const cls = await dbGet(`SELECT * FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
    if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học (hoặc không thuộc quyền quản lý của bạn)!' });

    await dbRun(`DELETE FROM class_members WHERE classId = ?`, [classId]);
    await dbRun(`DELETE FROM classes WHERE classId = ?`, [classId]);

    await logActivity(adminId, adminId, { action: 'Xóa lớp học', targetType: 'class', targetId: classId, targetName: cls.className });
    return res.json({ success: true, message: 'Đã xóa lớp học thành công!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// CLASS MEMBERSHIP — checks BOTH the class and the member belong
// to this admin before allowing the link
// ─────────────────────────────────────────────────────────────
router.post('/api/admin/classes/:classId/members',requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const adminId = req.admin.id;
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ success: false, message: 'Thiếu userId hoặc role!' });

    const cls = await dbGet(`SELECT classId FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
    if (!cls) return res.status(404).json({ success: false, message: 'Lớp không tồn tại (hoặc không thuộc quyền quản lý của bạn)!' });

    const existing = await dbGet(`SELECT userId FROM class_members WHERE classId = ? AND userId = ?`, [classId, userId]);
    if (existing) return res.status(400).json({ success: false, message: 'Thành viên đã có trong lớp!' });

    let member = null;
    if (role === 'student') member = await dbGet(`SELECT id, fullName FROM users.students WHERE id = ? AND adminId = ?`, [userId, adminId]);
    else if (role === 'teacher') member = await dbGet(`SELECT id, fullName FROM users.teachers WHERE id = ? AND adminId = ?`, [userId, adminId]);
    if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng (hoặc không thuộc quyền quản lý của bạn)!' });

    await dbRun(`INSERT INTO class_members (classId, userId, fullName, role) VALUES (?, ?, ?, ?)`,
      [classId, member.id, member.fullName, role]);

    await logActivity(adminId, adminId, {
      action: `Thêm ${role === 'student' ? 'học sinh' : 'giáo viên'} vào lớp ${classId}`,
      targetType: role, targetId: member.id, targetName: member.fullName
    });
    return res.json({ success: true, message: 'Đã thêm vào lớp!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/admin/classes/:classId/members/:userId',requireAdmin, async (req, res) => {
  try {
    const { classId, userId } = req.params;
    const adminId = req.admin.id;
    const cls = await dbGet(`SELECT classId FROM classes WHERE classId = ? AND adminId = ?`, [classId, adminId]);
    if (!cls) return res.status(404).json({ success: false, message: 'Lớp không tồn tại (hoặc không thuộc quyền quản lý của bạn)!' });

    const member = await dbGet(`SELECT * FROM class_members WHERE classId = ? AND userId = ?`, [classId, userId]);
    if (!member) return res.status(404).json({ success: false, message: 'Thành viên không có trong lớp!' });

    await dbRun(`DELETE FROM class_members WHERE classId = ? AND userId = ?`, [classId, userId]);

    await logActivity(adminId, adminId, { action: `Xóa khỏi lớp ${classId}`, targetType: member.role, targetId: member.userId, targetName: member.fullName });
    return res.json({ success: true, message: 'Đã xóa khỏi lớp!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/api/admin/classes/:classId/available-users',requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const adminId = req.admin.id;
    const { role = 'student', search = '' } = req.query;
    const searchParam = `%${search}%`;
    const table = role === 'teacher' ? 'users.teachers' : 'users.students';

    const rows = await dbAll(`
      SELECT u.id, u.fullName, u.email FROM ${table} u
      WHERE u.adminId = ? AND (u.fullName LIKE ? OR u.id LIKE ?)
        AND u.id NOT IN (SELECT userId FROM class_members WHERE classId = ? AND role = ?)
      ORDER BY u.fullName LIMIT 30`, [adminId, searchParam, searchParam, classId, role]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ACTIVITY LOG (scoped to this admin's own actions)
// ─────────────────────────────────────────────────────────────
router.get('/api/admin/activity',requireAdmin, async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { search = '', page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchParam = `%${search}%`;

    const rows = await dbAll(`
      SELECT * FROM users.admin_activity
      WHERE adminId = ? AND (action LIKE ? OR targetName LIKE ?)
      ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [adminId, searchParam, searchParam, parseInt(limit), offset]);

    const total = await dbGet(`SELECT COUNT(*) AS cnt FROM users.admin_activity WHERE adminId = ? AND (action LIKE ? OR targetName LIKE ?)`,
      [adminId, searchParam, searchParam]);

    return res.json({ success: true, data: rows, total: total?.cnt || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET: verify an admin id/token is valid — used by the admin frontend
// on page load (same purpose as shared_auth.js's guard, but for admin
// pages). Returns the admin's basic info if the id is real and active.
router.get('/api/admin/token', requireAdmin, async (req, res) => {
  try {
    // FIX: Get the adminId from the middleware instead of req.params
    const adminId = req.admin.id; 
    
    const admin = await dbGet(
      `SELECT id, fullName, email, activate FROM users.admins WHERE id = ?`,
      [adminId]
    );

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản Admin.' });
    }
    if (admin.activate !== 'true') {
      return res.status(403).json({ success: false, message: 'Tài khoản Admin chưa được kích hoạt.' });
    }

    return res.json({ success: true, data: admin });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
router.post('/api/teacher/:teacherId/submissions/:submissionId/grade', requireTeacher, helper((req) =>
    StudentService.gradeSubmission({
        submissionId: req.params.submissionId,
        teacherId: req.params.teacherId,
        score: req.body.score,
        comment: req.body.comment,
        appealStatus: req.body.appealStatus,
    })
));

// GET: Lấy danh sách yêu cầu phúc khảo của học sinh
// GET: Lấy danh sách yêu cầu phúc khảo của học sinh
router.get("/api/student/:studentId/phuckhao", helper(async (req) => {
  const { studentId } = req.params;

  const rows = await dbAll(`
    SELECT 
      s.id,
      s.score,
      s.appealStatus,
      s.appealReason,
      s.submittedAt,
      s.submittedAt AS updatedAt,  -- Gán tạm submittedAt làm updatedAt để tránh lỗi DB
      h.title AS homeworkTitle,
      h.classId AS className
    FROM hw.submissions s
    JOIN hw.homeworks h ON h.homeworkId = s.homeworkId
    WHERE s.studentId = ? AND (s.appealReason IS NOT NULL OR s.appealStatus IS NOT NULL)
    ORDER BY s.submittedAt DESC
  `, [studentId]);

  return rows;
}));

module.exports = router;