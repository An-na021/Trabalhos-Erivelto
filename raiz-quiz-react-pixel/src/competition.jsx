import React, { useEffect, useRef, useState } from 'react';
import { requestApi as api, apiUrl, onlineMode } from './api-client.js';
import AdminRooms from './admin-rooms.jsx';
import './competition.css';

const SESSION_KEY = 'dfs-live-session-v1';
const formatScore = n => n.toLocaleString('pt-BR');
function loadSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    const requested = new URLSearchParams(location.search).get('sala');
    return value && /^\d{6}$/.test(value.code) && typeof value.token === 'string' && (!requested || requested === value.code) ? value : null;
  } catch { return null; }
}
function Trophy() {
  return <svg className="trophy" viewBox="0 0 64 64" aria-hidden="true" shapeRendering="crispEdges"><path d="M18 8h28v22H18zM24 30h16v8H24zM28 38h8v12h-8zM18 50h28v7H18z" fill="currentColor"/><path d="M18 12H8v14h10m28-14h10v14H46" fill="none" stroke="currentColor" strokeWidth="5"/><path d="M26 14h5v12h-5z" fill="#ffe8b7"/></svg>;
}
function Leaderboard({ ranking, me, final = false }) {
  return <section className="leaderboard" aria-label={final ? 'Classificação final' : 'Classificação da partida'}>
    <div className="section-heading"><h2>{final ? 'Classificação final' : 'Na disputa'}</h2><span>{ranking.length} participantes</span></div>
    <div className="ranking-scroll"><table><thead><tr><th scope="col">Posição</th><th scope="col">Participante</th><th scope="col">Acertos</th><th scope="col">Pontos</th></tr></thead><tbody>
      {ranking.map(p => <tr key={p.id} className={p.id === me ? 'my-row' : ''}><td><span className={`rank rank-${p.rank}`}>{p.rank}º</span></td><th scope="row">{p.name}{p.id === me && <small> você</small>}</th><td>{p.correct}</td><td>{formatScore(p.score)}</td></tr>)}
    </tbody></table></div>
    <p className="fine-print">Desempate: mais acertos, menor tempo nos acertos e, por último, ordem de entrada.</p>
  </section>;
}

export default function Competition({ Tree, Icon }) {
  const [session, setSession] = useState(loadSession);
  const [game, setGame] = useState(null);
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('sala') || '').replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState(false);
  const [help, setHelp] = useState(false);
  const [admin, setAdmin] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [copied, setCopied] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [inviteOrigin, setInviteOrigin] = useState(location.origin);
  const [now, setNow] = useState(performance.now());
  const receivedAt = useRef(performance.now());
  const headingRef = useRef(null);
  const dialogRef = useRef(null);
  const adminDialogRef = useRef(null);
  const appliedVersion = useRef(0);
  const isHost = session?.role === 'host';

  function apply(state) {
    // Ignore older snapshots arriving after a newer round or answer.
    if (state.revision < appliedVersion.current) return;
    appliedVersion.current = state.revision;
    receivedAt.current = performance.now(); setNow(performance.now()); setGame(state);
  }
  useEffect(() => {
    if (!session) return;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Session remains usable in this tab. */ }
    let active = true;
    let closed = false;
    function roomClosed(message) {
      closed = true; stream.close(); clearInterval(polling);
      setConnected(false); setFatal(true); setGame(null); setError(message);
    }
    const refresh = () => api(`/api/rooms/${session.code}/state`, undefined, session.token).then(state => { if (active && !closed) apply(state); }).catch(err => {
      if (!active || closed) return;
      if ([401, 404].includes(err.status)) roomClosed(err.message);
    });
    const stream = new EventSource(apiUrl(`/api/rooms/${session.code}/events?token=${encodeURIComponent(session.token)}`));
    stream.onopen = () => { if (active && !closed) { setConnected(true); setFatal(false); } };
    stream.onmessage = event => { if (active && !closed) { apply(JSON.parse(event.data)); setConnected(true); } };
    stream.onerror = () => { if (active && !closed) { setConnected(false); refresh(); } };
    stream.addEventListener('room-closed', event => { if (active && !closed) roomClosed(JSON.parse(event.data).message); });
    refresh();
    const polling = setInterval(refresh, 5000);
    return () => { active = false; stream.close(); clearInterval(polling); };
  }, [session]);
  useEffect(() => {
    if (game?.phase !== 'question') return;
    const id = setInterval(() => setNow(performance.now()), 150);
    return () => clearInterval(id);
  }, [game?.phase, game?.index]);
  useEffect(() => {
    if (game?.phase === 'lobby' && isHost) {
      api('/api/network').then(({ addresses: list }) => { setAddresses(list); if (list.length) setInviteOrigin(list[0]); }).catch(() => {});
    }
  }, [game?.phase, isHost]);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [game?.phase, game?.index]);
  useEffect(() => { if (help) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [help]);
  useEffect(() => {
    if (adminOpen) adminDialogRef.current?.showModal();
    else { adminDialogRef.current?.close(); setAdminPassword(''); }
  }, [adminOpen]);

  async function loginAdmin(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setAdminError('');
    try {
      setAdmin(await api('/api/admin/login', { password: adminPassword }));
      setAdminOpen(false); setError('');
    } catch (err) { setAdminError(err.message); }
    finally { setAdminPassword(''); setBusy(false); }
  }
  function createRoom() {
    perform(async () => {
      try { enter(await api('/api/rooms', {}, admin?.token)); }
      catch (err) {
        if (err.status === 401) { setAdmin(null); setAdminError(err.message); setAdminOpen(true); }
        else throw err;
      }
    });
  }
  function logoutAdmin() {
    perform(async () => { await api('/api/admin/logout', {}, admin?.token); setAdmin(null); });
  }
  function expireAdmin(message) {
    setAdmin(null); setAdminError(message); setAdminOpen(true);
  }

  async function perform(task) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (err) { setError(err.message || 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  function enter(value) {
    appliedVersion.current = 0; setGame(null); setFatal(false); setError(''); setConnected(false);
    if (value.role === 'host') window.history.replaceState({}, '', location.pathname);
    setSession(value);
  }
  function leave() {
    if (game && !['lobby', 'finished'].includes(game.phase) && !window.confirm('Sair da tela da partida? A sala continuará e o tempo não será pausado.')) return;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* No saved session. */ }
    setSession(null); setGame(null); setError(''); setFatal(false); setConnected(false); appliedVersion.current = 0;
    window.history.replaceState({}, '', location.pathname);
  }
  const remaining = game?.phase === 'question' ? Math.max(0, game.deadline - game.serverNow - (now - receivedAt.current)) : 0;
  const seconds = Math.ceil(remaining / 1000);
  const question = game?.question;
  const revealed = game?.phase === 'reveal';
  const invite = `${inviteOrigin}/?sala=${session?.code || ''}`;
  const ready = connected && !fatal;
  function command(action) { perform(async () => apply(await api(`/api/rooms/${session.code}/command`, { action }, session.token))); }
  function answer(choice) { perform(async () => apply(await api(`/api/rooms/${session.code}/answer`, { questionId: question.id, choice }, session.token))); }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('Não foi possível copiar automaticamente. Selecione e copie o endereço exibido.'); }
  }

  return <div className={`app-shell competition ${session ? 'screen-live' : 'screen-intro'}`}>
    <header className="site-header"><button className="brand" onClick={leave} aria-label="Página inicial"><span className="brand-symbol"><Icon name="branch" size={22}/></span></button>
      <span className="header-subject"><span className="pixel-light"/>{session ? `SALA ${session.code} · ${isHost ? 'APRESENTADOR' : 'PARTICIPANTE'}` : 'O CONHECIMENTO ENTRA EM JOGO'}</span>
      <button className="text-button how-button" onClick={() => setHelp(true)}><Icon name="book" size={17}/><span>Como jogar</span></button>
    </header>
    <main>
      {error && <div className="game-error" role="alert">{error}{session && fatal && <button className="text-button" onClick={leave}>Voltar ao início</button>}</div>}
      {!session && <>
        <section className="arena-hero">
          <div className="arena-art" aria-hidden="true"/>
          <div className="arena-copy"><div className="eyebrow"><span className="tiny-line"/> DESAFIO MULTIPLAYER</div><h1>Vá mais fundo.<br/><em>Chegue ao topo.</em></h1>
            <p>Seu nome na disputa. Seu raciocínio no comando. Responda sobre DFS em tempo real e conquiste um lugar no pódio.</p>
            <div className="quiz-facts"><span>15 perguntas</span><span>45–60 segundos</span><span>Ao vivo</span></div>
            <div className="host-entry">{admin ? <><span className="admin-status"><Icon name="check" size={16}/> Administrador conectado</span><button className="secondary-button" disabled={busy} onClick={createRoom}>Criar sala de competição <Icon size={17}/></button><button className="text-button admin-logout" disabled={busy} onClick={logoutAdmin}>Sair do acesso de administrador</button><p>Crie a sala e compartilhe o convite com a turma.</p><a className="admin-rooms-link" href="#admin-rooms">Ver e gerenciar salas</a></> : <><button className="text-button admin-access" disabled={busy} onClick={() => { setAdminError(''); setAdminOpen(true); }}><Icon name="branch" size={16}/> Acesso de administrador</button><p>Participantes entram com o código ao lado. A criação de salas é exclusiva para administradores.</p></>}</div>
          </div>
          <form className="entry-card" onSubmit={e => { e.preventDefault(); perform(async () => enter(await api(`/api/rooms/${code}/join`, { name }))); }}>
            <span className="eyebrow">PRONTO PARA A DISPUTA?</span><h2>Entre na sala.</h2><p>Use o código compartilhado pelo apresentador.</p>
            <label htmlFor="room-code">Código da sala</label><input id="room-code" className="pin-input" inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="off"/>
            <label htmlFor="player-name">Seu nome no pódio</label><input id="player-name" placeholder="Como a turma te chama?" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={24} required autoComplete="nickname"/>
            <button className="primary-button" disabled={busy || code.length !== 6 || name.trim().length < 2}>{busy ? 'Conectando…' : 'Entrar na competição'}<Icon size={18}/></button><span className="entry-footnote">Cada participante joga no próprio celular.</span>
          </form>
        </section>
        {admin && <AdminRooms token={admin.token} onExpired={expireAdmin} onEnter={enter} Icon={Icon}/>}
        <section className="intro-bottom"><div className="feature-card"><span className="feature-number">01</span><div><h2>Entre com seu nome</h2><p>{onlineMode ? 'Jogue de onde estiver. O apresentador compartilha o endereço e o código.' : 'Todos na mesma rede Wi-Fi. O apresentador compartilha o endereço e o código.'}</p></div></div><div className="feature-card"><span className="feature-number">02</span><div><h2>Acerte. Seja ágil.</h2><p>45 segundos por pergunta. Nos desafios com código, você tem 60 segundos.</p></div></div><div className="feature-card"><span className="feature-number">03</span><div><h2>Conquiste o pódio</h2><p>Acertos rendem até 1.000 pontos. A rapidez decide o bônus. Top 3 no final!</p></div></div></section>
      </>}

      {session && !game && !fatal && <section className="loading-card" role="status">Conectando à sala {session.code}…</section>}
      {session && !connected && !fatal && <p className="connection-banner" role="status">Reconectando à sala… O relógio continua correndo.</p>}

      {game?.phase === 'lobby' && <section className="lobby-layout">
        <div className="lobby-main"><div className="eyebrow">{isHost ? 'REÚNA A TURMA' : 'VOCÊ ESTÁ NA DISPUTA'}</div>
          <h1 ref={headingRef} tabIndex="-1">{isHost ? 'A sala está aberta.' : `Boa sorte, ${game.me.name}!`}</h1>
          <p className="lead">{isHost ? 'Compartilhe o endereço abaixo. Cada pessoa abre no celular e entra com o próprio nome.' : 'Aguarde o apresentador iniciar. Deixe esta tela aberta para receber a primeira pergunta.'}</p>
          <div className="room-pin"><span>CÓDIGO DA SALA</span><strong>{game.code}</strong></div>
          {isHost && <div className="invite-box"><label htmlFor="network-address">Endereço para os celulares</label>
            {addresses.length > 1 && <select id="network-address" value={inviteOrigin} onChange={e => setInviteOrigin(e.target.value)} aria-label="Escolher endereço da rede">{[...new Set([...addresses, location.origin])].map(a => <option key={a} value={a}>{a}</option>)}</select>}
            <input id={addresses.length > 1 ? 'invite-link' : 'network-address'} aria-label="Link de entrada" value={invite} readOnly onFocus={e => e.target.select()}/>
            <button className="secondary-button" onClick={copyInvite}>{copied ? 'Endereço copiado!' : 'Copiar convite'}</button><p>{onlineMode ? 'O convite abre a competição pela internet. Compartilhe com a turma e mantenha a tela do apresentador aberta.' : 'Computador e celulares precisam estar na mesma rede Wi-Fi. Se a rede bloquear a conexão, consulte as instruções no README.'}</p></div>}
          <div className="lobby-actions">{isHost ? <button className="primary-button" disabled={busy || !ready || !game.players.length} onClick={() => command('start')}>Iniciar competição <Icon/></button> : <div className="waiting-label" role="status"><span className="pixel-light"/> Aguardando o início da partida</div>}<button className="text-button" onClick={leave}>Sair desta tela</button></div>
        </div>
        <aside className="players-panel"><div className="section-heading"><h2>Na sala</h2><span>{game.players.length} / 100</span></div>
          {!game.players.length ? <div className="empty-players"><Icon name="branch" size={36}/><p>Os nomes aparecem aqui<br/>quando a turma entrar.</p></div> : <ul className="players-list">{game.players.map((p, i) => <li key={p.id}><span className="player-avatar">{String(i + 1).padStart(2, '0')}</span><span>{p.name}</span>{p.id === game.me?.id && <small>você</small>}</li>)}</ul>}
          <div className="room-rules"><span>REGRAS DA DISPUTA</span><p>45s por pergunta · 60s com código</p><p>Uma resposta por rodada</p><p>500 a 1.000 pontos por acerto</p></div>
        </aside>
      </section>}

      {question && ['question', 'reveal'].includes(game.phase) && <section className="round-layout">
        <div className="round-main"><div className={`round-bar ${seconds <= 10 && !revealed ? 'urgent' : ''}`}>
          <div><span className="eyebrow">PERGUNTA {game.index + 1} DE {game.total}</span><span className="round-topic">{question.topic}</span></div>
          <div className="countdown" role="timer" aria-label={revealed ? 'Rodada encerrada' : `${seconds} segundos restantes`}>{revealed ? '✓' : seconds}<small>{revealed ? 'ENCERRADA' : 'SEGUNDOS'}</small></div>
        </div><progress className="time-track" max={game.duration} value={remaining} aria-label="Tempo restante"/>
          <article className="live-question"><h1 ref={headingRef} tabIndex="-1">{question.title}</h1><p className="question-prompt">{question.prompt}</p>
            {question.tree && <figure className="question-tree"><Tree type={question.tree}/><figcaption>Filhos explorados da esquerda para a direita.</figcaption></figure>}
            {question.code && <div className="code-block"><span>{question.codeLanguage || 'CÓDIGO'}</span><pre><code>{question.code}</code></pre></div>}
            <div className="live-options" role="group" aria-label="Alternativas">{question.options.map((option, i) => {
              const selected = game.me?.choice === i;
              const classes = `live-option option-${i} ${selected ? 'picked' : ''} ${revealed ? i === question.correct ? 'correct' : 'incorrect' : ''}`;
              const content = <><span className="answer-symbol">{['▲', '◆', '●', '■'][i]}</span><span className="answer-content"><b>{'ABCD'[i]}</b> {option}</span><span className="answer-mark">{revealed && i === question.correct ? <Icon name="check"/> : selected ? <Icon name="check" size={17}/> : null}{revealed && <small>{game.distribution[i]} {game.distribution[i] === 1 ? 'resposta' : 'respostas'}</small>}</span></>;
              return isHost ? <div key={i} className={classes}>{content}</div> : <button key={i} className={classes} disabled={busy || !ready || game.me.answered || revealed || seconds === 0} onClick={() => answer(i)} aria-pressed={selected}>{content}</button>;
            })}</div>
            {!isHost && !revealed && <div className={`response-state ${game.me.answered ? 'sent' : ''}`} role="status">{game.me.answered ? 'Resposta enviada! Aguarde a correção da rodada.' : seconds === 0 ? 'Tempo esgotado. Aguardando a correção…' : 'Toque em uma alternativa para enviar. A resposta é definitiva.'}</div>}
            {revealed && <div className="round-explanation" role="status"><span className="eyebrow">{isHost ? 'CORREÇÃO DA RODADA' : game.me.points > 0 ? `ACERTOU! +${formatScore(game.me.points)} PONTOS` : game.me.answered ? 'NÃO FOI DESSA VEZ' : 'TEMPO ESGOTADO'}</span><h2>Resposta {'ABCD'[question.correct]}</h2><p>{question.explanation}</p></div>}
          </article>
        </div>
        <aside className="round-sidebar"><div className="round-status"><span className="eyebrow">{isHost ? 'PULSO DA SALA' : 'SEU PERCURSO'}</span><h2>{isHost ? `${game.answeredCount}/${game.players.length}` : formatScore(game.me.score)}<small>{isHost ? 'respostas enviadas' : 'pontos acumulados'}</small></h2><p>{revealed ? 'Rodada concluída.' : 'Todos respondem à mesma pergunta.'}</p></div>
          {revealed ? <><Leaderboard ranking={game.ranking} me={game.me?.id}/>{isHost ? <button className="primary-button next-round" disabled={busy || !ready} onClick={() => command('next')}>{game.index + 1 === game.total ? 'Revelar o pódio' : 'Próxima pergunta'}<Icon/></button> : <p className="waiting-label" role="status">Aguarde o apresentador continuar.</p>}</> : <div className="score-rules"><h3>Cada acerto conta.</h3><p>500 pontos pelo acerto + até 500 pela rapidez.</p><p>Erro ou tempo esgotado: 0 pontos.</p><span>{game.answeredCount} de {game.players.length} já responderam</span></div>}
        </aside>
      </section>}

      {game?.phase === 'finished' && <section className="final-screen"><div className="podium-heading"><Trophy/><div className="eyebrow">A DISPUTA CHEGOU AO TOPO</div><h1 ref={headingRef} tabIndex="-1">O pódio é de vocês.</h1><p>{game.me ? `Você terminou em ${game.me.rank}º lugar, com ${formatScore(game.me.score)} pontos e ${game.me.correct} acertos.` : `${game.players.length} participantes. ${game.total} desafios. Conheça os destaques da competição.`}</p></div>
        <div className="podium" aria-label="Pódio dos três primeiros">{[1, 0, 2].map(index => { const p = game.ranking[index]; return p ? <div key={p.id} className={`podium-place place-${index + 1}`}><span className="podium-name">{p.name}</span><strong>{formatScore(p.score)} <small>pts</small></strong><div className="podium-block"><span>{index + 1}º</span>{index === 0 && <Trophy/>}</div></div> : <div key={index} className="podium-empty"/>; })}</div>
        <Leaderboard ranking={game.ranking} me={game.me?.id} final/>
        <div className="final-actions"><button className="primary-button" onClick={leave}>{isHost ? 'Voltar para criar outra sala' : 'Voltar ao início'}<Icon name="reset" size={18}/></button><p>Questões baseadas no material “Dominando o DFS”.</p></div>
      </section>}
    </main>
    <footer className="site-footer"><span>Busca em profundidade <span className="footer-divider">/</span> Competição ao vivo</span><span>Primeiro, vá mais fundo.</span></footer>
    <dialog ref={adminDialogRef} onCancel={() => setAdminOpen(false)} onClick={e => { if (e.target === adminDialogRef.current) setAdminOpen(false); }}><form className="dialog-content admin-form" onSubmit={loginAdmin}><button type="button" className="dialog-close text-button" aria-label="Fechar acesso de administrador" onClick={() => setAdminOpen(false)}><Icon name="close"/></button><div className="eyebrow">ACESSO RESTRITO</div><h2>Área do administrador</h2><p>Entre com a senha de administrador para criar e apresentar uma competição.</p><label htmlFor="admin-password">Senha de administrador</label><input id="admin-password" type="password" autoComplete="current-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required maxLength={256} autoFocus/>{adminError && <div className="admin-error" role="alert">{adminError}</div>}<button className="primary-button" disabled={busy || !adminPassword}>{busy ? 'Verificando…' : 'Entrar como administrador'}<Icon name="check" size={18}/></button><p className="admin-note">É participante? Feche esta janela e entre com o código da sala.</p></form></dialog>
    <dialog ref={dialogRef} onCancel={() => setHelp(false)} onClick={e => { if (e.target === dialogRef.current) setHelp(false); }}><div className="dialog-content"><button className="dialog-close text-button" aria-label="Fechar" onClick={() => setHelp(false)}><Icon name="close"/></button><div className="eyebrow">DA SALA AO PÓDIO</div><h2>Como jogar</h2><ol className="help-steps"><li>{onlineMode ? 'O apresentador cria uma sala e compartilha o endereço. Todos jogam pela internet.' : 'O apresentador cria uma sala e compartilha o endereço. Todos usam a mesma rede Wi-Fi.'}</li><li>Cada pessoa entra no próprio celular com o código e um nome diferente.</li><li>São 15 perguntas: 45 segundos nas comuns e 60 segundos nas que têm código.</li><li>Toque para enviar uma única resposta. Cada acerto vale de 500 a 1.000 pontos, conforme a rapidez.</li><li>A correção aparece quando todos respondem ou o tempo acaba. O apresentador avança e revela o pódio ao final.</li></ol><p>Se a conexão cair, a página tenta reconectar. Atualizar a tela mantém sua entrada nesta aba, mas não pausa o relógio.</p><button className="primary-button" onClick={() => setHelp(false)}>Vamos jogar <Icon name="check" size={18}/></button></div></dialog>
  </div>;
}
