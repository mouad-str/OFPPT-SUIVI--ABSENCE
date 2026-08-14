import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Users, Activity, CheckCircle2, XCircle, ArrowUpRight,
    TrendingUp, TrendingDown, FileText, RefreshCw, Briefcase,
    LayoutDashboard, ChevronDown, AlertTriangle, Clock, Zap,
    UserPlus, BookOpen, BarChart3, Download, ChevronRight
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTranslation } from 'react-i18next';
import studentService from '../../../services/studentService';
import reportService from '../../../services/reportService';
import './Dashboard.css';
import '../../../styles/admin-shared.css';

const Skeleton = ({ className = '' }) => (
    <div className={`skeleton-shimmer ${className}`} />
);

const timeAgo = (dateStr) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMins = Math.floor((now - then) / 60000);
    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    return `Il y a ${Math.floor(diffHours / 24)}j`;
};

const exportSummaryCSV = (stats, globalRate, distributionData) => {
    const rows = [
        ['Indicateur', 'Valeur'],
        ['Total Stagiaires', stats.totalStudents],
        ['Total Formateurs', stats.totalFormateurs],
        ['Total Groupes', stats.totalGroups],
        ['Total Rapports', stats.totalReports],
        ['Taux de Presence Global', `${globalRate}%`],
        [],
        ['Distribution', 'Nombre', 'Pourcentage'],
        ...distributionData.map(d => [d.name, d.count, `${d.value}%`])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard_resume_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

const AdminDashboard = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [stats, setStats] = useState({ totalStudents: 0, totalFormateurs: 0, totalGroups: 0, totalReports: 0 });
    const [trends, setTrends] = useState({ reports: 0 });
    const [period, setPeriod] = useState('weekly');
    const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(null);
    const [globalRate, setGlobalRate] = useState(100);
    const [evolutionData, setEvolutionData] = useState([]);
    const [distributionData, setDistributionData] = useState([]);
    const [criticalStudents, setCriticalStudents] = useState([]);
    const [recentReports, setRecentReports] = useState([]);
    const [topAbsentGroups, setTopAbsentGroups] = useState([]);
    const [warningsData, setWarningsData] = useState([]);
    const [pendingJustificationsCount, setPendingJustificationsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowPeriodDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [usersRes, summaryRes] = await Promise.all([
                studentService.getUsers(),
                reportService.getAdminSummary(period)
            ]);
            const users = usersRes.users || [];
            const summary = summaryRes.summary;

            setStats({
                totalStudents: summary.total_students,
                totalFormateurs: summary.total_formateurs,
                totalGroups: summary.total_groups,
                totalReports: summary.total_reports
            });
            setTrends(summary.trends || { reports: 0 });
            setGlobalRate(summary.global_rate || 100);

            if (summary.evolution) setEvolutionData(summary.evolution);

            if (summary.distribution) {
                const total = summary.distribution.reduce((acc, curr) => acc + curr.count, 0);
                const colors = {
                    'PRESENT': 'var(--color-secondary-green)',
                    'ABSENT': 'var(--color-error)',
                    'LATE': 'var(--color-warning)'
                };
                setDistributionData(summary.distribution.map(item => ({
                    name: t(`dashboard.${item.status.toLowerCase()}`) || item.status,
                    value: total > 0 ? Math.round((item.count / total) * 100) : 0,
                    count: item.count,
                    color: colors[item.status] || '#94a3b8'
                })));
            }

            setRecentReports(summary.recent_reports || []);
            setTopAbsentGroups(summary.top_absent_groups || []);
            setPendingJustificationsCount(summary.pending_justifications_count || 0);

            if (summary.warnings_stats) {
                const colors = {
                    'Blâme 1': '#f59e0b',
                    'Blâme 2': '#f97316',
                    'Blâme 3': '#ef4444',
                    'Avertissement': '#eab308'
                };
                setWarningsData(summary.warnings_stats.map(item => ({
                    name: item.penalty_type,
                    count: item.count,
                    color: colors[item.penalty_type] || 'var(--color-primary-blue)'
                })));
            }

            // All critical students with absences > 0, not just ABSENCE justifier
            const critical = users
                .filter(u => u.role === 'stagiaire' && u.absences > 0)
                .sort((a, b) => b.absences - a.absences)
                .slice(0, 5);
            setCriticalStudents(critical);
        } catch (err) {
            console.error('Error fetching stats', err);
            setError('Impossible de charger les données. Vérifiez votre connexion.');
        } finally {
            setLoading(false);
        }
    }, [period, t]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(fetchStats, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    const chartData = useMemo(() =>
        evolutionData.length > 0 ? evolutionData : [
            { name: 'LUN', rate: 0 }, { name: 'MAR', rate: 0 }, { name: 'MER', rate: 0 },
            { name: 'JEU', rate: 0 }, { name: 'VEN', rate: 0 }
        ], [evolutionData]);

    const pieData = useMemo(() =>
        distributionData.length > 0 ? distributionData : [
            { name: t('dashboard.present'), value: 100, color: 'var(--color-secondary-green)' },
            { name: t('dashboard.absent'), value: 0, color: 'var(--color-error)' }
        ], [distributionData, t]);

    const quickActions = [
        { label: 'Nouveau Formateur', icon: UserPlus, color: 'royalblue', path: '/admin/users?add=formateur' },
        { label: 'Voir les Rapports', icon: BookOpen, color: 'var(--primary)', path: '/admin/reports' },
        { label: 'Gérer les Groupes', icon: LayoutDashboard, color: 'var(--secondary)', path: '/admin/groups' },
        { label: 'Registre Absences', icon: BarChart3, color: 'orange', path: '/admin/absence-registry' }
    ];

    return (
        <div className="dashboard-container">
            {/* Error Banner */}
            {error && (
                <div className="dashboard-error-banner">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={fetchStats} className="error-retry-btn">Réessayer</button>
                </div>
            )}

            {/* Header */}
            <div className="dashboard-header-section">
                <div className="dashboard-title-wrapper">
                    <div className="dashboard-hub-tag-wrapper">
                        <span className="dashboard-hub-tag">{t('dashboard.hub_name')}</span>
                        <div className="pulse-dot-small"></div>
                    </div>
                    <h1 className="dashboard-title">{t('dashboard.overview_title')}</h1>
                    <p className="dashboard-subtitle">{t('dashboard.overview_subtitle')}</p>
                </div>
                <button onClick={fetchStats} className="btn-sync group" disabled={loading}>
                    <RefreshCw className={`sync-icon ${loading ? 'loading' : ''}`} />
                    {t('dashboard.sync_button')}
                </button>
            </div>

            {/* Justifications Notification Banner */}
            {pendingJustificationsCount > 0 && (
                <div className="dashboard-justification-banner fade-up" onClick={() => navigate('/admin/justifications')}>
                    <div className="banner-left">
                        <div className="banner-icon-wrapper">
                            <Clock size={16} className="animate-pulse" />
                        </div>
                        <div>
                            <h4 className="banner-title">Demandes de Justification en Attente</h4>
                            <p className="banner-subtitle">Vous avez {pendingJustificationsCount} document(s) justificatif(s) soumis par les stagiaires à valider.</p>
                        </div>
                    </div>
                    <button className="banner-btn">
                        Traiter maintenant
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}

            {/* Quick Actions */}
            <div className="quick-actions-bar">
                <div className="quick-actions-label">
                    <Zap size={13} />
                    <span>ACTIONS RAPIDES</span>
                </div>
                <div className="quick-actions-grid">
                    {quickActions.map((action, i) => (
                        <button
                            key={i}
                            className="quick-action-btn"
                            onClick={() => navigate(action.path)}
                            style={{ '--qa-color': action.color }}
                        >
                            <action.icon size={16} />
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="dashboard-stats-grid">
                {[
                    { label: t('dashboard.total_students'), value: stats.totalStudents, icon: Users, color: 'var(--primary)', tag: t('dashboard.status_active'), trend: null },
                    { label: t('dashboard.total_formateurs'), value: stats.totalFormateurs, icon: Briefcase, color: 'royalblue', tag: t('dashboard.status_online'), trend: null },
                    { label: t('dashboard.total_groups'), value: stats.totalGroups, icon: LayoutDashboard, color: 'var(--secondary)', tag: t('dashboard.status_open'), trend: null },
                    { label: t('dashboard.total_reports'), value: stats.totalReports, icon: FileText, color: 'orange', tag: t('dashboard.status_archived'), trend: trends.reports }
                ].map((stat, i) => (
                    <div key={i} className="ista-card group">
                        {loading ? (
                            <div className="stat-card-inner">
                                <div className="stat-info-wrapper">
                                    <Skeleton className="skeleton-icon" />
                                    <div className="skeleton-text-group">
                                        <Skeleton className="skeleton-value" />
                                        <Skeleton className="skeleton-label" />
                                    </div>
                                </div>
                                <Skeleton className="skeleton-tag" />
                            </div>
                        ) : (
                            <div className="stat-card-inner">
                                <div className="stat-info-wrapper">
                                    <div className="stat-icon-wrapper">
                                        <stat.icon className="stat-icon" style={{ color: stat.color }} />
                                    </div>
                                    <div>
                                        <h3 className="stat-value">{stat.value.toString().padStart(2, '0')}</h3>
                                        <p className="stat-label">{stat.label}</p>
                                    </div>
                                </div>
                                <div className="stat-footer">
                                    <span className="stat-tag">{stat.tag}</span>
                                    {stat.trend !== null && (
                                        <span className={`stat-trend ${stat.trend >= 0 ? 'up' : 'down'}`}>
                                            {stat.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                            {Math.abs(stat.trend)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Critical Absences */}
            <div className="critical-panel">
                <div className="critical-header">
                    <div className="critical-header-left">
                        <div className={`critical-icon-wrapper ${criticalStudents.length > 0 ? 'danger' : 'safe'}`}>
                            {criticalStudents.length > 0
                                ? <XCircle className="critical-icon danger" />
                                : <CheckCircle2 className="critical-icon safe" />}
                        </div>
                        <div>
                            <h3 className="critical-title">{t('dashboard.critical_absences_title') || 'Surveillance des Absences'}</h3>
                            <p className="critical-subtitle">
                                {criticalStudents.length > 0
                                    ? t('dashboard.critical_absences_subtitle') || 'Stagiaires sous surveillance étroite'
                                    : 'Tous les stagiaires sont en règle.'}
                            </p>
                        </div>
                    </div>
                    {criticalStudents.length > 0 && (
                        <div className="critical-alerts-badge">
                            {criticalStudents.length} {t('dashboard.alerts_active') || 'ALERTE(S) ACTIVE(S)'}
                        </div>
                    )}
                </div>
                {loading ? (
                    <div className="critical-grid">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="critical-student-card skeleton-card">
                                <Skeleton className="skeleton-abs-badge" />
                                <div className="skeleton-text-group" style={{ flex: 1 }}>
                                    <Skeleton className="skeleton-name" />
                                    <Skeleton className="skeleton-sub" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : criticalStudents.length > 0 ? (
                    <div className="critical-grid">
                        {criticalStudents.map((stg, i) => (
                            <Link to={`/admin/student/${stg.id}`} key={i} className="critical-student-card">
                                <div className="critical-student-inner">
                                    <div className="critical-student-header">
                                        <div className={`absences-badge ${stg.absences >= 7 ? 'danger' : 'warning'}`}>{stg.absences}</div>
                                        <div className="student-ids">
                                            <span className="student-group-id">{stg.group_id}</span>
                                            <span className="student-id">{stg.id}</span>
                                        </div>
                                    </div>
                                    <div className="student-info">
                                        <h4 className="student-name">{stg.name}</h4>
                                        <p className="student-filiere">{stg.filiere || 'Filière non spécifiée'}</p>
                                    </div>
                                    <div className="student-footer">
                                        <div className="student-status-wrapper">
                                            <span className="student-status-text">{stg.absences >= 7 ? 'CRITIQUE' : 'ATTENTION'}</span>
                                            {stg.last_status === 'ABSENT' && <span className="student-recidive-badge">RÉCIDIVE</span>}
                                        </div>
                                        <ArrowUpRight className="student-arrow-icon" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="critical-empty">
                        <Activity className="critical-empty-icon" />
                        <p className="critical-empty-text">Aucune anomalie détectée sur ce campus</p>
                    </div>
                )}
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                <div className="chart-panel-main">
                    <div className="chart-header">
                        <div className="chart-title-wrapper">
                            <div className="chart-title-indicator"></div>
                            <h3 className="chart-title">{t('dashboard.attendance_evolution')}</h3>
                        </div>
                        <div className="chart-actions">
                            <div className="period-dropdown-wrapper" ref={dropdownRef}>
                                <button onClick={() => setShowPeriodDropdown(!showPeriodDropdown)} className="btn-period">
                                    <svg className="period-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    </svg>
                                    <span>{period === 'weekly' ? (t('dashboard.period_weekly') || 'Hebdomadaire') : (t('dashboard.period_monthly') || 'Mensuel')}</span>
                                    <ChevronDown className={`period-chevron ${showPeriodDropdown ? 'open' : ''}`} />
                                </button>
                                {showPeriodDropdown && (
                                    <div className="period-dropdown-menu">
                                        <button onClick={() => { setPeriod('weekly'); setShowPeriodDropdown(false); }} className={`dropdown-item ${period === 'weekly' ? 'active' : 'inactive'}`}>{t('dashboard.period_weekly') || 'Hebdomadaire'}</button>
                                        <button onClick={() => { setPeriod('monthly'); setShowPeriodDropdown(false); }} className={`dropdown-item ${period === 'monthly' ? 'active' : 'inactive'}`}>{t('dashboard.period_monthly') || 'Mensuel'}</button>
                                    </div>
                                )}
                            </div>
                            <div className="rate-summary">
                                <span className="rate-value">{globalRate}%</span>
                                <p className="rate-label">{t('dashboard.weekly_rate')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="chart-area">
                        {loading ? <Skeleton className="skeleton-chart" /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <YAxis hide domain={[0, 100]} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }} formatter={(v) => [`${v}%`, 'Taux de présence']} />
                                    <Area type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={4} fillOpacity={1} fill="url(#colorRate)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="distribution-panel ista-panel">
                    <div className="chart-title-wrapper mb-10">
                        <div className="chart-title-indicator"></div>
                        <h3 className="chart-title distribution-title">{t('dashboard.distribution_title')}</h3>
                    </div>
                    <div className="pie-chart-wrapper">
                        {activeIndex !== null && (
                            <div className="pie-hover-info">
                                <div className="pie-hover-inner">
                                    <div className="pie-hover-dot" style={{ backgroundColor: pieData[activeIndex].color }}></div>
                                    <span className="pie-hover-text">{pieData[activeIndex].name}: {pieData[activeIndex].value}%</span>
                                </div>
                            </div>
                        )}
                        {loading ? <div className="pie-skeleton-wrapper"><Skeleton className="skeleton-pie" /></div> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} innerRadius={70} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none"
                                        onMouseEnter={(_, idx) => setActiveIndex(idx)} onMouseLeave={() => setActiveIndex(null)}>
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color}
                                                opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                                                style={{ filter: activeIndex === index ? 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' : 'none', transition: 'all 0.3s ease' }} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                        <div className="pie-center-text">
                            <span className="pie-center-value">{globalRate}%</span>
                            <span className="pie-center-label">{t('dashboard.attendance_rate')}</span>
                        </div>
                    </div>
                    <div className="distribution-list">
                        {pieData.map((item, i) => (
                            <div key={i} className="distribution-item group">
                                <div className="dist-item-left">
                                    <div className="dist-icon-wrapper" style={{ backgroundColor: `${item.color}15` }}>
                                        <div className="dist-icon-dot" style={{ backgroundColor: item.color }}></div>
                                    </div>
                                    <div className="dist-info">
                                        <span className="dist-name">{item.name}</span>
                                        <span className="dist-count">{item.count}</span>
                                    </div>
                                </div>
                                <div className="dist-item-right">
                                    <span className="dist-percentage" style={{ color: item.color }}>{item.value}%</span>
                                    <span className="dist-ratio-label">{t('dashboard.ratio')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Analytics Grid */}
            <div className="charts-grid mt-6">
                <div className="chart-panel-main">
                    <div className="chart-header">
                        <div className="chart-title-wrapper">
                            <div className="chart-title-indicator" style={{ backgroundColor: '#ef4444' }}></div>
                            <h3 className="chart-title">Absences par Groupe (Palmarès)</h3>
                        </div>
                    </div>
                    <div className="chart-area" style={{ height: '300px' }}>
                        {loading ? <Skeleton className="skeleton-chart" /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topAbsentGroups.length > 0 ? topAbsentGroups : [{ group_id: 'Aucun', total_absences: 0 }]}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="group_id" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: '900' }} formatter={(v) => [v, 'Total Absences']} />
                                    <Bar dataKey="total_absences" fill="#f97316" radius={[8, 8, 0, 0]} barSize={40}>
                                        {(topAbsentGroups.length > 0 ? topAbsentGroups : [{ group_id: 'Aucun', total_absences: 0 }]).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : index === 1 ? '#f97316' : '#eab308'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="distribution-panel ista-panel">
                    <div className="chart-title-wrapper mb-10">
                        <div className="chart-title-indicator" style={{ backgroundColor: 'royalblue' }}></div>
                        <h3 className="chart-title distribution-title">Répartition des Sanctions</h3>
                    </div>
                    <div className="chart-area" style={{ height: '300px' }}>
                        {loading ? <Skeleton className="skeleton-chart" /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={warningsData.length > 0 ? warningsData : [
                                    { name: 'Avertissement', count: 0, color: '#eab308' },
                                    { name: 'Blâme 1', count: 0, color: '#f59e0b' },
                                    { name: 'Blâme 2', count: 0, color: '#f97316' },
                                    { name: 'Blâme 3', count: 0, color: '#ef4444' }
                                ]}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: '900' }} formatter={(v) => [v, 'Total Emis']} />
                                    <Bar dataKey="count" fill="royalblue" radius={[8, 8, 0, 0]} barSize={45}>
                                        {(warningsData.length > 0 ? warningsData : [
                                            { name: 'Avertissement', count: 0, color: '#eab308' },
                                            { name: 'Blâme 1', count: 0, color: '#f59e0b' },
                                            { name: 'Blâme 2', count: 0, color: '#f97316' },
                                            { name: 'Blâme 3', count: 0, color: '#ef4444' }
                                        ]).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Panels: Recent Activity + Top Absent Groups */}
            <div className="bottom-panels-grid">
                <div className="activity-panel ista-panel">
                    <div className="panel-header">
                        <div className="chart-title-wrapper">
                            <div className="chart-title-indicator" style={{ backgroundColor: 'royalblue' }}></div>
                            <h3 className="chart-title">Activité Récente</h3>
                        </div>
                        <Link to="/admin/reports" className="panel-see-all">Voir tout <ChevronRight size={14} /></Link>
                    </div>
                    <div className="activity-list">
                        {loading ? [1, 2, 3, 4].map(i => (
                            <div key={i} className="activity-item skeleton-activity">
                                <Skeleton className="skeleton-activity-icon" />
                                <div className="skeleton-text-group" style={{ flex: 1 }}>
                                    <Skeleton className="skeleton-name" />
                                    <Skeleton className="skeleton-sub" />
                                </div>
                                <Skeleton className="skeleton-time" />
                            </div>
                        )) : recentReports.length > 0 ? recentReports.map((report, i) => (
                            <div key={i} className="activity-item">
                                <div className="activity-icon-wrapper"><FileText size={14} /></div>
                                <div className="activity-content">
                                    <p className="activity-title">Rapport soumis — <strong>{report.group_id}</strong></p>
                                    <p className="activity-sub">
                                        Par {report.formateur_name} ·{' '}
                                        <span className={`activity-absences ${report.absences_count > 0 ? 'has-absences' : 'no-absences'}`}>
                                            {report.absences_count} absence{report.absences_count !== 1 ? 's' : ''}
                                        </span>
                                        {' '}/ {report.total_students} présents
                                    </p>
                                </div>
                                <div className="activity-time"><Clock size={11} />{timeAgo(report.created_at)}</div>
                            </div>
                        )) : <div className="activity-empty"><p>Aucun rapport récent</p></div>}
                    </div>
                </div>

                <div className="top-groups-panel ista-panel">
                    <div className="panel-header">
                        <div className="chart-title-wrapper">
                            <div className="chart-title-indicator" style={{ backgroundColor: '#ef4444' }}></div>
                            <h3 className="chart-title">Groupes à Risque</h3>
                        </div>
                        <Link to="/admin/absence-registry" className="panel-see-all">Registre <ChevronRight size={14} /></Link>
                    </div>
                    <div className="top-groups-list">
                        {loading ? [1, 2, 3].map(i => (
                            <div key={i} className="top-group-item">
                                <Skeleton className="skeleton-rank" />
                                <div className="skeleton-text-group" style={{ flex: 1 }}>
                                    <Skeleton className="skeleton-name" />
                                    <Skeleton className="skeleton-bar-full" />
                                </div>
                                <Skeleton className="skeleton-pct" />
                            </div>
                        )) : topAbsentGroups.length > 0 ? topAbsentGroups.map((grp, i) => {
                            const maxAbs = topAbsentGroups[0]?.total_absences || 1;
                            const barW = Math.round((grp.total_absences / maxAbs) * 100);
                            const barColor = i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#eab308';
                            return (
                                <Link to="/admin/groups" key={i} className="top-group-item">
                                    <span className={`group-rank rank-${i + 1}`}>{i + 1}</span>
                                    <div className="group-info">
                                        <div className="group-info-header">
                                            <span className="group-name">{grp.group_id}</span>
                                            <span className="group-absences-count">{grp.total_absences} abs.</span>
                                        </div>
                                        <div className="group-bar-track">
                                            <div className="group-bar-fill" style={{ width: `${barW}%`, backgroundColor: barColor }} />
                                        </div>
                                    </div>
                                    <span className={`group-rate-badge ${grp.absence_rate > 20 ? 'critical' : 'warning'}`}>{grp.absence_rate}%</span>
                                </Link>
                            );
                        }) : (
                            <div className="activity-empty">
                                <CheckCircle2 size={24} style={{ color: 'var(--color-secondary-green)' }} />
                                <p>Tous les groupes sont en règle</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="dashboard-footer">
                <div className="footer-info">
                    <div className="footer-icon-wrapper">
                        <svg className="footer-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </div>
                    <div className="footer-text-wrapper">
                        <h4 className="footer-title">{t('dashboard.current_week')} : ISTA MIRLEFT</h4>
                        <p className="footer-subtitle">ANALYSE OPÉRATIONNELLE EN TEMPS RÉEL — Auto-refresh toutes les 5 min</p>
                    </div>
                </div>
                <button
                    className="btn-ista btn-report"
                    onClick={() => exportSummaryCSV(stats, globalRate, distributionData)}
                    title="Exporter le résumé en CSV"
                >
                    <Download className="report-icon" />
                    <span className="report-text">{t('dashboard.generate_global_report')}</span>
                </button>
            </div>
        </div>
    );
};

export default AdminDashboard;
