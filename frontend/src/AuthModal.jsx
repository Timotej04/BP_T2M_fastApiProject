import { useState } from 'react';

export default function AuthModal({ onClose, onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Vyplň meno a heslo');
      return;
    }

    setLoading(true);
    const API = 'http://127.0.0.1:8000';
    const endpoint = isLogin ? '/login' : '/register';

    try {
      const resp = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || 'Chyba servera');
      }

      if (isLogin) {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_username', data.username);
        onLoginSuccess(data.username);
      } else {
        alert('Účet úspešne vytvorený! Teraz sa môžeš prihlásiť.');
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Zatvorenie okna, ak klikne na tmavé pozadie
  const handleBackgroundClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackgroundClick}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div style={{
        background: 'white', padding: '30px', borderRadius: '12px',
        width: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        position: 'relative'
      }}>
        {/* Krížik vpravo hore */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '15px', right: '15px',
            background: 'none', border: 'none', fontSize: '20px',
            cursor: 'pointer', color: '#666', padding: '5px'
          }}
          title="Zavrieť"
        >✕</button>

        <h2 style={{ marginTop: 0, textAlign: 'center', color: '#333' }}>
          {isLogin ? 'Prihlásenie' : 'Nová registrácia'}
        </h2>
        <p style={{ textAlign: 'center', color: '#666', fontSize: '13px', marginBottom: '20px' }}>
          {isLogin
            ? 'Pre ukladanie do katalógu sa musíš prihlásiť.'
            : 'Vytvor si účet pre ukladanie tvojich diagramov.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>Meno (Nick):</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff' }}
              placeholder="napr. jozef_mrkvicka"
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '5px', fontWeight: 'bold', color: '#333' }}>Heslo:</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff' }}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && <div style={{ color: '#cc0000', fontSize: '13px', textAlign: 'center' }}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px', background: '#0066cc', color: 'white', fontWeight: 'bold',
              border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '5px'
            }}
          >
            {loading ? 'Čakajte prosím...' : (isLogin ? 'Prihlásiť sa' : 'Vytvoriť účet')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#0066cc' }}>
          {isLogin ? "Nemáš účet? " : "Už máš účet? "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{ background: 'none', border: 'none', color: '#0044aa', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontWeight: 'bold' }}
          >
            {isLogin ? 'Zaregistruj sa tu' : 'Prihlás sa tu'}
          </button>
        </div>
      </div>
    </div>
  );
}