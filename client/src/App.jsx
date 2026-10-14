import { useState, useCallback, useEffect } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Chat from './components/Chat.jsx';

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { onAuth(await api(`/auth/${mode}`, { method: 'POST', body: f })); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="authCard" onSubmit={submit}>
      <h1>🧠 DocMind</h1><p className="muted">Upload documents. Ask questions. Get answers with sources.</p>
      {mode === 'register' && <input placeholder="Name" value={f.name} onChange={set('name')} />}
      <input type="email" placeholder="Email" required value={f.email} onChange={set('email')} />
      <input type="password" placeholder="Password (6+ characters)" required value={f.password} onChange={set('password')} />
      {err && <p className="error">{err}</p>}
      <button className="btn">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <button type="button" className="btn ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}</button>
    </form>
  );
}

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('docmind') || 'null'));
  const [docs, setDocs] = useState([]), [convs, setConvs] = useState([]), [active, setActive] = useState(null), [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const token = session?.token;

  const logout = useCallback(() => { localStorage.removeItem('docmind'); setSession(null); setActive(null); }, []);
  const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 4000); }, []);
  const guard = useCallback((e) => (e.status === 401 ? logout() : notify(e.message)), [logout, notify]);
  const refresh = useCallback(async () => {
    try { const [d, c] = await Promise.all([api('/documents', { token }), api('/conversations', { token })]); setDocs(d); setConvs(c); } catch (e) { guard(e); }
  }, [token, guard]);

  // Load documents and chats when the app opens (a refresh keeps you logged in) and right after logging in
  useEffect(() => { if (token) refresh(); }, [token, refresh]);

  if (!session) return <Auth onAuth={(s) => { localStorage.setItem('docmind', JSON.stringify(s)); setSession(s); }} />;
  const ctx = { token, docs, convs, active, setActive: (c) => { setActive(c); setMenu(false); }, refresh, guard, notify };
  return (
    <div className="app">
      <Sidebar {...ctx} user={session.user} logout={logout} open={menu} />
      <div className="main">
        <button className="menuBtn" onClick={() => setMenu(!menu)}>☰ Documents & chats</button>
        <Chat key={active?.id ?? 'new'} {...ctx} />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
