import React, { useState } from 'react';
import { Layers, FileText, Search, AlertTriangle, Upload, CheckCircle2, ChevronRight, X, Clock, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import studentPortalService from '../../../services/studentPortalService';
import ofpptLogo from '../../../assets/OFPPT.png';
import './Justify.css';

const Justify = () => {
    const { t } = useTranslation();
    const [numInscription, setNumInscription] = useState('');
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');
    const [studentData, setStudentData] = useState(null);
    const [absences, setAbsences] = useState([]);
    
    // Upload form states
    const [selectedAbsence, setSelectedAbsence] = useState(null);
    const [file, setFile] = useState(null);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleLookup = async (e) => {
        e.preventDefault();
        if (!numInscription.trim()) return;
        setSearching(true);
        setError('');
        setStudentData(null);
        setAbsences([]);
        try {
            const data = await studentPortalService.lookup(numInscription);
            setStudentData(data.student);
            setAbsences(data.absences || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la recherche. Veuillez vérifier votre numéro d\'inscription.');
        } finally {
            setSearching(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!file || !selectedAbsence) return;

        setSubmitting(true);
        setError('');
        setSuccessMessage('');

        const formData = new FormData();
        formData.append('studentId', studentData.NumInscription);
        formData.append('absenceId', selectedAbsence.absence_id);
        formData.append('reason', reason);
        formData.append('file', file);

        try {
            const res = await studentPortalService.submitJustification(formData);
            setSuccessMessage(res.message || 'Justificatif soumis avec succès !');
            setSelectedAbsence(null);
            setFile(null);
            setReason('');
            
            // Re-fetch data to show updated status
            const data = await studentPortalService.lookup(studentData.NumInscription);
            setAbsences(data.absences || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la soumission du justificatif.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="st-justify-container">
            {/* Background designs */}
            <div className="st-justify-bg-glow glow-1"></div>
            <div className="st-justify-bg-glow glow-2"></div>
            
            <div className="st-justify-wrapper">
                {/* Header */}
                <div className="st-justify-header">
                    <img src={ofpptLogo} alt="OFPPT Logo" className="st-justify-logo" />
                    <div className="st-justify-header-text">
                        <span className="st-justify-badge">ESPACE STAGIAIRE</span>
                        <h1 className="st-justify-title">Justification des Absences</h1>
                        <p className="st-justify-subtitle">Déposez vos justificatifs médicaux ou administratifs en ligne</p>
                    </div>
                </div>

                {/* Lookup Section */}
                {!studentData && (
                    <div className="st-justify-panel st-lookup-panel fade-up">
                        <h2 className="st-panel-title">Consulter mes absences</h2>
                        <p className="st-panel-description">Veuillez saisir votre numéro d'inscription officiel pour consulter vos absences et soumettre vos justificatifs.</p>
                        
                        <form onSubmit={handleLookup} className="st-lookup-form">
                            <div className="st-input-wrapper">
                                <Search className="st-input-icon" />
                                <input
                                    type="text"
                                    value={numInscription}
                                    onChange={(e) => setNumInscription(e.target.value)}
                                    placeholder="Ex: 2409871"
                                    className="st-lookup-input"
                                    disabled={searching}
                                />
                            </div>
                            <button type="submit" className="st-lookup-btn" disabled={searching || !numInscription.trim()}>
                                {searching ? 'Recherche...' : 'Vérifier'}
                                <ChevronRight size={16} />
                            </button>
                        </form>

                        {error && (
                            <div className="st-error-alert fade-up">
                                <AlertTriangle size={18} />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Student Dashboard Section */}
                {studentData && (
                    <div className="st-dashboard-layout fade-up">
                        {/* Profile Summary Card */}
                        <div className="st-profile-card">
                            <div className="st-profile-avatar">
                                {studentData.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="st-profile-details">
                                <h2 className="st-profile-name">{studentData.name}</h2>
                                <p className="st-profile-meta">
                                    <strong>ID:</strong> {studentData.NumInscription} · <strong>Groupe:</strong> {studentData.group_id}
                                </p>
                                <p className="st-profile-meta"><strong>Filière:</strong> {studentData.filiere}</p>
                            </div>
                            <div className={`st-profile-status ${studentData.Active ? 'active' : 'inactive'}`}>
                                <div className="status-dot"></div>
                                <span>{studentData.Active ? 'ACTIF' : 'NON ACTIF'}</span>
                            </div>
                            <button onClick={() => setStudentData(null)} className="st-logout-btn">
                                Retour
                            </button>
                        </div>

                        {/* Status Messages */}
                        {successMessage && (
                            <div className="st-success-banner fade-up">
                                <CheckCircle2 size={18} />
                                <span>{successMessage}</span>
                                <button onClick={() => setSuccessMessage('')} className="st-success-close">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {error && (
                            <div className="st-error-alert fade-up">
                                <AlertTriangle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Absences Section */}
                        <div className="st-absences-section">
                            <h3 className="st-section-title">
                                {absences.length > 0 ? `Absences non justifiées (${absences.length})` : 'Absences'}
                            </h3>

                            {absences.length === 0 ? (
                                <div className="st-empty-state fade-up">
                                    <div className="st-empty-icon-wrapper">
                                        <CheckCircle2 className="st-empty-icon" />
                                    </div>
                                    <h4 className="st-empty-title">Tout est en règle !</h4>
                                    <p className="st-empty-text">Félicitations, vous n'avez actuellement aucune absence non justifiée.</p>
                                </div>
                            ) : (
                                <div className="st-absences-grid">
                                    {absences.map((abs, index) => (
                                        <div key={index} className={`st-absence-card ${abs.request_status ? 'has-request' : ''}`}>
                                            <div className="st-absence-header">
                                                <span className="st-absence-subject">{abs.subject}</span>
                                                <span className="st-absence-date">
                                                    {new Date(abs.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <div className="st-absence-body">
                                                <div className="st-absence-detail">
                                                    <Clock size={12} />
                                                    <span>Séance : {abs.heure || 'N/A'}</span>
                                                </div>
                                                <div className="st-absence-detail">
                                                    <HelpCircle size={12} />
                                                    <span>Statut d'absence : <strong>{abs.Justifier === 'ABSENCE' ? 'Non traitée' : 'Non justifiée'}</strong></span>
                                                </div>
                                            </div>

                                            {/* Action / Request status */}
                                            <div className="st-absence-footer">
                                                {abs.request_status === 'PENDING' && (
                                                    <div className="st-status-badge pending">
                                                        <Clock size={12} />
                                                        <span>En attente de validation</span>
                                                    </div>
                                                )}
                                                {abs.request_status === 'REJECTED' && (
                                                    <div className="st-action-row">
                                                        <div className="st-status-badge rejected">
                                                            <X size={12} />
                                                            <span>Justificatif refusé</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => setSelectedAbsence(abs)}
                                                            className="st-justify-action-btn reupload"
                                                        >
                                                            Déposer à nouveau
                                                        </button>
                                                    </div>
                                                )}
                                                {!abs.request_status && (
                                                    <button 
                                                        onClick={() => setSelectedAbsence(abs)}
                                                        className="st-justify-action-btn"
                                                    >
                                                        <Upload size={13} />
                                                        <span>Justifier cette absence</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Upload Modal Drawer */}
                {selectedAbsence && (
                    <div className="st-upload-overlay">
                        <div className="st-upload-modal fade-up">
                            <div className="st-upload-header">
                                <div>
                                    <h3 className="st-upload-title">Soumettre un justificatif</h3>
                                    <p className="st-upload-subtitle">
                                        Séance de <strong>{selectedAbsence.subject}</strong> du {new Date(selectedAbsence.date).toLocaleDateString('fr-FR')}
                                    </p>
                                </div>
                                <button onClick={() => { setSelectedAbsence(null); setFile(null); setReason(''); }} className="st-modal-close">
                                    <X size={18} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleUploadSubmit} className="st-upload-form">
                                {/* File input */}
                                <div className="st-file-field">
                                    <label className="st-file-label">Document Justificatif (JPG, PNG, ou PDF)</label>
                                    <div className="st-file-dropzone">
                                        <Upload className="dropzone-icon" />
                                        <input
                                            type="file"
                                            onChange={handleFileChange}
                                            accept=".jpg,.jpeg,.png,.pdf"
                                            className="dropzone-input"
                                            required
                                        />
                                        <span className="dropzone-text">
                                            {file ? `Fichier sélectionné : ${file.name}` : 'Glissez votre document ou cliquez pour choisir un fichier'}
                                        </span>
                                        <span className="dropzone-subtext">Max : 10 Mo</span>
                                    </div>
                                </div>

                                {/* Text input */}
                                <div className="st-text-field">
                                    <label className="st-text-label">Commentaire / Explication (Optionnel)</label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Ex: Certificat d'arrêt de travail du médecin pour cause de maladie..."
                                        className="st-text-input"
                                        rows={3}
                                    />
                                </div>

                                <div className="st-modal-actions">
                                    <button 
                                        type="button" 
                                        onClick={() => { setSelectedAbsence(null); setFile(null); setReason(''); }} 
                                        className="st-btn-secondary"
                                        disabled={submitting}
                                    >
                                        Annuler
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="st-btn-primary"
                                        disabled={submitting || !file}
                                    >
                                        {submitting ? 'Envoi...' : 'Soumettre le justificatif'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Justify;
