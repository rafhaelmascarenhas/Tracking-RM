# Feature: Rotador de Números (Link Rotativo Rastreável)

> Instruções de implementação **adaptadas ao código real** deste projeto (Express + TypeScript + Prisma/SQLite + Vite/React 19). Feature aditiva: não quebra nada existente. Reaproveita o matching de `TrackableMessage` que já existe.

---

## 0. Contexto do código atual (ler antes)

Mapeamento do que já existe e como a feature encaixa:

| Peça existente | Arquivo | Papel |
|---|---|---|
| Encurtador de destino único | `backend/src/routes/trackableLinks.ts` + `redirect.ts` | `GET /r/:short_code` → 302 pra UMA `destination_url`. **Não rotaciona.** |
| Mensagem rastreável | `backend/src/routes/trackableMessages.ts` + `prisma TrackableMessage` | `base_text` + UTMs. **É o "token na mensagem".** |
| Matching de atribuição | `backend/src/services/messageMatcher.ts` + `webhook.ts` | Webhook casa texto da 1ª mensagem com `base_text` → grava UTMs no `Lead`. **Já funciona.** |
| Conexões WhatsApp | `prisma WhatsappConnection` | `status` CONNECTED/DISCONNECTED, `phone_number`, `session_name`. |
| Meta CAPI | `backend/src/services/metaCapi.ts` | Hoje envia só `phone` + UTMs, `action_source: system_generated`. Sem `fbclid`. |

**Decisão central:** o rotador é uma evolução do `TrackableLink` que (a) aponta pra **N números** em vez de 1 URL, (b) escolhe 1 número por clique, (c) redireciona pro `wa.me` daquele número com a **mensagem pré-preenchida**. A atribuição de campanha **reaproveita** o matching de `TrackableMessage` já existente — zero mudança no webhook na Fase 1.

**Implementar em 2 fases.** Fase 1 entrega a distribuição funcional reusando tudo que existe. Fase 2 adiciona `fbclid` → CAPI enriquecida (opcional, faz quando quiser fechar loop Meta com qualidade).

---

# FASE 1 — Rotador funcional (distribuição + atribuição via TrackableMessage)

## 1.1 Banco (Prisma) — `backend/prisma/schema.prisma`

Adicionar 3 models e as back-relations. Manter padrão `@@map` snake_case do projeto.

```prisma
model Rotator {
  id             String   @id @default(uuid())
  workspace_id   String
  short_code     String   @unique
  name           String
  distribution   String   @default("ROUND_ROBIN") // ROUND_ROBIN | WEIGHTED | FALLBACK
  prefilled_text String                            // mensagem pré-preenchida; vira base_text da TrackableMessage
  utm_source     String?
  utm_medium     String?
  utm_campaign   String?
  utm_term       String?
  utm_content    String?
  rr_counter     Int      @default(0)              // estado do round-robin
  active         Boolean  @default(true)
  created_at     DateTime @default(now())

  workspace Workspace       @relation(fields: [workspace_id], references: [id], onDelete: Cascade)
  targets   RotatorTarget[]
  clicks    RotatorClick[]

  @@map("rotators")
}

model RotatorTarget {
  id            String  @id @default(uuid())
  rotator_id    String
  connection_id String
  weight        Int     @default(1)   // usado em WEIGHTED
  priority      Int     @default(0)   // usado em FALLBACK (menor = primeiro)
  active        Boolean @default(true)

  rotator    Rotator            @relation(fields: [rotator_id], references: [id], onDelete: Cascade)
  connection WhatsappConnection @relation(fields: [connection_id], references: [id], onDelete: Cascade)

  @@unique([rotator_id, connection_id])
  @@map("rotator_targets")
}

model RotatorClick {
  id            String   @id @default(uuid())
  rotator_id    String
  connection_id String   // número sorteado
  fbclid        String?  // usado na Fase 2
  gclid         String?
  ip_address    String?
  user_agent    String?
  created_at    DateTime @default(now())

  rotator Rotator @relation(fields: [rotator_id], references: [id], onDelete: Cascade)

  @@map("rotator_clicks")
}
```

Adicionar back-relations nos models existentes:
- Em `Workspace`: `rotators Rotator[]`
- Em `WhatsappConnection`: `rotatorTargets RotatorTarget[]`

Migração:
```bash
cd backend
npx prisma migrate dev --name add_rotator
npx prisma generate
```

## 1.2 Serviço de distribuição — `backend/src/services/rotatorService.ts` (novo)

Função pura que escolhe o número. **Regra de ouro: só sorteia número CONNECTED.** Se nenhum conectado, cai pro primeiro ativo mesmo offline (nunca derruba o lead) e loga warning.

```ts
import { prisma } from '../lib/prisma';

export async function pickTarget(rotatorId: string) {
  const rotator = await prisma.rotator.findUnique({
    where: { id: rotatorId },
    include: { targets: { include: { connection: true } } },
  });
  if (!rotator) return null;

  const actives = rotator.targets.filter((t) => t.active);
  let pool = actives.filter((t) => t.connection.status === 'CONNECTED');
  if (pool.length === 0) {
    console.warn(`[rotator ${rotatorId}] nenhum número CONNECTED, usando fallback offline`);
    pool = actives;
  }
  if (pool.length === 0) return null;

  if (rotator.distribution === 'FALLBACK') {
    return pool.sort((a, b) => a.priority - b.priority)[0];
  }

  if (rotator.distribution === 'WEIGHTED') {
    const total = pool.reduce((s, t) => s + Math.max(1, t.weight), 0);
    let n = Math.random() * total;
    for (const t of pool) {
      n -= Math.max(1, t.weight);
      if (n <= 0) return t;
    }
    return pool[0];
  }

  // ROUND_ROBIN — contador atômico no Postgres/SQLite
  const updated = await prisma.rotator.update({
    where: { id: rotatorId },
    data: { rr_counter: { increment: 1 } },
    select: { rr_counter: true },
  });
  return pool[(updated.rr_counter - 1) % pool.length];
}
```

## 1.3 Redirect público — `backend/src/routes/rotatorRedirect.ts` (novo)

⚠️ **Não montar em `/r`** — a rota `GET /r/:short_code` já é catch-all do `redirectRouter` e capturaria tudo. Usar prefixo novo `/j` (join WhatsApp).

```ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { pickTarget } from '../services/rotatorService';

export const rotatorRedirectRouter = Router();

// GET /j/:short_code  → destino do anúncio
rotatorRedirectRouter.get('/:short_code', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findUnique({
    where: { short_code: req.params.short_code },
  });
  if (!rotator || !rotator.active) return res.status(404).send('Rotator not found');

  const target = await pickTarget(rotator.id);
  if (!target) return res.status(503).send('No number available');

  // log do clique (atribuição fina vem na Fase 2)
  await prisma.rotatorClick.create({
    data: {
      rotator_id: rotator.id,
      connection_id: target.connection_id,
      fbclid: (req.query.fbclid as string) || null,
      gclid: (req.query.gclid as string) || null,
      ip_address: (req.headers['x-forwarded-for'] as string) || req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    },
  });

  const phone = (target.connection.phone_number || '').replace(/\D/g, '');
  if (!phone) return res.status(503).send('Number has no phone');

  // mensagem pré-preenchida = prefilled_text (casado depois via TrackableMessage)
  const text = encodeURIComponent(rotator.prefilled_text);
  return res.redirect(302, `https://wa.me/${phone}?text=${text}`);
});
```

Montar em `backend/src/index.ts` junto das rotas públicas:
```ts
import { rotatorRedirectRouter } from './routes/rotatorRedirect';
app.use('/j', rotatorRedirectRouter); // public, antes do authMiddleware
```

> `target.connection` precisa estar incluído — em `pickTarget` o `include` já traz `connection`. Garanta retornar o objeto com `connection` (ajuste o tipo de retorno).

## 1.4 Atribuição automática (sem mexer no webhook)

O webhook já casa a 1ª mensagem com `TrackableMessage.base_text` e grava UTMs no lead. Para o rotador herdar isso de graça: **ao criar/editar um rotador, garantir uma `TrackableMessage` com `base_text = prefilled_text` e as mesmas UTMs.**

Implementar no router de CRUD (próx. seção) um helper `syncTrackableMessage(rotator)` que faz upsert da TrackableMessage correspondente. Assim, quando o lead manda a mensagem pré-preenchida, o matching existente atribui a campanha. **Zero alteração em `webhook.ts` / `messageMatcher.ts` na Fase 1.**

> Cuidado: `messageMatcher` casa por `includes` (substring, lowercase). `prefilled_text` deve ser único o bastante por campanha pra não colidir com outra TrackableMessage. Validar no create (avisar se já existe base_text muito parecido).

## 1.5 CRUD — `backend/src/routes/rotators.ts` (novo, espelha `trackableLinks.ts`)

Rotas protegidas, escopadas por `req.workspaceId`:

```
GET    /api/rotators            → lista + contagem de cliques e targets
POST   /api/rotators            → cria { name, distribution, prefilled_text, utm_*, target_connection_ids[], weights?, priorities? }
GET    /api/rotators/:id        → detalhe + targets + métricas
PUT    /api/rotators/:id        → atualiza config + targets
DELETE /api/rotators/:id        → soft delete (active=false)
GET    /api/rotators/:id/clicks → log de cliques (paginado)
```

Seguir exatamente o padrão de `trackableLinks.ts`:
- `short_code = crypto.randomBytes(4).toString('hex')` no create.
- Sempre filtrar `where: { workspace_id: req.workspaceId! }`.
- No create/update: gravar `targets` (deletar e recriar `RotatorTarget` do rotador) + chamar `syncTrackableMessage`.
- Validar que cada `connection_id` pertence ao mesmo workspace.

Montar em `index.ts`:
```ts
import { rotatorsRouter } from './routes/rotators';
app.use('/api/rotators', rotatorsRouter); // depois do authMiddleware
```

## 1.6 Frontend — `src/pages/Rotators.tsx` (novo, espelha `TrackableLinks.tsx`)

Stack: React 19 + react-router-dom v7 + SWR + `src/lib/fetcher.ts` + shadcn. **Copiar a estrutura de `TrackableLinks.tsx`** e adaptar.

Lista (`Table`):
- Colunas: Nome, URL pública (`{API_URL}/j/{short_code}` + botão copiar), Nº de números, Distribuição (`Badge`), Cliques, Conversas geradas, Taxa de conversão.
- Botão "Criar rotador" → `Dialog`:
  - `Input` nome
  - **multi-select de números**: lista `WhatsappConnection` (SWR em `/api/numbers`), `Checkbox` por número (mostrar status com `Badge` verde/vermelho)
  - `RadioGroup` distribuição: Round-robin / Ponderado / Fallback
  - se Ponderado: `Input` peso por número; se Fallback: ordem/prioridade
  - `Textarea`/`Input` mensagem pré-preenchida (preview + aviso: "essa frase é usada pra rastrear a campanha, mantenha única")
  - campos UTM (source/medium/campaign) — opcionais
- Linha → `/rotators/:id` (detalhe) com métricas, distribuição real por número (`recharts` barras), editar, log de cliques.

Registrar:
- Rota em `src/App.tsx`: `<Route path="/rotators" element={<Rotators/>} />` (+ detalhe se fizer página separada).
- Item no menu em `src/components/Layout.tsx` (ícone `lucide-react`, ex: `Shuffle` ou `Split`).

Ajuste opcional em `src/pages/Conversations.tsx`: no drawer, mostrar rotador de origem + número que atendeu.

## 1.7 Critério de pronto da Fase 1

1. Criar rotador com 3 números no `/rotators`.
2. Copiar URL `/j/{code}`, abrir → redireciona pro `wa.me` de um dos 3, alternando (round-robin).
3. Mandar a mensagem pré-preenchida → lead criado com UTMs da campanha (via TrackableMessage).
4. Número offline (DISCONNECTED) é pulado na distribuição.
5. `rotator_clicks` registra cada clique.

---

# FASE 2 — Atribuição fina Meta (fbclid → CAPI) [opcional]

Fecha o loop de atribuição no Meta com qualidade, já que o caminho Tráfego→URL **não** gera `ctwa_clid`.

## 2.1 Token por clique (amarra clique ↔ conversa)

- No `rotatorRedirect`: gerar token curto único por clique (`crypto.randomBytes(3).toString('hex')`), salvar em `RotatorClick.token` (adicionar coluna), e anexar ao texto: `prefilled_text + " [" + token + "]"`.
- No `webhook.ts`: extrair token via regex `\[([a-f0-9]{6})\]`; achar `RotatorClick` por token; ligar ao lead (gravar `fbclid` no lead — adicionar coluna `fbclid String?` em `Lead`). Fallback: clique pendente mais recente na mesma `connection` dentro de janela (ex: 6h).

## 2.2 CAPI enriquecida — `backend/src/services/metaCapi.ts`

Estender `MetaCapiPayload` e o body:
- Aceitar `fbclid`, `clientIp`, `userAgent`, `eventTimeMs`.
- Montar `fbc = 'fb.1.' + clickTimeMs + '.' + fbclid`.
- `user_data`: adicionar `fbc`, `client_ip_address`, `client_user_agent`.
- Trocar `action_source` de `'system_generated'` para `'website'` (origem foi clique em URL).
- `event_id`: usar `lead.id`+evento pra **dedupe** (importante se o site também dispara o mesmo evento — não misturar; ver regra abaixo).

## 2.3 Disparo

Quando o lead atinge a `JourneyStage` com `ConversionEvent` (lógica já existente em `conversionEvents.ts`/`journeyStages.ts`), passar o `fbclid` salvo + ip/ua pro `fireMetaCapi`.

**Regra de eventos limpos:** evento de WhatsApp deve ter nome/significado distinto do evento do site. Não misturar dois tipos de lead no mesmo `event_name` (suja a otimização). Se usar o mesmo nome, garantir `event_id` distinto pra dedupe.

---

## 3. Por que isso resolve o problema original

- 3 vendedores hoje = 3 campanhas/conjuntos → orçamento picado, Meta nunca sai do aprendizado, auction overlap.
- Com o rotador: **1 campanha / 1 conjunto / 1 evento**, anúncio aponta pra `/j/{code}`, distribuição justa entre os 3 números fora da campanha.
- Atribuição preservada via matching de `TrackableMessage` (Fase 1) e `fbclid`→CAPI (Fase 2).

## 4. Ordem de execução

1. `schema.prisma` (3 models + relations) → `prisma migrate dev`.
2. `rotatorService.ts` (`pickTarget`).
3. `rotatorRedirect.ts` + montar `/j` em `index.ts`.
4. `rotators.ts` CRUD + `syncTrackableMessage` + montar `/api/rotators`.
5. `Rotators.tsx` + rota em `App.tsx` + menu em `Layout.tsx`.
6. Testar critério de pronto (1.7).
7. (Opcional) Fase 2: token + `fbclid` + CAPI enriquecida.

## 5. Decisões em aberto (confirmar antes/durante)

- **Domínio do `/j`**: hoje backend na porta 3001. Pra anúncio, expor com domínio curto/HTTPS (ex: proxy/Nginx). Definir URL pública base.
- **Fase 2 agora ou depois?** Fase 1 já distribui e atribui via UTM. Fase 2 só pra qualidade de CAPI Meta.
- **`prefilled_text` único por campanha** — necessário pro matching não colidir.
