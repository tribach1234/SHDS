const express = require('express');
const router = express.Router();
const StudentService = require("./hocsinh/StudentService");

const { dbGet, dbRun, dbAll } = require("./db");
const { hashPassword, verifyPassword } = require('./auth');
const { formatEmail, checkEmailExists } = require('./helpers');
const { activationTokens, generateAndSendActivationEmail, DOMAIN } = require('./mailer');

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

/// LOGIN/REGISTER AND AUTH
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
      `INSERT INTO users.admins (id, fullName, email, pass, activate) VALUES (?, ?, ?, ?, 'false')`,
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

    // Accepts plain-text comparison (testing) OR Bcrypt hash comparison
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

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: {
        id: matchedUser.id,
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
    await dbRun(
      `INSERT INTO ${targetTable} (id, fullName, email, pass) VALUES (?, ?, ?, ?)`,
      [fullUserEmail, fullName, fullUserEmail, hashedPass]
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

// GET: Fetch assignments mapped dynamically to a specific account ID
router.get("/api/assignments/:teacherId", async (req, res) => {
    try {
        const teacherId = req.params.teacherId;

        // Alias DB columns to the field names teacher.js/teacher-assignmentManage.html
        // actually use (id, className, description, materialUrl).
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

        // Split the stored "deadline" datetime back into dueDate/dueTime
        // for the date/time inputs in the edit form.
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

// POST: Create or Update an assignment for a specific account ID
router.post("/api/assignments/:teacherId", async (req, res) => {

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
            `SELECT homeworkId
             FROM hw.homeworks
             WHERE homeworkId = ? AND teacherId = ?`,
            [id, teacherId]
        );

        if (existing) {

            await dbRun(`
                UPDATE hw.homeworks
                SET
                    classId=?,
                    title=?,
                    note=?,
                    deadline=?,
                    joinLink=?,
                    points=?,
                    status=?
                WHERE homeworkId=? AND teacherId=?
            `,[
                className,
                title,
                description,
                deadline,
                materialUrl,
                points,
                status,
                id,
                teacherId
            ]);

        } else {

            await dbRun(`
                INSERT INTO hw.homeworks
                (
                    homeworkId,
                    teacherId,
                    classId,
                    title,
                    note,
                    deadline,
                    createdAt,
                    joinLink,
                    points,
                    status
                )
                VALUES (?,?,?,?,?,?,?,?,?,?)
            `,[
                id,
                teacherId,
                className,
                title,
                description,
                deadline,
                createdAt || new Date().toISOString(),
                materialUrl,
                points,
                status
            ]);

        }

        res.json({
            success:true
        });

    } catch(err){
        res.status(500).json({
            error:err.message
        });
    }

});
// DELETE: Remove an assignment dynamically matched to the account ID
router.delete("/api/assignments/:teacherId/:id", async (req,res)=>{

    try{

        await dbRun(`
            DELETE
            FROM hw.homeworks
            WHERE homeworkId=?
            AND teacherId=?
        `,[
            req.params.id,
            req.params.teacherId
        ]);

        res.json({
            success:true
        });

    }catch(err){

        res.status(500).json({
            error:err.message
        });

    }

});

router.get('/api/teacher/:teacherId/assignments/:homeworkId', helper((req) =>
    StudentService.getAssignmentDetail(req.params.teacherId, req.params.homeworkId)
));

router.get('/api/teacher/:teacherId/assignments/:homeworkId/submissions', helper((req) =>
    StudentService.getAssignmentSubmissions(req.params.teacherId, req.params.homeworkId)
));

router.get('/api/teacher/:teacherId/phuckhao', helper((req) =>
    StudentService.getPhucKhaoRequests(req.params.teacherId)
));

router.post('/api/teacher/:teacherId/submissions/:submissionId/grade', helper((req) =>
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

// GET: Dashboard stats + to-do list for the Teacher Overview page.
// Everything here comes straight from SQLite (hw.homeworks / hw.submissions /
// class_members) — nothing is stored in the browser.
router.get("/api/teacher/:teacherId/overview", async (req, res) => {
    try {
        const teacherId = req.params.teacherId;

        // 1) How many submitted answers are still waiting for a grade
        const pendingGradingRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.submissions s
            JOIN hw.homeworks h ON h.homeworkId = s.homeworkId
            WHERE h.teacherId = ? AND s.score IS NULL
        `, [teacherId]);

        // 2) Assignments due within the next 3 days (excluding drafts)
        const dueSoonRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.homeworks
            WHERE teacherId = ?
              AND status != 'draft'
              AND deadline > datetime('now')
              AND deadline <= datetime('now', '+3 days')
        `, [teacherId]);

        // 3) Overdue, still-not-graded-or-submitted assignments
        const overdueRow = await dbGet(`
            SELECT COUNT(*) AS cnt
            FROM hw.homeworks
            WHERE teacherId = ?
              AND status != 'draft'
              AND deadline < datetime('now')
        `, [teacherId]);

        // 4) Submission rate = (submissions received) / (expected = students in class × homeworks)
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

        // 5) "Cần xử lý trong hôm nay": the most recent ungraded submissions
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
                submissionRate, // null when the teacher has no assignments yet
                todo: todoRows,
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;