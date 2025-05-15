require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();

// MongoDB Connection
const DB_URI = 'mongodb+srv://HeySatyam:2017Satyam@cluster0.xqoozjj.mongodb.net/admissions?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(DB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const studentSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    middleName: String,
    lastName: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    bloodGroup: String,
    penNo: { type: String, required: true },
    apaarId: { type: String, required: true },
    srNo: { type: String, required: true },
    class: { type: String, required: true, lowercase: true, trim: true },
    section: { type: String, required: true },
    rollNo: String,
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    whatsapp: String,
    nationality: { type: String, required: true },
    religion: { type: String, required: true },
    caste: { type: String, required: true },
    category: { type: String, required: true },
    aadhaar: String,
    address: String,
    createdAt: { type: Date, default: Date.now }
});

const parentSchema = new mongoose.Schema({
    fatherName: { type: String, required: true },
    fatherMobile: { type: String, required: true },
    fatherEmail: String,
    fatherOccupation: { type: String, required: true },
    fatherIncome: String,
    fatherQualification: String,
    motherName: { type: String, required: true },
    motherMobile: { type: String, required: true },
    motherEmail: String,
    motherOccupation: String,
    motherIncome: String,
    motherQualification: String,
    guardianName: String,
    guardianRelation: String,
    guardianContact: String,
    guardianOccupation: String,
    guardianPhoto: String
});

const admissionSchema = new mongoose.Schema({
    admissionId: { type: String, required: true, unique: true },
    student: { type: studentSchema, required: true },
    parents: { type: parentSchema, required: true },
    documents: {
        studentPhoto: String,
        aadhaarCard: String,
        birthCertificate: String,
        transferCertificate: String,
        addressProof: String,
        incomeCertificate: String
    },
    termsAccepted: { type: Boolean, required: true },
    declarationAccepted: { type: Boolean, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const teacherSchema = new mongoose.Schema({
    teacherId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    assignedClass: { type: String, required: true, lowercase: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

const studentAttendanceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['Present', 'Absent'], required: true },
    class: { type: String, required: true, lowercase: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

const teacherAttendanceSchema = new mongoose.Schema({
    teacherId: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['Present', 'Absent'], required: true },
    createdAt: { type: Date, default: Date.now }
}); 

const Admission = mongoose.model('Admission', admissionSchema);
const Teacher = mongoose.model('Teacher', teacherSchema);
const StudentAttendance = mongoose.model('StudentAttendance', studentAttendanceSchema);
const TeacherAttendance = mongoose.model('TeacherAttendance', teacherAttendanceSchema);

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = 'Uploads/';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'your_admin_secret';
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Authentication Middleware
const authenticateTeacher = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const teacher = await Teacher.findOne({ teacherId: decoded.teacherId });
        if (!teacher) return res.status(401).json({ error: 'Invalid token' });
        req.teacher = teacher;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Admin Middleware
const authenticateAdmin = (req, res, next) => {
    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'Unauthorized: Invalid admin secret' });
    }
    next();
};

// Multer Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and PDF files are allowed!'));
        }
    }
});

// API Endpoints

// Create Teacher (Admin Only)
app.post('/api/teachers', authenticateAdmin, async (req, res) => {
    try {
        const { name, assignedClass, password = 'Teacher@123' } = req.body;

        if (!name || !assignedClass) {
            return res.status(400).json({ error: 'Name and assignedClass are required' });
        }

        // Generate unique teacherId
        const lastTeacher = await Teacher.findOne().sort({ teacherId: -1 });
        let newIdNum = 1;
        if (lastTeacher && lastTeacher.teacherId.startsWith('TCH')) {
            const lastIdNum = parseInt(lastTeacher.teacherId.replace('TCH', ''));
            newIdNum = lastIdNum + 1;
        }
        const teacherId = `TCH${String(newIdNum).padStart(3, '0')}`; // e.g., TCH001

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const teacher = new Teacher({
            teacherId,
            name,
            password: hashedPassword,
            assignedClass
        });

        await teacher.save();
        res.status(201).json({ success: true, teacherId, name, assignedClass, password });
    } catch (error) {
        console.error('Error creating teacher:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get Teachers List (Admin Only)
app.get('/api/teachers/list', authenticateAdmin, async (req, res) => {
    try {
        const teachers = await Teacher.find({}, 'teacherId name assignedClass').sort({ teacherId: 1 });
        res.json({ success: true, teachers });
    } catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Teacher Login
app.post('/api/teachers/login', async (req, res) => {
    try {
        const { teacherId, password } = req.body;
        if (!teacherId || !password) {
            return res.status(400).json({ error: 'Teacher ID and password are required' });
        }

        const teacher = await Teacher.findOne({ teacherId });
        if (!teacher) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ teacherId: teacher.teacherId }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, teacher: { teacherId: teacher.teacherId, name: teacher.name, assignedClass: teacher.assignedClass }, token });
    } catch (error) {
        console.error('Error logging in teacher:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Verify Token
app.get('/api/teachers/verify', authenticateTeacher, async (req, res) => {
    try {
        res.json({ teacher: { teacherId: req.teacher.teacherId, name: req.teacher.name, assignedClass: req.teacher.assignedClass } });
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get All Admissions (Restricted to Teacher's Class)
app.get('/api/admissions', authenticateTeacher, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const grade = req.query.grade ? req.query.grade.toLowerCase() : undefined;
        const search = req.query.search;

        const query = { 'student.class': req.teacher.assignedClass.toLowerCase() }; // Restrict to teacher's class
        if (grade) query['student.class'] = grade;
        if (search) {
            query.$or = [
                { 'student.firstName': { $regex: search, $options: 'i' } },
                { 'student.lastName': { $regex: search, $options: 'i' } },
                { admissionId: { $regex: search, $options: 'i' } }
            ];
        }

        const admissions = await Admission.find(query)
            .skip(skip)
            .limit(limit);
        const total = await Admission.countDocuments(query);

        res.json({
            admissions,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching admissions:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Submit Admission Form
app.post('/api/admissions', upload.fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'aadhaarCard', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'transferCertificate', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    { name: 'incomeCertificate', maxCount: 1 },
    { name: 'guardianPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const formData = req.body;
        const files = req.files;

        if (!formData.student || !formData.parents) {
            return res.status(400).json({ error: 'Student and parent data are required' });
        }

        const student = typeof formData.student === 'string' ? JSON.parse(formData.student) : formData.student;
        const parents = typeof formData.parents === 'string' ? JSON.parse(formData.parents) : formData.parents;

        if (!student.firstName || !student.lastName || !parents.fatherName) {
            return res.status(400).json({ error: 'Required fields missing' });
        }

        const fileReferences = {};
        if (files) {
            Object.keys(files).forEach(field => {
                fileReferences[field] = files[field][0].filename;
            });
        }

        const admissionId = 'ADM-' + Date.now();

        const admissionRecord = new Admission({
            admissionId,
            student: {
                firstName: student.firstName,
                middleName: student.middleName || '',
                lastName: student.lastName,
                dob: student.dob,
                gender: student.gender,
                bloodGroup: student.bloodGroup || '',
                penNo: student.penNo,
                apaarId: student.apaarId,
                srNo: student.srNo,
                class: student.class,
                section: student.section,
                rollNo: student.rollNo || '',
                email: student.email,
                mobile: student.mobile,
                whatsapp: student.whatsapp || student.mobile,
                nationality: student.nationality,
                religion: student.religion,
                caste: student.caste,
                category: student.category,
                aadhaar: student.aadhaar || '',
                address: student.address || ''
            },
            parents: {
                fatherName: parents.fatherName,
                fatherMobile: parents.fatherMobile,
                fatherEmail: parents.fatherEmail || '',
                fatherOccupation: parents.fatherOccupation,
                fatherIncome: parents.fatherIncome || '',
                fatherQualification: parents.fatherQualification || '',
                motherName: parents.motherName,
                motherMobile: parents.motherMobile,
                motherEmail: parents.motherEmail || '',
                motherOccupation: parents.motherOccupation || '',
                motherIncome: parents.motherIncome || '',
                motherQualification: parents.motherQualification || '',
                guardianName: parents.guardianName || '',
                guardianRelation: parents.guardianRelation || '',
                guardianContact: parents.guardianContact || '',
                guardianOccupation: parents.guardianOccupation || '',
                guardianPhoto: fileReferences.guardianPhoto || ''
            },
            documents: {
                studentPhoto: fileReferences.studentPhoto || '',
                aadhaarCard: fileReferences.aadhaarCard || '',
                birthCertificate: fileReferences.birthCertificate || '',
                transferCertificate: fileReferences.transferCertificate || '',
                addressProof: fileReferences.addressProof || '',
                incomeCertificate: fileReferences.incomeCertificate || ''
            },
            termsAccepted: formData.termsAccepted === 'true' || formData.termsAccepted === true,
            declarationAccepted: formData.declarationAccepted === 'true' || formData.declarationAccepted === true,
            status: formData.status || 'pending'
        });

        await admissionRecord.save();

        res.status(201).json({
            success: true,
            admissionId,
            message: 'Admission submitted successfully'
        });
    } catch (error) {
        console.error('Error processing admission:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Update Admission
app.put('/api/admissions/:id', async (req, res) => {
    try {
        const admission = await Admission.findOne({ admissionId: req.params.id });
        if (!admission) {
            return res.status(404).json({ error: 'Admission not found' });
        }

        const formData = req.body;
        const student = typeof formData.student === 'string' ? JSON.parse(formData.student) : formData.student;
        const parents = typeof formData.parents === 'string' ? JSON.parse(formData.parents) : formData.parents;

        admission.student = {
            ...admission.student,
            firstName: student.firstName,
            middleName: student.middleName || admission.student.middleName,
            lastName: student.lastName,
            dob: student.dob,
            gender: student.gender,
            bloodGroup: student.bloodGroup || admission.student.bloodGroup,
            penNo: student.penNo,
            apaarId: student.apaarId,
            srNo: student.srNo,
            class: student.class,
            section: student.section,
            rollNo: student.rollNo || admission.student.rollNo,
            email: student.email,
            mobile: student.mobile,
            whatsapp: student.whatsapp || student.mobile,
            nationality: student.nationality,
            religion: student.religion,
            caste: student.caste,
            category: student.category,
            aadhaar: student.aadhaar || admission.student.aadhaar,
            address: student.address || admission.student.address
        };

        admission.parents = {
            ...admission.parents,
            fatherName: parents.fatherName,
            fatherMobile: parents.fatherMobile,
            fatherEmail: parents.fatherEmail || admission.parents.fatherEmail,
            fatherOccupation: parents.fatherOccupation,
            fatherIncome: parents.fatherIncome || admission.parents.fatherIncome,
            fatherQualification: parents.fatherQualification || admission.parents.fatherQualification,
            motherName: parents.motherName,
            motherMobile: parents.motherMobile,
            motherEmail: parents.motherEmail || admission.parents.motherEmail,
            motherOccupation: parents.motherOccupation || admission.parents.motherOccupation,
            motherIncome: parents.motherIncome || admission.parents.motherIncome,
            motherQualification: parents.motherQualification || admission.parents.motherQualification
        };

        admission.status = formData.status || admission.status;
        admission.termsAccepted = formData.termsAccepted === 'true' || formData.termsAccepted === true;
        admission.declarationAccepted = formData.declarationAccepted === 'true' || formData.declarationAccepted === true;

        await admission.save();
        res.json({ success: true, message: 'Admission updated successfully' });
    } catch (error) {
        console.error('Error updating admission:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Delete Admission
app.delete('/api/admissions/:id', async (req, res) => {
    try {
        const admission = await Admission.findOneAndDelete({ admissionId: req.params.id });
        if (!admission) {
            return res.status(404).json({ error: 'Admission not found' });
        }
        res.json({ success: true, message: 'Admission deleted successfully' });
    } catch (error) {
        console.error('Error deleting admission:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get Single Admission
app.get('/api/admissions/:id', async (req, res) => {
    try {
        const admission = await Admission.findOne({ admissionId: req.params.id });
        if (!admission) {
            return res.status(404).json({ error: 'Admission not found' });
        }
        res.json(admission);
    } catch (error) {
        console.error('Error fetching admission:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Download Document
app.get('/api/documents/:filename', (req, res) => {
    const filePath = path.join(__dirname, UPLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Student Attendance Endpoints
app.get('/api/attendance/students', authenticateTeacher, async (req, res) => {
    try {
        const { date, class: className } = req.query;
        if (!date || !className) return res.status(400).json({ error: 'Date and class are required' });

        if (className.toLowerCase() !== req.teacher.assignedClass.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized: You can only access your assigned class' });
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const attendance = await StudentAttendance.find({
            date: { $gte: startOfDay, $lte: endOfDay },
            class: className.toLowerCase()
        });

        res.json(attendance);
    } catch (error) {
        console.error('Error fetching student attendance:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.post('/api/attendance/students', authenticateTeacher, async (req, res) => {
    try {
        const attendanceRecords = req.body;
        if (!Array.isArray(attendanceRecords)) return res.status(400).json({ error: 'Invalid data format' });

        for (const record of attendanceRecords) {
            if (record.class.toLowerCase() !== req.teacher.assignedClass.toLowerCase()) {
                return res.status(403).json({ error: 'Unauthorized: You can only mark attendance for your assigned class' });
            }

            const startOfDay = new Date(record.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(record.date);
            endOfDay.setHours(23, 59, 59, 999);

            await StudentAttendance.deleteOne({
                studentId: record.studentId,
                date: { $gte: startOfDay, $lte: endOfDay }
            });

            const attendance = new StudentAttendance({
                studentId: record.studentId,
                date: record.date,
                status: record.status,
                class: record.class.toLowerCase()
            });
            await attendance.save();
        }

        res.json({ success: true, message: 'Student attendance saved successfully' });
    } catch (error) {
        console.error('Error saving student attendance:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.get('/api/attendance/students/history/:studentId', authenticateTeacher, async (req, res) => {
    try {
        const attendance = await StudentAttendance.find({
            studentId: req.params.studentId,
            class: req.teacher.assignedClass.toLowerCase()
        }).sort({ date: -1 });
        res.json(attendance);
    } catch (error) {
        console.error('Error fetching student attendance history:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Teacher Attendance Endpoints
app.get('/api/attendance/teachers', authenticateTeacher, async (req, res) => {
    try {
        const { date, teacherId } = req.query;
        if (!date || !teacherId) return res.status(400).json({ error: 'Date and teacherId are required' });

        if (teacherId !== req.teacher.teacherId) {
            return res.status(403).json({ error: 'Unauthorized: You can only access your own attendance' });
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const attendance = await TeacherAttendance.findOne({
            teacherId,
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        res.json(attendance || {});
    } catch (error) {
        console.error('Error fetching teacher attendance:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.post('/api/attendance/teachers', authenticateTeacher, async (req, res) => {
    try {
        const { teacherId, date, status } = req.body;
        if (!teacherId || !date || !status) {
            return res.status(400).json({ error: 'Teacher ID, date, and status are required' });
        }

        if (teacherId !== req.teacher.teacherId) {
            return res.status(403).json({ error: 'Unauthorized: You can only mark your own attendance' });
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        await TeacherAttendance.deleteOne({
            teacherId,
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        const attendance = new TeacherAttendance({
            teacherId,
            date,
            status
        });
        await attendance.save();

        res.json({ success: true, message: 'Teacher attendance saved successfully' });
    } catch (error) {
        console.error('Error saving teacher attendance:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.get('/api/attendance/teachers/history/:teacherId', authenticateTeacher, async (req, res) => {
    try {
        if (req.params.teacherId !== req.teacher.teacherId) {
            return res.status(403).json({ error: 'Unauthorized: You can only view your own attendance history' });
        }

        const attendance = await TeacherAttendance.find({
            teacherId: req.params.teacherId
        }).sort({ date: -1 });
        res.json(attendance);
    } catch (error) {
        console.error('Error fetching teacher attendance history:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});