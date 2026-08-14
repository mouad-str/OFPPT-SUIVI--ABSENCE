const pool = require('../config/db');

exports.studentLookup = async (req, res, next) => {
    try {
        const { numInscription } = req.body;
        if (!numInscription) {
            return res.status(400).json({ message: 'Numéro d\'inscription requis.' });
        }

        // 1. Get student profile details
        const [students] = await pool.query(`
            SELECT s.NumInscription, s.name, s.group_id, s.Active, f.nom as filiere
            FROM stagiaires s
            LEFT JOIN filiere f ON s.filiereId = f.id
            WHERE s.NumInscription = ?
        `, [numInscription]);

        if (students.length === 0) {
            return res.status(404).json({ message: 'Aucun stagiaire trouvé avec ce numéro d\'inscription.' });
        }

        const student = students[0];

        // 2. Query unjustified absences
        const [absences] = await pool.query(`
            SELECT ra.id as absence_id, r.date, r.subject, r.heure, ra.status, ra.Justifier,
                   jr.id as pending_request_id, jr.status as request_status
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            LEFT JOIN justification_requests jr ON ra.id = jr.report_id AND jr.student_id = ra.student_id
            WHERE ra.student_id = ? AND ra.status = 'ABSENT' AND ra.Justifier != 'JUSTIFIÉ'
            ORDER BY r.date DESC
        `, [numInscription]);

        res.json({
            student,
            absences
        });
    } catch (err) {
        console.error("STUDENT LOOKUP ERROR:", err);
        next(err);
    }
};

exports.submitJustification = async (req, res, next) => {
    try {
        const { studentId, absenceId, reason } = req.body;
        
        if (!studentId || !absenceId || !req.file) {
            return res.status(400).json({ message: 'Données manquantes (absenceId, studentId, ou fichier justificatif).' });
        }

        // 1. Check if a request already exists for this student and absence
        const [existing] = await pool.query(`
            SELECT id FROM justification_requests 
            WHERE student_id = ? AND report_id = (SELECT report_id FROM report_attendance WHERE id = ?)
        `, [studentId, absenceId]);

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Un justificatif a déjà été soumis pour cette absence.' });
        }

        // 2. Fetch report details
        const [[absence]] = await pool.query(`
            SELECT ra.report_id, r.date, r.subject, s.name as student_name
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            JOIN stagiaires s ON ra.student_id = s.NumInscription
            WHERE ra.id = ? AND ra.student_id = ?
        `, [absenceId, studentId]);

        if (!absence) {
            return res.status(404).json({ message: 'Absence non trouvée.' });
        }

        // 3. Save to DB
        // Save relative path for frontend serving: /uploads/justifications/filename
        const fileRelativePath = `/uploads/justifications/${req.file.filename}`;
        
        await pool.query(`
            INSERT INTO justification_requests (student_id, report_id, date_absence, subject, reason, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [studentId, absence.report_id, absence.date, absence.subject, reason || '', fileRelativePath]);

        // 4. Create admin notification
        const { createNotification } = require('./notificationController');
        const [admins] = await pool.query('SELECT id FROM admins');
        for (const admin of admins) {
            await createNotification(
                admin.id,
                'request',
                'JUSTIFICATION',
                `Justification reçue : ${absence.student_name}`,
                `Le stagiaire ${absence.student_name} a soumis un justificatif pour son absence du ${new Date(absence.date).toLocaleDateString('fr-FR')} (${absence.subject}).`
            );
        }

        res.status(201).json({ message: 'Justificatif soumis avec succès. En attente de validation.' });
    } catch (err) {
        console.error("SUBMIT JUSTIFICATION ERROR:", err);
        next(err);
    }
};
