import { useState, useRef } from 'react';
import { api } from '../api.js';

export default function Sidebar({ token, docs, convs, active, setActive, refresh, guard, notify, user, logout, open }) {
  const [busy, setBusy] = useState(false), [drag, setDrag] = useState(false), input = useRef();

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const form = new FormData(); form.append('file', file); await api('/documents', { method: 'POST', token, form }); notify(`"${file.name}" is ready`); await refresh(); }
    catch (e) { guard(e); }
    setBusy(false); input.current.value = '';
  };
  const removeDoc = async (d) => {
    if (!confirm(`Delete "${d.title}" and the chats about it?`)) return;
    try { await api(`/documents/${d.id}`, { method: 'DELETE', token }); if (active?.document_id === d.id) setActive(null); refresh(); } catch (e) { guard(e); }
  };
  const removeConv = async (c) => {
    try { await api(`/conversations/${c.id}`, { method: 'DELETE', token }); if (active?.id === c.id) setActive(null); refresh(); } catch (e) { guard(e); }
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">🧠 DocMind</div>
      <label className={`drop ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => upload(e.target.files[0])} />
        {busy ? 'Reading & indexing…' : <><b>＋ Upload</b><br /><small>PDF, TXT or MD · max 5 MB</small></>}
      </label>

      <h4>Documents</h4>
      <div className="list">
        {docs.length === 0 && <p className="muted small">No documents yet.</p>}
        {docs.map((d) => <div className="item" key={d.id}><span title={d.filename}>📄 {d.title}</span><button className="x" onClick={() => removeDoc(d)}>✕</button></div>)}
      </div>

      <h4>Chats <button className="link" onClick={() => setActive(null)}>＋ New</button></h4>
      <div className="list grow">
        {convs.map((c) => (
          <div key={c.id} className={`item clickable ${active?.id === c.id ? 'on' : ''}`} onClick={() => setActive(c)}>
            <span>💬 {c.title}</span><button className="x" onClick={(e) => { e.stopPropagation(); removeConv(c); }}>✕</button></div>))}
      </div>
      <div className="user"><span className="muted small">{user.name || user.email}</span><button className="link" onClick={logout}>Log out</button></div>
    </aside>
  );
}
