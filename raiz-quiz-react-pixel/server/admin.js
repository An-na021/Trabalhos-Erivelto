import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GameError } from './game.js';

const digest = value => createHash('sha256').update(value).digest();
export class AdminAuth {
  constructor({ password = '', now = Date.now, sessionDuration = 8 * 60 * 60 * 1000 } = {}) {
    this.passwordHash = password.length >= 12 && password.length <= 256 ? digest(password) : null;
    this.now = now; this.sessionDuration = sessionDuration;
    this.sessions = new Map(); this.attempts = new Map();
  }
  configured() {
    if (!this.passwordHash) throw new GameError('O acesso de administrador ainda não foi configurado pelo responsável pelo site.', 503);
  }
  prune() {
    for (const [key, expires] of this.sessions) if (expires <= this.now()) this.sessions.delete(key);
    for (const [key, attempt] of this.attempts) if (attempt.until <= this.now()) this.attempts.delete(key);
  }
  login(password, source) {
    this.configured(); this.prune();
    const attempt = this.attempts.get(source);
    if (attempt?.count >= 10) throw new GameError('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.', 429);
    const candidate = typeof password === 'string' && password.length <= 256 ? password : '';
    if (!timingSafeEqual(digest(candidate), this.passwordHash)) {
      // Bound memory even when many different connections submit bad passwords.
      if (this.attempts.size >= 1000 && !attempt) throw new GameError('Muitas tentativas. Tente novamente mais tarde.', 429);
      this.attempts.set(source, { count: (attempt?.count || 0) + 1, until: attempt?.until || this.now() + 15 * 60 * 1000 });
      throw new GameError('Senha de administrador incorreta.', 401);
    }
    this.attempts.delete(source);
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.sessionDuration;
    this.sessions.set(token, expiresAt);
    return { token, expiresAt };
  }
  authorize(token) {
    this.configured(); this.prune();
    if (!this.sessions.has(token)) throw new GameError('Entre como administrador para gerenciar salas. Sua sessão pode ter expirado.', 401);
  }
  logout(token) { this.sessions.delete(token); }
}
