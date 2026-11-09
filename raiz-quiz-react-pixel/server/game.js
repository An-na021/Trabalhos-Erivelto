import { randomInt, randomBytes } from 'node:crypto';
import { questions } from '../src/questions.js';

const token = () => randomBytes(24).toString('hex');
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function requireThat(condition, message, status) {
  if (!condition) throw new GameError(message, status);
}
export function answerPoints(correct, elapsed, duration) {
  return correct ? Math.round(500 + 500 * Math.max(0, 1 - elapsed / duration)) : 0;
}

export class GameManager {
  constructor({ now = Date.now, schedule = setTimeout, cancel = clearTimeout, bank = questions } = {}) {
    this.now = now; this.schedule = schedule; this.cancel = cancel; this.bank = bank;
    this.rooms = new Map(); this.listeners = new Map();
  }
  create() {
    this.prune();
    requireThat(this.rooms.size < 100, 'Há muitas salas abertas. Tente novamente mais tarde.', 503);
    let code;
    do { code = String(randomInt(100000, 1000000)); } while (this.rooms.has(code));
    const room = { code, hostToken: token(), phase: 'lobby', index: -1, players: [], submissions: new Map(), revision: 0, createdAt: this.now(), updatedAt: this.now(), timer: null };
    this.rooms.set(code, room);
    return { code, token: room.hostToken, role: 'host' };
  }
  prune() {
    for (const [code, room] of this.rooms) {
      if (this.now() - room.updatedAt > 12 * 60 * 60 * 1000) {
        this.cancel(room.timer); this.rooms.delete(code); this.listeners.delete(code);
      }
    }
  }
  room(code) {
    const room = this.rooms.get(code);
    requireThat(room, 'Sala não encontrada. Confira o código ou peça uma nova sala ao apresentador.', 404);
    return room;
  }
  identity(room, credential) {
    if (credential === room.hostToken) return { role: 'host' };
    const player = room.players.find(p => p.token === credential);
    requireThat(player, 'Sua entrada não é válida. Entre na sala novamente.', 401);
    return { role: 'player', player };
  }
  join(code, rawName) {
    const room = this.room(code);
    requireThat(room.phase === 'lobby', 'Esta partida já começou. Aguarde a próxima sala.', 409);
    const name = typeof rawName === 'string' ? rawName.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
    requireThat(name.length >= 2 && name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(name), 'Use um nome entre 2 e 24 caracteres.');
    requireThat(!room.players.some(p => p.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')), 'Esse nome já está na sala. Acrescente seu sobrenome.', 409);
    requireThat(room.players.length < 100, 'A sala atingiu o limite de 100 participantes.', 409);
    const player = { id: token().slice(0, 12), token: token(), name, score: 0, correct: 0, correctTime: 0, order: room.players.length };
    room.players.push(player); this.publish(room);
    return { code, token: player.token, role: 'player' };
  }
  subscribe(code, credential, listener) {
    const room = this.room(code); this.identity(room, credential);
    const set = this.listeners.get(code) || new Set();
    const item = { credential, listener }; set.add(item); this.listeners.set(code, set);
    listener(this.snapshot(code, credential));
    return () => { set.delete(item); if (!set.size) this.listeners.delete(code); };
  }
  publish(room) {
    room.revision++;
    room.updatedAt = this.now();
    for (const { credential, listener } of this.listeners.get(room.code) || []) {
      listener(this.snapshot(room.code, credential));
    }
  }
  ranking(room) {
    return [...room.players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.correctTime - b.correctTime || a.order - b.order)
      .map((p, i) => ({ id: p.id, name: p.name, score: p.score, correct: p.correct, rank: i + 1 }));
  }
  snapshot(code, credential) {
    const room = this.room(code);
    const { role, player } = this.identity(room, credential);
    const q = this.bank[room.index];
    const revealed = ['reveal', 'finished'].includes(room.phase);
    const submitted = player ? room.submissions.get(player.id) : null;
    const ranking = this.ranking(room);
    return {
      code, role, phase: room.phase, index: room.index, total: this.bank.length, revision: room.revision, serverNow: this.now(),
      duration: room.duration || 0, deadline: room.deadline || 0,
      players: room.players.map(p => ({ id: p.id, name: p.name })), answeredCount: room.submissions.size,
      ranking: room.phase === 'question' ? [] : ranking,
      me: player ? { ...ranking.find(p => p.id === player.id),
        score: player.score - (room.phase === 'question' ? submitted?.points || 0 : 0),
        correct: player.correct - (room.phase === 'question' && submitted?.points > 0 ? 1 : 0),
        rank: room.phase === 'question' ? null : ranking.find(p => p.id === player.id).rank,
        answered: Boolean(submitted), choice: submitted?.choice ?? null, points: revealed ? submitted?.points || 0 : null } : null,
      question: q && room.phase !== 'finished' ? {
        id: q.id, title: q.title, prompt: q.prompt, options: q.options, tree: q.tree,
        code: q.code, codeLanguage: q.codeLanguage, topic: q.topic,
        ...(revealed ? { correct: q.correct, explanation: q.explanation } : {}),
      } : null,
      distribution: revealed && q ? q.options.map((_, i) => [...room.submissions.values()].filter(s => s.choice === i).length) : [],
    };
  }
  command(code, credential, action) {
    const room = this.room(code);
    requireThat(this.identity(room, credential).role === 'host', 'Somente o apresentador pode controlar a partida.', 403);
    if (action === 'start') {
      requireThat(room.phase === 'lobby', 'A partida já começou.', 409);
      requireThat(room.players.length > 0, 'Aguarde pelo menos um participante entrar.');
      this.openQuestion(room, 0);
    } else if (action === 'next') {
      requireThat(room.phase === 'reveal', 'Espere a correção desta pergunta.', 409);
      if (room.index + 1 === this.bank.length) { room.phase = 'finished'; this.publish(room); }
      else this.openQuestion(room, room.index + 1);
    } else throw new GameError('Comando desconhecido.');
    return this.snapshot(code, credential);
  }
  openQuestion(room, index) {
    this.cancel(room.timer);
    room.phase = 'question'; room.index = index; room.submissions = new Map();
    room.duration = (this.bank[index].code ? 60 : 45) * 1000;
    room.startedAt = this.now(); room.deadline = room.startedAt + room.duration;
    room.timer = this.schedule(() => this.reveal(room), room.duration);
    room.timer?.unref?.(); this.publish(room);
  }
  reveal(room) {
    if (room.phase !== 'question') return;
    this.cancel(room.timer); room.timer = null; room.phase = 'reveal'; this.publish(room);
  }
  answer(code, credential, questionId, choice) {
    const room = this.room(code);
    const { player } = this.identity(room, credential);
    requireThat(player, 'O apresentador não participa das respostas.', 403);
    if (room.phase === 'question' && this.now() >= room.deadline) this.reveal(room);
    requireThat(room.phase === 'question', 'O tempo desta pergunta terminou.', 409);
    const q = this.bank[room.index];
    requireThat(q.id === questionId, 'Esta pergunta já mudou. Aguarde a atualização.', 409);
    requireThat(Number.isInteger(choice) && choice >= 0 && choice < q.options.length, 'Escolha uma alternativa válida.');
    requireThat(!room.submissions.has(player.id), 'Sua resposta já foi registrada.', 409);
    const elapsed = Math.max(0, this.now() - room.startedAt);
    const correct = choice === q.correct;
    const points = answerPoints(correct, elapsed, room.duration);
    room.submissions.set(player.id, { choice, elapsed, points });
    player.score += points;
    if (correct) { player.correct++; player.correctTime += elapsed; }
    if (room.submissions.size === room.players.length) this.reveal(room);
    else this.publish(room);
    return this.snapshot(code, credential);
  }
  dispose() { for (const r of this.rooms.values()) this.cancel(r.timer); this.rooms.clear(); this.listeners.clear(); }
}
