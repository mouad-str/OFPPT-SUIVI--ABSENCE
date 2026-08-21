import React, { useState, useEffect } from 'react';
import { Search, FileText, Download, AlertTriangle, ChevronDown, CheckSquare, Square, Calendar, Printer, FileSpreadsheet, X, Eye } from 'lucide-react';
import { CustomDatePicker } from '../../../components/Forms';
import { RapportModal } from '../../../components/Modals';
import { useTranslation } from 'react-i18next';
import { getSignatureDataURI } from '../../../utils/signatureHelper';
import { exportElementToPDF } from '../../../utils/pdfUtils';
import { exportDataToExcel, loadXLSX } from '../../../utils/excelUtils';
import { formatDate } from '../../../utils/dateUtils';
import studentService from '../../../services/studentService';
import reportService from '../../../services/reportService';
import './Rapports.css';
import '../../../styles/admin-shared.css';

const MONTHS_LIST = [
    { value: 1, label: '01 - Janvier' },
    { value: 2, label: '02 - Février' },
    { value: 3, label: '03 - Mars' },
    { value: 4, label: '04 - Avril' },
    { value: 5, label: '05 - Mai' },
    { value: 6, label: '06 - Juin' },
    { value: 7, label: '07 - Juillet' },
    { value: 8, label: '08 - Août' },
    { value: 9, label: '09 - Septembre' },
    { value: 10, label: '10 - Octobre' },
    { value: 11, label: '11 - Novembre' },
    { value: 12, label: '12 - Décembre' }
];

const Rapports = () => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'ar';
    const [selectedDate, setSelectedDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [availableGroups, setAvailableGroups] = useState([]);
    const [groupFilter, setGroupFilter] = useState('ALL');
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [selectedRapport, setSelectedRapport] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [allReports, setAllReports] = useState([]);
    const [loading, setLoading] = useState(true);

    // 📊 Monthly Matrix & Official OFPPT Sheets Modal
    const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
    const [monthlyGroup, setMonthlyGroup] = useState('');
    const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());
    const [monthlyMonth, setMonthlyMonth] = useState(new Date().getMonth() + 1);
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const [monthlyMatrixData, setMonthlyMatrixData] = useState(null);
    const [monthlyError, setMonthlyError] = useState('');

    useEffect(() => {
        if (availableGroups.length > 0 && !monthlyGroup) {
            setMonthlyGroup(availableGroups[0].id);
        }
    }, [availableGroups]);

    const handleFetchMonthlyMatrix = async () => {
        if (!monthlyGroup) return;
        setMonthlyLoading(true);
        setMonthlyError('');
        try {
            const data = await studentService.getMonthlyMatrix(monthlyGroup, monthlyYear, monthlyMonth);
            setMonthlyMatrixData(data);
        } catch (err) {
            setMonthlyError(err.response?.data?.message || 'Erreur lors du chargement de la matrice.');
            setMonthlyMatrixData(null);
        } finally {
            setMonthlyLoading(false);
        }
    };

    const handleDownloadExcelMatrix = async () => {
        if (!monthlyGroup) return;
        try {
            const blob = await studentService.downloadMonthlyExcel(monthlyGroup, monthlyYear, monthlyMonth);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Fiche_Absence_${monthlyGroup}_${monthlyYear}_M${monthlyMonth}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Download excel error', err);
            alert('Erreur lors du téléchargement du fichier Excel.');
        }
    };

    const handleOpenPrintMatrix = () => {
        if (!monthlyGroup) return;
        window.open(`/admin/print-monthly-matrix/${monthlyGroup}?year=${monthlyYear}&month=${monthlyMonth}`, '_blank');
    };

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const res = await studentService.getGroups();
                setAvailableGroups(res.groups || []);
            } catch (error) {
                console.error('Error fetching groups', error);
            }
        };
        fetchGroups();

        const fetchReports = async () => {
            try {
                const res = await reportService.getAdminReports();
                const mappedReports = (res.reports || []).map(r => {
                    return {
                        ...r,
                        date: formatDate(r.date),
                        id: r.report_code,
                        db_id: r.id,
                        formateur: r.formateur_name,
                        salle: r.salle_name
                    };
                });
                setAllReports(mappedReports);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching reports', error);
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    const displayedAbsences = allReports.filter(record => {
        const matchesDate = !selectedDate || record.date === selectedDate;
        const matchesGroup = groupFilter === 'ALL' || record.group_id === groupFilter;
        const matchesSearch = !searchQuery ||
            (record.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                record.studentId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                record.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                record.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                record.formateur?.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesDate && matchesSearch && matchesGroup;
    });

    const toggleSelectAll = () => {
        if (selectedRecords.length === displayedAbsences.length && displayedAbsences.length > 0) {
            setSelectedRecords([]);
        } else {
            setSelectedRecords(displayedAbsences.map(r => r.id));
        }
    };

    const toggleSelectRecord = (id) => {
        if (selectedRecords.includes(id)) {
            setSelectedRecords(selectedRecords.filter(rId => rId !== id));
        } else {
            setSelectedRecords([...selectedRecords, id]);
        }
    };

    const handleExportPDF = (ids = selectedRecords) => {
        const targetIds = Array.isArray(ids) ? ids : selectedRecords;
        if (targetIds.length === 0) return;
        setIsExporting(true);
        executeExportPDF(targetIds);
    };

    const executeExportPDF = async (targetIds) => {
        for (const recordId of targetIds) {
            const element = document.getElementById(`pdf-export-${recordId}`);
            if (element) {
                element.style.display = 'block';
                await new Promise(resolve => setTimeout(resolve, 150));
                await exportElementToPDF(element, `Rapport_ISTA_${recordId}.pdf`);
                element.style.display = 'none';
            }
        }
        setIsExporting(false);
        if (targetIds === selectedRecords) {
            setSelectedRecords([]);
        }
    };

    const handleExportExcel = (ids = selectedRecords) => {
        const targetIds = Array.isArray(ids) ? ids : selectedRecords;
        if (targetIds.length === 0) return;
        setIsExporting(true);
        loadXLSX().then(() => {
            executeExportExcel(targetIds);
        });
    };

    const executeExportExcel = async (targetIds) => {
        try {
            for (const recordId of targetIds) {
                const rapport = displayedAbsences.find(r => r.id === recordId);
                if (!rapport) continue;

                const absents = (rapport.stagiaires || []).filter(s => s.status === 'ABSENT');
                const total = rapport.total_group_students || (rapport.stagiaires || []).length;
                const taux = total > 0 ? Math.round((absents.length / total) * 100) : 0;

                const ws_data = [
                    [t('reports.export_title')],
                    [t('reports.export_subtitle', 'Modèle professionnel (version modernisée)')],
                    [],
                    [t('reports.col_group'), rapport.group_id],
                    [t('reports.export_salle', 'Salle'), rapport.salle || 'N/A'],
                    [t('reports.col_date'), rapport.date],
                    [t('reports.export_time', 'Horaire'), rapport.heure || 'N/A'],
                    [t('reports.col_formateur'), rapport.formateur],
                    [],
                    [t('reports.export_total', 'Nombre total'), total],
                    [t('reports.export_absents_count', 'Absents'), absents.length],
                    [t('reports.col_absent_rate'), `${taux}%`],
                    [],
                    [t('reports.export_num', 'N°'), t('reports.export_student'), t('reports.export_id'), t('reports.export_status')],
                    ...absents.map((s, i) => [i + 1, s.name, s.id, t('reports.absent_label')])
                ];

                const colWidths = [
                    { wch: 15 },
                    { wch: 30 },
                    { wch: 20 },
                    { wch: 15 }
                ];

                await exportDataToExcel(ws_data, `Rapport_ISTA_${recordId}.xlsx`, colWidths);
            }
        } catch (error) {
            console.error("Export Excel error", error);
        }
        setIsExporting(false);
        if (targetIds === selectedRecords) {
            setSelectedRecords([]);
        }
    };

    return (
        <div className={`rapports-container ${isRtl ? 'rtl' : ''}`}>
            
            <div className={`rapports-header ${isRtl ? 'rtl' : ''}`}>
                <div className="rapports-title-wrapper">
                    <h1 className="rapports-title">
                        {t('reports.title')}
                    </h1>
                    <p className="rapports-subtitle">
                        {t('reports.subtitle')}
                    </p>
                </div>
            </div>

            <div className="rapports-group-cards-row ista-scrollbar">
                <div
                    onClick={() => setGroupFilter('ALL')}
                    className={`rapports-group-card ${groupFilter === 'ALL' ? 'active' : 'inactive'}`}
                >
                    <div className={`rapports-card-header ${isRtl ? 'rtl' : ''}`}>
                        <span className={`rapports-card-id ${groupFilter === 'ALL' ? 'active' : 'inactive'} ${isRtl ? 'rtl' : ''}`}>
                            {t('reports.all_groups')}
                        </span>
                        <div className={`rapports-card-indicator ${groupFilter === 'ALL' ? 'active' : 'inactive'}`}></div>
                    </div>
                    <h3 className={`rapports-card-title ${isRtl ? 'rtl' : ''}`}>
                        {t('reports.all_groups')}
                    </h3>
                    <p className={`rapports-card-subtitle ${isRtl ? 'rtl' : ''}`}>
                        {t('reports.title')}: <span className="rapports-card-highlight">
                            {allReports.length} {t('reports.export_button')}s
                        </span>
                    </p>
                </div>

                {availableGroups.length > 0 ? (
                    availableGroups.map((grp) => {
                        const grpReportsCount = allReports.filter(r => r.group_id === grp.id).length;
                        return (
                            <div
                                key={grp.id}
                                onClick={() => setGroupFilter(grp.id)}
                                className={`rapports-group-card ${groupFilter === grp.id ? 'active' : 'inactive'}`}
                            >
                                <div className={`rapports-card-header ${isRtl ? 'rtl' : ''}`}>
                                    <span className={`rapports-card-id ${groupFilter === grp.id ? 'active' : 'inactive'} ${isRtl ? 'rtl' : ''}`}>
                                        {(grp.id || '').split('-')[0].trim()}
                                    </span>
                                    <div className={`rapports-card-indicator ${groupFilter === grp.id ? 'active' : 'inactive'}`}></div>
                                </div>
                                <h3 className={`rapports-card-title ${isRtl ? 'rtl' : ''}`}>
                                    {grp.id}
                               </h3>
                                <p className={`rapports-card-subtitle ${isRtl ? 'rtl' : ''}`}>
                                    {t('accounts.col_filiere')}: <span className="rapports-card-highlight">
                                        {grp.filiere || 'GESTION DES ENTREPRISES'}
                                    </span>
                                    <span className="rapports-card-dot">•</span>
                                    <span className="rapports-card-count">{grpReportsCount}</span>
                                </p>
                            </div>
                        );
                    })
                ) : (
                    <div className="rapports-no-groups">
                        <p className="rapports-no-groups-text">{t('accounts.no_groups_available')}</p>
                    </div>
                )}
            </div>

            <div className={`rapports-filters-bar ${isRtl ? 'rtl' : ''}`}>
                <div className={`rapports-filters-left ${isRtl ? 'rtl' : ''}`}>
                    <h3 className="rapports-filters-title">{t('reports.list_title')}</h3>
                    <div className="rapports-filters-divider"></div>
                    <div className={`rapports-search-wrapper ${isRtl ? 'rtl' : ''}`}>
                        <Search className="rapports-search-icon" />
                        <input
                            type="text"
                            placeholder={t('reports.search')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`rapports-search-input ${isRtl ? 'rtl' : ''}`}
                        />
                    </div>
                </div>
                <div className={`rapports-filters-right ${isRtl ? 'rtl' : ''}`}>
                    <CustomDatePicker
                        selectedDate={selectedDate}
                        onChange={setSelectedDate}
                        placeholder={t('reports.filter_date')}
                    />

                    <button
                        onClick={() => {
                            setIsMonthlyModalOpen(true);
                            if (monthlyGroup) handleFetchMonthlyMatrix();
                        }}
                        className="btn-ista btn-monthly-matrix"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                            color: '#ffffff',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Calendar size={16} />
                        <span>Fiche Mensuelle d'Assiduité</span>
                    </button>
                    
                    <div className="rapports-export-wrapper">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            disabled={isExporting || selectedRecords.length === 0}
                            className={`btn-ista rapports-export-btn ${selectedRecords.length === 0 ? 'disabled' : 'active'}`}
                        >
                            <Download className={`rapports-export-icon ${isExporting ? 'animating' : ''}`} />
                            <span className="rapports-export-text">
                                {isExporting 
                                    ? t('reports.exporting', 'EXPORTATION...') 
                                    : (selectedRecords.length > 0 
                                        ? `${t('reports.export_btn', 'EXPORTER')} (${selectedRecords.length})` 
                                        : t('reports.export_btn', 'EXPORTER'))}
                            </span>
                            <ChevronDown className="rapports-export-chevron" />
                        </button>

                        {showExportMenu && selectedRecords.length > 0 && (
                            <div className="rapports-export-menu">
                                <button 
                                    onClick={() => { setShowExportMenu(false); handleExportPDF(); }}
                                    className="rapports-export-option border-b"
                                >
                                    {t('reports.format_pdf', 'Format PDF')}
                                </button>
                                <button 
                                    onClick={() => { setShowExportMenu(false); handleExportExcel(); }}
                                    className="rapports-export-option"
                                >
                                    {t('reports.format_excel', 'Format EXCEL')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="rapports-table-container">
                {loading ? (
                    <div className="rapports-loading-state">
                        <div className="rapports-spinner"></div>
                        <span className="rapports-loading-text">{t('reports.loading')}</span>
                    </div>
                ) : displayedAbsences.length === 0 ? (
                    <div className="rapports-empty-state">
                        <div className="rapports-empty-icon-wrapper">
                            <AlertTriangle className="rapports-empty-icon" />
                        </div>
                        <span className="rapports-empty-title">{t('reports.not_found')}</span>
                        <p className="rapports-empty-subtitle">{t('reports.adjust_filters')}</p>
                    </div>
                ) : (
                    <div className="rapports-table-wrapper ista-scrollbar">
                        <table className={`rapports-table ${isRtl ? 'rtl' : ''}`}>
                            <thead>
                                <tr className="rapports-thead-tr">
                                    <th className="rapports-th-select">
                                        <div onClick={toggleSelectAll} className="rapports-select-box">
                                            {selectedRecords.length === displayedAbsences.length && displayedAbsences.length > 0 ? (
                                                <CheckSquare className="rapports-icon-selected" />
                                            ) : (
                                                <Square className="rapports-icon-unselected" />
                                            )}
                                        </div>
                                    </th>
                                    <th className="rapports-th">{t('reports.col_date')}</th>
                                    <th className="rapports-th">{t('reports.col_formateur')}</th>
                                    <th className="rapports-th">{t('reports.col_subject')}</th>
                                    <th className="rapports-th">{t('reports.col_group')}</th>
                                    <th className="rapports-th">{t('reports.col_absent_rate')}</th>
                                    <th className={`rapports-th-actions ${isRtl ? 'rtl' : 'ltr'}`}>{t('reports.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="rapports-tbody">
                                {displayedAbsences.map((record) => (
                                    <tr key={record.id} className="rapports-tr group">
                                        <td className="rapports-td-select">
                                            <div onClick={() => toggleSelectRecord(record.id)} className="rapports-select-box">
                                                {selectedRecords.includes(record.id) ? (
                                                    <CheckSquare className="rapports-icon-selected" />
                                                ) : (
                                                    <Square className="rapports-icon-unselected" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="rapports-td">
                                            <span className="rapports-td-date">{record.date}</span>
                                        </td>
                                        <td className="rapports-td">
                                            <span className="rapports-td-formateur">{record.formateur}</span>
                                        </td>
                                        <td className="rapports-td">
                                            <span className="rapports-td-subject" title={record.subject}>
                                                {record.subject}
                                            </span>
                                        </td>
                                        <td className="rapports-td">
                                            <span className="rapports-badge">
                                                {record.group_id}
                                            </span>
                                        </td>
                                        <td className="rapports-td">
                                            <div className="rapports-rate-wrapper">
                                                <span className="rapports-rate-val">
                                                    {(record.stagiaires || []).filter(s => s.status === 'ABSENT').length} / {record.total_group_students || (record.stagiaires || []).length}
                                                </span>
                                                <span className="rapports-rate-lbl">{t('reports.absent_label')}</span>
                                            </div>
                                        </td>
                                        <td className={`rapports-td-actions ${isRtl ? 'rtl' : 'ltr'}`}>
                                            <button
                                                onClick={() => setSelectedRapport(record)}
                                                className="rapports-btn-view"
                                            >
                                                <FileText className="rapports-btn-view-icon" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <RapportModal
                isOpen={!!selectedRapport}
                onClose={() => setSelectedRapport(null)}
                rapport={selectedRapport}
                onExportPDF={() => handleExportPDF([selectedRapport.id])}
                onExportExcel={() => handleExportExcel([selectedRapport.id])}
                isExporting={isExporting}
            />

            <div className="absolute left-[-9999px] top-[-9999px] w-0 h-0 overflow-hidden">
                {displayedAbsences.map(rapport => {
                    const absents = (rapport.stagiaires || []).filter(s => s.status === 'ABSENT');
                    const total = (rapport.stagiaires || []).length;
                    const taux = total > 0 ? Math.round((absents.length / total) * 100) : 0;

                    return (
                    <div
                        key={`export-${rapport.id}`}
                        id={`pdf-export-${rapport.id}`}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        style={{ display: 'none', width: '210mm', backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'visible' }}
                        className="rapports-pdf-container"
                    >
                        <div className="rapports-pdf-wrapper">
                            <h1 className="rapports-pdf-title">{t('reports.export_title')}</h1>
                            <h2 className="rapports-pdf-subtitle">{t('reports.export_subtitle', 'Modèle professionnel (version modernisée)')}</h2>

                            <div className="rapports-pdf-info-section">
                                <table className="rapports-pdf-table-info main">
                                    <tbody>
                                        <tr>
                                            <td className="rapports-pdf-td-label w-33">{t('reports.col_group')}</td>
                                            <td className="rapports-pdf-td-value">{rapport.group_id}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.export_salle', 'Salle')}</td>
                                            <td className="rapports-pdf-td-value">{rapport.salle || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.col_date')}</td>
                                            <td className="rapports-pdf-td-value">{rapport.date}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.export_time', 'Horaire')}</td>
                                            <td className="rapports-pdf-td-value">{rapport.heure || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.col_formateur')}</td>
                                            <td className="rapports-pdf-td-value">{rapport.formateur}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <table className="rapports-pdf-table-info secondary">
                                    <tbody>
                                        <tr>
                                            <td className="rapports-pdf-td-label w-50">{t('reports.export_total', 'Nombre total')}</td>
                                            <td className="rapports-pdf-td-value">{total}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.export_absents_count', 'Absents')}</td>
                                            <td className="rapports-pdf-td-value">{absents.length}</td>
                                        </tr>
                                        <tr>
                                            <td className="rapports-pdf-td-label">{t('reports.col_absent_rate')}</td>
                                            <td className="rapports-pdf-td-value">{taux}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="rapports-pdf-students-section">
                                <table className="rapports-pdf-table-students">
                                    <thead>
                                        <tr>
                                            <th className="rapports-pdf-th-num">{t('reports.export_num', 'N°')}</th>
                                            <th className="rapports-pdf-th-name">{t('reports.export_student')}</th>
                                            <th className="rapports-pdf-th-id">{t('reports.export_id')}</th>
                                            <th className="rapports-pdf-th-status">{t('reports.export_status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {absents.map((stagiaire, idx) => (
                                            <tr key={idx}>
                                                <td className="rapports-pdf-td">{idx + 1}</td>
                                                <td className="rapports-pdf-td">{stagiaire.name}</td>
                                                <td className="rapports-pdf-td">{stagiaire.id}</td>
                                                <td className="rapports-pdf-td">{t('reports.absent_label')}</td>
                                            </tr>
                                        ))}
                                        {absents.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="rapports-pdf-td-empty">{t('reports.no_absences_found')}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="rapports-pdf-signature-section">
                                <h3 className="rapports-pdf-signature-label">{t('reports.signature_label', 'Signature du formateur')}</h3>
                                {rapport.signature ? (
                                    <div className="rapports-pdf-signature-image-wrapper">
                                        <img 
                                            src={getSignatureDataURI(rapport.signature)} 
                                            alt="Signature" 
                                            className="rapports-pdf-signature-image"
                                        />
                                    </div>
                                ) : (
                                    <div className="rapports-pdf-signature-placeholder"></div>
                                )}
                            </div>
                        </div>
                    </div>
                )})}
            </div>

            {/* ========================================================= */}
            {/* 📊 MODAL : FICHE MENSUELLE D'ASSIDUITÉ & MATRICE D'ABSENCES */}
            {/* ========================================================= */}
            {isMonthlyModalOpen && (
                <div className="st-modal-overlay fade-in" style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 120,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '680px',
                        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
                        color: '#f8fafc',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '20px 24px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            background: 'rgba(15, 23, 42, 0.6)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Calendar size={22} color="#38bdf8" />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                                    Fiche Mensuelle d'Assiduité (Format Officiel)
                                </h3>
                            </div>
                            <button 
                                onClick={() => setIsMonthlyModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '24px' }}>
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px' }}>
                                Sélectionnez le groupe et le mois pour générer la grille complète des présences/absences (jours 1 à 31) avec calcul automatique des pourcentages et bilans.
                            </p>

                            {/* Filters row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr', gap: '14px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                                        Groupe :
                                    </label>
                                    <select
                                        value={monthlyGroup}
                                        onChange={(e) => {
                                            setMonthlyGroup(e.target.value);
                                        }}
                                        style={{
                                            width: '100%',
                                            background: '#0f172a',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            color: '#fff',
                                            borderRadius: '10px',
                                            padding: '10px 12px',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    >
                                        {availableGroups.map((g) => (
                                            <option key={g.id} value={g.id}>{g.id}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                                        Mois :
                                    </label>
                                    <select
                                        value={monthlyMonth}
                                        onChange={(e) => setMonthlyMonth(Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            background: '#0f172a',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            color: '#fff',
                                            borderRadius: '10px',
                                            padding: '10px 12px',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    >
                                        {MONTHS_LIST.map((m) => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                                        Année :
                                    </label>
                                    <input
                                        type="number"
                                        value={monthlyYear}
                                        onChange={(e) => setMonthlyYear(Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            background: '#0f172a',
                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                            color: '#fff',
                                            borderRadius: '10px',
                                            padding: '10px 12px',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Action to preview */}
                            <div style={{ marginBottom: '20px' }}>
                                <button
                                    onClick={handleFetchMonthlyMatrix}
                                    disabled={monthlyLoading}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        color: '#e2e8f0',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Eye size={15} /> {monthlyLoading ? 'Calcul des données...' : 'Actualiser / Prévisualiser la période'}
                                </button>
                            </div>

                            {monthlyError && (
                                <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fda4af', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
                                    {monthlyError}
                                </div>
                            )}

                            {monthlyMatrixData && (
                                <div style={{
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>Stagiaires Inscrits</span>
                                            <strong style={{ fontSize: '1.3rem', color: '#38bdf8' }}>{monthlyMatrixData.totalStudents}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>Séances Enregistrées</span>
                                            <strong style={{ fontSize: '1.3rem', color: '#34d399' }}>{monthlyMatrixData.totalSessions}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '10px' }}>
                                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>Période</span>
                                            <strong style={{ fontSize: '0.95rem', color: '#fbbf24' }}>{monthlyMatrixData.monthStr}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Export Buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <button
                                    onClick={handleDownloadExcelMatrix}
                                    style={{
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '14px',
                                        borderRadius: '12px',
                                        fontWeight: '700',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    <FileSpreadsheet size={18} />
                                    Exporter en Excel (.xlsx)
                                </button>

                                <button
                                    onClick={handleOpenPrintMatrix}
                                    style={{
                                        background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '14px',
                                        borderRadius: '12px',
                                        fontWeight: '700',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 16px rgba(37, 99, 235, 0.3)'
                                    }}
                                >
                                    <Printer size={18} />
                                    Imprimer Fiche (A4 Paysage)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Rapports;
