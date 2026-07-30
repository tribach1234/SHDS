const db = require("./Database");

function submissionId(homewordId, studentId) {
    return `submission_${homewordId}_${studentId}`;
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
    ).all(classId)
}

// chi tiet bai tap cua hoc sinh
function getHomewordDetail(homewordId) {
    const hw = db.prepare(
        `select h.* , c.className
        from hw.homeworks h
        join classes c on c.classId = h.classId
        where h.homeworkId = ?`
    ).get(homeworkId)

    if(!hw) {
        const err = new Error("khong tim thay bai tap");
        err.statusCode = 400;
        throw err;
    }

    return {...hw, timeRemainingMs: new Date(hw.deadline).getTime - Date.now() };
}

// hoc sinh nop bai
function submitHomework( {homeworkId, studentId, fileLink}) {
    if (!fileLink) {
        const err = new Error("nhap link bai nop di");
        err.statusCode = 300;
        throw err;
    }
    const id = submissionId(homeworkId, studentId);
    const existing = db.prepare(`select * from hw.submissions 
                                where id = ?`).get(id);
    
    if (existing && existing.score != null) {
        const err = new Error ("bai tap da duoc cham diem khong the nop lai")
    }
}