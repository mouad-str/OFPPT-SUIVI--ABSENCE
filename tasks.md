# Project Tasks & Updates Checklist

## 🗄️ Database Changes & Refactoring

### 1. User & Authentication Refactor
- [x] **1. User Table Split**:
    - [x] Separate `users` table into `admins` and `formateurs`
    - [x] Update database schema and foreign keys (Reports, Timetable, etc.)
- [x] **2. Security & Profiles**:
    - [x] Remove unused `image` field from admin and formateur profiles
    - [x] Update auth logic to handle multi-table authentication

### 2. Formateur Management
- [x] **3. Formateur Type**:
    - [x] Add `type` (Parrain or Vacataire)
    - [x] Logic for Vacataire: manually enter email address
    - [x] Email suggestion: `(name)@ofppt-edu.ma` for vacataire

### 3. Classes Management
- [x] **4. Classes table**:
    - [x] replace `stream` by option 
    - [x] Add `année_scolaire`
    - [x] Add `level` (1er, 2eme, 3eme formation)
    - [x] Logic: recreate classes list each year (default no stagiaires, updated year)

### 4. Stagiaire (Student) Updates
- [x] **5. Stagiaire Refactor**:
    - [x] Rename `id` to `NumInscription`
    - [x] Remove `institu` 
    - [x] replace `year` by `Année` (1er, 2eme, 3eme formation)
    - [x] Add `filiéreId` (FK)
    - [x] Add `optionId` (FK to `options` table) - *only if year is 2ème or 3ème*
    - [x] Add `Active` (boolean):
        - [x] *Logic: True if present last session OR absent and justified*

### 5. New Infrastructure Tables
- [x] **6. New Tables**:
    - [x] Table `filiére` (id, nom, niveau)
    - [x] Table `option` (id, filiéreId FK, nom, niveau)
- [x] **7. Salles (Rooms)**:
    - [x] Table `salles` (Id, nom)

### 6. Attendance & Reporting
- [x] **7. Report Table**: Add `sallID` (FK to `salles`)
- [x] **8. Repport_attendence Table**: Add `Justifier` (boolean)

## 🚀 7. New Evolution Tasks
- [x] **Data Model Simplification**:
    - [x] Delete `options` table; merge logic directly under `filiére` (Major per year)
- [x] **UX Polish**:
    - [x] Update time-selection interface to use **Selectors** instead of manual text input for precision
- [x] **Discipline Hub**:
    - [x] Create `suivieDisipline` table (ID, student_id, penalty_type, date, reason)
    - [x] Implement Admin UI to assign penalties: "Blame 1", "Blame 2", "Blame 3"
- [x] **Attendance Analytics**:
    - [x] Develop a counter for student absences to allow administrators to monitor attendance levels at a glance
- [x] **Attendance Logic Optimization**:
    - [x] Modify `report_attendance` logic to **only save `ABSENT` and `LATE`** states. (Students with no entry = `PRESENT` by default).
    - [x] Update `status` ENUM to include: `PRESENT`, `ABSENT`, `LATE`.
- [x] **Administrative Absence Workflow**:
    - [x] Create an **Absence Registry View** for administrators to monitor all absences reported by formateurs.
    - [x] Implement Admin actions for absences:
        - [x] **Justify**: Mark absence as "Absent Justifié" (Equivalent to `PRESENT`).
        - [x] **Correct**: Change "Absent" back to **`PRESENT`** (Delete the entry).
        - [x] **Penalize**: Directly assign a "Blame" (`suivieDisipline`) while reviewing the absence.
- [x] **🎓 Student Portal & Digital QR Badge**:
    - [x] Create dedicated public student portal (`/student/portal`) with lookup by `NumInscription` / CEF.
    - [x] Display real-time attendance rate gauge, total hours, breakdown of absences, discipline warnings, and group timetable.
    - [x] Integrated official OFPPT digital ID card with downloadable (PNG) and printable live QR badge.
    - [x] Online absence justification upload modal with medical / administrative certificate attachments.
- [x] **📊 Advanced OFPPT Reports & Monthly Absence Matrix**:
    - [x] Develop Monthly Attendance Matrix API and UI mapping daily presence/absence status (days 1-31).
    - [x] Export official multi-group OFPPT Excel reports (`.xlsx`) with automated formulas and attendance percentages.
    - [x] Official A4 Landscape printable OFPPT template (`/admin/print-monthly-matrix/:groupId`) with signature blocks for Formateur, Surveillance Générale, and Direction.
- [x] **📥 Batch Multi-Group Excel Importer**:
    - [x] Standardized OFPPT Excel template generator (`Modele_Import_Stagiaires_OFPPT.xlsx`).
    - [x] Drag-and-drop Excel parser with pre-import validation and live table preview.
    - [x] Automatic multi-group and multi-filière creation with background Python QR badge generation.
- [x] **🌱 One-Click Demo Database Seeder (`npm run seed`)**:
    - [x] Complete seeder script (`server/scripts/seed.js`) generating realistic OFPPT filières, salles, groups, formateurs, 30+ students, and past session reports.
- [x] **📱 Enhanced Scanner UX & Web Audio Feedback**:
    - [x] Native Web Audio API synthesizer chimes (`playSuccessChime`, `playWarningBeep`, `playErrorBuzzer`) with mute toggle.
    - [x] Continuous fast-scan mode with reduced debounce for classroom queue flow.
    - [x] Full-screen visual edge micro-flash (emerald/amber/red).
    - [x] Real-time live presence progress gauge with instant manual toggle.


