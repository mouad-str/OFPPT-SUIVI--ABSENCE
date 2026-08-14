import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import studentService from '../../../services/studentService';
import './PrintBadges.css';

const PrintBadges = () => {
    const { groupId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [students, setStudents] = useState([]);

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await studentService.getAdminUsersByGroup(groupId);
                const list = res.users.filter(u => u.role === 'stagiaire');
                if (list.length === 0) {
                    setError(true);
                } else {
                    setStudents(list);
                }
            } catch (err) {
                console.error("Error fetching students for badges:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchStudents();
    }, [groupId]);

    useEffect(() => {
        if (!loading && students.length > 0) {
            const timer = setTimeout(() => {
                window.print();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [loading, students]);

    if (loading) {
        return (
            <div className="print-loading">
                <div className="spinner"></div>
                <p>Génération et compilation des badges en cours...</p>
            </div>
        );
    }

    if (error || students.length === 0) {
        return (
            <div className="print-error">
                <h2>Aucun stagiaire trouvé</h2>
                <p>Le groupe sélectionné ne contient aucun stagiaire à exporter.</p>
                <button onClick={() => window.close()} className="btn-close-action">Fermer</button>
            </div>
        );
    }

    return (
        <div className="print-badges-container">
            <div className="print-actions-bar no-print">
                <span className="print-info-badge">Groupe: {groupId} · {students.length} Stagiaires</span>
                <div className="action-buttons">
                    <button onClick={() => window.print()} className="btn-print-action">Imprimer les Badges</button>
                    <button onClick={() => window.close()} className="btn-close-action">Fermer</button>
                </div>
            </div>

            <div className="badges-print-grid">
                {students.map((student) => {
                    const qrUrl = student.qr_path 
                        ? (student.qr_path.startsWith('/') ? student.qr_path : `/${student.qr_path}`)
                        : '';
                    return (
                        <div key={student.id} className="badge-card-print">
                            <div className="badge-card-header">
                                <div className="header-logo-section">
                                    <span className="badge-org-title">OFPPT</span>
                                    <span className="badge-org-subtitle">ISTA MIRLEFT</span>
                                </div>
                                <div className="badge-status-dot"></div>
                            </div>

                            <div className="badge-card-body">
                                <div className="badge-details">
                                    <div className="detail-row">
                                        <span className="detail-lbl">Nom:</span>
                                        <span className="detail-val font-bold text-uppercase">{student.name}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-lbl">CE:</span>
                                        <span className="detail-val">{student.id}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-lbl">Groupe:</span>
                                        <span className="detail-val font-bold">{student.group_id}</span>
                                    </div>
                                    <div className="badge-campus-tag">DIGITAL CAMPUS</div>
                                </div>

                                <div className="badge-qr-section">
                                    {qrUrl ? (
                                        <img 
                                            src={qrUrl} 
                                            alt={`QR Code ${student.name}`} 
                                            className="badge-qr-image" 
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3Cpath d='M30,30 h10 v10 h-10 z M30,60 h10 v10 h-10 z M60,30 h10 v10 h-10 z' fill='%234b5563'/%3E%3C/svg%3E";
                                            }}
                                        />
                                    ) : (
                                        <div className="badge-qr-placeholder">QR</div>
                                    )}
                                </div>
                            </div>

                            <div className="badge-card-footer">
                                <span>CARTE DE SCOLARITÉ 2026/2027</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PrintBadges;
