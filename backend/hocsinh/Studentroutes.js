const express = require("express");
const StudentService = require("./StudentService")

const router = express.Router();

function helper(fn) {
    return async (req, res) => {
        try {
            const data = await fn(req, res);
            res.json({success : true, data});
        } catch (err) {
            console.error("[studenrRoutes]", err);
            res.status(err.statuscode || 500).json({
                success: false,
                error: err.message || "loi thu lai di"
            });
        }
    }
}

//     getMyClasses,
router.get("/api/students/:studentId/classes", helper((req) => (
    StudentService.getMyClasses(req.params.studentId)
)));

//     getHomeworkByClass,
router.get("/api/classes/:classId/homeworks", helper((req) => (
    StudentService.getHomeworkByClass(req.params.classId)
)));

//     getAllHomeworks,
router.get("/api/studesnts/:studentId/dashboard", helper((req) => (
    StudentService.getAllHomeworks(req.params.studentId)
)));

//     getHomeworkDetail,
router.get("/api/homeworks/:homeworkId", helper((req) => (
    StudentService.getHomeworkDetail(req.params.homeworkId)
)));

//     getOneSubmission,
router.get("/api/homeworks/:homeworkId/submission", helper((req) => (
    StudentService.getOneSubmission(req.params.homeworkId, 
                                    req.query.studentId
    )
)));

//     getSubmissions
router.get("/api/students/:studentId/submissions", helper((req) => (
    StudentService.getSubmissions(req.params.studentId)
)));

//     submitHomework,
router.post("/api/homeworks/:homeworkId/submit", helper((req) => (
    StudentService.submitHomework({
        homeworkId: req.params.homeworkId,
        studentId: req.body.studentId,
        fileLink: req.body.fileLink,
    })
)));

module.exports = router;