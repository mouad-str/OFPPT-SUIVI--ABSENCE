const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const xlsx = require('xlsx');

exports.getFormateurs = async (req, res) => {
    try {
        const [formateurs] = await pool.query("SELECT id, name, email, 'formateur' as role FROM formateurs");
        res.json({ formateurs });
    } catch (err) {
        console.error("GET FORMATEURS ERROR:", err);
        res.status(500).json({ message: 'Server Error getting formateurs' });
    }
};

exports.getDashboardSummary = async (req, res) => {
    try {
        const periodParam = req.query.period === 'monthly' ? 30 : 7;

        const [[{ total_students }]] = await pool.query("SELECT COUNT(*) as total_students FROM stagiaires");
        const [[{ total_formateurs }]] = await pool.query("SELECT COUNT(*) as total_formateurs FROM formateurs");
        const [[{ total_groups }]] = await pool.query("SELECT COUNT(*) as total_groups FROM groups");
        const [[{ total_reports }]] = await pool.query("SELECT COUNT(*) as total_reports FROM reports");

        // Total Theoretical Attendance Records (Total Expected across all reports)
        const [[{ total_theoretical }]] = await pool.query(`
            SELECT SUM(group_counts.cnt) as total_theoretical
            FROM reports r
            JOIN (SELECT group_id, COUNT(*) as cnt FROM stagiaires GROUP BY group_id) as group_counts 
            ON r.group_id = group_counts.group_id
        `);

        // Total Absences based on Justifier='ABSENCE'
        const [[{ total_absences }]] = await pool.query("SELECT COUNT(*) as total_absences FROM report_attendance WHERE Justifier = 'ABSENCE'");

        // Attendance Evolution based on period
        const [evolution] = await pool.query(`
            SELECT 
                DATE_FORMAT(r.date, '%Y-%m-%d') as date,
                SUM(group_counts.cnt) as total_expected,
                SUM(IFNULL(absences.abs_cnt, 0)) as absent_count
            FROM reports r
            JOIN (SELECT group_id, COUNT(*) as cnt FROM stagiaires GROUP BY group_id) as group_counts 
                ON r.group_id = group_counts.group_id
            LEFT JOIN (
                SELECT ra.report_id, COUNT(*) as abs_cnt 
                FROM report_attendance ra 
                WHERE ra.Justifier = 'ABSENCE' 
                GROUP BY ra.report_id
            ) as absences ON r.id = absences.report_id
            WHERE r.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY r.date
            ORDER BY r.date ASC
        `, [periodParam]);

        // Generate a continuous sequence for the selected period
        const processedEvolution = [];
        for (let i = periodParam - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);

            // Generate local YYYY-MM-DD string to avoid timezone shifts from toISOString()
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const dayData = evolution.find(e => e.date === dateStr);

            // For monthly, show date for weekly show day name
            const label = periodParam > 7
                ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                : d.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase().replace('.', '');

            processedEvolution.push({
                name: label,
                // If there are zero absences, it is 100% presence (even if no reports).
                // If there are absences, we calculate based on the expected total.
                rate: (dayData && dayData.absent_count > 0)
                    ? Math.round(((dayData.total_expected - dayData.absent_count) / dayData.total_expected) * 100)
                    : 100
            });
        }

        // 1. Recent reports
        const [recentReports] = await pool.query(`
            SELECT r.id, r.group_id, r.created_at, f.name as formateur_name, r.subject,
                   (SELECT COUNT(*) FROM report_attendance ra WHERE ra.report_id = r.id AND ra.status = 'ABSENT') as absences_count,
                   (SELECT COUNT(*) FROM report_attendance ra WHERE ra.report_id = r.id AND ra.status = 'PRESENT') as total_students
            FROM reports r
            JOIN formateurs f ON r.formateur_id = f.id
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 4
        `);

        // 2. Top absent groups
        const [topAbsentGroups] = await pool.query(`
            SELECT r.group_id, 
                   COUNT(CASE WHEN ra.status = 'ABSENT' THEN 1 END) as total_absences,
                   ROUND((COUNT(CASE WHEN ra.status = 'ABSENT' THEN 1 END) / (COUNT(DISTINCT r.id) * IFNULL(g_count.cnt, 1))) * 100) as absence_rate
            FROM reports r
            LEFT JOIN report_attendance ra ON r.id = ra.report_id
            LEFT JOIN (SELECT group_id, COUNT(*) as cnt FROM stagiaires GROUP BY group_id) as g_count ON r.group_id = g_count.group_id
            GROUP BY r.group_id
            ORDER BY total_absences DESC
            LIMIT 5
        `);

        // 3. Warnings statistics
        const [warningsStats] = await pool.query(`
            SELECT penalty_type, COUNT(*) as count 
            FROM suivieDisipline 
            GROUP BY penalty_type
        `);

        // 4. Pending justifications count
        const [[{ pending_justifications_count }]] = await pool.query(`
            SELECT COUNT(*) as pending_justifications_count 
            FROM justification_requests 
            WHERE status = 'PENDING'
        `);

        res.json({
            summary: {
                total_students,
                total_formateurs,
                total_groups,
                total_reports,
                global_rate: total_theoretical > 0 ? Math.round(((total_theoretical - total_absences) / total_theoretical) * 100) : 100,
                evolution: processedEvolution,
                distribution: [
                    { status: 'PRESENT', count: (total_theoretical || 0) - (total_absences || 0) },
                    { status: 'ABSENT', count: total_absences || 0 }
                ],
                recent_reports: recentReports,
                top_absent_groups: topAbsentGroups,
                warnings_stats: warningsStats,
                pending_justifications_count
            }
        });
    } catch (err) {
        console.error("GET DASHBOARD SUMMARY ERROR:", err);
        res.status(500).json({ message: 'Server Error getting summary' });
    }
};

exports.createGroup = async (req, res, next) => {
    try {
        const { id, filiereId, lead, année_scolaire } = req.body;

        if (!id || !filiereId) {
            return res.status(400).json({ message: 'L\'ID du groupe et la filière sont obligatoires.' });
        }

        await pool.query(
            'INSERT INTO groups (id, filiereId, annee_scolaire) VALUES (?, ?, ?)',
            [id, filiereId, année_scolaire || '2025/2026']
        );

        // Create group folder for QRs
        const groupFolder = path.join(__dirname, '..', 'uploads', 'Qr_Id', id.replace(/ /g, '_'));
        if (!fs.existsSync(groupFolder)) {
            fs.mkdirSync(groupFolder, { recursive: true });
        }

        // Sync supervisors
        const leads = Array.isArray(lead) ? lead : (lead ? lead.split(',').map(s => s.trim()) : []);
        for (const leadName of leads) {
            const [[user]] = await pool.query('SELECT id FROM formateurs WHERE name = ?', [leadName]);
            if (user) {
                await pool.query('INSERT IGNORE INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', [id, user.id]);
                // Ensure notification only if admin users table exists or handle formateur notification safely
                try {
                    const { createNotification } = require('./notificationController');
                    await createNotification(
                        user.id,
                        'message',
                        'PLANNING',
                        'Nouveau Groupe Assigné',
                        `Vous avez été assigné comme superviseur pour le groupe ${id}.`
                    );
                } catch (err) { }
            }
        }

        // Link multiple salles if provided
        const salleIds = req.body.salleIds || (req.body.salleId ? [req.body.salleId] : []);
        if (salleIds.length > 0) {
            for (const sId of salleIds) {
                await pool.query('INSERT IGNORE INTO group_salles (group_id, salle_id) VALUES (?, ?)', [id, sId]);
            }
        }

        res.status(201).json({
            message: 'Group created successfully',
            group: { id, filiereId, annee_scolaire: année_scolaire, lead: leads.join(', '), students: 0 }
        });
    } catch (err) {
        next(err);
    }
};

exports.updateGroup = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { filiereId, lead, année_scolaire } = req.body;

        if (!filiereId) {
            return res.status(400).json({ message: 'La filière est obligatoire.' });
        }

        await pool.query(
            'UPDATE groups SET filiereId = ?, annee_scolaire = ? WHERE id = ?',
            [filiereId, année_scolaire || '2025/2026', id]
        );

        // Sync supervisors
        await pool.query('DELETE FROM groups_supervisors WHERE group_id = ?', [id]);
        const leads = Array.isArray(lead) ? lead : (lead ? lead.split(',').map(s => s.trim()) : []);
        for (const leadName of leads) {
            const [[user]] = await pool.query('SELECT id FROM formateurs WHERE name = ?', [leadName]);
            if (user) {
                await pool.query('INSERT IGNORE INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', [id, user.id]);
            }
        }

        // Update room assignments (Many-to-Many)
        await pool.query('DELETE FROM group_salles WHERE group_id = ?', [id]);
        const salleIds = req.body.salleIds || (req.body.salleId ? [req.body.salleId] : []);
        if (salleIds.length > 0) {
            for (const sId of salleIds) {
                await pool.query('INSERT IGNORE INTO group_salles (group_id, salle_id) VALUES (?, ?)', [id, sId]);
            }
        }

        // Fetch updated object with count and leads
        const [[updatedGroup]] = await pool.query(`
            SELECT 
                c.*, f.nom as stream, s.nom as salle_nom,
                (SELECT COUNT(*) FROM stagiaires st WHERE st.group_id = c.id) as student_count,
                (SELECT GROUP_CONCAT(u_lead.name SEPARATOR ', ') FROM groups_supervisors cs JOIN formateurs u_lead ON cs.formateur_id = u_lead.id WHERE cs.group_id = c.id) as lead_formateurs
            FROM groups c 
            LEFT JOIN filiere f ON c.filiereId = f.id
            LEFT JOIN salles s ON c.salleId = s.id
            WHERE c.id = ?
        `, [id]);

        res.json({
            message: 'Group updated successfully',
            group: {
                id: updatedGroup.id,
                stream: updatedGroup.stream,
                filiereId: updatedGroup.filiereId,
                annee_scolaire: updatedGroup.annee_scolaire,
                lead: updatedGroup.lead_formateurs || '',
                students: updatedGroup.student_count
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        const { id } = req.params;

        // Use a transaction or sequential deletes to handle constraints
        await pool.query('DELETE FROM groups_supervisors WHERE group_id = ?', [id]);
        await pool.query('UPDATE stagiaires SET group_id = NULL WHERE group_id = ?', [id]);

        const [result] = await pool.query('DELETE FROM groups WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Group not found in registry.' });
        }

        res.json({ message: 'Group purged from network.' });
    } catch (err) {
        console.error("DELETE GROUP ERROR:", err);
        res.status(500).json({ message: 'Error during group deletion.' });
    }
};

exports.recreateClasses = async (req, res, next) => {
    try {
        const { newYear } = req.body;
        if (!newYear) {
            return res.status(400).json({ message: "L'année scolaire est obligatoire." });
        }

        // 1. Update the academic year for all groups
        await pool.query('UPDATE `groups` SET annee_scolaire = ?', [newYear]);

        // 2. Set all students' group_id to NULL and Active to TRUE
        await pool.query('UPDATE stagiaires SET group_id = NULL, Active = TRUE');

        res.json({ message: `Classes recréées pour l'année ${newYear}. Tous les stagiaires ont été dissociés.` });
    } catch (err) {
        console.error("RECREATE CLASSES ERROR:", err);
        next(err);
    }
};

exports.getUsersByGroup = async (req, res) => {
    try {
        const { groupId } = req.params;

        const [supervisors] = await pool.query(`
            SELECT f.id, f.name, f.email, 'formateur' as role, c.group_id 
            FROM formateurs f 
            JOIN groups_supervisors c ON f.id = c.formateur_id 
            WHERE c.group_id = ?
        `, [groupId]);

        const [stagiaires] = await pool.query("SELECT NumInscription as id, name, group_id, 'stagiaire' as profession, qr_path, Active FROM stagiaires WHERE group_id = ?", [groupId]);

        const combined = [
            ...supervisors.map(u => ({ ...u, status: 'ACTIVE', lastLogin: 'Staff' })),
            ...stagiaires.map(s => ({ ...s, role: 'stagiaire', status: s.Active ? 'ACTIVE' : 'INACTIVE', lastLogin: 'No Login' }))
        ];

        res.json({ users: combined });
    } catch (err) {
        console.error("GET USERS ERROR:", err);
        res.status(500).json({ message: 'Server Error getting users' });
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const { name, role, group_id, filiereId, numInsc, type } = req.body;
        if (!name || !role) {
            return res.status(400).json({ message: 'Name and Role are mandatory.' });
        }

        if (role === 'stagiaire') {
            if (!numInsc) return res.status(400).json({ message: 'NumInscription est obligatoire pour les stagiaires.' });

            // 1. Create Stagiaire
            const email = name.replace(/\s+/g, '').toLowerCase() + '@ofppt-edu.ma';
            await pool.query(
                'INSERT INTO stagiaires (NumInscription, name, group_id, filiereId, email) VALUES (?, ?, ?, ?, ?)',
                [numInsc, name, group_id || null, filiereId || null, email]
            );
            const stagiaireId = numInsc;

            // 2. Generate QR Code via Python
            const qrData = {
                Name: name,
                Group: group_id || "Unassigned",
                Institute: "OFPPT ISTA",
                Year: "2025/2026",
                Profession: "stagiaire"
            };

            const pythonProcess = spawn('py', [
                path.join(__dirname, '../generate_qr.py'),
                JSON.stringify(qrData)
            ]);

            let newQrPath = '';
            pythonProcess.stdout.on('data', (data) => {
                const qrPathStr = data.toString().trim();
                const relativePath = path.relative(path.join(__dirname, '..'), qrPathStr).replace(/\\/g, '/');
                newQrPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`[PY_STDERR]: ${data}`);
            });

            await new Promise((resolve) => {
                pythonProcess.on('close', resolve);
            });

            if (newQrPath) {
                await pool.query('UPDATE stagiaires SET qr_path = ? WHERE NumInscription = ?', [newQrPath, stagiaireId]);
            }

            const [[newStagiaire]] = await pool.query('SELECT NumInscription as id, name, group_id, filiereId, qr_path FROM stagiaires WHERE NumInscription = ?', [stagiaireId]);

            // Notify Formateurs of the group
            const [supervisors] = await pool.query('SELECT formateur_id FROM groups_supervisors WHERE group_id = ?', [group_id]);
            for (const supervisor of supervisors) {
                const { createNotification } = require('./notificationController');
                await createNotification(
                    supervisor.formateur_id,
                    'message',
                    'STAGIAIRE',
                    'Nouveau Stagiaire',
                    `Le stagiaire ${name} a été ajouté au groupe ${group_id}.`
                );
            }

            return res.status(201).json({
                message: 'Stagiaire identity created. QR generated.',
                user: { ...newStagiaire, role: 'stagiaire', status: 'ACTIVE', lastLogin: 'No Login' }
            });

        } else {
            // Staff creation (Admin/Formateur)
            let email;
            if (role === 'formateur' && type === 'Vacataire') {
                email = (req.body.email || (name.trim().toLowerCase().replace(/\s+/g, '.') + '@ofppt-edu.ma')).trim().toLowerCase();
            } else {
                email = name.trim().toLowerCase().replace(/\s+/g, '.') + '@ofppt.ma';
            }
            const defaultPassword = email.split('@')[0];
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(defaultPassword, 10);

            const table = role === 'admin' ? 'admins' : 'formateurs';

            const [result] = await pool.query(
                `INSERT INTO ${table} (name, email, password${role === 'formateur' ? ', type' : ''}) VALUES (?, ?, ?${role === 'formateur' ? ', ?' : ''})`,
                role === 'formateur' ? [name, email, hash, type || 'Parrain'] : [name, email, hash]
            );

            const userId = result.insertId;

            if (role === 'formateur' && group_id) {
                const groupIds = group_id.split(',').map(id => id.trim());
                for (const cid of groupIds) {
                    if (cid) {
                        await pool.query('INSERT IGNORE INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', [cid, userId]);
                    }
                }
            }

            const [[newUser]] = await pool.query(`SELECT id, name, email, '${role}' as role${role === 'formateur' ? ', type' : ''} FROM ${table} WHERE id = ?`, [userId]);
            res.status(201).json({
                message: 'Staff identity successfully initialized.',
                user: { ...newUser, status: 'ACTIVE', lastLogin: 'Staff' }
            });
        }
    } catch (err) {
        next(err);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, role, group_id, filiereId, type } = req.body;

        if (!name || !role) {
            return res.status(400).json({ message: 'Name and Role are mandatory.' });
        }

        if (role === 'stagiaire') {
            // 1. Get old group_id and QR path to delete it
            const [[oldRecord]] = await pool.query('SELECT group_id, qr_path FROM stagiaires WHERE NumInscription = ?', [id]);
            const oldGroupId = oldRecord ? oldRecord.group_id : null;

            if (oldRecord && oldRecord.qr_path) {
                const relativeOldPath = oldRecord.qr_path.startsWith('/') ? oldRecord.qr_path.substring(1) : oldRecord.qr_path;
                const absoluteOldPath = path.join(__dirname, '..', relativeOldPath);
                if (fs.existsSync(absoluteOldPath)) {
                    fs.unlinkSync(absoluteOldPath);
                }
            }

            // 2. Update basic info
            const email = name.replace(/\s+/g, '').toLowerCase() + '@ofppt-edu.ma';
            await pool.query(
                'UPDATE stagiaires SET name = ?, group_id = ?, filiereId = ?, email = ? WHERE NumInscription = ?',
                [name, group_id || null, filiereId || null, email, id]
            );

            // Trigger active status updates for both old and new groups
            if (oldGroupId) {
                await updateGroupActiveStatus(oldGroupId);
            }
            if (group_id) {
                await updateGroupActiveStatus(group_id);
            }

            // 3. Generate New QR Code
            const qrData = {
                Name: name,
                Group: group_id || "Unassigned",
                Institute: "OFPPT ISTA",
                Year: "2025/2026",
                Profession: "stagiaire"
            };

            const pythonProcess = spawn('py', [
                path.join(__dirname, '../generate_qr.py'),
                JSON.stringify(qrData)
            ]);

            let newQrPath = '';
            pythonProcess.stdout.on('data', (data) => {
                const qrPathStr = data.toString().trim();
                const relativePath = path.relative(path.join(__dirname, '..'), qrPathStr).replace(/\\/g, '/');
                newQrPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`[PY_STDERR]: ${data}`);
            });

            await new Promise((resolve) => {
                pythonProcess.on('close', resolve);
            });

            if (newQrPath) {
                await pool.query('UPDATE stagiaires SET qr_path = ? WHERE NumInscription = ?', [newQrPath, id]);
            }

            const [[updated]] = await pool.query('SELECT NumInscription as id, name, group_id, filiereId, qr_path FROM stagiaires WHERE NumInscription = ?', [id]);
            res.json({ message: 'Stagiaire updated. New QR generated.', user: { ...updated, role: 'stagiaire' } });
        } else {
            let email;
            if (role === 'formateur' && type === 'Vacataire') {
                email = (req.body.email || (name.trim().toLowerCase().replace(/\s+/g, '.') + '@ofppt-edu.ma')).trim().toLowerCase();
            } else {
                email = name.trim().toLowerCase().replace(/\s+/g, '.') + '@ofppt.ma';
            }
            const defaultPassword = email.split('@')[0];
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(defaultPassword, 10);

            const table = role === 'admin' ? 'admins' : 'formateurs';

            if (role === 'formateur') {
                await pool.query(
                    `UPDATE formateurs SET name = ?, email = ?, password = ?, type = ? WHERE id = ?`,
                    [name, email, hash, type || 'Parrain', id]
                );
            } else {
                await pool.query(
                    `UPDATE admins SET name = ?, email = ?, password = ? WHERE id = ?`,
                    [name, email, hash, id]
                );
            }

            if (role === 'formateur' && group_id) {
                await pool.query('DELETE FROM groups_supervisors WHERE formateur_id = ?', [id]);
                const groupIds = group_id.split(',').map(cid => cid.trim());
                for (const cid of groupIds) {
                    if (cid) {
                        await pool.query('INSERT IGNORE INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', [cid, id]);
                    }
                }
            }
            const [[updated]] = await pool.query(`SELECT id, name, email, '${role}' as role${role === 'formateur' ? ', type' : ''} FROM ${table} WHERE id = ?`, [id]);
            res.json({ message: 'Staff identity updated.', user: updated });
        }
    } catch (err) {
        next(err);
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.query;

        if (role === 'stagiaire') {
            const [[user]] = await pool.query('SELECT qr_path FROM stagiaires WHERE NumInscription = ?', [id]);
            if (user && user.qr_path) {
                const relativePath = user.qr_path.startsWith('/') ? user.qr_path.substring(1) : user.qr_path;
                const absolutePath = path.join(__dirname, '..', relativePath);
                if (fs.existsSync(absolutePath)) {
                    fs.unlinkSync(absolutePath);
                }
            }
            await pool.query('DELETE FROM stagiaires WHERE NumInscription = ?', [id]);
        } else {
            await pool.query('DELETE FROM groups_supervisors WHERE formateur_id = ?', [id]);
            const table = role === 'admin' ? 'admins' : 'formateurs';
            await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
        }

        res.json({ message: 'Identity purged from network.' });
    } catch (err) {
        console.error("DELETE USER ERROR:", err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getReports = async (req, res) => {
    try {
        const [reports] = await pool.query(`
            SELECT r.*, c.id as group_id, u.name as formateur_name,
            (SELECT COUNT(*) FROM stagiaires st WHERE st.group_id = c.id) as total_group_students,
            (SELECT GROUP_CONCAT(sl.nom SEPARATOR ', ') FROM group_salles gs JOIN salles sl ON gs.salle_id = sl.id WHERE gs.group_id = r.group_id) as salle_name
            FROM reports r
            JOIN groups c ON r.group_id = c.id
            JOIN formateurs u ON r.formateur_id = u.id
            ORDER BY r.date DESC, r.created_at DESC
        `);

        // Fetch students for each report (now joining with stagiaires table)
        const reportsWithStagiaires = await Promise.all(reports.map(async (report) => {
            const [stagiaires] = await pool.query(`
                SELECT ra.student_id as id, s.name as name, ra.status 
                FROM report_attendance ra
                JOIN stagiaires s ON ra.student_id = s.NumInscription
                WHERE ra.report_id = ?
            `, [report.id]);
            return {
                ...report,
                stagiaires: stagiaires.map(s => ({
                    id: s.id,
                    name: s.name,
                    status: s.status
                }))
            };
        }));

        res.json({ reports: reportsWithStagiaires });
    } catch (err) {
        console.error("GET REPORTS ERROR:", err);
        res.status(500).json({ message: 'Server Error getting reports' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [admins] = await pool.query("SELECT id, name, email, 'admin' as role, NULL as group_id FROM admins");
        const [formateurs] = await pool.query(`
            SELECT f.id, f.name, f.email, 'formateur' as role, f.type,
                   GROUP_CONCAT(cs.group_id SEPARATOR ', ') as supervised_groups
            FROM formateurs f
            LEFT JOIN groups_supervisors cs ON f.id = cs.formateur_id
            GROUP BY f.id
        `);

        const [stagiaires] = await pool.query(`
            SELECT 
                s.NumInscription as id, s.name, s.group_id as group_id, 
                s.qr_path, s.Active,
                f.nom as filiere_name,
                c.annee_scolaire,
                (SELECT COUNT(*) FROM report_attendance ra WHERE ra.student_id = s.NumInscription AND ra.status = 'ABSENT') as absence_count,
                (SELECT COUNT(*) FROM report_attendance ra WHERE ra.student_id = s.NumInscription AND ra.status = 'LATE') as late_count,
                (SELECT ra.status FROM report_attendance ra JOIN reports r ON ra.report_id = r.id WHERE ra.student_id = s.NumInscription ORDER BY r.date DESC, r.created_at DESC LIMIT 1) as last_status,
                (SELECT ra.Justifier FROM report_attendance ra JOIN reports r ON ra.report_id = r.id WHERE ra.student_id = s.NumInscription ORDER BY r.date DESC, r.created_at DESC LIMIT 1) as last_justifier
            FROM stagiaires s
            LEFT JOIN filiere f ON s.filiereId = f.id
            LEFT JOIN groups c ON s.group_id = c.id
        `);

        const combined = [
            ...admins.map(a => ({ ...a, status: 'ACTIVE', lastLogin: 'Staff' })),
            ...formateurs.map(f => ({
                ...f,
                groups: f.supervised_groups || '',
                is_online: false,
                status: 'ACTIVE',
                lastLogin: 'Staff'
            })),
            ...stagiaires.map(s => ({
                ...s,
                email: s.email || (s.name ? String(s.name).replace(/\s/g, '').toLowerCase() + '@ofppt-edu.ma' : 'student@ofppt-edu.ma'),
                role: 'stagiaire',
                filiere: s.filiere_name,
                group_id: s.group_id,
                annee_scolaire: s.annee_scolaire,
                status: s.Active ? 'ACTIVE' : 'INACTIVE',
                lastLogin: 'No Login',
                absences: s.absence_count,
                lates: s.late_count,
                last_status: s.last_status,
                last_justifier: s.last_justifier
            }))
        ];

        res.json({ users: combined });
    } catch (err) {
        console.error("GET USERS ERROR:", err);
        res.status(500).json({ message: 'Server Error getting users' });
    }
};

exports.getAbsenceRegistry = async (req, res) => {
    try {
        const [registry] = await pool.query(`
            SELECT 
                MIN(ra.id) as record_id,
                CASE 
                    WHEN SUM(CASE WHEN ra.status = 'ABSENT' THEN 1 ELSE 0 END) > 0 THEN 'ABSENT'
                    ELSE 'LATE'
                END as status,
                CASE 
                    WHEN SUM(CASE WHEN ra.Justifier = 'ABSENCE' THEN 1 ELSE 0 END) > 0 THEN 'ABSENCE'
                    WHEN SUM(CASE WHEN ra.Justifier = 'NON JUSTIFIÉ' THEN 1 ELSE 0 END) > 0 THEN 'NON JUSTIFIÉ'
                    ELSE 'JUSTIFIÉ'
                END as justified,
                s.NumInscription as student_id,
                s.name as student_name,
                s.group_id as class_id,
                r.date as session_date,
                GROUP_CONCAT(DISTINCT r.subject ORDER BY r.heure SEPARATOR ', ') as subject,
                GROUP_CONCAT(DISTINCT r.heure ORDER BY r.heure SEPARATOR ', ') as session_time,
                GROUP_CONCAT(DISTINCT f.name SEPARATOR ', ') as formateur_name,
                (SELECT COUNT(*) FROM report_attendance WHERE student_id = s.NumInscription AND status = 'ABSENT' AND Justifier != 'JUSTIFIÉ') as total_absences,
                (SELECT COUNT(*) FROM suivieDisipline WHERE student_id = s.NumInscription) as total_blames
            FROM report_attendance ra
            JOIN stagiaires s ON ra.student_id = s.NumInscription
            JOIN reports r ON ra.report_id = r.id
            JOIN formateurs f ON r.formateur_id = f.id
            GROUP BY s.NumInscription, r.date
            ORDER BY r.date DESC, MIN(r.created_at) DESC, MIN(ra.id) DESC
        `);
        res.json({ registry });
    } catch (err) {
        console.error("GET ABSENCE REGISTRY ERROR:", err);
        res.status(500).json({ message: 'Server Error fetching registry' });
    }
};

exports.justifyAbsence = async (req, res) => {
    try {
        const { recordId, justified } = req.body;
        const newStatus = justified ? "JUSTIFIÉ" : "ABSENCE";

        // 1. Retrieve the student_id and session date associated with this record
        const [[record]] = await pool.query(`
            SELECT ra.student_id, r.date 
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            WHERE ra.id = ?
        `, [recordId]);

        let studentGroupId = null;
        if (record) {
            // 2. Update all attendance records for this student on this day
            await pool.query(`
                UPDATE report_attendance ra
                JOIN reports r ON ra.report_id = r.id
                SET ra.Justifier = ?
                WHERE ra.student_id = ? AND r.date = ?
            `, [newStatus, record.student_id, record.date]);

            // Query group_id of the student
            const [[student]] = await pool.query('SELECT group_id FROM stagiaires WHERE NumInscription = ?', [record.student_id]);
            if (student) {
                studentGroupId = student.group_id;
            }
        } else {
            // Fallback in case record is not found
            await pool.query('UPDATE report_attendance SET Justifier = ? WHERE id = ?', [newStatus, recordId]);
            
            // Try to find the student and their group via recordId fallback
            const [[student]] = await pool.query(`
                SELECT s.group_id FROM stagiaires s 
                JOIN report_attendance ra ON s.NumInscription = ra.student_id 
                WHERE ra.id = ?
            `, [recordId]);
            if (student) {
                studentGroupId = student.group_id;
            }
        }

        if (studentGroupId) {
            await updateGroupActiveStatus(studentGroupId);
        }

        res.json({ message: `Absence marquée comme ${newStatus}.` });
    } catch (err) {
        console.error("JUSTIFY ABSENCE ERROR:", err);
        res.status(500).json({ message: 'Server Error updating absence' });
    }
};

exports.correctAbsence = async (req, res, next) => {
    try {
        const { recordId } = req.params;

        // 1. Find the student_id associated with this record to know their group
        const [[record]] = await pool.query(
            'SELECT student_id FROM report_attendance WHERE id = ?',
            [recordId]
        );

        if (!record) {
            return res.status(404).json({ message: 'Absence record not found.' });
        }

        // 2. Delete the record from report_attendance
        await pool.query('DELETE FROM report_attendance WHERE id = ?', [recordId]);

        // 3. Query the student\'s group to update their active status
        const [[student]] = await pool.query(
            'SELECT group_id FROM stagiaires WHERE NumInscription = ?',
            [record.student_id]
        );

        if (student && student.group_id) {
            await updateGroupActiveStatus(student.group_id);
        }

        res.json({ message: 'Absence corrigée. Le stagiaire est marqué comme présent.' });
    } catch (err) {
        console.error("CORRECT ABSENCE ERROR:", err);
        next(err);
    }
};

exports.addDisciplinePenalty = async (req, res) => {
    try {
        const { stagiaireId, penalty, reason } = req.body;

        await pool.query(
            'INSERT INTO suivieDisipline (student_id, penalty_type, date, reason) VALUES (?, ?, CURDATE(), ?)',
            [stagiaireId, penalty, reason]
        );

        // Update the status in report_attendance to NON JUSTIFIÉ
        await pool.query(
            'UPDATE report_attendance SET Justifier = "NON JUSTIFIÉ" WHERE student_id = ? AND Justifier = "ABSENCE" ORDER BY id DESC LIMIT 1',
            [stagiaireId]
        );

        // Get student's group, name, and email, and update active status
        const [[student]] = await pool.query('SELECT name, email, group_id FROM stagiaires WHERE NumInscription = ?', [stagiaireId]);
        if (student && student.group_id) {
            await updateGroupActiveStatus(student.group_id);
        }

        // Send email warning to student
        if (student) {
            const sendEmail = require('../utils/mailer');
            const stEmail = student.email || `${student.name.replace(/\s+/g, '').toLowerCase()}@ofppt-edu.ma`;
            const blameHtml = `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 2rem; border-radius: 12px; background: #fff;">
                    <div style="border-bottom: 2px solid #dc2626; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 800;">AVIS DE SANCTION DISCIPLINAIRE</h2>
                        <p style="color: #6b7280; font-size: 11px; margin: 0.25rem 0 0 0;">OFPPT Smart Attendance System</p>
                    </div>
                    <p style="font-size: 14px; font-weight: 700; color: #111;">Bonjour ${student.name},</p>
                    <p style="font-size: 13px; line-height: 1.6; color: #4b5563;">
                        Nous vous informons que l'administration de l'établissement a décidé de vous attribuer la sanction disciplinaire suivante :
                    </p>
                    <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 1.25rem; margin: 1.5rem 0; text-align: center;">
                        <span style="font-size: 20px; font-weight: 900; color: #dc2626; letter-spacing: 0.05em; display: block;">${penalty}</span>
                        <span style="font-size: 11px; color: #7f1d1d; display: block; margin-top: 0.5rem; font-weight: 700; font-style: italic;">
                            Motif : ${reason || "Non-respect du règlement intérieur."}
                        </span>
                    </div>
                    <p style="font-size: 13px; line-height: 1.6; color: #4b5563;">
                        Nous vous rappelons que la présence à l'ensemble des cours et ateliers est obligatoire. En cas de récidive, des mesures d'exclusion définitive seront entamées conformément au règlement intérieur de l'OFPPT.
                    </p>
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 1.5rem; text-align: right;">
                        <p style="font-size: 12px; font-weight: 700; color: #111; margin: 0;">La Direction</p>
                        <p style="font-size: 11px; color: #6b7280; margin: 0.25rem 0 0 0;">ISTA Mirleft</p>
                    </div>
                </div>
            `;
            sendEmail({
                to: stEmail,
                subject: `Sanction Disciplinaire - ${penalty} : ${student.name}`,
                html: blameHtml
            });
        }

        res.json({ message: 'Penalty assigned and status updated to NON JUSTIFIÉ.' });
    } catch (err) {
        console.error("ADD PENALTY ERROR:", err);
        res.status(500).json({ message: 'Server Error assigning penalty' });
    }
};

exports.getDisciplineHistory = async (req, res) => {
    try {
        const { stagiaireId } = req.params;
        const [history] = await pool.query(`
            SELECT d.*
            FROM suivieDisipline d
            WHERE d.student_id = ?
            ORDER BY d.date DESC
        `, [stagiaireId]);
        res.json({ history });
    } catch (err) {
        console.error("GET DISCIPLINE HISTORY ERROR:", err);
        res.status(500).json({ message: 'Server Error fetching history' });
    }
};

exports.getGroups = async (req, res) => {
    try {
        const [groups] = await pool.query(`
            SELECT 
                g.*, 
                filiere.nom AS filiere_name, 
                filiere.nom AS filiere, 
                (SELECT COUNT(*) FROM stagiaires WHERE group_id = g.id) AS student_count,
                (SELECT GROUP_CONCAT(f.name SEPARATOR ', ') FROM groups_supervisors gs JOIN formateurs f ON gs.formateur_id = f.id WHERE gs.group_id = g.id) AS lead_formateurs,
                (SELECT GROUP_CONCAT(s.nom SEPARATOR ', ') FROM group_salles gsl JOIN salles s ON gsl.salle_id = s.id WHERE gsl.group_id = g.id) AS salle_nom,
                (SELECT GROUP_CONCAT(s.id) FROM group_salles gsl JOIN salles s ON gsl.salle_id = s.id WHERE gsl.group_id = g.id) AS salle_ids
            FROM groups g
            JOIN filiere ON g.filiereId = filiere.id
        `);

        res.json({
            groups: groups.map(c => ({
                ...c,
                students: c.student_count,
                filiere: c.filiere_name,
                salle_nom: c.salle_nom,
                salleIds: c.salle_ids ? c.salle_ids.split(',').map(Number) : [],
                année_scolaire: c.annee_scolaire,
                lead: c.lead_formateurs ? c.lead_formateurs.split(', ') : []
            }))
        });
    } catch (err) {
        console.error("GET GROUPS ERROR:", err);
        res.status(500).json({ message: 'Server Error getting groups' });
    }
};

exports.getFilieres = async (req, res) => {
    try {
        const [filieres] = await pool.query(`
            SELECT 
                f.id, 
                f.nom, 
                COUNT(DISTINCT g.id) AS groupes_count, 
                COUNT(DISTINCT s.NumInscription) AS stagiaires_count
            FROM filiere f
            LEFT JOIN \`groups\` g ON g.filiereId = f.id
            LEFT JOIN stagiaires s ON s.filiereId = f.id OR s.group_id = g.id
            GROUP BY f.id, f.nom
            ORDER BY f.id DESC
        `);
        res.json({ filieres });
    } catch (err) {
        console.error("GET FILIERES ERROR:", err);
        res.status(500).json({ message: 'Server Error getting filieres' });
    }
};

exports.createFiliere = async (req, res, next) => {
    try {
        const { nom } = req.body;
        const [result] = await pool.query('INSERT INTO filiere (nom) VALUES (?)', [nom]);
        res.json({ id: result.insertId, nom });
    } catch (err) {
        next(err);
    }
};

exports.deleteFiliere = async (req, res) => {
    try {
        const { id } = req.params;
        const [groups] = await pool.query('SELECT COUNT(*) as count FROM `groups` WHERE filiereId = ?', [id]);
        if (groups[0].count > 0) {
            return res.status(400).json({ 
                message: `Impossible de supprimer: cette filière contient encore ${groups[0].count} groupe(s).` 
            });
        }
        await pool.query('DELETE FROM filiere WHERE id = ?', [id]);
        res.json({ message: 'Filière supprimée avec succès' });
    } catch (err) {
        console.error("DELETE FILIERE ERROR:", err);
        res.status(500).json({ message: 'Server Error deleting filiere' });
    }
};

exports.updateFiliere = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nom } = req.body;
        await pool.query('UPDATE filiere SET nom = ? WHERE id = ?', [nom, id]);
        res.json({ id, nom });
    } catch (err) {
        next(err);
    }
};

exports.getSalles = async (req, res, next) => {
    try {
        const [salles] = await pool.query(`
            SELECT s.*, 
            (SELECT GROUP_CONCAT(f.name SEPARATOR ', ') FROM groups_supervisors gs JOIN formateurs f ON gs.formateur_id = f.id JOIN group_salles gsl ON gs.group_id = gsl.group_id WHERE gsl.salle_id = s.id) as lead_formateurs,
            (SELECT GROUP_CONCAT(gs.group_id SEPARATOR ', ') FROM group_salles gs WHERE gs.salle_id = s.id) as assigned_groups
            FROM salles s
        `);
        res.json({
            salles: salles.map(s => ({
                ...s,
                groupIds: s.assigned_groups ? s.assigned_groups.split(', ') : []
            }))
        });
    } catch (err) {
        next(err);
    }
};

exports.createSalle = async (req, res, next) => {
    try {
        const { nom, groupIds } = req.body;
        const [result] = await pool.query('INSERT INTO salles (nom) VALUES (?)', [nom]);
        const salleId = result.insertId;

        // Link multiple groups if provided
        const groups = groupIds || (req.body.group_id ? [req.body.group_id] : []);
        if (groups.length > 0) {
            for (const gId of groups) {
                await pool.query('INSERT IGNORE INTO group_salles (group_id, salle_id) VALUES (?, ?)', [gId, salleId]);
            }
        }

        res.json({ id: salleId, nom });
    } catch (err) {
        next(err);
    }
};

exports.updateSalle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nom, groupIds } = req.body;
        await pool.query('UPDATE salles SET nom = ? WHERE id = ?', [nom, id]);

        // Update group assignments (Many-to-Many)
        await pool.query('DELETE FROM group_salles WHERE salle_id = ?', [id]);
        const groups = groupIds || (req.body.group_id ? [req.body.group_id] : []);
        if (groups.length > 0) {
            for (const gId of groups) {
                await pool.query('INSERT IGNORE INTO group_salles (group_id, salle_id) VALUES (?, ?)', [gId, id]);
            }
        }

        res.json({ id, nom });
    } catch (err) {
        next(err);
    }
};

exports.deleteSalle = async (req, res) => {
    try {
        await pool.query('DELETE FROM salles WHERE id = ?', [req.params.id]);
        res.json({ message: 'Salle deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error deleting salle' });
    }
};

exports.getStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Basic Info
        const [student] = await pool.query(`
            SELECT s.*, f.nom as filiere_name
            FROM stagiaires s
            LEFT JOIN filiere f ON s.filiereId = f.id
            WHERE s.NumInscription = ?
        `, [id]);

        if (student.length === 0) {
            return res.status(404).json({ message: 'Stagiaire non trouvé' });
        }

        // 2. Absence History
        const [absences] = await pool.query(`
            SELECT ra.*, r.date, r.subject, r.heure, r.formateur_id
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            WHERE ra.student_id = ? AND ra.status = 'ABSENT'
            ORDER BY r.date DESC
        `, [id]);

        // 3. Discipline History
        const [discipline] = await pool.query(`
            SELECT *
            FROM suivieDisipline
            WHERE student_id = ?
            ORDER BY date DESC
        `, [id]);

        res.json({
            student: student[0],
            absences,
            discipline
        });
    } catch (error) {
        console.error('Error fetching student details:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.importExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Veuillez uploader un fichier Excel.' });
        }

        const { groupId, filiereId } = req.body;
        if (!groupId) {
            return res.status(400).json({ message: 'Le groupe de destination est obligatoire.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ message: 'Le fichier Excel est vide.' });
        }

        let importedCount = 0;
        let errorCount = 0;

        // Case-insensitive key retriever
        const getRowValue = (row, possibleKeys) => {
            const keys = Object.keys(row);
            for (const key of keys) {
                const cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                for (const pk of possibleKeys) {
                    const cleanPk = pk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (cleanKey === cleanPk || cleanKey.includes(cleanPk)) {
                        return row[key];
                    }
                }
            }
            return null;
        };

        for (const row of data) {
            let numInsc = getRowValue(row, ['NumInscription', 'num_inscription', 'inscription', 'id', 'matricule', 'code', 'num', 'n°']);
            let name = getRowValue(row, ['Nom Complet', 'nom_complet', 'nom complet', 'nom', 'name', 'stagiaire', 'fullname', 'prenom']);
            let tele = getRowValue(row, ['tele', 'telephone', 'phone', 'tel']);
            let cin = getRowValue(row, ['cin', 'c.i.n', 'id_card', 'c.i.n.']);

            if (numInsc) {
                numInsc = String(numInsc).trim().toUpperCase();
            } else {
                // Generate a unique NumInscription if missing
                numInsc = 'STG' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            }

            if (name) {
                name = String(name).trim();
            } else {
                errorCount++;
                continue;
            }

            try {
                // 1. Insert or Update Stagiaire (save data like the details form, using NumInscription as the generated unique key)
                const email = name.replace(/\s+/g, '').toLowerCase() + '@ofppt-edu.ma';
                await pool.query(
                    'INSERT INTO stagiaires (NumInscription, name, group_id, filiereId, tele, cin, email) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), group_id = VALUES(group_id), filiereId = VALUES(filiereId), tele = VALUES(tele), cin = VALUES(cin), email = VALUES(email)',
                    [numInsc, name, groupId, filiereId || null, tele || null, cin || null, email]
                );

                // 2. Generate QR Code (buffered stdout to avoid chunking issues)
                const qrData = {
                    Name: name,
                    Group: groupId,
                    Institute: "OFPPT ISTA",
                    Year: "2025/2026",
                    Profession: "stagiaire"
                };

                const pythonProcess = spawn('py', [
                    path.join(__dirname, '../generate_qr.py'),
                    JSON.stringify(qrData)
                ]);

                let stdoutData = '';
                pythonProcess.stdout.on('data', (data) => {
                    stdoutData += data.toString();
                });

                await new Promise((resolve) => {
                    pythonProcess.on('close', resolve);
                });

                const qrPathStr = stdoutData.trim();
                let newQrPath = '';
                if (qrPathStr) {
                    const relativePath = path.relative(path.join(__dirname, '..'), qrPathStr).replace(/\\/g, '/');
                    newQrPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
                }

                if (newQrPath) {
                    await pool.query('UPDATE stagiaires SET qr_path = ? WHERE NumInscription = ?', [newQrPath, numInsc]);
                }

                importedCount++;
            } catch (err) {
                console.error(`Error importing row ${numInsc}:`, err);
                errorCount++;
            }
        }

        res.json({
            message: 'Importation terminée.',
            summary: {
                total: data.length,
                success: importedCount,
                errors: errorCount
            }
        });

    } catch (err) {
        console.error("IMPORT EXCEL ERROR:", err);
        res.status(500).json({ message: 'Erreur lors de l\'importation du fichier Excel.' });
    }
};

const updateGroupActiveStatus = async (groupId) => {
    if (!groupId) return;
    try {
        // 1. Get the last report for this group
        const [lastReports] = await pool.query(
            'SELECT id FROM reports WHERE group_id = ? ORDER BY date DESC, created_at DESC LIMIT 1',
            [groupId]
        );

        if (lastReports.length === 0) {
            // No reports yet, so all students in the group are Active = True
            await pool.query('UPDATE stagiaires SET Active = TRUE WHERE group_id = ?', [groupId]);
            return;
        }

        const lastReportId = lastReports[0].id;

        // 2. Set all students in the group to Active = True by default
        await pool.query('UPDATE stagiaires SET Active = TRUE WHERE group_id = ?', [groupId]);

        // 3. Find all students who were ABSENT and whose absence is NOT justified (Justifier != \'JUSTIFIÉ\') in this last report
        const [inactiveStudents] = await pool.query(
            'SELECT student_id FROM report_attendance WHERE report_id = ? AND status = "ABSENT" AND Justifier != "JUSTIFIÉ"',
            [lastReportId]
        );

        if (inactiveStudents.length > 0) {
            const studentIds = inactiveStudents.map(s => s.student_id);
            await pool.query(
                'UPDATE stagiaires SET Active = FALSE WHERE NumInscription IN (?) AND group_id = ?',
                [studentIds, groupId]
            );
        }

        // 4. Automated Disciplinary Penalties Check
        const [students] = await pool.query(
            'SELECT NumInscription, name, email FROM stagiaires WHERE group_id = ?',
            [groupId]
        );

        for (const st of students) {
            // Count unjustified absences for this student
            const [[{ abs_count }]] = await pool.query(
                'SELECT COUNT(*) as abs_count FROM report_attendance WHERE student_id = ? AND status = "ABSENT" AND Justifier != "JUSTIFIÉ"',
                [st.NumInscription]
            );

            // Get existing blames
            const [blames] = await pool.query(
                'SELECT penalty_type FROM suivieDisipline WHERE student_id = ?',
                [st.NumInscription]
            );
            const blameTypes = blames.map(b => b.penalty_type);

            let newBlame = null;
            let reason = '';

            if (abs_count >= 9 && !blameTypes.includes('Blâme 3')) {
                newBlame = 'Blâme 3';
                reason = `Généré automatiquement : Seuil de ${abs_count} absences non justifiées dépassé.`;
            } else if (abs_count >= 6 && !blameTypes.includes('Blâme 2')) {
                newBlame = 'Blâme 2';
                reason = `Généré automatiquement : Seuil de ${abs_count} absences non justifiées dépassé.`;
            } else if (abs_count >= 3 && !blameTypes.includes('Blâme 1')) {
                newBlame = 'Blâme 1';
                reason = `Généré automatiquement : Seuil de ${abs_count} absences non justifiées dépassé.`;
            }

            if (newBlame) {
                // Insert blame
                await pool.query(
                    'INSERT INTO suivieDisipline (student_id, penalty_type, date, reason) VALUES (?, ?, CURDATE(), ?)',
                    [st.NumInscription, newBlame, reason]
                );

                // Send email warning to student
                const sendEmail = require('../utils/mailer');
                const stEmail = st.email || `${st.name.replace(/\s+/g, '').toLowerCase()}@ofppt-edu.ma`;
                const blameHtml = `
                    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 2rem; border-radius: 12px; background: #fff;">
                        <div style="border-bottom: 2px solid #dc2626; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                            <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 800;">AVIS DE SANCTION DISCIPLINAIRE</h2>
                            <p style="color: #6b7280; font-size: 11px; margin: 0.25rem 0 0 0;">OFPPT Smart Attendance System</p>
                        </div>
                        <p style="font-size: 14px; font-weight: 700; color: #111;">Bonjour ${st.name},</p>
                        <p style="font-size: 13px; line-height: 1.6; color: #4b5563;">
                            Nous vous informons qu'en raison de votre taux d'absentéisme élevé, l'administration de l'établissement a le regret de vous attribuer la sanction disciplinaire suivante :
                        </p>
                        <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 1.25rem; margin: 1.5rem 0; text-align: center;">
                            <span style="font-size: 20px; font-weight: 900; color: #dc2626; letter-spacing: 0.05em; display: block;">${newBlame}</span>
                            <span style="font-size: 11px; color: #7f1d1d; display: block; margin-top: 0.5rem; font-weight: 700; font-style: italic;">
                                ${reason}
                            </span>
                        </div>
                        <p style="font-size: 13px; line-height: 1.6; color: #4b5563;">
                            Nous vous rappelons que la présence à l'ensemble des cours et ateliers est obligatoire. En cas de nouvelles absences non justifiées, des mesures d'exclusion définitive seront entamées conformément au règlement intérieur des établissements de l'OFPPT.
                        </p>
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 1.5rem; text-align: right;">
                            <p style="font-size: 12px; font-weight: 700; color: #111; margin: 0;">La Direction</p>
                            <p style="font-size: 11px; color: #6b7280; margin: 0.25rem 0 0 0;">ISTA Mirleft</p>
                        </div>
                    </div>
                `;
                sendEmail({
                    to: stEmail,
                    subject: `Sanction Disciplinaire - ${newBlame} : ${st.name}`,
                    html: blameHtml
                });

                // Insert notifications for admins
                const { createNotification } = require('./notificationController');
                const [admins] = await pool.query('SELECT id FROM admins');
                for (const admin of admins) {
                    await createNotification(
                        admin.id,
                        'alert',
                        'DISCIPLINE',
                        `Pénalité automatique : ${st.name}`,
                        `Le stagiaire ${st.name} (ID: ${st.NumInscription}) s'est vu attribuer un ${newBlame} suite à ${abs_count} absences non justifiées.`
                    );
                }
            }
        }
    } catch (err) {
        console.error(`Error updating active status for group ${groupId}:`, err);
    }
};

exports.updateGroupActiveStatus = updateGroupActiveStatus;

exports.getPendingJustifications = async (req, res, next) => {
    try {
        const [requests] = await pool.query(`
            SELECT jr.id, jr.student_id, s.name as student_name, s.group_id,
                   jr.date_absence, jr.subject, jr.reason, jr.file_path, jr.status, jr.created_at
            FROM justification_requests jr
            JOIN stagiaires s ON jr.student_id = s.NumInscription
            WHERE jr.status = 'PENDING'
            ORDER BY jr.created_at DESC
        `);
        res.json({ justifications: requests });
    } catch (err) {
        console.error("GET PENDING JUSTIFICATIONS ERROR:", err);
        next(err);
    }
};

exports.reviewJustification = async (req, res, next) => {
    try {
        const { requestId, action } = req.body;
        if (!requestId || !action) {
            return res.status(400).json({ message: 'requestId et action requis.' });
        }

        // 1. Fetch justification details
        const [[request]] = await pool.query(
            'SELECT student_id, report_id, status FROM justification_requests WHERE id = ?',
            [requestId]
        );

        if (!request) {
            return res.status(404).json({ message: 'Demande de justification non trouvée.' });
        }

        if (request.status !== 'PENDING') {
            return res.status(400).json({ message: 'Cette demande a déjà été traitée.' });
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // 2. Update status in DB
        await pool.query('UPDATE justification_requests SET status = ? WHERE id = ?', [newStatus, requestId]);

        // 3. Update report_attendance record
        if (action === 'APPROVE') {
            await pool.query(
                'UPDATE report_attendance SET Justifier = "JUSTIFIÉ" WHERE student_id = ? AND report_id = ?',
                [request.student_id, request.report_id]
            );
        } else {
            await pool.query(
                'UPDATE report_attendance SET Justifier = "NON JUSTIFIÉ" WHERE student_id = ? AND report_id = ?',
                [request.student_id, request.report_id]
            );
        }

        // 4. Query student's group to update active status
        const [[student]] = await pool.query('SELECT group_id FROM stagiaires WHERE NumInscription = ?', [request.student_id]);
        if (student && student.group_id) {
            await updateGroupActiveStatus(student.group_id);
        }

        res.json({ message: `Justification ${action === 'APPROVE' ? 'approuvée' : 'rejetée'} avec succès.` });
    } catch (err) {
        console.error("REVIEW JUSTIFICATION ERROR:", err);
        next(err);
    }
};

exports.getAdminSchedule = async (req, res, next) => {
    try {
        const [slots] = await pool.query(`
            SELECT t.id, t.formateur_id, f.name as formateur_name, t.group_id, t.day, t.time, t.salle_id, s.nom as salle_name, t.subject
            FROM timetables t
            LEFT JOIN formateurs f ON t.formateur_id = f.id
            LEFT JOIN salles s ON t.salle_id = s.id
            ORDER BY FIELD(t.day, 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'), t.time ASC
        `);
        res.json({ schedule: slots });
    } catch (err) {
        console.error("GET ADMIN SCHEDULE ERROR:", err);
        next(err);
    }
};

exports.createSchedule = async (req, res, next) => {
    try {
        const { formateur_id, group_id, day, time, salle_id, subject } = req.body;

        if (!formateur_id || !group_id || !day || !time || !salle_id || !subject) {
            return res.status(400).json({ message: 'Tous les champs sont requis.' });
        }

        const parseMinutes = (tStr) => {
            const [h, m] = tStr.split(':').map(Number);
            return h * 60 + m;
        };
        
        const timeParts = time.split('-').map(tStr => tStr.trim());
        if (timeParts.length !== 2) {
            return res.status(400).json({ message: 'Format de temps invalide. Utilisez HH:MM - HH:MM' });
        }
        const [newStart, newEnd] = timeParts.map(parseMinutes);

        // Fetch existing slots on the same day for overlap checking
        const [existingSlots] = await pool.query(`
            SELECT t.id, t.formateur_id, f.name as formateur_name, t.group_id, t.time, t.salle_id, s.nom as salle_name
            FROM timetables t
            LEFT JOIN formateurs f ON t.formateur_id = f.id
            LEFT JOIN salles s ON t.salle_id = s.id
            WHERE t.day = ?
        `, [day]);

        for (const slot of existingSlots) {
            const slotParts = slot.time.split('-').map(tStr => tStr.trim());
            if (slotParts.length === 2) {
                const [start, end] = slotParts.map(parseMinutes);
                const overlaps = (newStart < end && newEnd > start);

                if (overlaps) {
                    if (Number(slot.formateur_id) === Number(formateur_id)) {
                        return res.status(400).json({ 
                            message: `Conflit Formateur : Le formateur ${slot.formateur_name} enseigne déjà au groupe ${slot.group_id} sur ce créneau (${slot.time}) !` 
                        });
                    }
                    if (Number(slot.salle_id) === Number(salle_id)) {
                        return res.status(400).json({ 
                            message: `Conflit Salle : La salle ${slot.salle_name} est déjà réservée par le groupe ${slot.group_id} sur ce créneau (${slot.time}) !` 
                        });
                    }
                    if (slot.group_id === group_id) {
                        return res.status(400).json({ 
                            message: `Conflit Groupe : Le groupe ${group_id} a déjà cours sur ce créneau (${slot.time}) !` 
                        });
                    }
                }
            }
        }

        const [result] = await pool.query(`
            INSERT INTO timetables (formateur_id, group_id, day, time, salle_id, subject)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [formateur_id, group_id, day, time, salle_id, subject]);

        res.status(201).json({ 
            message: 'Créneau ajouté avec succès.', 
            slot: { id: result.insertId, formateur_id, group_id, day, time, salle_id, subject } 
        });
    } catch (err) {
        console.error("CREATE SCHEDULE ERROR:", err);
        next(err);
    }
};

exports.updateSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { formateur_id, group_id, day, time, salle_id, subject } = req.body;

        if (!formateur_id || !group_id || !day || !time || !salle_id || !subject) {
            return res.status(400).json({ message: 'Tous les champs sont requis.' });
        }

        const parseMinutes = (tStr) => {
            const [h, m] = tStr.split(':').map(Number);
            return h * 60 + m;
        };

        const timeParts = time.split('-').map(tStr => tStr.trim());
        if (timeParts.length !== 2) {
            return res.status(400).json({ message: 'Format de temps invalide. Utilisez HH:MM - HH:MM' });
        }
        const [newStart, newEnd] = timeParts.map(parseMinutes);

        const [existingSlots] = await pool.query(`
            SELECT t.id, t.formateur_id, f.name as formateur_name, t.group_id, t.time, t.salle_id, s.nom as salle_name
            FROM timetables t
            LEFT JOIN formateurs f ON t.formateur_id = f.id
            LEFT JOIN salles s ON t.salle_id = s.id
            WHERE t.day = ? AND t.id != ?
        `, [day, id]);

        for (const slot of existingSlots) {
            const slotParts = slot.time.split('-').map(tStr => tStr.trim());
            if (slotParts.length === 2) {
                const [start, end] = slotParts.map(parseMinutes);
                const overlaps = (newStart < end && newEnd > start);

                if (overlaps) {
                    if (Number(slot.formateur_id) === Number(formateur_id)) {
                        return res.status(400).json({ 
                            message: `Conflit Formateur : Le formateur ${slot.formateur_name} enseigne déjà au groupe ${slot.group_id} sur ce créneau (${slot.time}) !` 
                        });
                    }
                    if (Number(slot.salle_id) === Number(salle_id)) {
                        return res.status(400).json({ 
                            message: `Conflit Salle : La salle ${slot.salle_name} est déjà réservée par le groupe ${slot.group_id} sur ce créneau (${slot.time}) !` 
                        });
                    }
                    if (slot.group_id === group_id) {
                        return res.status(400).json({ 
                            message: `Conflit Groupe : Le groupe ${group_id} a déjà cours sur ce créneau (${slot.time}) !` 
                        });
                    }
                }
            }
        }

        await pool.query(`
            UPDATE timetables 
            SET formateur_id = ?, group_id = ?, day = ?, time = ?, salle_id = ?, subject = ?
            WHERE id = ?
        `, [formateur_id, group_id, day, time, salle_id, subject, id]);

        res.json({ message: 'Créneau modifié avec succès.' });
    } catch (err) {
        console.error("UPDATE SCHEDULE ERROR:", err);
        next(err);
    }
};

exports.deleteSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM timetables WHERE id = ?', [id]);
        res.json({ message: 'Créneau supprimé avec succès.' });
    } catch (err) {
        console.error("DELETE SCHEDULE ERROR:", err);
        next(err);
    }
};
