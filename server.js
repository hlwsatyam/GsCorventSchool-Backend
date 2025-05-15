require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
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
    class: { type: String, required: true },
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

const Admission = mongoose.model('Admission', admissionSchema);

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = 'uploads/';
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

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

// Get all admissions with pagination and filtering
app.get('/api/admissions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const grade = req.query.grade;
        const status = req.query.status;
        const search = req.query.search;

        const query = {};
        if (grade) query['student.class'] = grade;
        if (status) query.status = status;
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
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Submit admission form
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

        // Validate required fields
        if (!formData.student || !formData.parents) {
            return res.status(400).json({ error: 'Student and parent data are required' });
        }

        const student = typeof formData.student === 'string' ? JSON.parse(formData.student) : formData.student;
        const parents = typeof formData.parents === 'string' ? JSON.parse(formData.parents) : formData.parents;

        if (!student.firstName || !student.lastName || !parents.fatherName) {
            return res.status(400).json({ error: 'Required fields missing' });
        }

        // Process uploaded files
        const fileReferences = {};
        if (files) {
            Object.keys(files).forEach(field => {
                fileReferences[field] = files[field][0].filename;
            });
        }

        // Generate admission ID
        const admissionId = 'ADM-' + Date.now();

        // Create admission record
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

        // Save to MongoDB
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

// Update admission
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

// Delete admission
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

// Get single admission
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

// Download document
app.get('/api/documents/:filename', (req, res) => {
    const filePath = path.join(__dirname, UPLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});