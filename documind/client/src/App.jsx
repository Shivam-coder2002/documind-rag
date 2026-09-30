import { useEffect, useRef, useState } from 'react';

const api = async (url, options) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export default function App() {
  const [docs, setDocs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const loadDocs = async () => setDocs(await api('/api/documents'));

  useEffect(() => { loadDocs().catch((e) => setError(e.message)); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, asking]);

  const selectDoc = (doc) => { setActive(doc); setMessages([]); setError(''); };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const doc = await api('/api/documents', { method: 'POST', body: form });
      await loadDocs();
      selectDoc(doc);
    } catch (err) { setError(err.message); }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (id) => {
    await api(`/api/documents/${id}`, { method: 'DELETE' });
    if (active?._id === id) { setActive(null); setMessages([]); }
    loadDocs();
  };

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim() || !active || asking) return;
    const q = question.trim();
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setQuestion(''); setAsking(true); setError('');
    try {
      const data = await api(`/api/documents/${active._id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: messages.map((m) => ({ role: m.role, text: m.text })) }),
      });
      setMessages((m) => [...m, { role: 'bot', text: data.answer, sources: data.sources }]);
    } catch (err) { setError(err.message); }
    setAsking(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>DocuMind</h1>
        <p className="tag">Chat with your PDFs</p>
        <label className={`upload ${uploading ? 'disabled' : ''}`}>
          {uploading ? 'Processing PDF...' : '+ Upload PDF'}
          <input type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} hidden />
        </label>
        <ul className="docs">
          {docs.map((d) => (
            <li key={d._id} className={active?._id === d._id ? 'active' : ''} onClick={() => selectDoc(d)}>
              <div>
                <strong>{d.name}</strong>
                <small>{d.pages} pages, {d.chunks} chunks</small>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(d._id); }} title="Delete">x</button>
            </li>
          ))}
          {docs.length === 0 && <li className="empty">No documents yet</li>}
        </ul>
      </aside>

      <main className="chat">
        {!active ? (
          <div className="placeholder">Upload or select a PDF to start asking questions.</div>
        ) : (
          <>
            <header><strong>{active.name}</strong></header>
            <div className="messages">
              {messages.length === 0 && <p className="hint">Ask anything about this document.</p>}
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <p>{m.text}</p>
                  {m.sources?.length > 0 && (
                    <details>
                      <summary>Sources ({m.sources.length})</summary>
                      {m.sources.map((s, j) => (
                        <blockquote key={j}>
                          <small>{s.page ? `page ${s.page}, ` : ''}similarity {s.score}</small>
                          <div>{s.text}</div>
                        </blockquote>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              {asking && <div className="msg bot"><p>Thinking...</p></div>}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={ask} className="composer">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question..." />
              <button disabled={asking || !question.trim()}>Send</button>
            </form>
          </>
        )}
        {error && <div className="error">{error}</div>}
      </main>
    </div>
  );
}
