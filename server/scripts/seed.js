const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ofppt_attendance',
    multipleStatements: true
};

async function seedDatabase() {
    console.log('🚀 Starting OFPPT Smart Attendance Database Seeder...\n');

    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        console.log(`✅ Connected to MySQL database "${DB_CONFIG.database}".`);
    } catch (err) {
        console.error('❌ Could not connect to database. Make sure MySQL (XAMPP/WAMP) is running.');
        console.error(err.message);
        process.exit(1);
    }

    try {
        console.log('🧹 Preparing tables and synchronizing schema...');

        // Disable foreign keys temporarily
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

        // Clear existing demo data
        const tablesToTruncate = [
            'suivieDisipline', 'report_attendance', 'active_checkins', 
            'notifications', 'reports', 'groups_supervisors', 'group_salles', 
            'timetables', 'stagiaires', 'groups', 'formateurs', 'admins', 'salles', 'filiere'
        ];

        for (const table of tablesToTruncate) {
            try {
                await connection.query(`TRUNCATE TABLE ${table};`);
            } catch (e) {
                // Table might not exist yet
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
        console.log('✅ Previous demo data cleared.\n');

        // 1. Seed Filières
        console.log('🏢 Seeding Filières...');
        const filieres = [
            'Développement Digital (Tronc Commun)',
            'Développement Digital Option Fullstack',
            'Infrastructure Digitale',
            'Gestion des Entreprises'
        ];
        const filiereIds = {};
        for (const fNom of filieres) {
            const [res] = await connection.query('INSERT INTO filiere (nom) VALUES (?)', [fNom]);
            filiereIds[fNom] = res.insertId;
        }
        console.log(`   Created ${filieres.length} filières.`);

        // 2. Seed Salles
        console.log('🏫 Seeding Salles (Classrooms & Labs)...');
        const salles = [
            'Lab Info 1', 'Lab Info 2', 'Lab Réseau 1', 
            'Salle 101', 'Salle 102', 'Amphi A'
        ];
        const salleIds = {};
        for (const sNom of salles) {
            const [res] = await connection.query('INSERT INTO salles (nom) VALUES (?)', [sNom]);
            salleIds[sNom] = res.insertId;
        }
        console.log(`   Created ${salles.length} salles.`);

        // 3. Seed Groups
        console.log('👥 Seeding Groups (Classes)...');
        const groupsData = [
            { id: 'DEV101', filiere: 'Développement Digital (Tronc Commun)', year: '2025/2026' },
            { id: 'DEV102', filiere: 'Développement Digital Option Fullstack', year: '2025/2026' },
            { id: 'ID101', filiere: 'Infrastructure Digitale', year: '2025/2026' },
            { id: 'GE101', filiere: 'Gestion des Entreprises', year: '2025/2026' }
        ];

        for (const g of groupsData) {
            const fId = filiereIds[g.filiere];
            await connection.query(
                'INSERT INTO groups (id, filiereId, annee_scolaire) VALUES (?, ?, ?)',
                [g.id, fId, g.year]
            );
        }
        console.log(`   Created ${groupsData.length} groups.`);

        // 4. Seed Admins & Formateurs
        console.log('👨‍🏫 Seeding Admins & Formateurs...');
        const adminHash = await bcrypt.hash('admin123', 10);
        const formateurHash = await bcrypt.hash('formateur123', 10);

        // Admin
        await connection.query(
            'INSERT INTO admins (name, email, password) VALUES (?, ?, ?)',
            ['Administration ISTA', 'admin@ofppt.ma', adminHash]
        );

        // Formateurs
        const formateursData = [
            { name: 'Mohammed Alami', email: 'alami.mohammed@ofppt.ma', type: 'Parrain' },
            { name: 'Fatima Bennani', email: 'bennani.fatima@ofppt.ma', type: 'Parrain' },
            { name: 'Yassine Tahiri', email: 'tahiri.yassine@ofppt-edu.ma', type: 'Vacataire' },
            { name: 'Salma Chraibi', email: 'chraibi.salma@ofppt.ma', type: 'Parrain' }
        ];

        const formateurIds = {};
        for (const f of formateursData) {
            const [res] = await connection.query(
                'INSERT INTO formateurs (name, email, password, type, first_login) VALUES (?, ?, ?, ?, 0)',
                [f.name, f.email, formateurHash, f.type]
            );
            formateurIds[f.name] = res.insertId;
        }

        // Link group supervisors
        await connection.query('INSERT INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', ['DEV101', formateurIds['Mohammed Alami']]);
        await connection.query('INSERT INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', ['DEV102', formateurIds['Fatima Bennani']]);
        await connection.query('INSERT INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', ['ID101', formateurIds['Yassine Tahiri']]);
        await connection.query('INSERT INTO groups_supervisors (group_id, formateur_id) VALUES (?, ?)', ['GE101', formateurIds['Salma Chraibi']]);

        console.log('   Created 1 Admin & 4 Formateurs.');

        // 5. Seed Stagiaires (Students)
        console.log('🎓 Seeding Stagiaires (Students & QR Paths)...');
        const studentsList = [
            // DEV101
            { id: 'STG2026001', name: 'Amine El Fassi', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026002', name: 'Sara Mansouri', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026003', name: 'Mehdi Benkirane', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026004', name: 'Hajar Tazi', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026005', name: 'Omar Berrada', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026006', name: 'Kawtar Naciri', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026007', name: 'Youssef Chaoui', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026008', name: 'Imane Slaoui', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026009', name: 'Hamza Idrissi', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },
            { id: 'STG2026010', name: 'Nour El Houda', group: 'DEV101', filiere: 'Développement Digital (Tronc Commun)' },

            // DEV102
            { id: 'STG2026011', name: 'Reda Bouazza', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026012', name: 'Salma El Amrani', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026013', name: 'Othmane Bennis', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026014', name: 'Meryem Kabbaj', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026015', name: 'Karim Zouheir', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026016', name: 'Chaimae Lahlou', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026017', name: 'Walid Filali', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },
            { id: 'STG2026018', name: 'Zineb Doukkali', group: 'DEV102', filiere: 'Développement Digital Option Fullstack' },

            // ID101
            { id: 'STG2026019', name: 'Ayoub Sabri', group: 'ID101', filiere: 'Infrastructure Digitale' },
            { id: 'STG2026020', name: 'Ghita Kadiri', group: 'ID101', filiere: 'Infrastructure Digitale' },
            { id: 'STG2026021', name: 'Anas Mezouar', group: 'ID101', filiere: 'Infrastructure Digitale' },
            { id: 'STG2026022', name: 'Kenza Senhaji', group: 'ID101', filiere: 'Infrastructure Digitale' },
            { id: 'STG2026023', name: 'Nabil Radi', group: 'ID101', filiere: 'Infrastructure Digitale' },
            { id: 'STG2026024', name: 'Safae Ouazzani', group: 'ID101', filiere: 'Infrastructure Digitale' },

            // GE101
            { id: 'STG2026025', name: 'Tarik Jazouli', group: 'GE101', filiere: 'Gestion des Entreprises' },
            { id: 'STG2026026', name: 'Nouhaila Chami', group: 'GE101', filiere: 'Gestion des Entreprises' },
            { id: 'STG2026027', name: 'Soufiane Guessous', group: 'GE101', filiere: 'Gestion des Entreprises' },
            { id: 'STG2026028', name: 'Asmaa El Alami', group: 'GE101', filiere: 'Gestion des Entreprises' },
            { id: 'STG2026029', name: 'Badr Benjelloun', group: 'GE101', filiere: 'Gestion des Entreprises' },
            { id: 'STG2026030', name: 'Rania El Khalifi', group: 'GE101', filiere: 'Gestion des Entreprises' }
        ];

        for (const st of studentsList) {
            const fId = filiereIds[st.filiere];
            const safeName = st.name.replace(/ /g, '_').toUpperCase();
            const qrPath = `/uploads/Qr_Id/${st.group}/QR_${safeName}.png`;

            await connection.query(
                `INSERT INTO stagiaires (NumInscription, name, group_id, filiereId, Active, qr_path)
                 VALUES (?, ?, ?, ?, 1, ?)`,
                [st.id, st.name, st.group, fId, qrPath]
            );
        }
        console.log(`   Created ${studentsList.length} Stagiaires.`);

        // 6. Seed Timetables (Emploi du Temps)
        console.log('📅 Seeding Weekly Schedules...');
        const timetablesData = [
            // DEV101
            { f: 'Mohammed Alami', g: 'DEV101', day: 'LUNDI', time: '08:30 - 11:30', s: 'Lab Info 1', subj: 'HTML5 / CSS3 & Responsive Design' },
            { f: 'Mohammed Alami', g: 'DEV101', day: 'LUNDI', time: '11:30 - 14:30', s: 'Lab Info 1', subj: 'JavaScript Moderne ES6+' },
            { f: 'Fatima Bennani', g: 'DEV101', day: 'MARDI', time: '08:30 - 11:30', s: 'Lab Info 2', subj: 'Bases de Données MySQL' },
            { f: 'Fatima Bennani', g: 'DEV101', day: 'MERCREDI', time: '14:30 - 17:30', s: 'Lab Info 1', subj: 'Algorithmique & Structures de Données' },
            { f: 'Yassine Tahiri', g: 'DEV101', day: 'JEUDI', time: '08:30 - 11:30', s: 'Salle 101', subj: 'Communication Professionnelle' },
            { f: 'Mohammed Alami', g: 'DEV101', day: 'VENDREDI', time: '08:30 - 11:30', s: 'Lab Info 1', subj: 'Atelier Pratique & Mini-Projet' },

            // DEV102
            { f: 'Fatima Bennani', g: 'DEV102', day: 'LUNDI', time: '14:30 - 17:30', s: 'Lab Info 2', subj: 'React.js & Architecture Frontend' },
            { f: 'Mohammed Alami', g: 'DEV102', day: 'MARDI', time: '11:30 - 14:30', s: 'Lab Info 1', subj: 'Node.js & API REST Express' },
            { f: 'Fatima Bennani', g: 'DEV102', day: 'JEUDI', time: '08:30 - 11:30', s: 'Lab Info 2', subj: 'Sécurité Web & Authentification JWT' },

            // ID101
            { f: 'Yassine Tahiri', g: 'ID101', day: 'LUNDI', time: '08:30 - 11:30', s: 'Lab Réseau 1', subj: 'Réseaux & Adressage IP' },
            { f: 'Yassine Tahiri', g: 'ID101', day: 'MERCREDI', time: '08:30 - 11:30', s: 'Lab Réseau 1', subj: 'Administration Linux / Windows Server' },

            // GE101
            { f: 'Salma Chraibi', g: 'GE101', day: 'MARDI', time: '08:30 - 11:30', s: 'Salle 102', subj: 'Comptabilité Générale' },
            { f: 'Salma Chraibi', g: 'GE101', day: 'JEUDI', time: '14:30 - 17:30', s: 'Salle 102', subj: 'Management & Droit des Affaires' }
        ];

        for (const t of timetablesData) {
            await connection.query(
                `INSERT INTO timetables (formateur_id, group_id, day, time, salle_id, subject)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [formateurIds[t.f], t.g, t.day, t.time, salleIds[t.s], t.subj]
            );
        }
        console.log(`   Created ${timetablesData.length} weekly timetable slots.`);

        // 7. Seed Past Reports & Attendance Matrix
        console.log('📝 Seeding Past Session Reports & Attendance Records...');
        const reportsData = [
            { code: 'REP-DEV101-01', f: 'Mohammed Alami', g: 'DEV101', date: '2026-08-03', subj: 'HTML5 & CSS3 Layouts', salle: 'Lab Info 1', heure: '08:30 - 11:30' },
            { code: 'REP-DEV101-02', f: 'Mohammed Alami', g: 'DEV101', date: '2026-08-05', subj: 'JavaScript Fonctions & DOM', salle: 'Lab Info 1', heure: '11:30 - 14:30' },
            { code: 'REP-DEV101-03', f: 'Fatima Bennani', g: 'DEV101', date: '2026-08-10', subj: 'MySQL Requêtes & Jointures', salle: 'Lab Info 2', heure: '08:30 - 11:30' },
            { code: 'REP-DEV101-04', f: 'Mohammed Alami', g: 'DEV101', date: '2026-08-12', subj: 'JavaScript Async / Fetch API', salle: 'Lab Info 1', heure: '11:30 - 14:30' },
            { code: 'REP-DEV101-05', f: 'Fatima Bennani', g: 'DEV101', date: '2026-08-17', subj: 'Projet d\'évaluation JavaScript', salle: 'Lab Info 1', heure: '08:30 - 11:30' },
            { code: 'REP-DEV101-06', f: 'Mohammed Alami', g: 'DEV101', date: '2026-08-19', subj: 'Atelier Intégration Web', salle: 'Lab Info 1', heure: '08:30 - 11:30' },

            { code: 'REP-DEV102-01', f: 'Fatima Bennani', g: 'DEV102', date: '2026-08-04', subj: 'React Hooks & State', salle: 'Lab Info 2', heure: '14:30 - 17:30' },
            { code: 'REP-DEV102-02', f: 'Mohammed Alami', g: 'DEV102', date: '2026-08-11', subj: 'Node.js Express Routing', salle: 'Lab Info 1', heure: '11:30 - 14:30' },

            { code: 'REP-ID101-01', f: 'Yassine Tahiri', g: 'ID101', date: '2026-08-05', subj: 'Routage Statique & VLAN', salle: 'Lab Réseau 1', heure: '08:30 - 11:30' },
            { code: 'REP-GE101-01', f: 'Salma Chraibi', g: 'GE101', date: '2026-08-06', subj: 'Bilan & Compte de Résultat', salle: 'Salle 102', heure: '08:30 - 11:30' }
        ];

        for (const rep of reportsData) {
            const [rRes] = await connection.query(
                `INSERT INTO reports (report_code, formateur_id, group_id, date, subject, salleId, heure)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [rep.code, formateurIds[rep.f], rep.g, rep.date, rep.subj, salleIds[rep.salle], rep.heure]
            );
            const reportId = rRes.insertId;

            // Generate realistic absences for DEV101 reports
            if (rep.g === 'DEV101') {
                if (rep.code === 'REP-DEV101-01') {
                    // STG2026003 absent non justifié, STG2026005 late
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026003', 'ABSENT', 'ABSENCE')", [reportId]);
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026005', 'LATE', 'ABSENCE')", [reportId]);
                } else if (rep.code === 'REP-DEV101-02') {
                    // STG2026003 absent justifié
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026003', 'ABSENT', 'JUSTIFIÉ')", [reportId]);
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026008', 'ABSENT', 'ABSENCE')", [reportId]);
                } else if (rep.code === 'REP-DEV101-03') {
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026007', 'ABSENT', 'ABSENCE')", [reportId]);
                } else if (rep.code === 'REP-DEV101-04') {
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026003', 'ABSENT', 'ABSENCE')", [reportId]);
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026007', 'LATE', 'ABSENCE')", [reportId]);
                } else if (rep.code === 'REP-DEV101-05') {
                    await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026003', 'ABSENT', 'ABSENCE')", [reportId]);
                }
            } else if (rep.g === 'DEV102') {
                await connection.query("INSERT INTO report_attendance (report_id, student_id, status, Justifier) VALUES (?, 'STG2026013', 'ABSENT', 'ABSENCE')", [reportId]);
            }
        }
        console.log(`   Created ${reportsData.length} session reports with attendance logs.`);

        // 8. Seed Sample Discipline Records
        console.log('⚖️ Seeding Discipline Records (Blâmes)...');
        await connection.query(
            `INSERT INTO suivieDisipline (student_id, penalty_type, date, reason)
             VALUES ('STG2026003', 'Blâme 1', '2026-08-15', 'Cumul de plus de 12 heures d\\'absences non justifiées.')`
        );
        await connection.query(
            `INSERT INTO suivieDisipline (student_id, penalty_type, date, reason)
             VALUES ('STG2026013', 'Blâme 1', '2026-08-18', 'Retards répétés et absence au contrôle continu.')`
        );
        console.log('   Created 2 sample discipline notices.');

        // 9. Seed Sample Notifications
        console.log('🔔 Seeding System Notifications...');
        const adminId = 1;
        await connection.query(
            `INSERT INTO notifications (user_id, type, category, title, message, is_read)
             VALUES (?, 'alert', 'DISCIPLINE', 'Seuil d\\'absence dépassé - DEV101', 'Le stagiaire Mehdi Benkirane (STG2026003) a atteint 3 absences non justifiées ce mois.', 0)`,
            [adminId]
        );
        await connection.query(
            `INSERT INTO notifications (user_id, type, category, title, message, is_read)
             VALUES (?, 'message', 'SYSTEM', 'Bienvenue sur la plateforme', 'La base de données et les données de démonstration ont été synchronisées.', 1)`,
            [adminId]
        );

        console.log('\n========================================================');
        console.log('🎉 DEMO DATABASE SEEDED SUCCESSFULLY!');
        console.log('========================================================');
        console.log('🔑 Credentials to Log in:');
        console.log('   👨‍💼 Admin:     admin@ofppt.ma / admin123');
        console.log('   👨‍🏫 Formateur: alami.mohammed@ofppt.ma / formateur123');
        console.log('   🎓 Stagiaire: Look up with NumInscription: STG2026001, STG2026003');
        console.log('========================================================\n');

    } catch (err) {
        console.error('❌ Error during seeding:', err);
    } finally {
        if (connection) await connection.end();
        process.exit(0);
    }
}

seedDatabase();
