import React, { useState, useEffect } from 'react';
import { FileText, Check, X, Eye, ExternalLink, Calendar, User, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import studentService from '../../../services/studentService';
import './Justifications.css';
import '../../../styles/admin-shared.css';

const AdminJustifications = () => {
    const { t } = useTranslation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);

    const fetchPendingJustifications = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await studentService.getPendingJustifications();
            setRequests(data.justifications || []);
        } catch (err) {
            setError('Impossible de charger les demandes de justification.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingJustifications();
    }, []);

    const handleAction = async (requestId, action) => {
        setActionLoading({ id: requestId, action });
        setError('');
        try {
            await studentService.reviewJustification(requestId, action);
            // Refresh list
            await fetchPendingJustifications();
            setPreviewFile(null);
        } catch (err) {
            setError(err.response?.data?.message || 'Erreur lors de la validation.');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="adm-justifications-container">
            <div className="adm-justifications-header">
                <div className="adm-title-wrapper">
                    <span className="adm-badge">VALIDATION DES EXCUSES</span>
                    <h1 className="adm-title">Justifications d'Absences</h1>
                    <p className="adm-subtitle">Consultez et validez les pièces justificatives déposées par les stagiaires</p>
                </div>
                <button onClick={fetchPendingJustifications} className="btn-sync group" disabled={loading}>
                    <RefreshCw className={`sync-icon ${loading ? 'loading' : ''}`} />
                    Actualiser
                </button>
            </div>

            {error && (
                <div className="st-error-alert fade-up">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="adm-justifications-grid">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="adm-justification-card skeleton-card">
                            <div className="skeleton-line w-1/3"></div>
                            <div className="skeleton-line w-full"></div>
                            <div className="skeleton-line w-2/3"></div>
                        </div>
                    ))}
                </div>
            ) : requests.length === 0 ? (
                <div className="adm-empty-state fade-up">
                    <div className="adm-empty-icon-wrapper">
                        <Check className="adm-empty-icon" />
                    </div>
                    <h3 className="adm-empty-title">Aucune demande en attente</h3>
                    <p className="adm-empty-text">Toutes les justifications soumises par les stagiaires ont été traitées.</p>
                </div>
            ) : (
                <div className="adm-justifications-grid fade-up">
                    {requests.map((req) => (
                        <div key={req.id} className="adm-justification-card">
                            <div className="adm-card-header">
                                <div className="adm-student-info">
                                    <div className="adm-student-avatar">
                                        {req.student_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="adm-student-name">{req.student_name}</h4>
                                        <p className="adm-student-meta">
                                            ID: <strong>{req.student_id}</strong> · Groupe: <strong>{req.group_id}</strong>
                                        </p>
                                    </div>
                                </div>
                                <span className="adm-status-badge pending">EN ATTENTE</span>
                            </div>

                            <div className="adm-card-body">
                                <div className="adm-detail-row">
                                    <Calendar size={14} />
                                    <span>Date d'absence : <strong>{new Date(req.date_absence).toLocaleDateString('fr-FR')}</strong></span>
                                </div>
                                <div className="adm-detail-row">
                                    <BookOpen size={14} />
                                    <span>Module / Matière : <strong>{req.subject}</strong></span>
                                </div>
                                
                                {req.reason && (
                                    <div className="adm-reason-box">
                                        <h5 className="adm-reason-title">Motif du stagiaire :</h5>
                                        <p className="adm-reason-text">"{req.reason}"</p>
                                    </div>
                                )}
                            </div>

                            <div className="adm-card-footer">
                                <button 
                                    onClick={() => setPreviewFile(req)} 
                                    className="adm-btn-preview"
                                >
                                    <Eye size={14} />
                                    <span>Visualiser la pièce</span>
                                </button>
                                
                                <div className="adm-actions-group">
                                    <button
                                        onClick={() => handleAction(req.id, 'REJECT')}
                                        disabled={actionLoading?.id === req.id}
                                        className="adm-btn-reject"
                                    >
                                        {actionLoading?.id === req.id && actionLoading?.action === 'REJECT' ? '...' : <X size={14} />}
                                        <span>Rejeter</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction(req.id, 'APPROVE')}
                                        disabled={actionLoading?.id === req.id}
                                        className="adm-btn-approve"
                                    >
                                        {actionLoading?.id === req.id && actionLoading?.action === 'APPROVE' ? '...' : <Check size={14} />}
                                        <span>Approuver</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Document Viewer Modal Overlay */}
            {previewFile && (
                <div className="adm-viewer-overlay">
                    <div className="adm-viewer-modal fade-up">
                        <div className="adm-viewer-header">
                            <div>
                                <h3 className="adm-viewer-title">Pièce justificative</h3>
                                <p className="adm-viewer-subtitle">Déposée par {previewFile.student_name}</p>
                            </div>
                            <div className="adm-viewer-actions-top">
                                <a 
                                    href={previewFile.file_path} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="adm-viewer-external"
                                >
                                    <ExternalLink size={16} />
                                    Ouvrir
                                </a>
                                <button onClick={() => setPreviewFile(null)} className="adm-viewer-close">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="adm-viewer-content">
                            {previewFile.file_path.toLowerCase().endsWith('.pdf') ? (
                                <embed 
                                    src={previewFile.file_path} 
                                    type="application/pdf" 
                                    width="100%" 
                                    height="100%" 
                                    style={{ borderRadius: '12px' }}
                                />
                            ) : (
                                <div className="adm-image-preview-wrapper">
                                    <img 
                                        src={previewFile.file_path} 
                                        alt="Justificatif" 
                                        className="adm-image-preview"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="adm-viewer-footer">
                            <button
                                onClick={() => handleAction(previewFile.id, 'REJECT')}
                                disabled={actionLoading?.id === previewFile.id}
                                className="adm-btn-reject"
                            >
                                Rejeter
                            </button>
                            <button
                                onClick={() => handleAction(previewFile.id, 'APPROVE')}
                                disabled={actionLoading?.id === previewFile.id}
                                className="adm-btn-approve"
                            >
                                Approuver
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminJustifications;
