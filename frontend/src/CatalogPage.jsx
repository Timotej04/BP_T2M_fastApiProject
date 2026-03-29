import { useState, useEffect, useCallback } from 'react';

const API = 'http://127.0.0.1:8000';

// Používame rovnaké farby ako v App.jsx pre jednotný dizajn
const COLORS = {
  bg: '#f0f4f8',
  sidebarBg: '#1e1b4b',
  card: '#ffffff',
  accent: '#6366f1',
  text: '#1e293b',
  textMuted: '#64748b',
  danger: '#ef4444',
  border: '#cbd5e1'
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
};

// SVG Ikony
const Icons = {
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Public: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>,
  Private: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
  Load: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Nodes: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="8" rx="1" ry="1"></rect><rect x="2" y="14" width="8" height="8" rx="1" ry="1"></rect><rect x="14" y="14" width="8" height="8" rx="1" ry="1"></rect><line x1="12" y1="10" x2="12" y2="12"></line><line x1="6" y1="12" x2="6" y2="14"></line><line x1="18" y1="12" x2="18" y2="14"></line><line x1="6" y1="12" x2="18" y2="12"></line></svg>
};

function CatalogPage({ username, onLoadModel, onClose, onLogout }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('my');

  const fetchCatalog = useCallback(async (searchQuery, currentTab) => {
    setLoading(true);
    try {
      const q = encodeURIComponent(searchQuery || '');
      let resp;
      if (currentTab === 'my') {
        if (!username) return;
        resp = await fetch(`${API}/catalog?q=${q}`, { headers: getAuthHeaders() });
      } else {
        resp = await fetch(`${API}/public-catalog?q=${q}`);
      }

      if (resp?.status === 401) {
        alert("Relácia vypršala. Prihlás sa znova.");
        onLogout();
        return;
      }
      if (!resp?.ok) throw new Error('Chyba načítania katalógu');

      const data = await resp.json();
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [username, onLogout]);

  useEffect(() => { fetchCatalog(search, tab); }, [tab, fetchCatalog]);
  useEffect(() => {
    const timer = setTimeout(() => fetchCatalog(search, tab), 300);
    return () => clearTimeout(timer);
  }, [search, tab, fetchCatalog]);

  const loadProcess = async (id) => {
    try {
      const resp = await fetch(`${API}/catalog/${id}`, { headers: getAuthHeaders() });
      if (!resp.ok) throw new Error('Načítanie zlyhalo');
      const data = await resp.json();

      const rawNodes = data.model_json.nodes.map((n) => ({
        id: n.id, type: 'default',
        data: { label: n.label, baseLabel: n.label, actor: n.actor || '', nodeType: n.type || 'task' },
        position: { x: 0, y: 0 },
      }));
      const rawEdges = data.model_json.edges.map((e) => ({
        id: e.id, source: e.source, target: e.target, label: e.label || null, type: 'smoothstep',
      }));
      onLoadModel(rawNodes, rawEdges, data.prompt);
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteProcess = async (id, title) => {
    if (!window.confirm(`Naozaj chceš zmazať „${title}"?`)) return;
    try {
      const resp = await fetch(`${API}/catalog/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!resp.ok) throw new Error('Zmazanie zlyhalo');
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

      {/* Ovládací panel s vyhľadávaním a záložkami */}
      <div style={{
        display: 'flex', gap: '20px', marginBottom: '32px', alignItems: 'center',
        flexWrap: 'wrap', background: 'white', padding: '16px', borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: `1px solid ${COLORS.border}`
      }}>

        {/* Záložky */}
        <div style={{ display: 'flex', background: COLORS.bg, padding: '4px', borderRadius: '8px', gap: '4px' }}>
          <button
            onClick={() => setTab('my')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: 'none',
              borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
              background: tab === 'my' ? 'white' : 'transparent', color: tab === 'my' ? COLORS.sidebarBg : COLORS.textMuted,
              boxShadow: tab === 'my' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Icons.Private /> Môj katalóg
          </button>
          <button
            onClick={() => setTab('public')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: 'none',
              borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
              background: tab === 'public' ? 'white' : 'transparent', color: tab === 'public' ? COLORS.sidebarBg : COLORS.textMuted,
              boxShadow: tab === 'public' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Icons.Public /> Verejný katalóg
          </button>
        </div>

        {/* Vyhľadávanie */}
        <div style={{ flex: 1, position: 'relative', minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: COLORS.textMuted }}>
            <Icons.Search />
          </div>
          <input
            placeholder="Hľadať proces podľa názvu alebo obsahu..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 42px', fontSize: '14px',
              border: `1px solid ${COLORS.border}`, borderRadius: '8px', outline: 'none',
              background: COLORS.bg, color: COLORS.text, transition: 'border 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = COLORS.accent}
            onBlur={(e) => e.target.style.borderColor = COLORS.border}
          />
        </div>
      </div>

      {/* Načítavanie */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: '12px', height: '180px', border: `1px solid ${COLORS.border}`, opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {/* Grid kariet */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {items.map((proc) => (
            <div key={proc.id} style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '12px',
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)',
              transition: 'transform 0.2s, box-shadow 0.2s', position: 'relative'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)'; }}
            >

              {/* Hlavička karty */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, color: COLORS.sidebarBg, fontSize: '16px', fontWeight: '700', lineHeight: 1.3 }}>{proc.title}</h3>
                <div style={{
                  background: proc.is_public ? '#ecfdf5' : '#f1f5f9', color: proc.is_public ? '#059669' : '#475569',
                  padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  {proc.is_public ? <><Icons.Public /> Verejný</> : <><Icons.Private /> Súkromný</>}
                </div>
              </div>

              {/* Textový prompt */}
              <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '13px', lineHeight: 1.6, flex: 1 }}>
                {proc.prompt.length > 120 ? proc.prompt.slice(0, 120) + '...' : proc.prompt || 'Bez popisu'}
              </p>

              {/* Metadáta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: COLORS.textMuted, paddingTop: '12px', borderTop: `1px solid ${COLORS.bg}` }}>
                <span style={{ fontWeight: '500' }}>{proc.username}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icons.Nodes /> {proc.final_node_count} uzlov</span>
              </div>

              {/* Tlačidlá */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  onClick={() => loadProcess(proc.id)}
                  style={{
                    flex: 1, background: COLORS.sidebarBg, color: 'white', border: 'none', padding: '10px',
                    borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px'
                  }}>
                  <Icons.Load /> Otvoriť
                </button>
                {tab === 'my' && (
                  <button
                    onClick={() => deleteProcess(proc.id, proc.title)}
                    style={{
                      background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}40`,
                      padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    <Icons.Trash />
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Prázdny stav */}
      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: `1px dashed ${COLORS.border}` }}>
          <div style={{ color: COLORS.border, marginBottom: '16px' }}><Icons.Search /></div>
          <h3 style={{ margin: '0 0 8px 0', color: COLORS.sidebarBg }}>Zatiaľ nič nenájdené</h3>
          <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMuted }}>
            {tab === 'my' ? 'Tvoj katalóg je zatiaľ prázdny. Ulož si nejaký diagram z editora.' : 'Momentálne nie sú dostupné žiadne verejné diagramy.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default CatalogPage;