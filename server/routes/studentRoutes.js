const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { studentLookup, submitJustification } = require('../controllers/studentController');

// Multer storage engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure path is resolved relative to app root
        const dir = path.join(__dirname, '..', 'uploads', 'justifications');
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const studentId = req.body.studentId || 'st';
        const ext = path.extname(file.originalname);
        cb(null, `${studentId}-${Date.now()}${ext}`);
    }
});

// Filter files (accept only images and PDFs)
const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Fichiers autorisés : images (JPG, PNG) ou PDF.'));
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/lookup', studentLookup);
router.post('/justify', upload.single('file'), submitJustification);

module.exports = router;
