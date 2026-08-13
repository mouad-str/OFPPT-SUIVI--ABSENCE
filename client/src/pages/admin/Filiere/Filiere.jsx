import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
    Layers, Plus, Trash2, Edit2, Search, X, Check, AlertTriangle, 
    ArrowRight, Hash, Activity, Users, BookOpen, Download, LayoutGrid, 
    Table as TableIcon, ArrowUpDown, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import studentService from '../../../services/studentService';
import './Filiere.css';
import '../../../styles/admin-shared.css';

const SkeletonCard = () => (
    <div className="filiere-skeleton-card">
        <div className="skeleton-shimmer filiere-skeleton-icon"></div>
        <div className="skeleton-shimmer filiere-skeleton-title"></div>
        <div className="skeleton-shimmer filiere-skeleton-badge"></div>
        <div className="filiere-skeleton-footer">
            <div className="skeleton-shimmer filiere-skeleton-pill"></div>
            <div className="skeleton-shimmer filiere-skeleton-pill"></div>
        </div>
    </div>
);

const exportFilieresCSV = (filieres) => {
    const rows = [
        ['ID Filière', 'Nom de la Filière', 'Nombre de Groupes', 'Nombre de Stagiaires'],
        ...filieres.map(f => [
            f.id,
            `"${(f.nom || '').replace(/"/g, '""')}"`,
            f.groupes_count || 0,
            f.stagiaires_count || 0
        ])
    ];
    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `filieres_catalogue_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

const Filiere = () => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'ar';
    const [filieres, setFilieres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [viewMode, setViewMode] = useState('grid');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFiliere, setEditingFiliere] = useState(null);
    const [formData, setFormData] = useState({ nom: '' });
    const [submitting, setSubmitting] = useState(false);
    
    const [isDeleting, setIsDeleting] = useState(null);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState(null);

    const [toast, setToast] = useState(null);

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchFilieres = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await studentService.getFilieres();
            setFilieres(res.filieres || []);
        } catch (err) {
            console.error("FETCH FILIERES ERROR:", err);
            setError("Impossible de charger la liste des filières.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFilieres();
    }, []);

    const handleOpenModal = (filiere = null) => {
        if (filiere) {
            setEditingFiliere(filiere);
            setFormData({ nom: filiere.nom });
        } else {
            setEditingFiliere(null);
            setFormData({ nom: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.nom.trim()) return;
        setSubmitting(true);
        try {
            if (editingFiliere) {
                await studentService.updateFiliere(editingFiliere.id, formData);
                showToast('success', 'Filière mise à jour avec succès');
            } else {
                await studentService.createFiliere(formData);
                showToast('success', 'Nouvelle filière ajoutée avec succès');
            }
            setIsModalOpen(false);
            fetchFilieres();
        } catch (err) {
            console.error("SUBMIT FILIERE ERROR:", err);
            showToast('error', err.response?.data?.message || "Erreur lors de l'enregistrement");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleteErrorMessage(null);
        try {
            await studentService.deleteFiliere(id);
            setIsDeleting(null);
            showToast('success', 'Filière supprimée avec succès');
            fetchFilieres();
        } catch (err) {
            console.error("DELETE FILIERE ERROR:", err);
            const msg = err.response?.data?.message || "Erreur lors de la suppression de la filière.";
            setDeleteErrorMessage(msg);
        }
    };

    const [flippedCardId, setFlippedCardId] = useState(null);

    const handleFlip = (filiere) => {
        if (flippedCardId === filiere.id) {
            setFlippedCardId(null);
        } else {
            setFlippedCardId(filiere.id);
            setFormData({ nom: filiere.nom });
        }
    };

    const handleQuickUpdate = async (id) => {
        if (!formData.nom.trim()) return;
        setSubmitting(true);
        try {
            await studentService.updateFiliere(id, formData);
            setFlippedCardId(null);
            showToast('success', 'Modifications enregistrées');
            fetchFilieres();
        } catch (err) {
            console.error("UPDATE FILIERE ERROR:", err);
            showToast('error', "Échec de la mise à jour");
        } finally {
            setSubmitting(false);
        }
    };

    const stats = useMemo(() => {
        const totalFilieres = filieres.length;
        const totalGroups = filieres.reduce((acc, f) => acc + (parseInt(f.groupes_count) || 0), 0);
        const totalStagiaires = filieres.reduce((acc, f) => acc + (parseInt(f.stagiaires_count) || 0), 0);
        const largestFiliere = [...filieres].sort((a, b) => (b.stagiaires_count || 0) - (a.stagiaires_count || 0))[0];
        return { totalFilieres, totalGroups, totalStagiaires, largestFiliere };
    }, [filieres]);

    const filteredAndSortedFilieres = useMemo(() => {
        return filieres
            .filter(f => 
                (f.nom || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(f.id).includes(searchTerm)
            )
            .sort((a, b) => {
                if (sortBy === 'name-asc') return (a.nom || '').localeCompare(b.nom || '');
                if (sortBy === 'name-desc') return (b.nom || '').localeCompare(a.nom || '');
                if (sortBy === 'groups-desc') return (b.groupes_count || 0) - (a.groupes_count || 0);
                if (sortBy === 'stagiaires-desc') return (b.stagiaires_count || 0) - (a.stagiaires_count || 0);
                return 0;
            });
    }, [filieres, searchTerm, sortBy]);

    return (
        <div className={`filiere-container ${isRtl ? 'rtl' : ''}`}>
            
            {toast && (
                <div className={`filiere-toast ${toast.type}`}>
                    {toast.type === 'success' ? <CheckCircle2 className="toast-icon" /> : <AlertCircle className="toast-icon" />}
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="toast-close"><X size={16} /></button>
                </div>
            )}

            <div className={`filiere-header-section ${isRtl ? 'rtl' : ''}`}>
                <div className="filiere-title-wrapper">
                    <h1 className="filiere-title">
                        {t('nav.filieres_nav', 'Gestion des Filières')}
                    </h1>
                    <div className={`filiere-subtitle-wrapper ${isRtl ? 'rtl' : ''}`}>
                        <div className="pulse-dot"></div>
                        <span>Secteurs & Spécialités de Formation OFPPT</span>
                    </div>
                </div>

                <div className="filiere-top-actions">
                    <button 
                        onClick={() => exportFilieresCSV(filieres)} 
                        disabled={filieres.length === 0}
                        className="btn-ista-secondary"
                        title="Télécharger le catalogue des filières"
                    >
                        <Download size={18} />
                        <span>Exporter CSV</span>
                    </button>
                    <button onClick={() => handleOpenModal()} className="btn-ista btn-add-filiere">
                        <Plus className="btn-add-icon" />
                        <span>{t('filiere.add_button', 'Nouvelle Filière')}</span>
                    </button>
                </div>
            </div>

            <div className="filiere-stats-grid">
                <div className="filiere-stat-card">
                    <div className="filiere-stat-icon-bg primary">
                        <Layers className="filiere-stat-icon" />
                    </div>
                    <div className="filiere-stat-info">
                        <span className="filiere-stat-label">Total Filières</span>
                        <span className="filiere-stat-value">{loading ? '...' : stats.totalFilieres}</span>
                    </div>
                </div>

                <div className="filiere-stat-card">
                    <div className="filiere-stat-icon-bg success">
                        <BookOpen className="filiere-stat-icon" />
                    </div>
                    <div className="filiere-stat-info">
                        <span className="filiere-stat-label">Groupes Associés</span>
                        <span className="filiere-stat-value">{loading ? '...' : stats.totalGroups}</span>
                    </div>
                </div>

                <div className="filiere-stat-card">
                    <div className="filiere-stat-icon-bg info">
                        <Users className="filiere-stat-icon" />
                    </div>
                    <div className="filiere-stat-info">
                        <span className="filiere-stat-label">Stagiaires Enrôlés</span>
                        <span className="filiere-stat-value">{loading ? '...' : stats.totalStagiaires}</span>
                    </div>
                </div>

                <div className="filiere-stat-card">
                    <div className="filiere-stat-icon-bg warning">
                        <Activity className="filiere-stat-icon" />
                    </div>
                    <div className="filiere-stat-info">
                        <span className="filiere-stat-label">Pôle Principal</span>
                        <span className="filiere-stat-value text-truncate">
                            {loading ? '...' : (stats.largestFiliere?.nom || 'Aucun')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="filiere-control-bar">
                <div className="filiere-search-wrapper">
                    <Search className={`filiere-search-icon ${isRtl ? 'rtl' : 'ltr'}`} />
                    <input
                        type="text"
                        placeholder="Rechercher par nom ou code..."
                        className={`filiere-search-input ${isRtl ? 'rtl' : 'ltr'}`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="filiere-search-clear">
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="filiere-controls-right">
                    <div className="filiere-sort-wrapper">
                        <ArrowUpDown size={16} className="filiere-sort-icon" />
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)}
                            className="filiere-sort-select"
                        >
                            <option value="name-asc">Nom (A-Z)</option>
                            <option value="name-desc">Nom (Z-A)</option>
                            <option value="groups-desc">Nombre de Groupes (Élevé)</option>
                            <option value="stagiaires-desc">Stagiaires Enrôlés (Élevé)</option>
                        </select>
                    </div>

                    <div className="filiere-view-toggle">
                        <button 
                            className={`filiere-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Vue Grille"
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button 
                            className={`filiere-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                            title="Vue Tableau"
                        >
                            <TableIcon size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="filiere-error-banner">
                    <AlertCircle className="error-icon" />
                    <span>{error}</span>
                    <button onClick={fetchFilieres} className="btn-retry">
                        <RefreshCw size={14} /> Réessayer
                    </button>
                </div>
            )}

            {loading ? (
                <div className="filiere-grid">
                    {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : viewMode === 'grid' ? (
                <div className="filiere-grid">
                    <div onClick={() => handleOpenModal()} className="filiere-init-card">
                        <div className="filiere-init-icon-wrapper">
                            <Plus className="filiere-init-icon" />
                        </div>
                        <h3 className="filiere-init-title">{t('filiere.new_unit', 'Ajouter une Filière')}</h3>
                        <p className="filiere-init-subtitle">{t('filiere.register_specialty', 'Enregistrer un nouveau parcours')}</p>
                    </div>

                    {filteredAndSortedFilieres.length > 0 ? (
                        filteredAndSortedFilieres.map((filiere) => (
                            <div key={filiere.id} className="filiere-card-container">
                                <div className={`filiere-card-inner ${flippedCardId === filiere.id ? 'flipped' : ''}`}>
                                    
                                    <div className="filiere-card-front">
                                        <div className="filiere-card-bg-shape"></div>

                                        <div className="filiere-card-header">
                                            <div className="filiere-card-icon-wrapper">
                                                <Layers className="filiere-card-icon" />
                                            </div>
                                            <div className="filiere-card-actions">
                                                <button onClick={() => handleFlip(filiere)} className="filiere-action-btn edit" title="Modification rapide">
                                                    <Edit2 className="filiere-action-icon" />
                                                </button>
                                                <button onClick={() => { setIsDeleting(filiere.id); setDeleteErrorMessage(null); }} className="filiere-action-btn delete" title="Supprimer">
                                                    <Trash2 className="filiere-action-icon" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="filiere-card-content">
                                            <div className="filiere-id-wrapper">
                                                <Hash className="filiere-id-icon" />
                                                <span className="filiere-id-text">Code #{filiere.id}</span>
                                            </div>
                                            <h2 className="filiere-card-title" title={filiere.nom}>
                                                {filiere.nom}
                                            </h2>
                                            
                                            <div className="filiere-card-metrics">
                                                <div className="filiere-metric-pill">
                                                    <BookOpen size={14} />
                                                    <span>{filiere.groupes_count || 0} Groupes</span>
                                                </div>
                                                <div className="filiere-metric-pill">
                                                    <Users size={14} />
                                                    <span>{filiere.stagiaires_count || 0} Stagiaires</span>
                                                </div>
                                            </div>

                                            <div className="filiere-status-badge">
                                                <div className="filiere-status-dot"></div>
                                                <span className="filiere-status-text">{t('filiere.active_training', 'Formation Active')}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="filiere-card-back">
                                        <div className="filiere-back-header">
                                            <span className="filiere-back-title">{t('filiere.update_ref', 'Modifier l\'intitulé')}</span>
                                            <button onClick={() => setFlippedCardId(null)} className="filiere-close-btn">
                                                <X className="filiere-close-icon" />
                                            </button>
                                        </div>

                                        <div className="filiere-back-form">
                                            <div className="admin-header-text">
                                                <label className="filiere-label">{t('filiere.label', 'Intitulé de la filière')}</label>
                                                <textarea
                                                    autoFocus
                                                    required
                                                    rows={3}
                                                    className="filiere-textarea ista-scrollbar"
                                                    placeholder={t('filiere.placeholder', 'Ex: Développement Digital')}
                                                    value={formData.nom}
                                                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleQuickUpdate(filiere.id)}
                                            disabled={submitting}
                                            className="btn-ista filiere-save-btn"
                                        >
                                            {submitting ? (
                                                <Activity className="filiere-save-icon animate-spin text-white" />
                                            ) : (
                                                <>
                                                    <Check className="filiere-save-icon" />
                                                    <span>{t('filiere.save', 'Enregistrer')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="filiere-empty-state">
                            <div className="filiere-empty-icon-wrapper">
                                 <Layers className="filiere-empty-icon" />
                            </div>
                            <p className="filiere-empty-text">Aucune filière trouvée pour "{searchTerm}"</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="filiere-table-wrapper">
                    <table className="filiere-table">
                        <thead>
                            <tr>
                                <th># Code</th>
                                <th>Nom de la Filière</th>
                                <th>Groupes Associés</th>
                                <th>Stagiaires Enrôlés</th>
                                <th>Statut</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedFilieres.length > 0 ? (
                                filteredAndSortedFilieres.map((filiere) => (
                                    <tr key={filiere.id}>
                                        <td className="font-mono text-muted">#{filiere.id}</td>
                                        <td className="font-semibold text-primary">{filiere.nom}</td>
                                        <td>
                                            <span className="table-badge groups">
                                                <BookOpen size={13} /> {filiere.groupes_count || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="table-badge students">
                                                <Users size={13} /> {filiere.stagiaires_count || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="table-status-pill active">Active</span>
                                        </td>
                                        <td>
                                            <div className="table-actions">
                                                <button onClick={() => handleOpenModal(filiere)} className="table-action-btn edit" title="Editer">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => { setIsDeleting(filiere.id); setDeleteErrorMessage(null); }} className="table-action-btn delete" title="Supprimer">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="table-empty">
                                        Aucune filière ne correspond à votre recherche.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && ReactDOM.createPortal(
                <div className="filiere-modal-overlay">
                    <div className="filiere-modal-content">
                        
                        <div className="filiere-modal-header filiere-header-gradient">
                            <button onClick={() => setIsModalOpen(false)} className="filiere-modal-close">
                                <X className="filiere-modal-close-icon" />
                            </button>
                            <div className={`filiere-modal-header-content ${isRtl ? 'rtl' : ''}`}>
                                <div className="filiere-modal-icon-wrapper">
                                    <Layers className="filiere-modal-icon" />
                                </div>
                                <div>
                                    <h2 className="filiere-modal-title">
                                        {editingFiliere ? t('filiere.modal_edit', 'Modifier la Filière') : t('filiere.modal_new', 'Nouvelle Filière')}
                                    </h2>
                                    <p className="filiere-modal-subtitle">
                                        {t('filiere.modal_admin', 'Gestion du catalogue des filières ISTA')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="filiere-modal-form">
                            <div className="filiere-modal-label-wrapper">
                                <label className={`filiere-modal-label ${isRtl ? 'rtl' : ''}`}>
                                    <Layers className="filiere-modal-label-icon" />
                                    {t('filiere.modal_label', 'Intitulé Officiel de la Filière')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    className={`filiere-modal-input ${isRtl ? 'rtl' : ''}`}
                                    placeholder={t('filiere.modal_placeholder', 'Ex: Développement Digital option Web Fullstack')}
                                    value={formData.nom}
                                    onChange={(e) => setFormData({ nom: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting || !formData.nom.trim()}
                                className={`filiere-modal-submit ${submitting || !formData.nom.trim() ? 'disabled' : 'active'}`}
                            >
                                {submitting ? (
                                    <>
                                        <Activity className="filiere-submit-icon animate-spin" />
                                        {t('filiere.sync', 'Enregistrement...')}
                                    </>
                                ) : (
                                    <>
                                        {editingFiliere ? t('filiere.modal_update', 'Mettre à jour') : t('filiere.modal_save', 'Créer la filière')}
                                        <ArrowRight className={`filiere-submit-arrow ${isRtl ? 'rtl' : ''}`} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="filiere-modal-footer">
                            <p className="filiere-modal-footer-text">OFPPT Smart Attendance • Système de Gestion Pédagogique</p>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {isDeleting && ReactDOM.createPortal(
                <div className="filiere-confirm-modal-wrapper">
                    <div className="filiere-confirm-modal">
                        <div className="filiere-confirm-icon-wrapper">
                            <AlertTriangle className="filiere-confirm-icon" />
                        </div>
                        <h2 className="filiere-confirm-title">{t('filiere.delete_title', 'Confirmer la Suppression')}</h2>
                        <p className="filiere-confirm-msg">
                            Êtes-vous sûr de vouloir supprimer cette filière ? Cette action est irréversible.
                        </p>
                        
                        {deleteErrorMessage && (
                            <div className="delete-error-alert">
                                <AlertCircle size={16} />
                                <span>{deleteErrorMessage}</span>
                            </div>
                        )}

                        <div className="filiere-confirm-actions">
                            <button onClick={() => { setIsDeleting(null); setDeleteErrorMessage(null); }} className="filiere-btn-cancel">
                                {t('common.cancel', 'Annuler')}
                            </button>
                            <button onClick={() => handleDelete(isDeleting)} className="filiere-btn-confirm">
                                {t('common.confirm', 'Supprimer définitivement')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Filiere;
