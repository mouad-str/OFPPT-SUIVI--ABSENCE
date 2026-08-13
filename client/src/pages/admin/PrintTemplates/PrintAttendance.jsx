import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import studentService from '../../../services/studentService';
import './PrintAttendance.css';

const PrintAttendance = () => {
    const { studentId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [data, setData] = useState({ student: null, absences: [] });

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await studentService.getStudentProfile(studentId);
                if (!res.student) {
                    setError(true);
                } else {
                    setData({ student: res.student, absences: res.absences });
                }
            } catch (err) {
                console.error("Error fetching print details:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [studentId]);

    useEffect(() => {
        if (!loading && data.student) {
            const timer = setTimeout(() => {
                window.print();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [loading, data]);

    if (loading) {
        return (
            <div className="print-loading">
                <div className="spinner"></div>
                <p>Génération du relevé d'absences...</p>
            </div>
        );
    }

    if (error || !data.student) {
        return (
            <div className="print-error">
                <h2>Erreur de chargement</h2>
                <p>Le relevé d'absences n'a pas pu être généré.</p>
                <button onClick={() => window.close()}>Fermer</button>
            </div>
        );
    }

    const { student, absences } = data;
    const totalAbsences = absences.length;
    const justifiedAbsences = absences.filter(a => a.Justifier === 'JUSTIFIÉ').length;
    const unjustifiedAbsences = totalAbsences - justifiedAbsences;

    const formattedDate = new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <div className="print-page-container">
            {/* Action buttons (hidden on print) */}
            <div className="print-actions-bar no-print">
                <button onClick={() => window.print()} className="btn-print-action">Imprimer</button>
                <button onClick={() => window.close()} className="btn-close-action">Fermer</button>
            </div>

            {/* Document body */}
            <div className="letter-wrapper">
                {/* Official Header */}
                <div className="letter-header">
                    <div className="header-left">
                        <p className="org-main">ROYAUME DU MAROC</p>
                        <p className="org-sub">L'Office de la Formation Professionnelle et de la Promotion du Travail (OFPPT)</p>
                        <p className="establishment">ISTA Mirleft - Sidi Ifni</p>
                    </div>
                    <div className="header-right">
                        <p className="date-place">Date d'édition : {formattedDate}</p>
                    </div>
                </div>

                <div className="divider-double"></div>

                {/* Title */}
                <div className="letter-title-section">
                    <h1 className="letter-title">FICHE DE SUIVI ET RELEVE D'ABSENCES</h1>
                    <h2 className="letter-subtitle-normal">ANNEE SCOLAIRE 2025/2026</h2>
                </div>

                {/* Student Bio */}
                <div className="student-profile-summary">
                    <table className="bio-table">
                        <tbody>
                            <tr>
                                <td className="label">Stagiaire :</td>
                                <td className="val font-bold">{student.name}</td>
                                <td className="label">Num. Inscription :</td>
                                <td className="val">{student.NumInscription}</td>
                            </tr>
                            <tr>
                                <td className="label">Groupe :</td>
                                <td className="val">{student.group_id}</td>
                                <td className="label">Filière :</td>
                                <td className="val">{student.filiere_name || 'Développement Digital'}</td>
                            </tr>
                            <tr>
                                <td className="label">Téléphone :</td>
                                <td className="val">{student.tele || 'N/A'}</td>
                                <td className="label">Email :</td>
                                <td className="val">{student.email || 'N/A'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Absence Statistics Summary Cards */}
                <div className="stats-cards-row">
                    <div className="stat-card tot">
                        <span className="stat-num">{totalAbsences}</span>
                        <span className="stat-lbl">Absences Totales</span>
                    </div>
                    <div className="stat-card just">
                        <span className="stat-num text-green">{justifiedAbsences}</span>
                        <span className="stat-lbl">Justifiées</span>
                    </div>
                    <div className="stat-card unjust">
                        <span className="stat-num text-red">{unjustifiedAbsences}</span>
                        <span className="stat-lbl">Non Justifiées</span>
                    </div>
                    <div className="stat-card status">
                        <span className={`stat-badge ${student.Active ? 'active' : 'inactive'}`}>
                            {student.Active ? 'ACTIF' : 'INACTIF'}
                        </span>
                        <span className="stat-lbl">Statut Scolaire</span>
                    </div>
                </div>

                {/* Absences List Table */}
                <div className="absence-table-section">
                    <h3 className="table-heading">DETAILS DES SEANCES MANQUEES :</h3>
                    <table className="absences-detail-table">
                        <thead>
                            <tr>
                                <th>Date de l'absence</th>
                                <th>Heure / Période</th>
                                <th>Module / Matière</th>
                                <th>Justification</th>
                                <th>Motif</th>
                            </tr>
                        </thead>
                        <tbody>
                            {absences.length > 0 ? (
                                absences.map((abs, i) => (
                                    <tr key={i}>
                                        <td className="font-bold">
                                            {new Date(abs.date).toLocaleDateString('fr-FR', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td>{abs.heure || 'Période indéfinie'}</td>
                                        <td>{abs.subject}</td>
                                        <td>
                                            <span className={`status-pill ${abs.Justifier === 'JUSTIFIÉ' ? 'justified' : 'unjustified'}`}>
                                                {abs.Justifier === 'JUSTIFIÉ' ? 'JUSTIFIÉE' : 'NON JUSTIFIÉE'}
                                            </span>
                                        </td>
                                        <td className="italic text-slate-500">
                                            {abs.Justifier === 'JUSTIFIÉ' ? (abs.justification_reason || 'Certificat médical') : '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="empty-row">Aucune absence signalée pour ce stagiaire.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Signatures */}
                <div className="letter-signatures" style={{ marginTop: '5rem' }}>
                    <div className="signature-box block-left">
                        <p className="signature-title">Visa du Surveillant Général</p>
                        <div className="signature-space"></div>
                    </div>
                    <div className="signature-box block-right">
                        <p className="signature-title">Le Directeur de l'Etablissement</p>
                        <div className="signature-space"></div>
                        <p className="signature-name">Direction ISTA Mirleft</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrintAttendance;
