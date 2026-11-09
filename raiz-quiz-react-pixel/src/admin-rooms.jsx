import React, { useEffect, useRef, useState } from 'react';
import { requestApi as api, deleteApi } from './api-client.js';

const labels = { lobby: 'Em espera', question: 'Em andamento', reveal: 'Em correção', finished: 'Finalizada' };
const formatDate = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminRooms({ token, onExpired, Icon }) {
  const [rooms, setRooms] = useState(null);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const dialogRef = useRef(null);
  const refreshRef = useRef(() => {});
  const requestSequence = useRef(0);
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  useEffect(() => {
    let active = true;
    setRooms(null); setSelected(null);
    async function refresh(background = false) {
      const sequence = ++requestSequence.current;
      if (!background) setLoading(true);
      try {
        const result = await api('/api/admin/rooms', undefined, token);
        if (active && sequence === requestSequence.current) { setRooms(result.rooms); setError(''); }
      } catch (err) {
        if (!active || sequence !== requestSequence.current) return;
        if (err.status === 401) expiredRef.current(err.message);
        else setError(err.message);
      } finally { if (active && sequence === requestSequence.current) setLoading(false); }
    }
    refreshRef.current = refresh;
    refresh();
    const interval = setInterval(() => refresh(true), 5000);
    return () => { active = false; clearInterval(interval); refreshRef.current = () => {}; requestSequence.current++; };
  }, [token]);

  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [selected]);

  async function confirmDelete(event) {
    event.preventDefault();
    if (!selected || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteApi(`/api/admin/rooms/${selected.code}`, token);
      // Invalidate lists requested before the deletion so they cannot restore the deleted row.
      requestSequence.current++;
      setRooms(previous => previous?.filter(room => room.code !== selected.code) || []);
      setMessage(`Sala ${selected.code} excluída.`); setSelected(null);
      refreshRef.current(true);
    } catch (err) {
      if (err.status === 401) expiredRef.current(err.message);
      else if (err.status === 404) { setMessage('Essa sala já foi encerrada ou excluída.'); setSelected(null); refreshRef.current(true); }
      else setDeleteError(err.message);
    } finally { setDeleting(false); }
  }

  const visible = (rooms || []).filter(room => filter === 'all' || (filter === 'finished' ? room.phase === 'finished' : room.phase !== 'finished'));
  const openCount = (rooms || []).filter(room => room.phase !== 'finished').length;

  return <section id="admin-rooms" className="admin-rooms" aria-label="Gerenciamento de salas">
    <div className="admin-rooms-heading"><div><span className="eyebrow">PAINEL DO ADMINISTRADOR</span><h2>Gerenciar salas</h2><p>{rooms ? `${openCount} ${openCount === 1 ? 'sala aberta' : 'salas abertas'}` : 'Carregando salas…'} · atualização a cada 5 segundos</p></div><button className="secondary-button" disabled={loading || deleting} onClick={() => refreshRef.current()}>{loading ? 'Atualizando…' : 'Atualizar lista'}<Icon name="reset" size={17}/></button></div>
    <div className="admin-rooms-toolbar"><label htmlFor="room-filter">Mostrar</label><select id="room-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Salas abertas</option><option value="finished">Salas finalizadas</option><option value="all">Todas as salas</option></select><span>Somente administradores podem excluir salas.</span></div>
    {message && <p className="admin-rooms-success" role="status">{message}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {rooms === null ? <p className="admin-rooms-empty" role="status">{loading ? 'Buscando salas…' : 'Não foi possível carregar as salas. Clique em atualizar para tentar novamente.'}</p> : !visible.length ? <p className="admin-rooms-empty">{filter === 'open' ? 'Nenhuma sala aberta no momento. Crie uma competição para receber a turma.' : 'Nenhuma sala para este filtro.'}</p> : <div className="admin-rooms-grid">{visible.map(room => <article className="admin-room-card" key={room.code}>
      <div className="admin-room-top"><h3><span>SALA</span> {room.code}</h3><span className={`room-phase phase-${room.phase}`}>{labels[room.phase]}</span></div>
      <dl><div><dt>Participantes</dt><dd>{room.playerCount}</dd></div><div><dt>Progresso</dt><dd>{room.questionNumber ? `${room.questionNumber} / ${room.total}` : 'Não iniciada'}</dd></div><div><dt>Criada em</dt><dd><time dateTime={new Date(room.createdAt).toISOString()}>{formatDate(room.createdAt)}</time></dd></div></dl>
      <button className="danger-button" disabled={deleting} onClick={() => { setDeleteError(''); setSelected(room); }}>Excluir sala {room.code}</button>
    </article>)}</div>}
    <dialog ref={dialogRef} onCancel={e => { if (deleting) e.preventDefault(); else setSelected(null); }} onClick={e => { if (!deleting && e.target === dialogRef.current) setSelected(null); }}><form className="dialog-content" onSubmit={confirmDelete}><button type="button" className="dialog-close text-button" aria-label="Cancelar exclusão" disabled={deleting} onClick={() => setSelected(null)}><Icon name="close"/></button><div className="eyebrow">EXCLUIR COMPETIÇÃO</div><h2>Excluir a sala {selected?.code}?</h2><p>A sala e seus resultados serão removidos. Se houver uma partida em andamento, ela será encerrada e os participantes serão avisados. Esta ação não pode ser desfeita.</p>{deleteError && <div className="admin-error" role="alert">{deleteError}</div>}<div className="dialog-actions"><button type="button" className="text-button" disabled={deleting} onClick={() => setSelected(null)}>Cancelar</button><button className="danger-button" disabled={deleting}>{deleting ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></form></dialog>
  </section>;
}
