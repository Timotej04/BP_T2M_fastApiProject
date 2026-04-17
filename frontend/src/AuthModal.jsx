import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function AuthModal({ onClose, onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isLogin ? '/login' : '/register';

    try {
      const resp = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || 'Chyba servera');
      }

      if (isLogin) {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_username', username);
        onLoginSuccess(username);
      } else {
        alert('Registrácia úspešná, môžeš sa prihlásiť.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 9999, padding: '20px'
    }}>

      <div style={{
        backgroundColor: '#ffffff', width: '100%', maxWidth: '380px',
        borderRadius: '16px', padding: '32px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        position: 'relative', border: '1px solid rgba(255,255,255,0.2)'
      }}>

        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer',
          color: '#94a3b8', padding: '4px', display: 'flex'
        }}>
          ✕
        </button>

        <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700', color: '#1e1b4b', textAlign: 'center' }}>
          {isLogin ? 'Vitaj späť 👋' : 'Vytvor si účet'}
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#64748b', textAlign: 'center' }}>
          Pre ukladanie do katalógu sa prihlás.
        </p>

        {error && (
          <div style={{
            padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
            color: '#ef4444', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Prihlasovacie meno</label>
            <input
              type="text" required value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Zadaj meno..."
              style={{
                padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none',
                transition: 'border 0.2s, box-shadow 0.2s'
              }}
              onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Heslo</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none',
                transition: 'border 0.2s, box-shadow 0.2s'
              }}
              onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <button
            type="submit" disabled={isLoading}
            style={{
              marginTop: '8px', padding: '12px', background: '#6366f1', color: 'white',
              border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '15px', cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s', opacity: isLoading ? 0.7 : 1
            }}
            onMouseEnter={e => { if(!isLoading) e.target.style.background = '#4f46e5'; }}
            onMouseLeave={e => e.target.style.background = '#6366f1'}
          >
            {isLoading ? 'Spracovávam...' : (isLogin ? 'Prihlásiť sa' : 'Zaregistrovať sa')}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
          {isLogin ? "Ešte nemáš účet? " : "Už máš účet? "}
          <button
            type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{
              background: 'none', border: 'none', color: '#6366f1', fontWeight: '600',
              cursor: 'pointer', padding: 0, textDecoration: 'underline'
            }}
          >
            {isLogin ? 'Zaregistruj sa' : 'Prihlás sa'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default AuthModal;