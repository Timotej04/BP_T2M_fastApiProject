import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const CATEGORIES = ['Financie',
  'Hospodárstvo',
  'HR',
  'IT',
  'Marketing',
  'Operácie',
  'Právo',
  'Služby',
  'Školstvo',
  'Šport',
  'Územné celky',
  'Zákaznícky servis',
  'Zdravotníctvo',
  'Iné',];

const CATEGORY_COLORS = {
  'HR':                 { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'IT':                 { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'Financie':           { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'Operácie':           { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  'Marketing':          { bg: '#fce7f3', text: '#831843', border: '#f9a8d4' },
  'Zákaznícky servis':  { bg: '#ffedd5', text: '#7c2d12', border: '#fdba74' },
  'Iné':                { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

const CategoryBadge = ({ category }) => {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Iné'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: '9999px', fontSize: '11px', fontWeight: '600',
      backgroundColor: colors.bg, color: colors.text,
      border: `1px solid ${colors.border}`, whiteSpace: 'nowrap'
    }}>
      {category || 'Iné'}
    </span>
  );
};

export default function CatalogPage({ username, onLogout, onLoadModel, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Všetky');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

    const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();

      const isPublicTab = activeTab === 'public';
      const url = isPublicTab
        ? `${API}/public-catalog?${params}`
        : `${API}/catalog?${params}`;

      const headers = isPublicTab
        ? {}
        : { 'Authorization': `Bearer ${token}` };

      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error('Načítanie zlyhalo');
      const data = await resp.json();
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id) => {
    if (!window.confirm('Naozaj vymazať tento diagram?')) return;
    setDeletingId(id);
    try {
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(`${API}/catalog/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Vymazanie zlyhalo');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert('Vymazanie zlyhalo.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleVisibility = async (id, currentIsPublic) => {
    try {
      const token = localStorage.getItem('auth_token');
      const newVisibility = !currentIsPublic;

      const resp = await fetch(`${API}/catalog/${id}/visibility`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_public: newVisibility })
      });

      if (!resp.ok) throw new Error('Zmena viditeľnosti zlyhala');

      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, is_public: newVisibility } : item
      ));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleLoad = (item) => {
    const { nodes, edges } = item.model_json;
    const rawNodes = nodes.map(n => ({
      id: n.id, type: 'task',
      data: {
        label: n.label, baseLabel: n.label,
        actor: n.actor || '', nodeType: n.type || 'task',
        isDecision: n.isDecision || false
      },
      position: { x: 0, y: 0 }
    }));
    const rawEdges = edges.map(e => ({
      id: e.id, source: e.source, target: e.target, label: e.label || null,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed', color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      labelBgPadding: [8, 4], labelBgBorderRadius: 4,
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, stroke: '#cbd5e1', strokeWidth: 1 },
      labelStyle: { fill: '#1e293b', fontWeight: 600, fontSize: 12 },
    }));
    onLoadModel(rawNodes, rawEdges, item.prompt || '');
  };

    // Filtrovanie na strane klienta (vyhľadávanie + tab + kategória)
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.prompt || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'my' ? item.owner === username :
      activeTab === 'public' ? item.is_public : true;

    const itemCategory = item.category || 'Iné';
    const matchesCategory = activeCategory === 'Všetky' ? true : itemCategory === activeCategory;

    return matchesSearch && matchesTab && matchesCategory;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div style={{ minHeight: '100%', backgroundColor: '#f0f4f8', padding: '32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Hlavička */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '700', color: '#1e1b4b' }}>
            Katalóg modelov
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            {items.length} uložených diagramov · prihlásený ako <strong>{username}</strong>
          </p>
        </div>

        {/* Vyhľadávanie + Tab prepínač */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍  Hľadaj podľa názvu alebo popisu..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: '1', minWidth: '220px', padding: '10px 14px',
              borderRadius: '8px', border: '1px solid #cbd5e1',
              fontSize: '14px', outline: 'none', backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}
          />
          <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {[
              { key: 'all', label: 'Všetky' },
              { key: 'my', label: 'Moje' },
              { key: 'public', label: 'Verejné' }
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '500', transition: 'all 0.15s',
                backgroundColor: activeTab === tab.key ? '#ffffff' : 'transparent',
                color: activeTab === tab.key ? '#1e1b4b' : '#64748b',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtre podľa kategórie */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat;
            const colors = cat !== 'Všetky' ? (CATEGORY_COLORS[cat] || CATEGORY_COLORS['Iné']) : null;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                padding: '6px 14px', borderRadius: '9999px', border: '2px solid',
                cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                transition: 'all 0.15s',
                backgroundColor: isActive ? (colors ? colors.bg : '#1e1b4b') : '#ffffff',
                color: isActive ? (colors ? colors.text : '#ffffff') : '#64748b',
                borderColor: isActive ? (colors ? colors.border : '#1e1b4b') : '#e2e8f0',
                boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
              }}>
                {cat}
                {cat !== 'Všetky' && (
                  <span style={{ marginLeft: '5px', opacity: 0.7 }}>
                    ({items.filter(i => (i.category || 'Iné') === cat).length})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Obsah */}
        {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ height: '20px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px', width: '70%', marginBottom: '8px' }} />
              <div style={{ height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px', width: '50%' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ef4444' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <p style={{ fontWeight: '600' }}>Chyba pri načítaní</p>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>{error}</p>
          <button onClick={fetchItems} style={{ marginTop: '16px', padding: '8px 20px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Skúsiť znova
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <h3 style={{ color: '#475569', marginBottom: '8px', fontWeight: '600' }}>Žiadne diagramy</h3>
          <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>
            {searchQuery ? `Žiadny výsledok pre „${searchQuery}"` : 'V tejto kategórii nie sú žiadne uložené diagramy.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredItems.map(item => {
            const isOwner = item.owner === username;

            return (
              <div key={item.id} style={{
                backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                display: 'flex', flexDirection: 'column', gap: '12px',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Hlavička karty */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e1b4b', lineHeight: 1.3 }}>
                    {item.title}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <CategoryBadge category={item.category || 'Iné'} />

                    {/* Tlačidlo pre zmenu viditeľnosti */}
                    <button
                      onClick={() => isOwner ? handleToggleVisibility(item.id, item.is_public) : null}
                      disabled={!isOwner}
                      title={isOwner ? "Klikni pre zmenu viditeľnosti" : "Nemáš práva na zmenu"}
                      style={{
                        fontSize: '10px',
                        fontWeight: '600',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        cursor: isOwner ? 'pointer' : 'default',
                        backgroundColor: item.is_public ? '#dcfce7' : '#ffedd5',
                        color: item.is_public ? '#166534' : '#9a3412',
                        border: `1px solid ${item.is_public ? '#bbf7d0' : '#fed7aa'}`,
                        transition: 'opacity 0.2s, transform 0.1s',
                        outline: 'none',
                        opacity: !isOwner ? 0.7 : 1 // Jemne stmaviť ak to používateľ nemôže zmeniť
                      }}
                      onMouseDown={e => { if(isOwner) e.currentTarget.style.transform = 'scale(0.95)'; }}
                      onMouseUp={e => { if(isOwner) e.currentTarget.style.transform = 'scale(1)'; }}
                      onMouseLeave={e => { if(isOwner) e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {item.is_public ? '🌐 Verejný' : '🔒 Súkromný'}
                    </button>
                  </div>
                </div>

                {/* Popis (prompt) */}
                {item.prompt && (
                  <p style={{
                    margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {item.prompt}
                  </p>
                )}

                {/* Meta info */}
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#94a3b8' }}>
                  <span>⬡ {item.final_node_count} uzlov</span>
                  <span>👤 {item.owner}</span>
                  <span>📅 {formatDate(item.created_at)}</span>
                </div>

                {/* Akcie */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={() => handleLoad(item)} style={{
                    flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none',
                    backgroundColor: '#6366f1', color: '#fff', fontSize: '13px',
                    fontWeight: '600', cursor: 'pointer', transition: 'background 0.15s'
                  }}
                    onMouseEnter={e => e.target.style.backgroundColor = '#4f46e5'}
                    onMouseLeave={e => e.target.style.backgroundColor = '#6366f1'}
                  >
                    ↗ Načítať
                  </button>
                  {isOwner && (
                    <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} style={{
                      padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid #fecaca', backgroundColor: '#fff',
                      color: '#ef4444', fontSize: '13px', fontWeight: '600',
                      cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
                      opacity: deletingId === item.id ? 0.5 : 1, transition: 'all 0.15s'
                    }}
                      onMouseEnter={e => { if (deletingId !== item.id) e.target.style.backgroundColor = '#fef2f2'; }}
                      onMouseLeave={e => e.target.style.backgroundColor = '#fff'}
                    >
                      {deletingId === item.id ? '...' : '🗑'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `}</style>
  </div>
);
}