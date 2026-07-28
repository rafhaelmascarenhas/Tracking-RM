# Atribuição de entrada em grupo do rotador

Status: **fase 1 implementada, fase 2 a decidir**
Data: 2026-07-28

## Problema

O rotador de grupo entrega um link `chat.whatsapp.com/XXX`. A partir do clique o
WhatsApp assume e nenhum callback volta. Consequência: sabemos quantos cliques
vieram de cada anúncio (`GroupClick.fbclid` + UTMs), mas não sabemos quantas
pessoas realmente entraram no grupo, nem quais delas vieram de anúncio.

O clique tem `fbclid` e **não tem telefone**.
A entrada tem telefone e **não tem `fbclid`**.
Não existe chave comum — é esse o buraco.

## Fase 1 — contagem de entradas (implementada)

Captura o evento `group-participants.update` do provider e conta quem entrou e
quem saiu, por grupo.

Peças:

- `GroupMember` (schema) — `group_jid` + `phone_number` únicos, `joined_at`,
  `left_at`. Reentrada limpa o `left_at` em vez de duplicar linha.
- `GroupTarget.group_jid` — liga o evento ao target do rotador. Resolvido pelo
  código do convite via `GET /group/inviteInfo` (Evolution).
- `evolution.setWebhook` — passa a assinar `GROUP_PARTICIPANTS_UPDATE`.
- `POST /numbers/:id/resync-webhook` — reassina instâncias antigas.
- `POST /group-rotators/:id/resolve-jids` — preenche `group_jid` dos targets.
- `GET /group-rotators/:id/members` — `members` (dentro agora), `joined_total`
  (histórico), `clicks`, `unattributed_joins`.

Pré-requisitos operacionais (sem eles a contagem fica em **zero, sem erro**):

1. O número conectado precisa ser **admin do grupo**.
2. O provider precisa ser **Evolution** — a uazapi não expõe `inviteInfo`.
3. Rodar `resolve-jids` uma vez por rotador, depois de cadastrar os grupos.

O que a fase 1 **não** entrega: qual anúncio trouxe cada pessoa. Entradas sem
`group_jid` resolvido caem em `unattributed_joins`.

## Fase 2 — atribuição determinística (a decidir)

Três caminhos. Não são combináveis sem redundância; escolher um.

### A. Um grupo por criativo

Cada anúncio aponta pra um `GroupTarget` dedicado. O `target_id` da entrada já
identifica a origem — atribuição 100%, zero matching.

- Ganha: exatidão total, nenhuma janela de tempo, nada probabilístico.
- Perde: explosão operacional. N criativos = N grupos pra criar, moderar e
  esvaziar. Grupo lota em 1024; com 6 criativos são 6 grupos girando em paralelo.
- Custa: quase nada de código — o rotador já suporta múltiplos targets.

### B. Pit-stop no número antes do grupo

O link do anúncio manda pro WhatsApp 1:1 com texto pré-preenchido (mesmo fluxo
do rotador de número, que já casa `fbclid` por token). O bot responde com o link
do grupo. Aí o telefone e o `fbclid` estão na mesma linha.

- Ganha: atribuição determinística por pessoa, com telefone real. Desbloqueia
  Lead/CAPI com `phone` hasheado, o que a fase 1 não permite.
- Perde: uma fricção a mais no funil — parte das pessoas para no 1:1 e não entra
  no grupo. Precisa medir a queda.
- Custa: fluxo novo (auto-resposta com link), reaproveitando `matchRotatorClick`.

### C. Matching probabilístico por janela

Casa o clique com a entrada pela proximidade de tempo no mesmo target.

- Ganha: nenhuma mudança no funil, nenhuma fricção.
- Perde: com vários cliques simultâneos no mesmo grupo vira chute. Degrada
  exatamente quando o volume sobe, que é quando o dado importa.
- Custa: pouco código, muita desconfiança no número.

### Recomendação

**B** se o objetivo for alimentar o Meta com conversão por pessoa (é o único que
entrega telefone). **A** se o objetivo for só saber qual criativo enche mais
grupo e o número de criativos for pequeno. **C** não — mede pior justamente
sob volume.

## Aberto

- Medir a queda do funil em B antes de adotar (teste A/B contra o link direto).
- Backfill: entradas anteriores ao `resolve-jids` ficam órfãs pra sempre? Ou
  vale um `fetchAllGroups` pra reatar por JID?
- uazapi: existe evento equivalente? Hoje a feature é Evolution-only.
