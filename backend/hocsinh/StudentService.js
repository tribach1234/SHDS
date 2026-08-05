const db = require("./Database.js");

function submissionId(homeworkId, studentId) {
    return `submission_${homeworkId}_${studentId}`;
}

// check lop hoc cua hoc sinh
function getMyClasses(studentId) {
    return db.prepare(
        `select c.classId, c.className, c.description, c.status, c.note
        from classes c
        join class_members cm on cm.classId = c.classId
        where cm.userId = ? and cm.role = 'student'`
    ).all(studentId);
}

// check danh sach bai tap cua hoc sinh
function getHomeworkByClass(classId) {
    return db.prepare(
        `select * from hw.homeworks 
        where classId = ?
        order by deadline desc`
    ).all(classId);
}

function getAllHomeworks(studentId) {
    const rows = db.prepare(`select h.homeworkId, h.classId, h.title, h.note, h.deadline, h.createdAt, h.joinLink,  
                                    c.className,
                                    s.id as submissionId, s.fileLink, s.submittedAt, s.score, s.comment
                            from hw.homeworks h
                            join classes c on c.classId = h.classId
                            join class_members cm on cm.classId = c.classId and cm.userId = ? and cm.role = 'student'
                            left join hw.submissions s on s.homeworkId = h.homeworkId and s.studentId = ?
                            order by h.deadline desc`).all(studentId, studentId);

    return rows.map((r) => ({
        ...r,
        submissionStatus: !r.submissionId
                            ? "not_submitted"
                                : r.score != null
                                ? "graded"
                                : "submitted",
    }));
}

// chi tiet bai tap cua hoc sinh
function getHomeworkDetail(homeworkId) {
    const hw = db.prepare(
        `select h.* , c.className
        from hw.homeworks h
        join classes c on c.classId = h.classId
        where h.homeworkId = ?`
    ).get(homeworkId);

    if (!hw) {
        const err = new Error("Không tìm thấy bài tập.");
        err.statusCode = 404;
        throw err;
    }

    return { ...hw, timeRemainingMs: new Date(hw.deadline).getTime() - Date.now() };
}

// hoc sinh nop bai
function submitHomework({ homeworkId, studentId, fileLink }) {
    if (!fileLink) {
        const err = new Error("Vui lòng nhập link bài nộp.");
        err.statusCode = 400;
        throw err;
    }
    const id = submissionId(homeworkId, studentId);
    const existing = db.prepare(`select * from hw.submissions 
                                where id = ?`).get(id);

    if (existing && existing.score != null) {
        const err = new Error("Bài tập đã được chấm điểm, không thể nộp lại.");
        err.statusCode = 409;
        throw err;
    }
    const submitTime = new Date().toISOString();

    if (existing) {
        db.prepare(`update hw.submissions set fileLink = ?, submittedAt = ?
                    where id = ?`).run(fileLink, submitTime, id);
    } else {
        db.prepare(
            `insert into hw.submissions (id, homeworkId, studentId, fileLink, submittedAt, score, comment)
            values (?, ?, ?, ?, ?, NULL, NULL)`
        ).run(id, homeworkId, studentId, fileLink, submitTime);
    }

    return db.prepare(`select * from hw.submissions 
                        where id = ?`).get(id);
}

// xem bai da nop va diem cua hoc sinh
function getOneSubmission(homeworkId, studentId) {
    return db.prepare(`select * from hw.submissions 
                        where id = ?`).get(submissionId(homeworkId, studentId)) ?? null;
}

function getSubmissions(studentId) {
    return db.prepare(`select s.*, h.title as homeworkTitle, c.className
                        from hw.submissions s
                        join hw.homeworks h on h.homeworkId = s.homeworkId
                        join classes c on c.classId = h.classId
                        where s.studentId = ?
                        order by s.submittedAt desc`).all(studentId);
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
