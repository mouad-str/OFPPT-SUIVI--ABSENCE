const pool = require('../config/db');
const { sendMail } = require('./mailer');

const runWeeklyReport = async () => {
    try {
        console.log('[SCHEDULER] Running weekly executive report compilation...');

        // 1. Gather stats
        const [[{ total_students }]] = await pool.query('SELECT COUNT(*) as total_students FROM stagiaires');
        const [[{ total_groups }]] = await pool.query('SELECT COUNT(*) as total_groups FROM groups');

        // Stats this week
        const [[{ reports_this_week }]] = await pool.query(`
            SELECT COUNT(*) as reports_this_week 
            FROM reports 
            WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `);

        // Total Expected Sessions vs Absences this week
        const [[{ total_expected_sessions }]] = await pool.query(`
            SELECT SUM(g_count.cnt) as total_expected_sessions
            FROM reports r
            JOIN (SELECT group_id, COUNT(*) as cnt FROM stagiaires GROUP BY group_id) as g_count ON r.group_id = g_count.group_id
            WHERE r.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `);

        const [[{ absences_this_week }]] = await pool.query(`
            SELECT COUNT(*) as absences_this_week
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            WHERE ra.status = 'ABSENT' AND r.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `);

        const [[{ lates_this_week }]] = await pool.query(`
            SELECT COUNT(*) as lates_this_week
            FROM report_attendance ra
            JOIN reports r ON ra.report_id = r.id
            WHERE ra.status = 'LATE' AND r.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `);

        const weeklyPresenceRate = total_expected_sessions > 0
            ? Math.round(((total_expected_sessions - absences_this_week) / total_expected_sessions) * 100)
            : 100;

        // Top 3 absent groups this week
        const [topAbsentGroups] = await pool.query(`
            SELECT r.group_id, 
                   COUNT(CASE WHEN ra.status = 'ABSENT' THEN 1 END) as total_absences,
                   ROUND((COUNT(CASE WHEN ra.status = 'ABSENT' THEN 1 END) / (COUNT(DISTINCT r.id) * IFNULL(g_count.cnt, 1))) * 100) as absence_rate
            FROM reports r
            LEFT JOIN report_attendance ra ON r.id = ra.report_id
            LEFT JOIN (SELECT group_id, COUNT(*) as cnt FROM stagiaires GROUP BY group_id) as g_count ON r.group_id = g_count.group_id
            WHERE r.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY r.group_id
            ORDER BY total_absences DESC
            LIMIT 3
        `);

        // New discipline warnings issued this week
        const [warnings] = await pool.query(`
            SELECT s.name as student_name, s.group_id, sd.penalty_type, sd.reason, sd.created_at
            FROM suivieDisipline sd
            JOIN stagiaires s ON sd.stagiaire_id = s.NumInscription
            WHERE sd.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY sd.created_at DESC
        `);

        // 2. Compile HTML content
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Rapport Hebdomadaire d'Assiduité</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 0; }
                    .wrapper { max-width: 600px; margin: 2rem auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
                    .header { background: linear-gradient(135deg, #0A5593, #084373); color: white; padding: 2.5rem; text-align: center; }
                    .header h1 { margin: 0; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
                    .header p { margin: 0.5rem 0 0 0; font-size: 13px; opacity: 0.8; }
                    .content { padding: 2.5rem; }
                    .section-title { font-size: 14px; font-weight: 800; text-transform: uppercase; color: #0a5593; margin-bottom: 1rem; border-bottom: 2px solid #f3f4f6; padding-bottom: 0.5rem; }
                    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem; }
                    .stat-card { background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 12px; padding: 1.25rem; text-align: center; }
                    .stat-value { font-size: 24px; font-weight: 800; color: #00875a; display: block; }
                    .stat-value.red { color: #dc2626; }
                    .stat-value.orange { color: #f59e0b; }
                    .stat-label { font-size: 11px; color: #6b7280; font-weight: 700; text-transform: uppercase; margin-top: 0.25rem; }
                    .table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
                    .table th { background-color: #f9fafb; padding: 0.75rem 1rem; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4b5563; border-bottom: 1px solid #e5e7eb; }
                    .table td { padding: 0.75rem 1rem; font-size: 12px; border-bottom: 1px solid #f3f4f6; color: #4b5563; }
                    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
                    .badge.red { background-color: #fee2e2; color: #dc2626; }
                    .badge.orange { background-color: #fef3c7; color: #d97706; }
                    .footer { background-color: #f9fafb; padding: 1.5rem; text-align: center; border-top: 1px solid #f3f4f6; font-size: 11px; color: #9ca3af; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header">
                        <h1>ISTA MIRLEFT</h1>
                        <p>Rapport d'Assiduité Hebdomadaire · Synthèse Exécutive</p>
                    </div>
                    <div class="content">
                        <div class="section-title">Performances Clés de la Semaine</div>
                        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="stat-card" style="flex: 1; text-align: center; background-color: #f9fafb; padding: 1.25rem; border-radius: 12px;">
                                <span class="stat-value" style="font-size: 24px; font-weight: 800; color: ${weeklyPresenceRate < 90 ? '#dc2626' : '#00875a'}; display: block;">${weeklyPresenceRate}%</span>
                                <span class="stat-label" style="font-size: 10px; color: #6b7280; font-weight: bold;">Taux de présence global</span>
                            </div>
                            <div class="stat-card" style="flex: 1; text-align: center; background-color: #f9fafb; padding: 1.25rem; border-radius: 12px;">
                                <span class="stat-value" style="font-size: 24px; font-weight: 800; color: #f59e0b; display: block;">${lates_this_week}</span>
                                <span class="stat-label" style="font-size: 10px; color: #6b7280; font-weight: bold;">Retards enregistrés</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                            <div class="stat-card" style="flex: 1; text-align: center; background-color: #f9fafb; padding: 1.25rem; border-radius: 12px;">
                                <span class="stat-value" style="font-size: 24px; font-weight: 800; color: #dc2626; display: block;">${absences_this_week}</span>
                                <span class="stat-label" style="font-size: 10px; color: #6b7280; font-weight: bold;">Absences non justifiées</span>
                            </div>
                            <div class="stat-card" style="flex: 1; text-align: center; background-color: #f9fafb; padding: 1.25rem; border-radius: 12px;">
                                <span class="stat-value" style="font-size: 24px; font-weight: 800; color: #0A5593; display: block;">${reports_this_week}</span>
                                <span class="stat-label" style="font-size: 10px; color: #6b7280; font-weight: bold;">Rapports soumis</span>
                            </div>
                        </div>

                        <div class="section-title">Classes avec le plus d'absences</div>
                        ${topAbsentGroups.length > 0 ? `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Groupe</th>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Total Absences</th>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Taux d'Absence</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${topAbsentGroups.map(grp => `
                                        <tr>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;"><strong>${grp.group_id}</strong></td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${grp.total_absences} absences(s)</td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; color: #dc2626; font-weight: bold;">${grp.absence_rate}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p style="font-size: 12px; color: #9ca3af; font-style: italic; margin-bottom: 2rem;">Aucune absence à signaler.</p>'}

                        <div class="section-title">Pénalités Disciplinaires de la Semaine</div>
                        ${warnings.length > 0 ? `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Stagiaire</th>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Groupe</th>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Type</th>
                                        <th style="border-bottom: 2px solid #e5e7eb; padding: 0.75rem; text-align: left;">Motif</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${warnings.map(w => `
                                        <tr>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;"><strong>${w.student_name}</strong></td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${w.group_id}</td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;"><span class="badge ${w.penalty_type.includes('Blâme') ? 'red' : 'orange'}" style="padding: 0.25rem 0.5rem; font-size: 10px; font-weight: bold; border-radius: 6px; text-transform: uppercase; background-color: ${w.penalty_type.includes('Blâme') ? '#fee2e2' : '#fef3c7'}; color: ${w.penalty_type.includes('Blâme') ? '#dc2626' : '#d97706'}">${w.penalty_type}</span></td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${w.reason}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p style="font-size: 12px; color: #9ca3af; font-style: italic;">Aucune pénalité émise cette semaine.</p>'}
                    </div>
                    <div class="footer" style="background-color: #f9fafb; padding: 1.5rem; text-align: center; border-top: 1px solid #f3f4f6; font-size: 11px; color: #9ca3af;">
                        <p style="margin: 0;">Système de Suivi Intelligent des Présences OFPPT</p>
                        <p style="font-size: 10px; margin: 0.25rem 0 0 0;">Généré automatiquement le ${new Date().toLocaleDateString('fr-FR')}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 3. Query admin emails and send reports
        const [admins] = await pool.query('SELECT email FROM admins');
        for (const admin of admins) {
            console.log(`[SCHEDULER] Sending weekly report to: ${admin.email}`);
            await sendMail({
                to: admin.email,
                subject: `[Assiduité] Rapport Hebdomadaire ISTA Mirleft - ${new Date().toLocaleDateString('fr-FR')}`,
                html
            });
        }
        console.log('[SCHEDULER] Weekly report sent successfully.');
    } catch (err) {
        console.error('[SCHEDULER] ERROR compiling weekly report:', err);
    }
};

// Start scheduler background loop checking once per minute
const startScheduler = () => {
    console.log('[SCHEDULER] Automated scheduler background thread started successfully.');
    setInterval(() => {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Target: Friday 18:00
        if (day === 5 && hours === 18 && minutes === 0) {
            runWeeklyReport();
        }
    }, 60000); // Check once per minute
};

module.exports = {
    startScheduler,
    runWeeklyReport
};
