const { dbGet, dbAll, dbRun } = require("../../modules/db");

function submissionId(homeworkId, studentId) {
    return `submission_${homeworkId}_${studentId}`;
}

// Check danh sach lop hoc cua hoc sinh
async function getMyClasses(studentId) {
    return await dbAll(
        `select c.classId, c.className, c.description, c.status, c.note
        from classes c
        join class_members cm on cm.classId = c.classId
        where cm.userId = ? and cm.role = 'student'`,
        [studentId]
    );
}

// Check danh sach bai tap cua lop hoc
async function getHomeworkByClass(classId) {
    return await dbAll(
        `select * from hw.homeworks 
        where classId = ?
        order by deadline desc`,
        [classId]
    );
}

// Lay tat ca bai tap va trang thai nop bai cua hoc sinh
async function getAllHomeworks(studentId) {
    const rows = await dbAll(
        `select h.homeworkId, h.classId, h.title, h.note, h.deadline, h.createdAt, h.joinLink, h.points, h.status
                , c.className,
                s.id as submissionId, s.fileLink, s.submittedAt, s.score, s.comment
        from hw.homeworks h
        join classes c on c.classId = h.classId
        join class_members cm on cm.classId = c.classId and cm.userId = ? and cm.role = 'student'
        left join hw.submissions s on s.homeworkId = h.homeworkId and s.studentId = ?
        order by h.deadline desc`,
        [studentId, studentId]
    );

    return rows.map((r) => ({
        ...r,
        submissionStatus: !r.submissionId
            ? "not_submitted"
            : r.score != null
            ? "graded"
            : "submitted",
    }));
}

// Chi tiet bai tap cua hoc sinh
async function getHomeworkDetail(homeworkId) {
    const hw = await dbGet(
        `select h.*, c.className
        from hw.homeworks h
        join classes c on c.classId = h.classId
        where h.homeworkId = ?`,
        [homeworkId]
    );

    if (!hw) {
        const err = new Error("Không tìm thấy bài tập.");
        err.statusCode = 404;
        throw err;
    }

    return { 
        ...hw,
        points: hw.points,
        status: hw.status,
        timeRemainingMs: new Date(hw.deadline).getTime() - Date.now(),
    };
}

// Hoc sinh nop bai
async function submitHomework({ homeworkId, studentId, fileLink }) {
    if (!fileLink) {
        const err = new Error("Vui lòng nhập link bài nộp.");
        err.statusCode = 400;
        throw err;
    }

    const homework = await dbGet(
        `select h.homeworkId, h.deadline
         from hw.homeworks h
         join class_members cm on cm.classId = h.classId and cm.userId = ? and cm.role = 'student'
         where h.homeworkId = ?`,
        [studentId, homeworkId]
    );

    if (!homework) {
        const err = new Error("Không tìm thấy bài tập hoặc bạn không có quyền nộp.");
        err.statusCode = 404;
        throw err;
    }

    const id = submissionId(homeworkId, studentId);
    const existing = await dbGet(
        `select * from hw.submissions where id = ?`, 
        [id]
    );

    if (existing && existing.score != null) {
        const err = new Error("Bài tập đã được chấm điểm, không thể nộp lại.");
        err.statusCode = 409;
        throw err;
    }

    const submitTime = new Date().toISOString();

    if (existing) {
        await dbRun(
            `update hw.submissions set fileLink = ?, submittedAt = ? where id = ?`,
            [fileLink, submitTime, id]
        );
    } else {
        await dbRun(
            `insert into hw.submissions (id, homeworkId, studentId, fileLink, submittedAt, score, comment)
            values (?, ?, ?, ?, ?, NULL, NULL)`,
            [id, homeworkId, studentId, fileLink, submitTime]
        );
    }

    return await dbGet(`select * from hw.submissions where id = ?`, [id]);
}

// Xem 1 bai da nop va diem cua hoc sinh
async function getOneSubmission(homeworkId, studentId) {
    const res = await dbGet(
        `select * from hw.submissions where id = ?`,
        [submissionId(homeworkId, studentId)]
    );
    return res ?? null;
}

// Xem danh sach tat ca bai da nop cua hoc sinh
async function getSubmissions(studentId) {
    return await dbAll(
        `select s.*, h.homeworkId, h.title as homeworkTitle, h.points as points, c.className,
                s.appealReason, s.appealStatus, s.appealSubmittedAt
        from hw.submissions s
        join hw.homeworks h on h.homeworkId = s.homeworkId
        join classes c on c.classId = h.classId
        where s.studentId = ?
        order by s.submittedAt desc`,
        [studentId]
    );
}

// Yêu cầu phúc khảo
async function requestRegrade({ submissionId, studentId, reason }) {
    if (!reason || !reason.trim()) {
        const err = new Error("Vui lòng cung cấp lý do phúc khảo.");
        err.statusCode = 400;
        throw err;
    }

    const submission = await dbGet(
        `select 
            s.id as submissionId,
            s.homeworkId,
            s.studentId,
            s.score,
            COALESCE(cm.userId, h.teacherId) as teacherId, 
            h.title as homeworkTitle, 
            c.classId, 
            c.className, 
            st.fullName as studentName
         from hw.submissions s
         join hw.homeworks h on h.homeworkId = s.homeworkId
         join classes c on c.classId = h.classId
         left join class_members cm on cm.classId = c.classId and cm.role in ('LEC', 'teacher')
         join users.students st on st.id = s.studentId
         where s.id = ? and s.studentId = ?`,
        [submissionId, studentId]
    );

    if (!submission) {
        const err = new Error("Không tìm thấy bài nộp hoặc bạn không có quyền yêu cầu phúc khảo.");
        err.statusCode = 404;
        throw err;
    }

    if (submission.score == null) {
        const err = new Error("Chỉ có thể yêu cầu phúc khảo cho bài đã được chấm.");
        err.statusCode = 400;
        throw err;
    }

    const teacherId = submission.teacherId;
    const now = new Date().toISOString();

    await dbRun(
        `update hw.submissions set appealReason = ?, appealStatus = 'pending', appealSubmittedAt = ? where id = ?`,
        [reason.trim(), now, submissionId]
    );

    const requestId = `request_${submissionId}`;
    const existingRequest = await dbGet(`select * from pk.requests where id = ?`, [requestId]);

    if (existingRequest) {
        await dbRun(
            `update pk.requests
             set appealReason = ?, appealStatus = 'pending', requestedAt = ?, updatedAt = ?, teacherId = ?
             where id = ?`,
            [reason.trim(), now, now, teacherId, requestId]
        );
    } else {
        await dbRun(
            `insert into pk.requests
             (id, submissionId, homeworkId, teacherId, studentId, studentName, classId, className, homeworkTitle, appealReason, appealStatus, requestedAt, updatedAt)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [requestId, submissionId, submission.homeworkId, teacherId, submission.studentId, submission.studentName, submission.classId, submission.className, submission.homeworkTitle, reason.trim(), now, now]
        );
    }

    return await dbGet(`select * from hw.submissions where id = ?`, [submissionId]);
}

async function getPhucKhaoRequests(teacherId) {
    return await dbAll(
        `select 
            r.id,
            r.submissionId,
            r.homeworkId,
            r.studentId,
            r.studentName,
            r.classId,
            r.className,
            r.homeworkTitle,
            r.appealReason,
            r.appealStatus,
            r.requestedAt,
            r.updatedAt,
            COALESCE(r.teacherId, h.teacherId) as teacherId
         from pk.requests r
         join hw.homeworks h on h.homeworkId = r.homeworkId
         where h.teacherId = ? or r.teacherId = ?
         order by r.requestedAt desc`,
        [teacherId, teacherId]
    );
}

// SỬA ĐỔI: Cho phép lấy chi tiết bài tập nếu là GV của lớp hoặc tạo bài tập
async function getAssignmentDetail(teacherId, homeworkId) {
    const assignment = await dbGet(
        `select h.*, c.className
         from hw.homeworks h
         join classes c on c.classId = h.classId
         left join class_members cm on cm.classId = h.classId and cm.userId = ?
         where h.homeworkId = ? and (h.teacherId = ? or cm.userId = ? or h.teacherId is null)`,
        [teacherId, homeworkId, teacherId, teacherId]
    );

    if (!assignment) {
        const err = new Error("Không tìm thấy bài tập hoặc bạn không có quyền xem.");
        err.statusCode = 404;
        throw err;
    }

    return assignment;
}

// SỬA ĐỔI: Cho phép lấy danh sách bài nộp linh hoạt hơn
async function getAssignmentSubmissions(teacherId, homeworkId) {
    const rows = await dbAll(
        `select s.*, st.fullName as studentName, h.title as homeworkTitle, h.points as points, h.classId, c.className,
                s.appealReason, s.appealStatus, s.appealSubmittedAt
         from hw.submissions s
         join hw.homeworks h on h.homeworkId = s.homeworkId
         join users.students st on st.id = s.studentId
         join classes c on c.classId = h.classId
         left join class_members cm on cm.classId = h.classId and cm.userId = ?
         where s.homeworkId = ? and (h.teacherId = ? or cm.userId = ? or h.teacherId is null)
         order by s.submittedAt desc`,
        [teacherId, homeworkId, teacherId, teacherId]
    );

    return rows;
}

// SỬA ĐỔI: Chấm bài / Cập nhật điểm & trạng thái phúc khảo
async function gradeSubmission({ submissionId, teacherId, score, comment, appealStatus }) {
    const row = await dbGet(
        `select s.*, h.teacherId
         from hw.submissions s
         join hw.homeworks h on h.homeworkId = s.homeworkId
         left join class_members cm on cm.classId = h.classId and cm.userId = ?
         where s.id = ? and (h.teacherId = ? or cm.userId = ? or h.teacherId is null)`,
        [teacherId, submissionId, teacherId, teacherId]
    );

    if (!row) {
        const err = new Error("Không tìm thấy bài nộp hoặc bạn không có quyền chấm bài này.");
        err.statusCode = 404;
        throw err;
    }

    if (score == null || isNaN(Number(score)) || Number(score) < 0) {
        const err = new Error("Điểm phải là số hợp lệ lớn hơn hoặc bằng 0.");
        err.statusCode = 400;
        throw err;
    }

    const now = new Date().toISOString();
    const updatedAppealStatus = appealStatus || (row.appealStatus === 'pending' ? 'approved' : (row.appealStatus || 'none'));

    // Cập nhật bảng submissions
    await dbRun(
        `update hw.submissions set score = ?, comment = ?, appealStatus = ? where id = ?`,
        [Number(score), comment || '', updatedAppealStatus, submissionId]
    );

    // Đồng thời cập nhật trạng thái trong bảng pk.requests nếu có yêu cầu phúc khảo liên quan
    const requestId = `request_${submissionId}`;
    await dbRun(
        `update pk.requests set appealStatus = ?, updatedAt = ? where submissionId = ? or id = ?`,
        [updatedAppealStatus, now, submissionId, requestId]
    );

    return await dbGet(`select * from hw.submissions where id = ?`, [submissionId]);
}

module.exports = {
    getMyClasses,
    getHomeworkByClass,
    getAllHomeworks,
    getHomeworkDetail,
    submitHomework,
    getOneSubmission,
    getSubmissions,
    requestRegrade,
    getAssignmentDetail,
    getAssignmentSubmissions,
    gradeSubmission,
    getPhucKhaoRequests,
};