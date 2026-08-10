// check-data.js
// Chạy: node check-data.js
// Liệt kê những gì ĐANG CÓ SẴN trong database thật của bạn — để biết nên test
// với studentId/classId nào, thay vì đoán "student-1" có tồn tại hay không.

const { db } = require("./modules/db");

console.log("\n📋 STUDENTS (users.db):");
console.table(db.prepare(`SELECT id, fullName, email FROM users.students LIMIT 20`).all());

console.log("\n📋 CLASSES (classes.db):");
console.table(db.prepare(`SELECT classId, className, status FROM classes LIMIT 20`).all());

console.log("\n📋 CLASS_MEMBERS (role = student):");
console.table(db.prepare(`SELECT classId, userId, fullName, role FROM class_members WHERE role = 'student' LIMIT 20`).all());

console.log("\n📋 HOMEWORKS (homeworks.db):");
console.table(db.prepare(`SELECT homeworkId, classId, title, deadline FROM hw.homeworks LIMIT 20`).all());

console.log("\n📋 SUBMISSIONS (homeworks.db):");
console.table(db.prepare(`SELECT id, homeworkId, studentId, score FROM hw.submissions LIMIT 20`).all());

process.exit(0);