// seed-test-student.js
// Chạy: node seed-test-student.js
// Tạo (nếu chưa có) MỘT bộ dữ liệu THẬT, ghi thẳng vào 3 file .db của bạn qua
// cùng kết nối Database.js đang dùng — để bạn có 1 tài khoản chắc chắn hoạt động,
// dùng test toàn bộ luồng: xem lớp -> xem bài tập -> nộp bài -> xem điểm.

const bcrypt = require("bcryptjs");
const db = require("./backend/hocsinh/Database");

const STUDENT_ID = "test-student-01";
const STUDENT_EMAIL = "teststudent01@tmts.io.vn";
const CLASS_ID = "test-class-01";
const HOMEWORK_ID = "test-hw-01";

function upsertStudent() {
  const existing = db.prepare(`SELECT id FROM users.students WHERE id = ?`).get(STUDENT_ID);
  if (existing) {
    console.log(`✔ Học sinh "${STUDENT_ID}" đã tồn tại, bỏ qua.`);
    return;
  }
  const hashed = bcrypt.hashSync("123456", 10);
  db.prepare(
    `INSERT INTO users.students (id, fullName, email, pass) VALUES (?, ?, ?, ?)`
  ).run(STUDENT_ID, "Học Sinh Test", STUDENT_EMAIL, hashed);
  console.log(`✅ Đã tạo học sinh test: ${STUDENT_ID} / ${STUDENT_EMAIL} / mật khẩu: 123456`);
}

function upsertClass() {
  const existing = db.prepare(`SELECT classId FROM classes WHERE classId = ?`).get(CLASS_ID);
  if (!existing) {
    db.prepare(
      `INSERT INTO classes (classId, className, description, status, note) VALUES (?, ?, ?, ?, ?)`
    ).run(CLASS_ID, "Lớp Test - Scratch Cơ Bản", "Lớp tạo tự động để test", "active", null);
    console.log(`✅ Đã tạo lớp test: ${CLASS_ID}`);
  } else {
    console.log(`✔ Lớp "${CLASS_ID}" đã tồn tại, bỏ qua.`);
  }

  const isMember = db
    .prepare(`SELECT 1 FROM class_members WHERE classId = ? AND userId = ?`)
    .get(CLASS_ID, STUDENT_ID);
  if (!isMember) {
    db.prepare(
      `INSERT INTO class_members (classId, userId, fullName, role) VALUES (?, ?, ?, ?)`
    ).run(CLASS_ID, STUDENT_ID, "Học Sinh Test", "student");
    console.log(`✅ Đã thêm học sinh test vào lớp.`);
  } else {
    console.log(`✔ Học sinh đã có trong lớp, bỏ qua.`);
  }
}

function upsertHomework() {
  const existing = db.prepare(`SELECT homeworkId FROM hw.homeworks WHERE homeworkId = ?`).get(HOMEWORK_ID);
  if (existing) {
    console.log(`✔ Bài tập "${HOMEWORK_ID}" đã tồn tại, bỏ qua.`);
    return;
  }
  const deadline = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  db.prepare(
    `INSERT INTO hw.homeworks (homeworkId, classId, title, note, deadline, createdAt, joinLink)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(HOMEWORK_ID, CLASS_ID, "Bài tập Test: Nộp thử 1 link bất kỳ", "Dùng để test nộp bài", deadline, new Date().toISOString(), null);
  console.log(`✅ Đã tạo bài tập test: ${HOMEWORK_ID} (CHƯA nộp bài — dùng để test nút "Nộp bài")`);
}

upsertStudent();
upsertClass();
upsertHomework();

console.log(`\n🎉 Xong. Dùng thông tin sau để test:`);
console.log(`   studentId: ${STUDENT_ID}`);
console.log(`   classId:   ${CLASS_ID}`);
console.log(`   homeworkId:${HOMEWORK_ID}`);
console.log(`\n   Mở: http://localhost:3000/Student/Student.html?studentId=${STUDENT_ID}`);

process.exit(0);