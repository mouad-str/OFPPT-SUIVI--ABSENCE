import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import studentService from '../../../services/studentService';
import ofpptLogo from '../../../assets/OFPPT.png';
import './PrintMonthlyMatrix.css';

const MONTH_NAMES_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const PrintMonthlyMatrix = () => {
    const { groupId } = useParams();
    const [searchParams] = useSearchParams();
    const year = searchParams.get('year') || new Date().getFullYear();
    const month = searchParams.get('month') || (new Date().getMonth() + 1);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [matrixData, setMatrixData] = useState(null);

    useEffect(() => {
        const fetchMatrix = async () => {
            try {
                setLoading(true);
                const data = await studentService.getMonthlyMatrix(groupId, year, month);
                setMatrixData(data);
            } catch (err) {
                console.error("Error fetching monthly matrix:", err);
                setError(err.response?.data?.message || 'Erreur de chargement des données.');
            } finally {
                setLoading(false);
            }
        };

        if (groupId) {
            fetchMatrix();
        }
    }, [groupId, year, month]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="print-matrix-loading">
                <div className="matrix-spinner"></div>
                <p>Génération de la Fiche Mensuelle d'Assiduité en cours...</p>
            </div>
        );
    }

    if (error || !matrixData) {
        return (
            <div className="print-matrix-error">
                <h2>Erreur lors de la génération</h2>
                <p>{error || 'Données introuvables pour le groupe et la période demandés.'}</p>
                <button onClick={() => window.close()} className="btn-close-print">Fermer</button>
            </div>
        );
    }

    const { group, sessions, students } = matrixData;
    const monthName = MONTH_NAMES_FR[parseInt(month, 10) - 1] || `Mois ${month}`;

    return (
        <div className="print-matrix-page">
            {/* Top Action Bar (hidden on print) */}
            <div className="matrix-action-bar no-print">
                <div className="action-info">
                    <strong>Fiche d'Assiduité :</strong> {group?.id} · {monthName} {year} · ({students.length} Stagiaires, {sessions.length} Séances)
                </div>
                <div className="action-buttons">
                    <button onClick={handlePrint} className="btn-print-matrix">
                        🖨️ Imprimer la Fiche (A4 Paysage)
                    </button>
                    <button onClick={() => window.close()} className="btn-close-matrix">
                        Fermer
                    </button>
                </div>
            </div>

            {/* Printable Document Body */}
            <div className="matrix-sheet">
                {/* Official OFPPT Header */}
                <div className="matrix-header-grid">
                    <div className="header-left">
                        <p className="royaume-text">ROYAUME DU MAROC</p>
                        <p className="ofppt-text">OFPPT - Office de la Formation Professionnelle</p>
                        <p className="dr-text">Direction Régionale Souss Massa</p>
                        <p className="inst-text">ISTA MIRLEFT</p>
                    </div>

                    <div className="header-center">
                        <img src={ofpptLogo} alt="Logo OFPPT" className="matrix-logo" />
                        <h1 className="matrix-title">FICHE MENSUELLE DE CONTRÔLE D'ASSIDUITÉ</h1>
                        <p className="matrix-subtitle">Période : {monthName.toUpperCase()} {year}</p>
                    </div>

                    <div className="header-right">
                        <div className="group-meta-card">
                            <p><strong>Filière :</strong> {group?.filiere_nom || 'Formation Professionnelle'}</p>
                            <p><strong>Groupe :</strong> {group?.id}</p>
                            <p><strong>Année :</strong> {group?.annee_scolaire || '2025/2026'}</p>
                        </div>
                    </div>
                </div>

                {/* Table Matrix */}
                <div className="matrix-table-container">
                    <table className="matrix-table">
                        <thead>
                            <tr>
                                <th rowSpan="2" className="col-num">N°</th>
                                <th rowSpan="2" className="col-matricule">Matricule</th>
                                <th rowSpan="2" className="col-name">Nom et Prénom</th>
                                <th colSpan={Math.max(1, sessions.length)} className="col-sessions-header">
                                    Séances et Émargements ({monthName} {year})
                                </th>
                                <th colSpan="4" className="col-totals-header">Bilan Mensuel</th>
                            </tr>
                            <tr>
                                {sessions.length === 0 ? (
                                    <th className="col-no-session">Aucune séance enregistrée pour ce mois</th>
                                ) : (
                                    sessions.map((sess, idx) => (
                                        <th key={sess.id} className="col-session-day" title={`${sess.date} - ${sess.subject} (${sess.formateur})`}>
                                            <span className="sess-day">{sess.dayNumber}</span>
                                            <span className="sess-time">{sess.heure ? sess.heure.substring(0, 5) : `S${idx + 1}`}</span>
                                        </th>
                                    ))
                                )}
                                <th className="col-stat th-absent" title="Absences Non Justifiées">A</th>
                                <th className="col-stat th-justified" title="Absences Justifiées">AJ</th>
                                <th className="col-stat th-late" title="Retards">R</th>
                                <th className="col-stat th-rate" title="Taux d'assiduité">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.length === 0 ? (
                                <tr>
                                    <td colSpan={sessions.length + 7} className="text-center py-4">
                                        Aucun stagiaire inscrit dans ce groupe.
                                    </td>
                                </tr>
                            ) : (
                                students.map((st, sIdx) => {
                                    return (
                                        <tr key={st.NumInscription} className={sIdx % 2 === 0 ? 'row-even' : 'row-odd'}>
                                            <td className="cell-num">{sIdx + 1}</td>
                                            <td className="cell-matricule">{st.NumInscription}</td>
                                            <td className="cell-name">{st.name}</td>
                                            {sessions.length === 0 ? (
                                                <td className="cell-empty">-</td>
                                            ) : (
                                                sessions.map(sess => {
                                                    const att = st.attendance[sess.id] || { code: 'P' };
                                                    const cellClass = att.code === 'A' ? 'cell-absent' : att.code === 'AJ' ? 'cell-justified' : att.code === 'R' ? 'cell-late' : 'cell-present';
                                                    return (
                                                        <td key={sess.id} className={`cell-code ${cellClass}`}>
                                                            {att.code}
                                                        </td>
                                                    );
                                                })
                                            )}
                                            <td className="cell-stat stat-a">{st.stats.absent}</td>
                                            <td className="cell-stat stat-aj">{st.stats.justified}</td>
                                            <td className="cell-stat stat-r">{st.stats.late}</td>
                                            <td className="cell-stat stat-rate font-bold">{st.stats.rate}%</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Legend and Summary */}
                <div className="matrix-legend-row">
                    <div className="legend-items">
                        <span className="legend-title">Légende :</span>
                        <span className="legend-pill code-p"><strong>P</strong> : Présent</span>
                        <span className="legend-pill code-a"><strong>A</strong> : Absent Non Justifié</span>
                        <span className="legend-pill code-aj"><strong>AJ</strong> : Absent Justifié</span>
                        <span className="legend-pill code-r"><strong>R</strong> : Retard</span>
                    </div>
                    <div className="matrix-counters">
                        <span>Total Effectif : <strong>{students.length}</strong></span>
                        <span>Total Séances : <strong>{sessions.length}</strong></span>
                    </div>
                </div>

                {/* Official Signatures Block */}
                <div className="matrix-signatures-grid">
                    <div className="sig-block">
                        <p className="sig-title">Le Formateur / Tuteur</p>
                        <p className="sig-subtitle">Date et Signature</p>
                        <div className="sig-space"></div>
                    </div>

                    <div className="sig-block">
                        <p className="sig-title">La Surveillance Générale</p>
                        <p className="sig-subtitle">Visa et Contrôle</p>
                        <div className="sig-space"></div>
                    </div>

                    <div className="sig-block">
                        <p className="sig-title">Le Directeur de l'Établissement</p>
                        <p className="sig-subtitle">Cachet et Signature</p>
                        <div className="sig-space"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrintMonthlyMatrix;
