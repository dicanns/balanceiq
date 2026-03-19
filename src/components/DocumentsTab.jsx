import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase.js';

const DEFAULT_FOLDERS = ['SOPs', 'Brand Assets', 'Marketing & Promo', 'Logos', 'Approved Content'];
const EDGE_FN = `${SUPABASE_URL}/functions/v1/franchise-docs`;

async function callEdgeFn(body, token) {
  const res = await fetch(EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getToken() {
  const { data: sd } = await supabase.auth.getSession();
  return sd?.session?.access_token || SUPABASE_ANON_KEY;
}

// Convert File to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DocumentsTab({ isFranchisor, orgId, cloudUser, T, t, onUnreadCountChange }) {
  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPosting, setAnnPosting] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    if (!cloudUser || !orgId) { setLoading(false); return; }
    setLoading(true); setLoadErr(null);
    try {
      // Fetch documents — treat missing table as empty (migration not yet run)
      const { data: docs, error: docsErr } = await supabase
        .from('franchise_documents')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (docsErr) {
        // 42P01 = relation does not exist; PGRST116 = table not found via PostgREST
        const isSetup = docsErr.code === '42P01' || docsErr.code === 'PGRST116'
          || (docsErr.message || '').includes('does not exist');
        if (isSetup) {
          setLoadErr('__setup__');
          setLoading(false);
          return;
        }
        throw docsErr;
      }
      setDocuments(docs || []);

      // Collect folders from docs + defaults
      const docFolders = [...new Set((docs || []).map(d => d.folder))];
      setFolders(prev => {
        const all = [...DEFAULT_FOLDERS, ...docFolders, ...prev].filter((f, i, arr) => arr.indexOf(f) === i);
        return all;
      });

      // Fetch announcements
      const { data: anns, error: annsErr } = await supabase
        .from('franchise_announcements')
        .select('*')
        .order('created_at', { ascending: false });
      if (annsErr && !((annsErr.message || '').includes('does not exist'))) throw annsErr;
      setAnnouncements(anns || []);

      // Fetch read receipts for current user
      if (anns && anns.length > 0) {
        const { data: reads } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .in('announcement_id', anns.map(a => a.id));
        const readSet = new Set((reads || []).map(r => r.announcement_id));
        setReadIds(readSet);
        const unreadCount = anns.filter(a => !readSet.has(a.id)).length;
        onUnreadCountChange?.(unreadCount);
      } else {
        onUnreadCountChange?.(0);
      }
    } catch (e) {
      console.error('[DocumentsTab] loadData error:', e);
      setLoadErr(T.docLoadErr + ' ' + (e?.message || e?.code || ''));
    } finally {
      setLoading(false);
    }
  }, [cloudUser, orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFolder) return;
    setUploading(true); setUploadErr(null);
    try {
      const base64 = await fileToBase64(file);
      const token = await getToken();
      const result = await callEdgeFn({
        action: 'upload',
        orgId,
        folder: selectedFolder,
        filename: file.name,
        fileBase64: base64,
        mimeType: file.type,
      }, token);
      if (result.error) throw new Error(result.error);
      await loadData();
    } catch (e) {
      setUploadErr(T.docUploadErr + (e.message ? ` (${e.message})` : ''));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [selectedFolder, orgId, loadData]);

  const handleDelete = useCallback(async (doc) => {
    if (!window.confirm(T.docDeleteConfirm)) return;
    const token = await getToken();
    await callEdgeFn({ action: 'delete_doc', docId: doc.id, storagePath: doc.storage_path, orgId }, token);
    await loadData();
  }, [orgId, loadData]);

  const handleDownload = useCallback(async (doc) => {
    try {
      const token = await getToken();
      const result = await callEdgeFn({ action: 'get_signed_url', storagePath: doc.storage_path }, token);
      if (result.error) throw new Error(result.error);
      await window.api.docs.download({ url: result.url, filename: doc.filename });
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  }, []);

  const handlePostAnn = useCallback(async () => {
    if (!annTitle.trim() || !annBody.trim()) return;
    setAnnPosting(true);
    try {
      const token = await getToken();
      const result = await callEdgeFn({ action: 'post_announcement', orgId, title: annTitle.trim(), body: annBody.trim() }, token);
      if (result.error) throw new Error(result.error);
      setAnnTitle(''); setAnnBody('');
      await loadData();
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setAnnPosting(false);
    }
  }, [annTitle, annBody, orgId, loadData]);

  const handleDeleteAnn = useCallback(async (ann) => {
    if (!window.confirm(T.annDelete + '?')) return;
    const token = await getToken();
    await callEdgeFn({ action: 'delete_announcement', annId: ann.id, orgId }, token);
    await loadData();
  }, [orgId, loadData]);

  const handleMarkRead = useCallback(async (ann) => {
    if (readIds.has(ann.id)) return;
    try {
      await supabase.from('announcement_reads').insert({ announcement_id: ann.id, user_id: cloudUser.id });
      setReadIds(prev => new Set([...prev, ann.id]));
      onUnreadCountChange?.(prev => Math.max(0, (prev || 0) - 1));
    } catch (e) { /* ignore */ }
  }, [readIds, cloudUser]);

  const handleAddFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    setFolders(prev => [...new Set([...prev, name])]);
    setSelectedFolder(name);
    setNewFolderName(''); setAddingFolder(false);
  }, [newFolderName]);

  const filteredDocs = selectedFolder ? documents.filter(d => d.folder === selectedFolder) : [];

  // Styles
  const folderBtn = (active) => ({
    width: '100%', padding: '7px 12px', textAlign: 'left', background: active ? 'rgba(249,115,22,0.15)' : 'transparent',
    border: active ? '1px solid rgba(249,115,22,0.4)' : '1px solid transparent',
    borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? '#f97316' : 'inherit',
  });
  const inputStyle = {
    width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'inherit', fontSize: 12,
  };
  const btnOrange = {
    padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700,
  };
  const btnGhost = {
    padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer', background: 'transparent', color: 'inherit', fontSize: 11,
  };

  if (!cloudUser) {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.6 }}>{T.docNotLinked}</div>;
  }

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, opacity: 0.5 }}>Chargement...</div>;
  }

  if (loadErr === '__setup__') {
    return (
      <div style={{ padding: 20, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10, maxWidth: 560 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginBottom: 8 }}>⚙️ Configuration requise — Documents réseau</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, opacity: 0.85, marginBottom: 12 }}>
          Les tables Supabase pour le partage de documents n'ont pas encore été créées.<br/>
          Exécuter la migration suivante dans le <strong>SQL Editor</strong> de votre projet Supabase&nbsp;:
        </div>
        <code style={{ display: 'block', fontSize: 10.5, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, whiteSpace: 'pre', overflowX: 'auto', color: '#c0c3d4' }}>
          {`supabase/migrations/20260314_franchise_docs.sql`}
        </code>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 12 }}>
          Ensuite, créer un bucket Storage nommé <strong>franchise-docs</strong> (privé, 10 MB max) dans Supabase Storage.
        </div>
        <button onClick={loadData} style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.1)', color: '#f97316', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          {T.docRetryAfterMig || 'Retry after migration'}
        </button>
      </div>
    );
  }

  if (loadErr) {
    return <div style={{ padding: 16, fontSize: 12, color: '#ef4444' }}>{loadErr} <button onClick={loadData} style={btnGhost}>{T.docRetry || 'Retry'}</button></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Documents section */}
      <div style={{ display: 'flex', gap: 16, minHeight: 300 }}>
        {/* Folder panel */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{T.docFolders}</div>
          {folders.map(f => (
            <button key={f} onClick={() => setSelectedFolder(f)} style={folderBtn(selectedFolder === f)}>
              📁 {f}
            </button>
          ))}
          {isFranchisor && (
            addingFolder
              ? <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    placeholder={T.docNewFolder} style={{ ...inputStyle, fontSize: 11 }}
                    onKeyDown={e => e.key === 'Enter' && handleAddFolder()} autoFocus />
                  <button onClick={handleAddFolder} style={{ ...btnOrange, padding: '4px 8px' }}>+</button>
                </div>
              : <button onClick={() => setAddingFolder(true)} style={{ ...folderBtn(false), color: '#f97316', marginTop: 4 }}>
                  {T.docAddFolder}
                </button>
          )}
        </div>

        {/* File list */}
        <div style={{ flex: 1 }}>
          {!selectedFolder ? (
            <div style={{ fontSize: 12, opacity: 0.5, padding: '12px 0' }}>{T.docNoFolder}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedFolder}</div>
                {isFranchisor && (
                  <div>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.mov,.zip" />
                    <button onClick={() => !uploading && fileInputRef.current?.click()} style={btnOrange} disabled={uploading}>
                      {uploading ? T.docUploading : T.docUpload}
                    </button>
                  </div>
                )}
              </div>
              {uploadErr && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{uploadErr}</div>}
              {filteredDocs.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.5 }}>{T.docNoFiles}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredDocs.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                        <div style={{ fontSize: 10, opacity: 0.5 }}>
                          {doc.size_bytes ? T.docSize(doc.size_bytes) : ''} &nbsp;·&nbsp;
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button onClick={() => handleDownload(doc)} style={btnGhost}>{T.docDownload}</button>
                      {isFranchisor && (
                        <button onClick={() => handleDelete(doc)} style={{ ...btnGhost, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>{T.docDelete}</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Announcements section */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{T.annSection}</div>

        {/* Compose (franchisor only) */}
        {isFranchisor && (
          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{T.annNew}</div>
            <input value={annTitle} onChange={e => setAnnTitle(e.target.value)}
              placeholder={T.annTitleLabel} style={{ ...inputStyle, marginBottom: 6 }} />
            <textarea value={annBody} onChange={e => setAnnBody(e.target.value)}
              placeholder={T.annBody} rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            <button onClick={handlePostAnn} disabled={annPosting || !annTitle.trim() || !annBody.trim()} style={{ ...btnOrange, marginTop: 8, opacity: (!annTitle.trim() || !annBody.trim()) ? 0.5 : 1 }}>
              {annPosting ? T.annPublishing : T.annPublish}
            </button>
          </div>
        )}

        {/* Announcement list */}
        {announcements.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.5 }}>{T.annNoAnn}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {announcements.map(ann => {
              const isUnread = !readIds.has(ann.id);
              return (
                <div key={ann.id}
                  onClick={() => handleMarkRead(ann)}
                  style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    background: isUnread ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.03)',
                    border: isUnread ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{ann.title}</span>
                      {isUnread && <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '1px 6px' }}>{T.annUnread}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, opacity: 0.4 }}>{new Date(ann.created_at).toLocaleDateString()}</span>
                      {isFranchisor && <button onClick={e => { e.stopPropagation(); handleDeleteAnn(ann); }} style={{ ...btnGhost, fontSize: 10, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>{T.annDelete}</button>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: 'pre-wrap' }}>{ann.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
