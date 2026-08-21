import React, { useState, useEffect } from 'react';
import { 
    Search, User, Calendar, Clock, AlertTriangle, ShieldCheck, CheckCircle2, 
    XCircle, FileText, Upload, Download, Printer, ArrowLeft, RefreshCw, 
    BookOpen, Layers, Award, Info, ChevronRight, X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import studentPortalService from '../../../services/studentPortalService';
import ofpptLogo from '../../../assets/OFPPT.png';
import './StudentPortal.css';

const StudentPortal = () => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [portalData, setPortalData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'absences' | 'discipline' | 'timetable'

    // Justification upload modal state
    const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
    const [selectedAbsence, setSelectedAbsence] = useState(null);
    const [justificationFile, setJustificationFile] = useState(null);
    const [justificationReason, setJustificationReason] = useState('');
    const [uploading, setUploading] = useState(false);
    const [modalSuccess, setModalSuccess] = useState('');
    const [modalError, setModalError] = useState('');

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        setLoading(true);
        setError('');
        try {
            const data = await studentPortalService.lookup(query);
            setPortalData(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Stagiaire introuvable. Veuillez vérifier votre identifiant.');
            setPortalData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        if (!portalData?.student?.NumInscription) return;
        setLoading(true);
        try {
            const data = await studentPortalService.lookup(portalData.student.NumInscription);
            setPortalData(data);
        } catch (err) {
            console.error('Refresh error', err);
        } finally {
            setLoading(false);
        }
    };

    const openJustifyModal = (absence) => {
        setSelectedAbsence(absence);
        setJustificationFile(null);
        setJustificationReason('');
        setModalSuccess('');
        setModalError('');
        setIsJustifyModalOpen(true);
    };

    const handleJustifySubmit = async (e) => {
        e.preventDefault();
        if (!justificationFile || !selectedAbsence) {
            setModalError('Veuillez joindre une pièce justificative (image ou PDF).');
            return;
        }

        setUploading(true);
        setModalError('');
        setModalSuccess('');

        const formData = new FormData();
        formData.append('studentId', portalData.student.NumInscription);
        formData.append('absenceId', selectedAbsence.absence_id);
        formData.append('reason', justificationReason);
        formData.append('file', justificationFile);

        try {
            const res = await studentPortalService.submitJustification(formData);
            setModalSuccess(res.message || 'Justificatif transmis avec succès.');
            setTimeout(() => {
                setIsJustifyModalOpen(false);
                handleRefresh();
            }, 1200);
        } catch (err) {
            setModalError(err.response?.data?.message || 'Erreur lors de la soumission du justificatif.');
        } finally {
            setUploading(false);
        }
    };

    const handlePrintBadge = () => {
        window.print();
    };

    const handleDownloadBadge = () => {
        const qrUrl = portalData?.qr?.qr_path || (portalData?.student?.qr_path ? (portalData.student.qr_path.startsWith('/') ? portalData.student.qr_path : `/${portalData.student.qr_path}`) : null);
        if (!qrUrl) return;

        const link = document.createElement('a');
        link.href = qrUrl;
        link.download = `Badge_QR_${portalData.student.NumInscription}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const student = portalData?.student;
    const stats = portalData?.stats || {};
    const absences = portalData?.absences || [];
    const discipline = portalData?.discipline || [];
    const timetable = portalData?.timetable || [];

    const qrSrc = portalData?.qr?.qr_path 
        ? (portalData.qr.qr_path.startsWith('/') ? portalData.qr.qr_path : `/${portalData.qr.qr_path}`)
        : (student?.qr_path ? (student.qr_path.startsWith('/') ? student.qr_path : `/${student.qr_path}`) : null);

    const getRateColor = (rate) => {
        if (rate >= 90) return 'rate-excellent';
        if (rate >= 75) return 'rate-warning';
        return 'rate-danger';
    };

    return (
        <div className="st-portal-container">
            {/* Ambient Background Glows */}
            <div className="st-glow glow-top"></div>
            <div className="st-glow glow-bottom"></div>

            {/* Top Navigation */}
            <header className="st-portal-header no-print">
                <div className="st-header-left">
                    <img src={ofpptLogo} alt="OFPPT" className="st-logo" />
                    <div>
                        <div className="st-header-title-row">
                            <span className="st-portal-badge">ESPACE STAGIAIRE</span>
                            <span className="st-campus-pill">ISTA MIRLEFT</span>
                        </div>
                        <h1 className="st-portal-title">Portail & Badge Numérique</h1>
                    </div>
                </div>

                <div className="st-header-actions">
                    <Link to="/login" className="st-back-link">
                        <ArrowLeft size={16} /> Espace Administration
                    </Link>
                </div>
            </header>

            {/* Search / Lookup Banner */}
            <div className="st-search-section no-print">
                <form onSubmit={handleSearch} className="st-search-form">
                    <div className="st-search-input-wrap">
                        <Search className="st-search-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Saisissez votre N° d'inscription officiel (ex: STG001, CEF...)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="st-search-input"
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery('')} className="st-clear-btn">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <button type="submit" disabled={loading || !searchQuery.trim()} className="st-submit-btn">
                        {loading ? <RefreshCw className="spin" size={18} /> : 'Consulter mon Dossier'}
                    </button>
                </form>

                {error && (
                    <div className="st-error-alert fade-in">
                        <AlertTriangle size={18} />
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* If no student loaded yet, show welcome placeholder */}
            {!student && !loading && !error && (
                <div className="st-welcome-card fade-in no-print">
                    <div className="st-welcome-icon-wrap">
                        <ShieldCheck size={48} className="text-emerald-400" />
                    </div>
                    <h2>Bienvenue sur votre Espace de Suivi</h2>
                    <p>Consultez en temps réel vos statistiques d'assiduité, votre taux de présence, vos convocations et téléchargez votre <b>Badge QR officiel</b> pour l'émargement en classe.</p>
                    <div className="st-features-mini-grid">
                        <div className="mini-feature">
                            <Clock size={20} />
                            <span>Suivi en temps réel des absences</span>
                        </div>
                        <div className="mini-feature">
                            <Download size={20} />
                            <span>Badge QR téléchargeable & imprimable</span>
                        </div>
                        <div className="mini-feature">
                            <Upload size={20} />
                            <span>Dépôt de justificatifs en ligne</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Student Main Dashboard */}
            {student && (
                <div className="st-main-content fade-in">
                    {/* Student Identity & Digital Badge Hero Banner */}
                    <div className="st-hero-banner">
                        <div className="st-student-id-card">
                            <div className="st-badge-ribbon">OFPPT · ISTA MIRLEFT</div>
                            <div className="st-badge-content">
                                <div className="st-badge-avatar">
                                    <User size={36} />
                                </div>
                                <div className="st-badge-info">
                                    <h2 className="st-student-name">{student.name}</h2>
                                    <div className="st-meta-tags">
                                        <span className="st-tag matricule">N° {student.NumInscription}</span>
                                        <span className="st-tag group">{student.group_id}</span>
                                        <span className="st-tag filiere">{student.filiere || 'Tronc Commun'}</span>
                                    </div>
                                    <p className="st-session-year">Année Scolaire : {student.annee_scolaire || '2025/2026'}</p>
                                </div>

                                {/* Digital QR Section inside Badge */}
                                <div className="st-badge-qr-box">
                                    {qrSrc ? (
                                        <img 
                                            src={qrSrc} 
                                            alt={`QR Badge ${student.name}`} 
                                            className="st-qr-img"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23ffffff'/%3E%3Crect x='10' y='10' width='30' height='30' fill='%23111827'/%3E%3Crect x='80' y='10' width='30' height='30' fill='%23111827'/%3E%3Crect x='10' y='80' width='30' height='30' fill='%23111827'/%3E%3Ctext x='60' y='65' font-size='10' text-anchor='middle' fill='%23374151'%3EQR CODE%3C/text%3E%3C/svg%3E";
                                            }}
                                        />
                                    ) : (
                                        <div className="st-qr-fallback">QR Indisponible</div>
                                    )}
                                    <span className="st-qr-label">PASS SCANNER</span>
                                </div>
                            </div>

                            <div className="st-badge-actions no-print">
                                <button onClick={handleDownloadBadge} className="btn-badge-action primary">
                                    <Download size={15} /> Télécharger Badge (PNG)
                                </button>
                                <button onClick={handlePrintBadge} className="btn-badge-action secondary">
                                    <Printer size={15} /> Imprimer Carte
                                </button>
                                <button onClick={handleRefresh} className="btn-badge-action tertiary" title="Actualiser les données">
                                    <RefreshCw size={15} />
                                </button>
                            </div>
                        </div>

                        {/* KPI Summary Cards Grid */}
                        <div className="st-kpi-grid no-print">
                            {/* Attendance Rate */}
                            <div className={`st-kpi-card ${getRateColor(stats.attendance_rate || 100)}`}>
                                <div className="kpi-header">
                                    <span className="kpi-title">Taux d'Assiduité</span>
                                    <Award size={20} className="kpi-icon" />
                                </div>
                                <div className="kpi-body">
                                    <div className="kpi-value-big">{stats.attendance_rate || 100}%</div>
                                    <div className="kpi-progress-bar">
                                        <div 
                                            className="kpi-progress-fill" 
                                            style={{ width: `${stats.attendance_rate || 100}%` }}
                                        ></div>
                                    </div>
                                    <p className="kpi-subtext">
                                        {(stats.attendance_rate || 100) >= 90 ? '✅ Assiduité exemplaire' : (stats.attendance_rate || 100) >= 75 ? '⚠️ Risque d\'avertissement' : '🚨 Seuil critique dépassé'}
                                    </p>
                                </div>
                            </div>

                            {/* Total Absences */}
                            <div className="st-kpi-card card-absences">
                                <div className="kpi-header">
                                    <span className="kpi-title">Total Absences</span>
                                    <Clock size={20} className="kpi-icon text-rose-400" />
                                </div>
                                <div className="kpi-body">
                                    <div className="kpi-value-big text-rose-400">{stats.total_absences || 0}</div>
                                    <div className="kpi-breakdown-row">
                                        <span className="pill-unjustified">Non justifiées : {stats.unjustified_absences || 0}</span>
                                        <span className="pill-justified">Justifiées : {stats.justified_absences || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Retards */}
                            <div className="st-kpi-card card-lates">
                                <div className="kpi-header">
                                    <span className="kpi-title">Retards Enregistrés</span>
                                    <AlertTriangle size={20} className="kpi-icon text-amber-400" />
                                </div>
                                <div className="kpi-body">
                                    <div className="kpi-value-big text-amber-400">{stats.late_count || 0}</div>
                                    <p className="kpi-subtext">Séances avec arrivée tardive</p>
                                </div>
                            </div>

                            {/* Sanctions */}
                            <div className="st-kpi-card card-sanctions">
                                <div className="kpi-header">
                                    <span className="kpi-title">Avertissements / Blâmes</span>
                                    <ShieldCheck size={20} className="kpi-icon text-indigo-400" />
                                </div>
                                <div className="kpi-body">
                                    <div className="kpi-value-big text-indigo-400">{stats.blames_count || 0}</div>
                                    <p className="kpi-subtext">Sanctions disciplinaires actives</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="st-tabs-nav no-print">
                        <button 
                            className={`st-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            <Layers size={17} /> Vue Générale
                        </button>
                        <button 
                            className={`st-tab-btn ${activeTab === 'absences' ? 'active' : ''}`}
                            onClick={() => setActiveTab('absences')}
                        >
                            <Clock size={17} /> Historique des Absences ({absences.length})
                        </button>
                        <button 
                            className={`st-tab-btn ${activeTab === 'discipline' ? 'active' : ''}`}
                            onClick={() => setActiveTab('discipline')}
                        >
                            <ShieldCheck size={17} /> Sanctions & Blâmes ({discipline.length})
                        </button>
                        <button 
                            className={`st-tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
                            onClick={() => setActiveTab('timetable')}
                        >
                            <Calendar size={17} /> Emploi du Temps
                        </button>
                    </div>

                    {/* Tab Contents */}
                    <div className="st-tab-content no-print">
                        {/* TAB 1: OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="tab-pane fade-in">
                                <div className="st-pane-grid">
                                    {/* Recent Absences Summary */}
                                    <div className="st-panel-card">
                                        <div className="st-panel-card-header">
                                            <h3><Clock size={18} /> Dernières Absences</h3>
                                            <button onClick={() => setActiveTab('absences')} className="st-see-all-link">
                                                Voir tout ({absences.length}) <ChevronRight size={14} />
                                            </button>
                                        </div>
                                        <div className="st-panel-card-body">
                                            {absences.length === 0 ? (
                                                <div className="st-empty-state">
                                                    <CheckCircle2 size={36} className="text-emerald-400" />
                                                    <p>Aucune absence enregistrée. Félicitations pour votre assiduité !</p>
                                                </div>
                                            ) : (
                                                <div className="st-mini-list">
                                                    {absences.slice(0, 4).map((a) => (
                                                        <div key={a.absence_id} className="st-mini-item">
                                                            <div className="mini-item-left">
                                                                <span className="mini-date">{new Date(a.date).toLocaleDateString('fr-FR')}</span>
                                                                <span className="mini-subject">{a.subject}</span>
                                                                <span className="mini-formateur">Par: {a.formateur_name || 'Formateur'}</span>
                                                            </div>
                                                            <div className="mini-item-right">
                                                                {a.Justifier === 'JUSTIFIÉ' ? (
                                                                    <span className="badge-status-pill justified">Justifié</span>
                                                                ) : a.pending_request_id ? (
                                                                    <span className="badge-status-pill pending">En cours de vérification</span>
                                                                ) : (
                                                                    <button onClick={() => openJustifyModal(a)} className="btn-mini-justify">
                                                                        Justifier
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Discipline Alert Box */}
                                    <div className="st-panel-card">
                                        <div className="st-panel-card-header">
                                            <h3><ShieldCheck size={18} /> Dossier Disciplinaire</h3>
                                            <button onClick={() => setActiveTab('discipline')} className="st-see-all-link">
                                                Détails ({discipline.length}) <ChevronRight size={14} />
                                            </button>
                                        </div>
                                        <div className="st-panel-card-body">
                                            {discipline.length === 0 ? (
                                                <div className="st-empty-state">
                                                    <ShieldCheck size={36} className="text-indigo-400" />
                                                    <p>Dossier disciplinaire vierge. Aucun blâme ou avertissement.</p>
                                                </div>
                                            ) : (
                                                <div className="st-mini-list">
                                                    {discipline.map((d) => (
                                                        <div key={d.id} className="st-mini-item blame-item">
                                                            <div className="mini-item-left">
                                                                <span className="blame-badge">{d.penalty_type}</span>
                                                                <span className="blame-reason">{d.reason || 'Non précisé'}</span>
                                                                <span className="mini-date">{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: ABSENCES DETAILED */}
                        {activeTab === 'absences' && (
                            <div className="tab-pane fade-in">
                                <div className="st-table-header-box">
                                    <div>
                                        <h3>Registre Complet des Absences</h3>
                                        <p>Historique de toutes les absences et retards signalés par vos formateurs</p>
                                    </div>
                                </div>

                                {absences.length === 0 ? (
                                    <div className="st-empty-state big">
                                        <CheckCircle2 size={48} className="text-emerald-400" />
                                        <h4>Excellente assiduité !</h4>
                                        <p>Vous n'avez aucune absence enregistrée dans le système.</p>
                                    </div>
                                ) : (
                                    <div className="st-table-wrapper">
                                        <table className="st-custom-table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Créneau / Heure</th>
                                                    <th>Module / Matière</th>
                                                    <th>Formateur</th>
                                                    <th>Statut</th>
                                                    <th>Justification</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {absences.map((abs) => (
                                                    <tr key={abs.absence_id}>
                                                        <td className="font-semibold">{new Date(abs.date).toLocaleDateString('fr-FR')}</td>
                                                        <td>{abs.heure || 'Séance'}</td>
                                                        <td className="font-medium text-emerald-300">{abs.subject}</td>
                                                        <td>{abs.formateur_name || 'N/A'}</td>
                                                        <td>
                                                            {abs.status === 'LATE' ? (
                                                                <span className="badge-status-pill late">Retard</span>
                                                            ) : (
                                                                <span className="badge-status-pill absent">Absent</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {abs.Justifier === 'JUSTIFIÉ' ? (
                                                                <span className="badge-status-pill justified">Justifié ✅</span>
                                                            ) : abs.pending_request_id ? (
                                                                <span className="badge-status-pill pending">⏳ Justificatif déposé</span>
                                                            ) : (
                                                                <span className="badge-status-pill unjustified">Non Justifié ❌</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {abs.Justifier !== 'JUSTIFIÉ' && !abs.pending_request_id && (
                                                                <button 
                                                                    onClick={() => openJustifyModal(abs)}
                                                                    className="btn-action-justify"
                                                                >
                                                                    <Upload size={14} /> Déposer Justificatif
                                                                </button>
                                                            )}
                                                            {abs.pending_request_id && (
                                                                <span className="text-xs text-amber-400">En cours d'examen</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: DISCIPLINE */}
                        {activeTab === 'discipline' && (
                            <div className="tab-pane fade-in">
                                <div className="st-info-banner">
                                    <Info size={20} className="text-indigo-400 flex-shrink-0" />
                                    <div>
                                        <h4>Règlement Intérieur de l'OFPPT</h4>
                                        <p>Conformément au règlement de discipline de l'établissement, l'accumulation d'absences non justifiées entraîne l'application progressive de sanctions : Blâme 1 (mise en garde), Blâme 2 (convocation des tuteurs), et Blâme 3 (conseil de discipline / exclusion temporaire ou définitive).</p>
                                    </div>
                                </div>

                                {discipline.length === 0 ? (
                                    <div className="st-empty-state big">
                                        <ShieldCheck size={48} className="text-emerald-400" />
                                        <h4>Aucune sanction disciplinaire</h4>
                                        <p>Votre dossier est en parfaite conformité avec le règlement intérieur.</p>
                                    </div>
                                ) : (
                                    <div className="st-discipline-list">
                                        {discipline.map((item, idx) => (
                                            <div key={item.id} className="st-discipline-card">
                                                <div className="discipline-header">
                                                    <div className="blame-badge-big">{item.penalty_type}</div>
                                                    <span className="discipline-date">Décision du {new Date(item.date).toLocaleDateString('fr-FR')}</span>
                                                </div>
                                                <div className="discipline-body">
                                                    <p className="discipline-reason-title">Motif de la sanction :</p>
                                                    <p className="discipline-reason">{item.reason || 'Absences répétées non justifiées'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 4: TIMETABLE */}
                        {activeTab === 'timetable' && (
                            <div className="tab-pane fade-in">
                                <div className="st-table-header-box">
                                    <div>
                                        <h3>Emploi du Temps du Groupe : {student.group_id}</h3>
                                        <p>Horaires officiels des cours et affectations des salles</p>
                                    </div>
                                </div>

                                {timetable.length === 0 ? (
                                    <div className="st-empty-state big">
                                        <Calendar size={48} className="text-indigo-400" />
                                        <h4>Emploi du temps en cours d'attribution</h4>
                                        <p>Les créneaux de votre groupe n'ont pas encore été publiés par l'administration.</p>
                                    </div>
                                ) : (
                                    <div className="st-timetable-grid">
                                        {['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'].map((day) => {
                                            const daySlots = timetable.filter(t => t.day === day);
                                            if (daySlots.length === 0) return null;
                                            return (
                                                <div key={day} className="st-day-column">
                                                    <div className="day-header">{day}</div>
                                                    <div className="day-slots">
                                                        {daySlots.map((slot) => (
                                                            <div key={slot.id} className="st-slot-card">
                                                                <div className="slot-time"><Clock size={13} /> {slot.time}</div>
                                                                <div className="slot-subject">{slot.subject}</div>
                                                                <div className="slot-footer">
                                                                    <span className="slot-formateur">{slot.formateur_name || 'Formateur'}</span>
                                                                    <span className="slot-salle">{slot.salle_name || 'Salle'}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* JUSTIFICATION MODAL */}
            {isJustifyModalOpen && selectedAbsence && (
                <div className="st-modal-overlay fade-in no-print">
                    <div className="st-modal-box">
                        <div className="st-modal-header">
                            <h3><Upload size={18} /> Déposer un Justificatif d'Absence</h3>
                            <button onClick={() => setIsJustifyModalOpen(false)} className="st-modal-close-btn">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleJustifySubmit} className="st-modal-form">
                            <div className="st-modal-info-recap">
                                <div><strong>Date :</strong> {new Date(selectedAbsence.date).toLocaleDateString('fr-FR')}</div>
                                <div><strong>Module :</strong> {selectedAbsence.subject}</div>
                                <div><strong>Heure :</strong> {selectedAbsence.heure || 'Séance'}</div>
                            </div>

                            {modalError && <div className="st-modal-alert error">{modalError}</div>}
                            {modalSuccess && <div className="st-modal-alert success">{modalSuccess}</div>}

                            <div className="st-form-group">
                                <label>Motif de l'absence :</label>
                                <textarea
                                    rows="3"
                                    placeholder="Ex: Certificat médical, convocation officielle, urgence familiale..."
                                    value={justificationReason}
                                    onChange={(e) => setJustificationReason(e.target.value)}
                                    className="st-form-textarea"
                                    required
                                ></textarea>
                            </div>

                            <div className="st-form-group">
                                <label>Pièce justificative (Certificat / Document PDF ou Image) :</label>
                                <input 
                                    type="file" 
                                    accept="image/*,application/pdf"
                                    onChange={(e) => setJustificationFile(e.target.files[0])}
                                    className="st-form-file-input"
                                    required
                                />
                                <span className="st-hint">Formats acceptés : JPG, PNG, PDF (Max 10 Mo)</span>
                            </div>

                            <div className="st-modal-actions">
                                <button 
                                    type="button" 
                                    onClick={() => setIsJustifyModalOpen(false)} 
                                    className="btn-modal-cancel"
                                >
                                    Annuler
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={uploading} 
                                    className="btn-modal-submit"
                                >
                                    {uploading ? <RefreshCw className="spin" size={16} /> : 'Envoyer à l\'administration'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentPortal;
