import { useEffect, useRef, useState } from 'react';
import { api, streamAnswer } from '../api.js';

// Turns citation markers ([1], [1, 2], 【1】) into clickable chips and **bold** into bold text
const TOKEN = /([\[【]\s*\d+(?:\s*,\s*\d+)*[^\]】]*[\]】]|\*\*[^*]+\*\*)/g;
function Text({ text, onCite }) {
  return text.split(TOKEN).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    const cite = /^[\[【]\s*(\d+(?:\s*,\s*\d+)*)/.exec(p);
    if (cite) return cite[1].split(',').map((n) => <button key={i + '-' + n} className="cite" onClick={() => onCite(Number(n))}>{Number(n)}</button>);
    return <span key={i}>{p}</span>;
  });
}

function Message({ m }) {
  const [open, setOpen] = useState(null);
  return (
    <div className={`msg ${m.role}`}>
      <div className="bubble">
        <Text text={m.content || ''} onCite={(n) => setOpen(open === n ? null : n)} />
        {m.streaming && <span className="caret" />}
      </div>
      {m.sources?.length > 0 && (
        <div className="sources">
          {m.sources.map((s) => <button key={s.n} className={`src ${open === s.n ? 'on' : ''}`} onClick={() => setOpen(open === s.n ? null : s.n)}>[{s.n}] {s.title}</button>)}
          {open && m.sources.find((s) => s.n === open) && <p className="snippet">{m.sources.find((s) => s.n === open).snippet}</p>}
        </div>)}
    </div>
  );
}

export default function Chat({ token, docs, active, setActive, refresh, guard, notify }) {
  const [msgs, setMsgs] = useState([]), [q, setQ] = useState(''), [busy, setBusy] = useState(false), [scope, setScope] = useState('');
  const bottom = useRef();

  useEffect(() => {
    if (active) api(`/conversations/${active.id}/messages`, { token }).then(setMsgs).catch(guard);
  }, [active, token, guard]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (e) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    if (!docs.length) return notify('Upload a document first');
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content: '', sources: [], streaming: true }]);
    const patch = (fn) => setMsgs((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);
    try {
      let conv = active;
      if (!conv) { conv = await api('/conversations', { method: 'POST', token, body: { documentId: scope ? Number(scope) : null } }); }
      await streamAnswer(conv.id, question, token, {
        sources: (s) => patch((x) => ({ ...x, sources: s })),
        token: (t) => patch((x) => ({ ...x, content: x.content + t.text })),
        error: (er) => patch((x) => ({ ...x, content: x.content || '⚠️ ' + er.message, streaming: false, failed: true })),
        done: (d) => patch((x) => ({ ...x, streaming: false, sources: d.sources ?? x.sources })),
      });
      await refresh();
      if (!active) setActive({ ...conv, title: question.slice(0, 60) });
    } catch (er) { setMsgs((m) => m.slice(0, -2)); setQ(question); guard(er); }
    setBusy(false);
  };

  return (
    <section className="chat">
      <div className="scroll">
        {msgs.length === 0 && (
          <div className="empty">
            <h2>Ask anything about your documents</h2>
            <p className="muted">Answers are based on your files and cite the passages they used. Anything else is labelled.</p>
            {!active && docs.length > 0 && (
              <label className="scope">Search in <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">All my documents</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>)}
            {docs.length === 0 && <p className="hint">👈 Start by uploading a PDF or text file.</p>}
          </div>)}
        {msgs.map((m, i) => <Message key={i} m={m} />)}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={send}>
        <input placeholder={docs.length ? 'Ask a question about your documents…' : 'Upload a document to begin'} value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={busy || !q.trim()}>{busy ? '…' : 'Ask'}</button>
      </form>
    </section>
  );
}
