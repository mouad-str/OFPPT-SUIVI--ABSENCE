import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogIn, Loader2, ShieldCheck } from 'lucide-react';
import ofpptLogo from '../../assets/OFPPT.png';
import { useTranslation } from 'react-i18next';
import './Login.css';
import '../../styles/admin-shared.css';

const Login = () => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'ar';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || t('login.invalid_credentials'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`login-container ${isRtl ? 'rtl' : 'ltr'}`}>
            {/* Background Pattern */}
            <div className="login-bg-pattern"></div>
            
            {/* Glow effects */}
            <div className="login-glow login-glow-tr"></div>
            <div className="login-glow login-glow-bl"></div>

            <div className="login-content-wrapper">
                <div className="login-header">
                    <img
                        src={ofpptLogo}
                        alt="OFPPT Logo"
                        className="login-logo"
                    />
                    <div className="login-title-container">
                        <h1 className="login-title">{t('login.portal_title')}</h1>
                        <p className="login-subtitle">{t('login.attendance_system')}</p>
                    </div>
                </div>

                <div className="login-panel">
                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="login-field">
                            <label className="login-label">{t('login.email_address')}</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="login-input"
                                placeholder="name@ofppt.ma"
                                required
                            />
                        </div>

                        <div className="login-field">
                            <label className="login-label">{t('login.password')}</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="login-input"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="login-error-box">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-ista login-submit-btn"
                        >
                            {loading ? (
                                <Loader2 className="login-submit-icon rotating" />
                            ) : (
                                <div className="login-submit-content">
                                    <span>{t('login.login_button')}</span>
                                    <LogIn className="login-submit-icon hover-translate" />
                                </div>
                            )}
                        </button>
                    </form>

                    <div style={{
                        marginTop: '20px',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        textAlign: 'center'
                    }}>
                        <button
                            type="button"
                            onClick={() => navigate('/student/portal')}
                            style={{
                                background: 'rgba(14, 165, 233, 0.12)',
                                border: '1px solid rgba(14, 165, 233, 0.25)',
                                color: '#38bdf8',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            🎓 Vous êtes Stagiaire ? Accéder à votre Espace & Badge QR
                        </button>
                    </div>
                </div>

                <div className="login-footer">
                    <div className="login-secure-badge">
                        <ShieldCheck className="login-secure-icon" />
                        <p className="login-secure-text">{t('login.secure_connection')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
