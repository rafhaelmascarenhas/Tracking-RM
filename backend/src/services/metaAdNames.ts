import { prisma } from '../lib/prisma';

// Resolve ID de objeto do Meta Ads (campanha/conjunto/anúncio) pro nome legível.
//
// Contexto: quando a URL do anúncio é configurada com {{campaign.id}} em vez de
// {{campaign.name}}, o clique chega com número puro nas UTMs. Este módulo troca
// esse número pelo nome via Graph API e guarda em cache (tabela meta_ad_names),
// pra não bater na API a cada abertura de lead.

const GRAPH = 'https://graph.facebook.com/v19.0';
const BATCH_SIZE = 50; // limite prático do endpoint ?ids=

// UTM que é só dígitos = ID do Meta. Nome de campanha real quase nunca é numérico puro.
export function looksLikeMetaId(v: string | null | undefined): boolean {
  return !!v && /^\d{6,}$/.test(v.trim());
}

async function fetchNamesFromGraph(ids: string[], token: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const url = `${GRAPH}/?ids=${chunk.join(',')}&fields=name&access_token=${encodeURIComponent(token)}`;
    try {
      const res = await fetch(url);
      const json: any = await res.json();
      if (!res.ok) {
        console.warn('[metaAdNames] Graph falhou:', JSON.stringify(json?.error ?? json).slice(0, 300));
        continue;
      }
      // Resposta: { "<id>": { name, id }, ... }. IDs sem permissão vêm ausentes.
      for (const [id, obj] of Object.entries(json as Record<string, any>)) {
        if (obj && typeof obj.name === 'string') out.set(id, obj.name);
      }
    } catch (e: any) {
      console.warn('[metaAdNames] erro de rede:', e.message);
    }
  }
  return out;
}

/**
 * Recebe IDs do Meta e devolve o mapa id → nome.
 * Consulta o cache primeiro; só vai na Graph API pelos que faltam.
 * IDs não resolvidos ficam de fora do mapa (chamador faz fallback pro próprio ID).
 */
export async function resolveMetaAdNames(
  workspaceId: string,
  rawIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(rawIds.filter(looksLikeMetaId).map((v) => v!.trim()))];
  if (ids.length === 0) return new Map();

  const cached = await prisma.metaAdName.findMany({ where: { meta_id: { in: ids } } });
  const result = new Map(cached.map((c) => [c.meta_id, c.name]));

  const missing = ids.filter((id) => !result.has(id));
  if (missing.length === 0) return result;

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { meta_ads_token: true, meta_capi_token: true },
  });
  // Sem token com ads_read não dá pra resolver — devolve só o que já estava em cache.
  const token = ws?.meta_ads_token || ws?.meta_capi_token;
  if (!token) return result;

  const fetched = await fetchNamesFromGraph(missing, token);
  // upsert 1 a 1: SQLite não suporta skipDuplicates no createMany, e o volume
  // aqui é baixo (só os IDs ainda não cacheados).
  for (const [meta_id, name] of fetched) {
    await prisma.metaAdName.upsert({
      where: { meta_id },
      update: { name, fetched_at: new Date() },
      create: { meta_id, name },
    });
    result.set(meta_id, name);
  }
  return result;
}
