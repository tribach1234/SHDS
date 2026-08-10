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
        `select h.homeworkId, h.classId, h.title, h.note, h.deadline, h.createdAt, h.joinLink,  
                c.className,
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
        timeRemainingMs: new Date(hw.deadline).getTime() - Date.now() 
    };
}

// Hoc sinh nop bai
async function submitHomework({ homeworkId, studentId, fileLink }) {
    if (!fileLink) {
        const err = new Error("Vui lòng nhập link bài nộp.");
        err.statusCode = 400;
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
        `select s.*, h.title as homeworkTitle, c.className
        from hw.submissions s
        join hw.homeworks h on h.homeworkId = s.homeworkId
        join classes c on c.classId = h.classId
        where s.studentId = ?
        order by s.submittedAt desc`,
        [studentId]
    );
}

module.exports = {
    getMyClasses,
    getHomeworkByClass,
    getHomeworkDetail,
    getAllHomeworks,
    submitHomework,
    getOneSubmission,
    getSubmissions,
};