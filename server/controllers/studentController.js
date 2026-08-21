const pool = require('../config/db');

exports.studentLookup = async (req, res, next) => {
    try {
        const { numInscription } = req.body;
        if (!numInscription) {
            return res.status(400).json({ message: 'Numéro d\'inscription requis.' });
        }

        // 1. Get student profile details
        const [students] = await pool.query(`
            SELECT s.NumInscription, s.name, s.group_id, s.Active, s.qr_path, f.nom as filiere, g.annee_scolaire
            FROM stagiaires s
            LEFT JOIN filiere f ON s.filiereId = f.id
            LEFT JOIN groups g ON s.group_id = g.id
            WHERE s.NumInscription = ?
        `, [numInscription.trim()]);

        if (students.length === 0) {
            return res.status(404).json({ message: 'Aucun stagiaire trouvé avec ce numéro d\'inscription.' });
        }

        const student = students[0];

        // 2. Total Sessions for this group
        const [[{ total_sessions }]] = await pool.query(`
            SELECT COUNT(*) as total_sessions FROM reports WHERE group_id = ?
        `, [student.group_id]);

        // 3. Query all absence records for this student
        const [absences] = await pool.query(`
            SELECT ra.id as absence_id, r.date, r.subject, r.heure, ra.status, ra.Justifier,
                   f.name as formateur_name,
                   jr.id as pending_request_id, jr.status as request_status, jr.reason as justification_reason,
                   jr.created_at as justification_submitted_at
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            LEFT JOIN formateurs f ON r.formateur_id = f.id
            LEFT JOIN justification_requests jr ON ra.id = jr.report_id AND jr.student_id = ra.student_id
            WHERE ra.student_id = ?
            ORDER BY r.date DESC, ra.id DESC
        `, [numInscription.trim()]);

        // 4. Calculate metrics
        const totalAbsences = absences.filter(a => a.status === 'ABSENT').length;
        const justifiedAbsences = absences.filter(a => a.status === 'ABSENT' && a.Justifier === 'JUSTIFIÉ').length;
        const unjustifiedAbsences = absences.filter(a => a.status === 'ABSENT' && a.Justifier !== 'JUSTIFIÉ').length;
        const lateCount = absences.filter(a => a.status === 'LATE').length;
        
        const expectedSessions = Math.max(Number(total_sessions || 0), totalAbsences);
        const attendanceRate = expectedSessions > 0
            ? Math.max(0, Math.min(100, Math.round(((expectedSessions - unjustifiedAbsences) / expectedSessions) * 100)))
            : 100;

        // 5. Query discipline penalties
        const [discipline] = await pool.query(`
            SELECT id, penalty_type, date, reason, created_at
            FROM suivieDisipline
            WHERE student_id = ?
            ORDER BY date DESC
        `, [numInscription.trim()]);

        // 6. Query weekly timetable for student's group
        const [timetable] = await pool.query(`
            SELECT t.id, t.day, t.time, t.subject, s.nom as salle_name, f.name as formateur_name
            FROM timetables t
            LEFT JOIN formateurs f ON t.formateur_id = f.id
            LEFT JOIN salles s ON t.salle_id = s.id
            WHERE t.group_id = ?
            ORDER BY FIELD(t.day, 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'), t.time ASC
        `, [student.group_id]);

        // 7. QR Payload data & path
        const safeName = student.name.replace(/ /g, '_').toUpperCase();
        const qrPath = student.qr_path || `/uploads/Qr_Id/${(student.group_id || 'Unknown').replace(/ /g, '_')}/QR_${safeName}.png`;
        const qrPayload = `NAME:${student.name}|GROUP:${student.group_id}|INSTITUTE:OFPPT ISTA Mirleft|YEAR:${student.annee_scolaire || '2025/2026'}|PROFESSION:stagiaire|ID:${student.NumInscription}`;

        res.json({
            student,
            stats: {
                total_sessions: expectedSessions,
                total_absences: totalAbsences,
                justified_absences: justifiedAbsences,
                unjustified_absences: unjustifiedAbsences,
                late_count: lateCount,
                attendance_rate: attendanceRate,
                blames_count: discipline.length
            },
            absences,
            discipline,
            timetable,
            qr: {
                qr_path: qrPath,
                qr_payload: qrPayload
            }
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
