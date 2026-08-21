import React, { useState, useRef } from 'react';
import { 
    Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, 
    X, RefreshCw, Layers, Users, ArrowRight, Check, Info 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import studentService from '../../../services/studentService';
import './BulkImportModal.css';

const BulkImportModal = ({ isOpen, onClose, onSuccess, defaultGroupId = '' }) => {
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [detectedGroups, setDetectedGroups] = useState([]);
    const [fallbackGroup, setFallbackGroup] = useState(defaultGroupId);
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleDownloadTemplate = async () => {
        try {
            const blob = await studentService.downloadStudentTemplate();
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Modele_Import_Stagiaires_OFPPT.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Download template error:', err);
            alert('Erreur lors du téléchargement du modèle Excel.');
        }
    };

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        processExcelFile(selected);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processExcelFile(e.dataTransfer.files[0]);
        }
    };

    const processExcelFile = (excelFile) => {
        setFile(excelFile);
        setErrorMsg('');
        setImportResult(null);
        setParsing(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet);

                if (!json || json.length === 0) {
                    setErrorMsg('Le fichier Excel sélectionné est vide.');
                    setParsing(false);
                    return;
                }

                setTotalRows(json.length);
                setPreviewData(json.slice(0, 5));

                // Detect distinct groups
                const groupsSet = new Set();
                json.forEach(row => {
                    const grp = row['Groupe'] || row['groupe'] || row['Group'] || row['group'] || row['Classe'] || row['classe'];
                    if (grp) groupsSet.add(String(grp).trim().toUpperCase());
                });
                setDetectedGroups(Array.from(groupsSet));
                setParsing(false);
            } catch (err) {
                console.error('Excel parse error:', err);
                setErrorMsg('Impossible de lire le fichier Excel. Format non valide.');
                setParsing(false);
            }
        };
        reader.readAsArrayBuffer(excelFile);
    };

    const handleExecuteImport = async () => {
        if (!file) return;

        setImporting(true);
        setErrorMsg('');
        setImportResult(null);

        const formData = new FormData();
        formData.append('file', file);
        if (fallbackGroup) {
            formData.append('defaultGroupId', fallbackGroup);
        }

        try {
            const res = await studentService.batchImportStudents(formData);
            setImportResult(res);
            if (onSuccess) {
                onSuccess(res);
            }
        } catch (err) {
            console.error('Batch import error:', err);
            setErrorMsg(err.response?.data?.message || 'Erreur lors de l\'importation en masse.');
        } finally {
            setImporting(false);
        }
    };

    const resetModal = () => {
        setFile(null);
        setPreviewData([]);
        setTotalRows(0);
        setDetectedGroups([]);
        setImportResult(null);
        setErrorMsg('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="st-modal-overlay fade-in">
            <div className="bulk-import-modal-box">
                {/* Header */}
                <div className="bulk-modal-header">
                    <div className="header-title-wrap">
                        <FileSpreadsheet size={22} className="text-emerald-400" />
                        <div>
                            <h3>Importation en Masse de Stagiaires (Excel)</h3>
                            <p>Importez des listes complètes multi-groupes avec génération automatique des badges QR</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-close-modal">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="bulk-modal-body">
                    {/* If import is finished successfully, show success summary */}
                    {importResult ? (
                        <div className="bulk-success-view fade-in">
                            <div className="success-icon-wrap">
                                <CheckCircle2 size={54} className="text-emerald-400" />
                            </div>
                            <h3>Importation réussie !</h3>
                            <p className="success-subtitle">{importResult.message}</p>

                            <div className="success-stats-grid">
                                <div className="stat-box">
                                    <span className="stat-lbl">Nouveaux Ajoutés</span>
                                    <span className="stat-val text-emerald-400">+{importResult.insertedCount}</span>
                                </div>
                                <div className="stat-box">
                                    <span className="stat-lbl">Mis à Jour</span>
                                    <span className="stat-val text-blue-400">{importResult.updatedCount}</span>
                                </div>
                                <div className="stat-box">
                                    <span className="stat-lbl">Total Traité</span>
                                    <span className="stat-val text-white">{importResult.totalProcessed}</span>
                                </div>
                            </div>

                            {importResult.errors && importResult.errors.length > 0 && (
                                <div className="import-warnings-box">
                                    <h4><AlertTriangle size={16} /> Avertissements ({importResult.errors.length}) :</h4>
                                    <ul>
                                        {importResult.errors.map((err, idx) => (
                                            <li key={idx}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="bulk-success-actions">
                                <button onClick={resetModal} className="btn-reimport">
                                    <RefreshCw size={16} /> Importer un autre fichier
                                </button>
                                <button onClick={onClose} className="btn-finish">
                                    Terminer & Fermer
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Template Download Banner */}
                            <div className="template-download-banner">
                                <div className="template-info">
                                    <Info size={20} className="text-sky-400 flex-shrink-0" />
                                    <div>
                                        <strong>Modèle Standardisé OFPPT</strong>
                                        <p>Téléchargez le gabarit Excel officiel avec les colonnes pré-configurées (Matricule, Nom, Filière, Groupe, Téléphone, CIN).</p>
                                    </div>
                                </div>
                                <button onClick={handleDownloadTemplate} className="btn-download-template">
                                    <Download size={16} /> Télécharger Modèle (.xlsx)
                                </button>
                            </div>

                            {/* Drag and Drop Zone */}
                            {!file ? (
                                <div 
                                    className="dropzone-box"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                >
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        accept=".xlsx, .xls, .csv" 
                                        style={{ display: 'none' }} 
                                    />
                                    <div className="dropzone-icon-wrap">
                                        <Upload size={32} />
                                    </div>
                                    <h4>Glissez-déposez votre fichier Excel ici</h4>
                                    <p>ou cliquez pour parcourir vos fichiers (.xlsx, .xls, .csv)</p>
                                    <span className="file-formats-tag">Support Multi-Groupes & Multi-Filières</span>
                                </div>
                            ) : (
                                <div className="selected-file-card fade-in">
                                    <div className="file-card-left">
                                        <FileSpreadsheet size={32} className="text-emerald-400" />
                                        <div>
                                            <span className="file-name">{file.name}</span>
                                            <span className="file-size">{(file.size / 1024).toFixed(1)} Ko · {totalRows} lignes détectées</span>
                                        </div>
                                    </div>
                                    <button onClick={resetModal} className="btn-remove-file">
                                        <X size={18} /> Changer de fichier
                                    </button>
                                </div>
                            )}

                            {errorMsg && (
                                <div className="bulk-error-alert fade-in">
                                    <AlertTriangle size={18} />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            {/* Preview Table of Rows */}
                            {file && previewData.length > 0 && (
                                <div className="preview-section fade-in">
                                    <div className="preview-header">
                                        <h4>Aperçu des Données (5 premières lignes) :</h4>
                                        <div className="detected-groups-pills">
                                            <span>Groupes détectés ({detectedGroups.length}) :</span>
                                            {detectedGroups.map(g => (
                                                <span key={g} className="group-pill">{g}</span>
                                            ))}
                                            {detectedGroups.length === 0 && (
                                                <span className="group-pill text-amber-400">Aucun groupe spécifié (Groupe par défaut sera utilisé)</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="preview-table-wrapper ista-scrollbar">
                                        <table className="preview-table">
                                            <thead>
                                                <tr>
                                                    {Object.keys(previewData[0]).slice(0, 6).map((col) => (
                                                        <th key={col}>{col}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewData.map((row, rIdx) => (
                                                    <tr key={rIdx}>
                                                        {Object.keys(previewData[0]).slice(0, 6).map((col) => (
                                                            <td key={col}>{String(row[col] || '-')}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                {!importResult && (
                    <div className="bulk-modal-footer">
                        <button onClick={onClose} disabled={importing} className="btn-modal-cancel">
                            Annuler
                        </button>
                        <button 
                            onClick={handleExecuteImport} 
                            disabled={!file || importing || parsing} 
                            className="btn-modal-execute"
                        >
                            {importing ? (
                                <>
                                    <RefreshCw className="spin" size={18} />
                                    <span>Importation & Génération des QR ({totalRows} stagiaires)...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={18} />
                                    <span>Lancer l'Importation ({totalRows} Stagiaires)</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkImportModal;
