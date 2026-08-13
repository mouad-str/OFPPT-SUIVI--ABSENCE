import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import studentService from '../../../services/studentService';
import './PrintBlame.css';

const PrintBlame = () => {
    const { studentId, penaltyId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [data, setData] = useState({ student: null, penalty: null });

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await studentService.getStudentProfile(studentId);
                const penalty = res.discipline.find(d => d.id === parseInt(penaltyId));
                if (!res.student || !penalty) {
                    setError(true);
                } else {
                    setData({ student: res.student, penalty });
                }
            } catch (err) {
                console.error("Error fetching print details:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [studentId, penaltyId]);

    useEffect(() => {
        if (!loading && data.student && data.penalty) {
            // Trigger browser print dialog after content renders
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
                <p>Préparation du document pour impression...</p>
            </div>
        );
    }

    if (error || !data.student || !data.penalty) {
        return (
            <div className="print-error">
                <h2>Erreur de chargement</h2>
                <p>Le document demandé n'a pas pu être chargé. Veuillez vérifier que la sanction existe.</p>
                <button onClick={() => window.close()}>Fermer</button>
            </div>
        );
    }

    const { student, penalty } = data;
    const formattedDate = new Date(penalty.date).toLocaleDateString('fr-FR', {
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
                        <p className="date-place">Fait à Mirleft, le {formattedDate}</p>
                    </div>
                </div>

                <div className="divider-double"></div>

                {/* Title */}
                <div className="letter-title-section">
                    <h1 className="letter-title">DECISION DE SANCTION DISCIPLINAIRE</h1>
                    <h2 className="letter-subtitle">{penalty.penalty_type.toUpperCase()}</h2>
                </div>

                {/* Body Content */}
                <div className="letter-body">
                    <p className="salutation">Le Directeur de l'Institut Spécialisé de Technologie Appliquée (ISTA) de Mirleft,</p>

                    <p className="text-paragraph">
                        Vu le règlement intérieur des établissements de formation professionnelle de l'OFPPT ;
                    </p>
                    <p className="text-paragraph">
                        Vu le dossier disciplinaire du stagiaire mentionné ci-dessous ;
                    </p>

                    <div className="student-info-box">
                        <h3>INFORMATION DU STAGIAIRE :</h3>
                        <table className="student-info-table">
                            <tbody>
                                <tr>
                                    <td className="info-label">Nom et Prénom :</td>
                                    <td className="info-value font-bold">{student.name}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Numéro d'Inscription :</td>
                                    <td className="info-value">{student.NumInscription}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Groupe :</td>
                                    <td className="info-value">{student.group_id}</td>
                                </tr>
                                <tr>
                                    <td className="info-label">Filière :</td>
                                    <td className="info-value">{student.filiere_name || 'Non spécifiée'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="decision-section">
                        <h3 className="section-title">DECIDE :</h3>
                        
                        <div className="decision-statement">
                            <p className="text-paragraph">
                                <strong>Article Unique :</strong> Il est infligé au stagiaire susmentionné la sanction disciplinaire suivante :
                            </p>
                            <p className="sanction-highlight">
                                {penalty.penalty_type}
                            </p>
                            <p className="text-paragraph text-justify">
                                <strong>Motif de la sanction :</strong><br />
                                {penalty.reason || "Non-respect du règlement intérieur ou absences répétées et injustifiées."}
                            </p>
                            <p className="warning-text">
                                En cas de récidive ou d'absences continues non justifiées, des mesures disciplinaires plus sévères pouvant aller jusqu'à l'exclusion définitive seront appliquées conformément au règlement en vigueur.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Signatures */}
                <div className="letter-signatures">
                    <div className="signature-box block-left">
                        <p className="signature-title">Accusé de réception du Stagiaire</p>
                        <p className="signature-date">(Date et Signature)</p>
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

export default PrintBlame;
