import { EvolutionConfig, EvolutionGroup, fetchAllGroups } from './evolution';

/**
 * Busca da lista de grupos em segundo plano.
 *
 * `fetchAllGroups` varre o store do Baileys. Numa conta pequena responde em
 * ~17s; numa grande (3 mil contatos, 120 mil mensagens) passa de 90s e o
 * usuário só via um 504. Manter isso numa requisição síncrona significa
 * escolher entre estourar o timeout ou pendurar o navegador.
 *
 * Aqui a requisição responde na hora com "buscando" e a tela pergunta de novo
 * até ficar pronto. Assim uma busca de 3 minutos é só uma espera visível, e não
 * um erro.
 */

export type GroupJob =
  | { state: 'loading'; startedAt: number }
  | { state: 'ready'; startedAt: number; finishedAt: number; groups: EvolutionGroup[] }
  | { state: 'error'; startedAt: number; finishedAt: number; error: string };

const jobs = new Map<string, GroupJob>();

// Resultado vale por 10 min: montar um rotador leva várias aberturas do
// seletor, e refazer a busca a cada uma castigaria a Evolution de graça.
const READY_TTL_MS = 10 * 60_000;

// Trava de segurança: job que nunca terminou (processo reiniciado no meio, por
// exemplo) não pode bloquear tentativas novas pra sempre.
const LOADING_MAX_MS = 6 * 60_000;

const ERROR_TTL_MS = 2 * 60_000;

export function getGroupJob(instance: string): GroupJob | null {
  const job = jobs.get(instance);
  if (!job) return null;

  if (job.state === 'ready' && Date.now() - job.finishedAt > READY_TTL_MS) {
    jobs.delete(instance);
    return null;
  }
  if (job.state === 'loading' && Date.now() - job.startedAt > LOADING_MAX_MS) {
    jobs.delete(instance);
    return null;
  }
  // Erro também expira, senão uma falha passageira bloquearia o enriquecimento
  // até o processo reiniciar.
  if (job.state === 'error' && Date.now() - job.finishedAt > ERROR_TTL_MS) {
    jobs.delete(instance);
    return null;
  }
  return job;
}

/**
 * Começa a busca se não houver uma em andamento. Retorna o estado atual.
 * Chamar de novo enquanto carrega não dispara segunda busca — chamadas
 * simultâneas na mesma instância parecem travar a Evolution.
 */
export function startGroupJob(
  cfg: EvolutionConfig,
  instance: string,
  ownerPhone: string | null
): GroupJob {
  const existing = getGroupJob(instance);
  if (existing && existing.state === 'loading') return existing;

  const startedAt = Date.now();
  const job: GroupJob = { state: 'loading', startedAt };
  jobs.set(instance, job);

  // Timeout generoso: aqui ninguém está esperando na linha.
  fetchAllGroups(cfg, instance, ownerPhone, { force: true, timeoutMs: 5 * 60_000 })
    .then((groups) => {
      jobs.set(instance, { state: 'ready', startedAt, finishedAt: Date.now(), groups });
      console.log(`[grupos] ${instance}: ${groups.length} grupos em ${Date.now() - startedAt}ms`);
    })
    .catch((e) => {
      jobs.set(instance, {
        state: 'error',
        startedAt,
        finishedAt: Date.now(),
        error: e?.message || 'Falha ao listar grupos',
      });
      console.warn(`[grupos] ${instance} falhou em ${Date.now() - startedAt}ms: ${e?.message}`);
    });

  return job;
}

export function clearGroupJob(instance: string) {
  jobs.delete(instance);
}
