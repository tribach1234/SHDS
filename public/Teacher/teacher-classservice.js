// modules/hocsinh/TeacherClassService.js
// Quản lý "Lớp học" cho giáo viên: danh sách lớp đang dạy, sĩ số, điểm danh
// theo từng buổi học, và hồ sơ học sinh (thông tin + N bài tập gần nhất).
//
// Ghi chú quan trọng về mô hình dữ liệu THỰC TẾ (dựa trên dữ liệu seed sẵn):
// - Giáo viên phụ trách 1 lớp được xác định qua `class_members`, nơi
//   role = 'LEC' (không phải 'teacher', và hw.homeworks.teacherId hầu hết NULL
//   nên KHÔNG dùng làm nguồn xác định lớp của giáo viên).
// - KHÔNG có bảng điểm danh riêng. Mỗi dòng trong `hw.homeworks` thực chất là
//   một "buổi học" (title dạng "Buổi học/Bài tập YYYY-MM-DD"), và điểm danh
//   được lưu ngay trong `hw.submissions.status` với giá trị
//   'ATTENDED' | 'ABSENT' | 'LATE' cho từng (homeworkId, studentId).
//   => Điểm danh 1 buổi = xem/ghi vào submissions của buổi (homeworkId) đó.

const { dbGet, dbAll, dbRun } = require("../../modules/db");

const ATTENDANCE_STATUSES = ["ATTENDED", "ABSENT", "LATE"];

function submissionId(homeworkId, studentId) {
  return `sub_${homeworkId}_${studentId}`;
}

// Danh sách lớp giáo viên đang dạy (role != 'student' trong class_members
// của lớp đó — hiện tại giá trị thực tế là 'LEC').
async function getClassesByTeacher(teacherId) {
  const rows = await dbAll(
    `select c.classId, c.className, c.description, c.status, c.note,
        (select count(*) from class_members cm2
         where cm2.classId = c.classId and cm2.role = 'student') as studentCount
     from classes c
     join class_members cm on cm.classId = c.classId
     where cm.userId = ? and cm.role <> 'student'
     order by c.className`,
    [teacherId]
  );

  for (const cls of rows) {
    const latestSession = await dbGet(
      `select homeworkId, title, deadline from hw.homeworks
       where classId = ? order by deadline desc limit 1`,
      [cls.classId]
    );
    cls.latestSession = latestSession || null;

    if (latestSession) {
      const counts = await dbAll(
        `select status, count(*) as cnt from hw.submissions
         where homeworkId = ? group by status`,
        [latestSession.homeworkId]
      );
      let attended = 0, absent = 0, late = 0;
      for (const c of counts) {
        if (c.status === "ATTENDED") attended = c.cnt;
        else if (c.status === "ABSENT") absent = c.cnt;
        else if (c.status === "LATE") late = c.cnt;
      }
      cls.attendedLatest = attended;
      cls.lateLatest = late;
      cls.absentLatest = absent;
      cls.unmarkedLatest = Math.max((cls.studentCount || 0) - attended - absent - late, 0);
    } else {
      cls.attendedLatest = 0;
      cls.lateLatest = 0;
      cls.absentLatest = 0;
      cls.unmarkedLatest = cls.studentCount || 0;
    }
  }

  return rows;
}

// Danh sách buổi học (mỗi dòng hw.homeworks = 1 buổi) của 1 lớp, mới nhất trước
async function getClassSessions(classId) {
  const cls = await dbGet(`select classId from classes where classId = ?`, [classId]);
  if (!cls) {
    const err = new Error("Không tìm thấy lớp học.");
    err.statusCode = 404;
    throw err;
  }
  return await dbAll(
    `select homeworkId, title, deadline, status from hw.homeworks
     where classId = ? order by deadline desc`,
    [classId]
  );
}

// Sĩ số + điểm danh của 1 buổi học cụ thể.
// Không truyền homeworkId -> lấy buổi gần nhất.
async function getClassRoster(classId, homeworkId) {
  const cls = await dbGet(`select classId, className from classes where classId = ?`, [classId]);
  if (!cls) {
    const err = new Error("Không tìm thấy lớp học.");
    err.statusCode = 404;
    throw err;
  }

  const session = homeworkId
    ? await dbGet(
        `select homeworkId, title, deadline from hw.homeworks where homeworkId = ? and classId = ?`,
        [homeworkId, classId]
      )
    : await dbGet(
        `select homeworkId, title, deadline from hw.homeworks where classId = ? order by deadline desc limit 1`,
        [classId]
      );

  const students = await dbAll(
    `select cm.userId as studentId, cm.fullName, st.email
     from class_members cm
     left join users.students st on st.id = cm.userId
     where cm.classId = ? and cm.role = 'student'
     order by cm.fullName`,
    [classId]
  );

  let attendanceMap = new Map();
  if (session) {
    const subs = await dbAll(
      `select studentId, status, score, comment from hw.submissions where homeworkId = ?`,
      [session.homeworkId]
    );
    attendanceMap = new Map(subs.map((s) => [s.studentId, s]));
  }

  return {
    classId: cls.classId,
    className: cls.className,
    session, // null nếu lớp chưa có buổi học nào
    students: students.map((s) => {
      const sub = attendanceMap.get(s.studentId);
      return {
        ...s,
        attendanceStatus: sub?.status || "UNMARKED",
        score: sub?.score ?? null,
        comment: sub?.comment ?? null,
      };
    }),
  };
}

// Lưu điểm danh cho 1 buổi học (upsert vào hw.submissions).
// Chỉ cập nhật status/comment — không đụng tới fileLink/score đã có sẵn.
async function saveAttendance({ classId, homeworkId, records }) {
  if (!homeworkId) {
    const err = new Error("Thiếu buổi học (homeworkId).");
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(records) || !records.length) {
    const err = new Error("Thiếu danh sách điểm danh.");
    err.statusCode = 400;
    throw err;
  }

  for (const r of records) {
    if (!r.studentId || !ATTENDANCE_STATUSES.includes(r.status)) continue;
    const id = submissionId(homeworkId, r.studentId);
    const existing = await dbGet(`select id from hw.submissions where id = ?`, [id]);
    if (existing) {
      await dbRun(
        `update hw.submissions set status = ?, comment = coalesce(?, comment) where id = ?`,
        [r.status, r.comment ?? null, id]
      );
    } else {
      await dbRun(
        `insert into hw.submissions (id, homeworkId, studentId, status, comment)
         values (?, ?, ?, ?, ?)`,
        [id, homeworkId, r.studentId, r.status, r.comment || null]
      );
    }
  }

  return await getClassRoster(classId, homeworkId);
}

// Hồ sơ học sinh: thông tin cá nhân + N buổi/bài tập gần nhất trong lớp (mặc định 5)
async function getStudentProfile(studentId, classId, limit) {
  if (!classId) {
    const err = new Error("Thiếu classId.");
    err.statusCode = 400;
    throw err;
  }

  // 1. Tìm thông tin trong bảng users.students
  let student = await dbGet(
    `select id, fullName, email from users.students where id = ?`,
    [studentId]
  );

  // 2. FALLBACK: Nếu thiếu record trong users.students, lấy từ class_members
  if (!student) {
    const cm = await dbGet(
      `select userId as id, fullName from class_members where userId = ? and classId = ?`,
      [studentId, classId]
    );
    if (!cm) {
      const err = new Error("Không tìm thấy học sinh trong lớp.");
      err.statusCode = 404;
      throw err;
    }
    student = { id: cm.id, fullName: cm.fullName || cm.id, email: cm.id };
  }


  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 200));

  const homeworkRows = await dbAll(
    `select h.homeworkId, h.title, h.deadline, h.classId, c.className,
            s.score, s.submittedAt, s.fileLink, s.comment, s.status as attendanceStatus
     from hw.homeworks h
     join classes c on c.classId = h.classId
     left join hw.submissions s on s.homeworkId = h.homeworkId and s.studentId = ?
     where h.classId = ?
     order by h.deadline desc
     limit ?`,
    [studentId, classId, safeLimit]
  );

  const homeworks = homeworkRows.map((h) => ({
    ...h,
    submissionStatus: h.score != null ? "graded" : h.attendanceStatus ? "submitted" : "not_submitted",
  }));

  const totalHomeworksRow = await dbGet(
    `select count(*) as cnt from hw.homeworks where classId = ?`,
    [classId]
  );
  const submittedRow = await dbGet(
    `select count(*) as cnt
     from hw.submissions s
     join hw.homeworks h on h.homeworkId = s.homeworkId
     where h.classId = ? and s.studentId = ? and s.score is not null`,
    [classId, studentId]
  );
  const avgScoreRow = await dbGet(
    `select avg(s.score) as avg
     from hw.submissions s
     join hw.homeworks h on h.homeworkId = s.homeworkId
     where h.classId = ? and s.studentId = ? and s.score is not null`,
    [classId, studentId]
  );

  // Điểm danh: tính trên TẤT CẢ buổi học trong lớp (không giới hạn bởi safeLimit)
  const attendanceRows = await dbAll(
    `select h.deadline as date, s.status
     from hw.homeworks h
     left join hw.submissions s on s.homeworkId = h.homeworkId and s.studentId = ?
     where h.classId = ?
     order by h.deadline desc`,
    [studentId, classId]
  );
  const attendedCount = attendanceRows.filter((a) => a.status === "ATTENDED").length;
  const lateCount = attendanceRows.filter((a) => a.status === "LATE").length;
  const absentCount = attendanceRows.filter((a) => a.status === "ABSENT").length;

  return {
    student,
    classId,
    homeworkLimit: safeLimit,
    totalHomeworksInClass: totalHomeworksRow?.cnt || 0,
    submittedCount: submittedRow?.cnt || 0,
    averageScore: avgScoreRow?.avg != null ? Number(avgScoreRow.avg.toFixed(2)) : null,
    attendanceSummary: {
      attended: attendedCount,
      late: lateCount,
      absent: absentCount,
      totalSessions: attendanceRows.length,
    },
    homeworks,
  };
}

module.exports = {
  getClassesByTeacher,
  getClassSessions,
  getClassRoster,
  saveAttendance,
  getStudentProfile,
};