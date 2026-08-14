import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus, Edit3, Trash2, Clock, MapPin, User, Users, BookOpen, AlertCircle, X, Filter } from 'lucide-react';
import studentService from '../../../services/studentService';
import { useNotification } from '../../../hooks/useNotification';
import './Timetable.css';

const DAYS_OF_WEEK = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];

const Timetable = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();

    // Data lists
    const [slots, setSlots] = useState([]);
    const [formateurs, setFormateurs] = useState([]);
    const [groups, setGroups] = useState([]);
    const [salles, setSalles] = useState([]);

    // Filters
    const [filterType, setFilterType] = useState('ALL'); // ALL, GROUP, FORMATEUR, SALLE
    const [filterValue, setFilterValue] = useState('');

    // Loading & Error States
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null);
    const [formData, setFormData] = useState({
        formateur_id: '',
        group_id: '',
        day: 'LUNDI',
        startTime: '08:30',
        endTime: '11:30',
        salle_id: '',
        subject: ''
    });

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [schedRes, formRes, groupRes, salleRes] = await Promise.all([
                    studentService.getAdminSchedule(),
                    studentService.getFormateurs(),
                    studentService.getGroups(),
                    studentService.getSalles()
                ]);

                setSlots(schedRes.schedule || []);
                setFormateurs(formRes.formateurs || []);
                setGroups(groupRes.groups || []);
                setSalles(salleRes.salles || []);
            } catch (err) {
                console.error("Error loading timetable data:", err);
                addNotification("Erreur lors du chargement de l'emploi du temps.", "error");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const openCreateModal = () => {
        setEditingSlot(null);
        setErrorMsg(null);
        setFormData({
            formateur_id: formateurs[0]?.id || '',
            group_id: groups[0]?.id || '',
            day: 'LUNDI',
            startTime: '08:30',
            endTime: '11:30',
            salle_id: salles[0]?.id || '',
            subject: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (slot) => {
        setEditingSlot(slot);
        setErrorMsg(null);
        const parts = slot.time.split('-').map(p => p.trim());
        setFormData({
            formateur_id: slot.formateur_id,
            group_id: slot.group_id,
            day: slot.day,
            startTime: parts[0] || '08:30',
            endTime: parts[1] || '11:30',
            salle_id: slot.salle_id,
            subject: slot.subject
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce créneau de cours ?")) return;
        try {
            await studentService.deleteSchedule(id);
            setSlots(prev => prev.filter(s => s.id !== id));
            addNotification("Créneau de cours supprimé avec succès.", "success");
        } catch (err) {
            console.error("Delete slot error:", err);
            addNotification("Impossible de supprimer le créneau.", "error");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg(null);

        if (formData.startTime >= formData.endTime) {
            setErrorMsg("L'heure de début doit être antérieure à l'heure de fin.");
            return;
        }

        const timeString = `${formData.startTime} - ${formData.endTime}`;
        const payload = {
            formateur_id: parseInt(formData.formateur_id),
            group_id: formData.group_id,
            day: formData.day,
            time: timeString,
            salle_id: parseInt(formData.salle_id),
            subject: formData.subject
        };

        try {
            if (editingSlot) {
                await studentService.updateSchedule(editingSlot.id, payload);
                addNotification("Créneau modifié avec succès.", "success");
            } else {
                const res = await studentService.createSchedule(payload);
                addNotification("Créneau ajouté avec succès.", "success");
            }

            // Reload scheduler data to resolve names correctly
            const updatedSched = await studentService.getAdminSchedule();
            setSlots(updatedSched.schedule || []);
            setIsModalOpen(false);
        } catch (err) {
            console.error("Schedule submit error:", err);
            const serverMsg = err.response?.data?.message || "Erreur de configuration du créneau.";
            setErrorMsg(serverMsg);
        }
    };

    // Filter logic
    const filteredSlots = slots.filter(s => {
        if (filterType === 'ALL') return true;
        if (filterType === 'GROUP' && filterValue) return s.group_id === filterValue;
        if (filterType === 'FORMATEUR' && filterValue) return s.formateur_id === parseInt(filterValue);
        if (filterType === 'SALLE' && filterValue) return s.salle_id === parseInt(filterValue);
        return true;
    });

    if (loading) {
        return (
            <div className="timetable-loading">
                <div className="spinner"></div>
                <p>Chargement du planning en cours...</p>
            </div>
        );
    }

    return (
        <div className="timetable-page">
            {/* Header */}
            <div className="timetable-header">
                <div>
                    <h1 className="timetable-title">Gestion de l'Emploi du Temps</h1>
                    <p className="timetable-subtitle">Organisez les plannings de cours et résolvez automatiquement les conflits de salles et de formateurs.</p>
                </div>
                <button onClick={openCreateModal} className="btn-add-slot">
                    <Plus size={18} />
                    <span>Ajouter un créneau</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="timetable-filter-bar">
                <div className="filter-group">
                    <Filter className="filter-icon" size={16} />
                    <span className="filter-label">Filtrer par:</span>
                    
                    <select 
                        value={filterType} 
                        onChange={(e) => { setFilterType(e.target.value); setFilterValue(''); }}
                        className="filter-select-type"
                    >
                        <option value="ALL">Tout afficher</option>
                        <option value="GROUP">Groupe (Classe)</option>
                        <option value="FORMATEUR">Formateur</option>
                        <option value="SALLE">Salle de cours</option>
                    </select>

                    {filterType === 'GROUP' && (
                        <select 
                            value={filterValue} 
                            onChange={(e) => setFilterValue(e.target.value)}
                            className="filter-select-val"
                        >
                            <option value="">Sélectionner un groupe</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.id}</option>)}
                        </select>
                    )}

                    {filterType === 'FORMATEUR' && (
                        <select 
                            value={filterValue} 
                            onChange={(e) => setFilterValue(e.target.value)}
                            className="filter-select-val"
                        >
                            <option value="">Sélectionner un formateur</option>
                            {formateurs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    )}

                    {filterType === 'SALLE' && (
                        <select 
                            value={filterValue} 
                            onChange={(e) => setFilterValue(e.target.value)}
                            className="filter-select-val"
                        >
                            <option value="">Sélectionner une salle</option>
                            {salles.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                    )}
                </div>
            </div>

            {/* Grid Days view */}
            <div className="timetable-grid">
                {DAYS_OF_WEEK.map((day) => {
                    const daySlots = filteredSlots
                        .filter(s => s.day === day)
                        .sort((a, b) => a.time.localeCompare(b.time));

                    return (
                        <div key={day} className="timetable-col">
                            <div className="col-header">
                                <h3 className="col-day-title">{day}</h3>
                                <span className="col-slot-count">{daySlots.length} cours</span>
                            </div>

                            <div className="col-body ista-scrollbar">
                                {daySlots.length === 0 ? (
                                    <div className="slot-empty-state">Aucun cours</div>
                                ) : (
                                    daySlots.map((slot) => (
                                        <div key={slot.id} className="slot-card">
                                            <div className="slot-time-badge">
                                                <Clock size={12} />
                                                <span>{slot.time}</span>
                                            </div>

                                            <h4 className="slot-subject">{slot.subject}</h4>

                                            <div className="slot-info-item">
                                                <Users size={12} />
                                                <span>Groupe: <strong>{slot.group_id}</strong></span>
                                            </div>

                                            <div className="slot-info-item">
                                                <User size={12} />
                                                <span>Formateur: {slot.formateur_name}</span>
                                            </div>

                                            <div className="slot-info-item">
                                                <MapPin size={12} />
                                                <span>Salle: {slot.salle_name || 'Non spécifiée'}</span>
                                            </div>

                                            <div className="slot-actions">
                                                <button onClick={() => openEditModal(slot)} className="slot-btn edit" title="Modifier">
                                                    <Edit3 size={12} />
                                                </button>
                                                <button onClick={() => handleDelete(slot.id)} className="slot-btn delete" title="Supprimer">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Drawer Modal Form */}
            {isModalOpen && (
                <div className="timetable-modal-overlay">
                    <div className="timetable-modal-content">
                        <div className="modal-header">
                            <h2>{editingSlot ? 'Modifier le créneau' : 'Ajouter un créneau'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="modal-close-btn">
                                <X size={20} />
                            </button>
                        </div>

                        {errorMsg && (
                            <div className="modal-error-banner">
                                <AlertCircle size={16} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-grid">
                                <div className="form-field">
                                    <label>Matière / Module</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={formData.subject}
                                        onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                                        placeholder="Ex: Développement Web"
                                    />
                                </div>

                                <div className="form-field">
                                    <label>Jour de la semaine</label>
                                    <select 
                                        value={formData.day}
                                        onChange={(e) => setFormData(prev => ({ ...prev, day: e.target.value }))}
                                    >
                                        {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>

                                <div className="form-row">
                                    <div className="form-field">
                                        <label>Heure Début</label>
                                        <input 
                                            type="time" 
                                            required
                                            value={formData.startTime}
                                            onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label>Heure Fin</label>
                                        <input 
                                            type="time" 
                                            required
                                            value={formData.endTime}
                                            onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-field">
                                    <label>Formateur</label>
                                    <select 
                                        value={formData.formateur_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, formateur_id: e.target.value }))}
                                    >
                                        {formateurs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label>Groupe (Classe)</label>
                                    <select 
                                        value={formData.group_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, group_id: e.target.value }))}
                                    >
                                        {groups.map(g => <option key={g.id} value={g.id}>{g.id}</option>)}
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label>Salle de cours</label>
                                    <select 
                                        value={formData.salle_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, salle_id: e.target.value }))}
                                    >
                                        {salles.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-cancel">
                                    Annuler
                                </button>
                                <button type="submit" className="btn-submit">
                                    {editingSlot ? 'Enregistrer les modifications' : 'Confirmer le créneau'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Timetable;
