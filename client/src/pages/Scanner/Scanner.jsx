import React, { useEffect, useState, useRef } from 'react';
import { 
    Shield, X, Check, AlertCircle, CheckCircle, Smartphone, 
    Volume2, VolumeX, Users, Clock, Sparkles, UserCheck, UserX, AlertTriangle
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useNotification } from '../../hooks/useNotification';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useTranslation } from 'react-i18next';
import attendanceService from '../../services/attendanceService';
import studentService from '../../services/studentService';
import { playSuccessChime, playWarningBeep, playErrorBuzzer } from '../../utils/audioFeedback';
import './Scanner.css';

const Scanner = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [searchParams] = useSearchParams();
    const groupId = searchParams.get('groupId');
    const subject = searchParams.get('subject');
    const room = searchParams.get('room');
    const sessionTime = searchParams.get('time');

    const [activeStudents, setActiveStudents] = useState([]);
    const [checkedInIds, setCheckedInIds] = useState([]);
    const [lastScan, setLastScan] = useState(null);
    const [error, setError] = useState(null);
    const [submitting] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [flashEffect, setFlashEffect] = useState(null); // 'success' | 'warning' | 'error' | null

    const prevCheckinsRef = useRef([]);
    const isFirstSyncRef = useRef(true);
    const lastScannedTextRef = useRef('');
    const lastScanTimeRef = useRef(0);

    // 1. Trigger Flash Effect Helper
    const triggerFlash = (type) => {
        setFlashEffect(type);
        setTimeout(() => setFlashEffect(null), 600);
    };

    // 2. Sync Active Checkins via Polling
    useEffect(() => {
        if (!groupId) return;

        const syncCheckins = async () => {
            try {
                const checkinRes = await attendanceService.getActiveCheckins(groupId);
                const currentIds = (checkinRes.checkins || [])
                    .filter(c => c.status === 'PRESENT' || c.status === undefined)
                    .map(c => c.student_id !== undefined ? c.student_id : c);

                if (isFirstSyncRef.current) {
                    isFirstSyncRef.current = false;
                } else if (currentIds.length > prevCheckinsRef.current.length) {
                    const newId = currentIds.find(id => !prevCheckinsRef.current.includes(id));
                    const student = activeStudents.find(s => s.id === newId);

                    if (student) {
                        setLastScan({
                            name: student.name,
                            alreadyScanned: false,
                            time: new Date().toLocaleTimeString(),
                            success: true
                        });
                        triggerFlash('success');
                        playSuccessChime(isMuted);
                        setTimeout(() => setLastScan(null), 3500);
                    }
                }

                setCheckedInIds(currentIds);
                prevCheckinsRef.current = currentIds;
            } catch (err) {
                console.error("Signal Sync Failure:", err);
            }
        };

        syncCheckins();
        const interval = setInterval(syncCheckins, 1500);
        return () => clearInterval(interval);
    }, [groupId, activeStudents, isMuted]);

    // 3. Start HTML5 QR Scanner with Rapid Continuous Mode & Audio Feedback
    useEffect(() => {
        let scanner = null;
        let isInstanceMounted = true;
        let initTimeout = null;

        if (groupId) {
            initTimeout = setTimeout(() => {
                scanner = new Html5QrcodeScanner(
                    "qr-reader",
                    { 
                        fps: 15, 
                        qrbox: { width: 260, height: 260 },
                        rememberLastUsedCamera: true
                    },
                    /* verbose= */ false
                );

                scanner.render(async (decodedText) => {
                    const now = Date.now();
                    // Fast debounce: 1.2s for different QR codes, 3.5s for exact same repeated QR
                    const isSameQR = decodedText === lastScannedTextRef.current;
                    const threshold = isSameQR ? 3500 : 1200;

                    if (now - lastScanTimeRef.current < threshold) {
                        return;
                    }
                    lastScanTimeRef.current = now;
                    lastScannedTextRef.current = decodedText;

                    if (submitting) return;

                    try {
                        const res = await attendanceService.processCheckinQR(decodedText, groupId);

                        if (isInstanceMounted) {
                            const isAlready = res.alreadyScanned || false;
                            
                            setLastScan({
                                name: res.name || decodedText,
                                alreadyScanned: isAlready,
                                time: new Date().toLocaleTimeString(),
                                success: true
                            });

                            if (isAlready) {
                                triggerFlash('warning');
                                playWarningBeep(isMuted);
                                addNotification(t('scanner.already_scanned', 'Ce stagiaire est déjà présent'), 'warning');
                            } else {
                                triggerFlash('success');
                                playSuccessChime(isMuted);
                                addNotification(t('scanner.success_msg', 'QR Code scanné avec succès'), 'success');
                            }

                            setTimeout(() => setLastScan(null), 3500);
                        }
                    } catch (err) {
                        const errMsg = err.response?.data?.message || 'Code QR invalide ou stagiaire introuvable';
                        triggerFlash('error');
                        playErrorBuzzer(isMuted);

                        if (isInstanceMounted) {
                            setLastScan({
                                name: errMsg,
                                alreadyScanned: false,
                                time: new Date().toLocaleTimeString(),
                                success: false
                            });
                            setTimeout(() => setLastScan(null), 4000);
                            addNotification(errMsg, 'error');
                        }
                    }
                }, () => {
                    // Frame scan skip
                });
            }, 100);
        }

        return () => {
            isInstanceMounted = false;
            if (initTimeout) clearTimeout(initTimeout);
            if (scanner) {
                scanner.clear().catch(error => {
                    console.error("Failed to clear html5QrcodeScanner: ", error);
                });
            }
        };
    }, [groupId, submitting, addNotification, t, isMuted]);

    // 4. Initial Students Manifest
    useEffect(() => {
        const fetchMainData = async () => {
            try {
                const res = await studentService.getFormateurUsersByGroup(groupId);
                setActiveStudents(res.users || []);
            } catch (err) {
                console.error("Manifest Load Error:", err);
            }
        };
        if (groupId) fetchMainData();
    }, [groupId]);

    const handleExit = async () => {
        try {
            if (groupId) {
                await attendanceService.clearCheckins(groupId);
            }
        } catch (err) {
            console.error("Failed to clear checkins on exit:", err);
        } finally {
            navigate('/formateur');
        }
    };

    const handleConfirm = () => {
        if (submitting) return;
        
        const activeSession = {
            group: groupId,
            subject: decodeURIComponent(subject || 'COURS'),
            room: room || 'ROOM',
            time: sessionTime || new Date().toLocaleTimeString()
        };

        const studentsWithStatus = activeStudents.map(s => ({
            ...s,
            status: checkedInIds.includes(s.id) ? 'PRESENT' : 'ABSENT'
        }));

        const stats = {
            total: activeStudents.length,
            present: checkedInIds.length,
            absent: activeStudents.length - checkedInIds.length,
            late: 0
        };

        navigate('/formateur/dossier', { 
            state: { 
                activeSession, 
                students: studentsWithStatus, 
                stats 
            } 
        });
    };

    const toggleManualStatus = async (studentId, currentStatus) => {
        try {
            const newStatus = currentStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT';
            await attendanceService.updateCheckinStatus(studentId, groupId, newStatus);

            if (newStatus === 'PRESENT') {
                setCheckedInIds(prev => {
                    if (!prev.includes(studentId)) return [...prev, studentId];
                    return prev;
                });
                playSuccessChime(isMuted);
                triggerFlash('success');
            } else {
                setCheckedInIds(prev => prev.filter(id => id !== studentId));
            }
        } catch (err) {
            console.error("Manual toggle failed:", err);
            addNotification("Erreur lors de la mise à jour", "error");
        }
    };

    const checkedInStudents = activeStudents.filter(s => checkedInIds.includes(s.id));
    const presenceRate = activeStudents.length > 0 
        ? Math.round((checkedInIds.length / activeStudents.length) * 100) 
        : 0;

    return (
        <div className={`scn-wrapper fade-up ${flashEffect ? `scn-flash-${flashEffect}` : ''}`}>
            <div className="scn-container">
                <div className="scn-card">

                    {/* Header Bar */}
                    <div className="scn-header">
                        <div className="scn-header-left">
                            <div className="scn-header-icon-wrapper">
                                <Shield className="scn-header-icon" />
                            </div>
                            <div className="scn-header-titles">
                                <div className="scn-tag-row">
                                    <span className="scn-badge-pill">ISTA MIRLEFT</span>
                                    <span className="scn-fast-mode-pill">⚡ MODE CONTINU RAPIDE</span>
                                </div>
                                <h1 className="scn-header-title">{t('scanner.title')}</h1>
                            </div>
                        </div>
                        <div className="scn-header-right">
                            {/* Audio toggle button */}
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className={`scn-btn-sound ${isMuted ? 'muted' : 'active'}`}
                                title={isMuted ? "Activer les sons de scan" : "Désactiver le son"}
                            >
                                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>

                            <button
                                onClick={handleExit}
                                className="scn-btn-exit"
                                title={t('scanner.exit_tooltip')}
                            >
                                <X className="scn-icon-small" />
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={submitting}
                                className="scn-btn-finish"
                            >
                                <Check className="scn-icon-small" />
                                <span>{submitting ? t('scanner.validating') : t('scanner.finish_button')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Info Bar with Live Attendance Progress */}
                    <div className="scn-info-bar">
                        <div className="scn-info-col border-right">
                            <span className="scn-info-label">{t('scanner.group_label')}</span>
                            <span className="scn-info-val-sec font-bold text-sky-400">{groupId || '---'}</span>
                        </div>
                        <div className="scn-info-col border-right">
                            <span className="scn-info-label">{t('scanner.session_label')}</span>
                            <span className="scn-info-val-pri">{decodeURIComponent(subject || 'COURS')}</span>
                        </div>
                        <div className="scn-info-col border-right">
                            <span className="scn-info-label">SALLE</span>
                            <span className="scn-info-val-sec">{room || 'Salle 1'}</span>
                        </div>
                        <div className="scn-info-col border-right">
                            <span className="scn-info-label">{t('scanner.attendance_label')}</span>
                            <div className="scn-presence-stats">
                                <span className="scn-info-val-sec font-bold">{checkedInIds.length} / {activeStudents.length}</span>
                                <span className="scn-rate-pill">{presenceRate}%</span>
                            </div>
                        </div>
                        <div className="scn-info-col">
                            <span className="scn-info-label">SCANNER EN DIRECT</span>
                            <div className="scn-status-indicator">
                                <div className="scn-pulse-dot"></div>
                                <span className="scn-info-val-pri font-semibold text-emerald-400">ACTIF</span>
                            </div>
                        </div>
                    </div>

                    {/* Live Progress Bar */}
                    <div className="scn-progress-wrapper">
                        <div 
                            className="scn-progress-bar" 
                            style={{ width: `${presenceRate}%` }}
                        ></div>
                    </div>

                    {/* Viewport Area */}
                    <div className="scn-viewport">
                        {error ? (
                            <div className="scn-error-state">
                                <AlertCircle className="scn-error-icon" />
                                <span className="scn-error-text">{t('scanner.offline')}</span>
                            </div>
                        ) : (
                            <>
                                <div id="qr-reader" className="scn-qr-reader"></div>

                                {/* Dynamic Result Card Overlay */}
                                {lastScan && (
                                    <div className={`scn-scan-result fade-in ${!lastScan.success ? 'error' : lastScan.alreadyScanned ? 'warning' : 'success'}`}>
                                        <div className="scn-scan-result-icon">
                                            {!lastScan.success ? (
                                                <AlertTriangle className="text-red-400" size={28} />
                                            ) : lastScan.alreadyScanned ? (
                                                <AlertCircle className="text-amber-400" size={28} />
                                            ) : (
                                                <CheckCircle size={28} className="text-emerald-400" />
                                            )}
                                        </div>

                                        <div className="scn-scan-result-content">
                                            <span className="scn-scan-result-title">
                                                {!lastScan.success ? '⚠️ ERREUR DE SCAN' : lastScan.alreadyScanned ? '⚠️ DÉJÀ PRÉSENT' : '✅ PRÉSENCE ENREGISTRÉE'}
                                            </span>
                                            <span className="scn-scan-result-name">
                                                {lastScan.name}
                                            </span>
                                            <span className="scn-scan-result-time">
                                                Heure : {lastScan.time}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Detailed Students Table & Live Presence List */}
                    <div className="scn-table-section">
                        <div className="scn-table-header">
                            <div className="table-header-left">
                                <Users size={18} className="text-sky-400" />
                                <h3 className="scn-table-title">Émargement en Direct ({checkedInStudents.length} Présents / {activeStudents.length - checkedInStudents.length} Absents)</h3>
                            </div>
                            <span className="table-auto-save-tag">Enregistrement automatique en temps réel</span>
                        </div>
                        <div className="scn-table-wrapper ista-scrollbar">
                            {activeStudents.length === 0 ? (
                                <div className="scn-table-empty">{t('scanner.no_scans', 'Aucun étudiant trouvé...')}</div>
                            ) : (
                                <table className="scn-table">
                                    <thead className="scn-thead">
                                        <tr>
                                            <th className="scn-th">NOM & PRÉNOM</th>
                                            <th className="scn-th">MATRICULE</th>
                                            <th className="scn-th text-center">STATUT</th>
                                            <th className="scn-th text-center">ACTION MANUELLE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="scn-tbody">
                                        {activeStudents.map(student => {
                                            const isPresent = checkedInIds.includes(student.id);
                                            return (
                                                <tr key={student.id} className={`scn-tr ${isPresent ? 'tr-present' : 'tr-absent'}`}>
                                                    <td className="scn-td font-bold">{student.name}</td>
                                                    <td className="scn-td text-muted">{student.id}</td>
                                                    <td className="scn-td text-center">
                                                        <span className={`scn-status-badge ${isPresent ? 'present' : 'absent'}`}>
                                                            {isPresent ? 'PRÉSENT' : 'ABSENT'}
                                                        </span>
                                                    </td>
                                                    <td className="scn-td text-center">
                                                        <button 
                                                            onClick={() => toggleManualStatus(student.id, isPresent ? 'PRESENT' : 'ABSENT')}
                                                            disabled={submitting}
                                                            className={`scn-manual-btn ${isPresent ? 'absent' : 'present'}`}
                                                        >
                                                            {isPresent ? 'Marquer Absent' : 'Marquer Présent'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Status Bar */}
                    <div className="scn-footer">
                        <div className="scn-footer-left">
                            <div className="scn-footer-item">
                                <div className="scn-pulse-dot-green"></div>
                                <span className="scn-footer-label">{t('scanner.server_status')}</span>
                            </div>
                            <div className="scn-footer-item border-left hidden-mobile">
                                <Smartphone className="scn-footer-icon" />
                                <span className="scn-footer-label">{t('scanner.interface_tag')}</span>
                            </div>
                        </div>
                        <div className="scn-footer-brand">{t('scanner.campus')}</div>
                    </div>
                </div>

                <div className="scn-brand-watermark">
                    <p className="scn-brand-text">
                        {t('scanner.automated')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Scanner;
