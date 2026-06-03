# Roadmap — Finalizar Rotador de Números

Status base: backend completo (CRUD, redirect `/j/:code`, 3 algoritmos, matching no webhook). Tabelas já no `dev.db`. Faltam controles na UI + visibilidade + 1 ajuste de prod.

---

## Item 1 — Toggle Ativo/Inativo (Fácil · ~15 min)

**Problema:** campo `active` existe no schema e no PUT, mas UI não expõe. Impossível pausar rotador sem deletar.

**Backend:** já pronto (`rotators.ts:176` aceita `active` no PUT).

**Frontend (`src/pages/Rotators.tsx`):**
- Tabela: nova coluna "Status" com `Badge` (Ativo/Pausado) + clique p/ alternar.
- Adicionar handler:
  ```ts
  const toggleActive = async (r: Rotator) => {
    await putter(`/rotators/${r.id}`, { active: !r.active });
    load();
  };
  ```
- Dialog: opcional, switch "Ativo" no form.

**Aceite:** pausar rotador → `GET /j/:code` retorna 404 (já tratado em `rotatorRedirect.ts:23`).

---

## Item 2 — Pesos no modo PONDERADO (Médio · ~30 min)

**Problema:** UI só manda `priority`, nunca `weight`. Todo target fica `weight=1` → modo WEIGHTED se comporta igual round-robin.

**Backend:** já aceita `weight` (`buildTargets` em `rotators.ts:50`). Falta o front enviar.

**Frontend:**
- Estado: trocar `target_ids: string[]` por `targets: {connection_id, weight}[]` no `FormState` (ou map paralelo de pesos).
- Quando `distribution === 'WEIGHTED'`: ao lado de cada número marcado, `Input type=number` (min 1) p/ peso.
- `save()`: enviar `targets: form.targets.map((t,i) => ({connection_id: t.connection_id, weight: t.weight, priority: i}))`.
- `openEdit()`: hidratar pesos de `r.targets`.

**Aceite:** rotador WEIGHTED com pesos 3/1 → ~75% dos cliques no primeiro número (testar 20 hits em `/j/:code`).

---

## Item 3 — Ordem no modo FALLBACK (Médio · ~30 min)

**Problema:** FALLBACK usa `priority` (menor = primário, `rotatorService.ts:27`), mas UI não deixa ordenar. Ordem vira a de seleção dos checkboxes — imprevisível.

**Frontend:**
- Quando `distribution === 'FALLBACK'`: lista ordenável dos números marcados.
- MVP sem lib: botões ↑/↓ p/ reordenar o array `target_ids` (índice = priority).
- `save()` já manda `priority: i` — só garantir ordem do array reflete a UI.

**Aceite:** número topo da lista recebe 100% enquanto CONNECTED; cai pro próximo só se offline.

---

## Item 4 — Drill-down de Cliques (Médio · ~45 min)

**Problema:** rota `GET /api/rotators/:id/clicks` existe (`rotators.ts:78`) mas nenhuma tela consome. Coluna "Cliques" só mostra contagem — sem ver fbclid, IP, se casou com lead.

**Frontend:**
- Tornar contador de cliques clicável → abre `Dialog` ou `Sheet`.
- `fetcher('/rotators/${id}/clicks')` → tabela: data, número destino, token, fbclid/gclid, status (pending/matched), `matched_at`.
- `Badge` verde p/ `matched`, cinza p/ `pending`.
- Resolver `connection_id` → nome do número (já temos `numbers` carregado).

**Aceite:** ver lista de cliques de um rotador, distinguir os que viraram conversa dos pendentes.

---

## Item 5 — Métrica de Conversão (Opcional · ~30 min)

**Problema:** sem taxa de match (cliques que viraram lead). É o KPI real do rotador.

**Backend:** adicionar em `GET /rotators` um `_count` de clicks por status, ou campo derivado:
```ts
// match rate = matched / total clicks
```
**Frontend:** coluna "Taxa de match %" na tabela.

**Aceite:** dashboard mostra X% dos cliques viraram conversa por rotador.

---

## Item 6 — Deploy / Prod (Bloqueador de release)

- `dev.db` tem as tabelas, mas **prod precisa** `npx prisma db push` (ou criar migration formal: `prisma migrate dev --name rotators`).
- Confirmar `VITE_API_URL` aponta pro backend público em prod (redirect `/j/` precisa ser acessível pelo Meta/Google).
- `short_code` é público — OK, sem auth no `/j/`. Conferir rate-limit/abuso futuramente.

---

## Ordem sugerida de execução

1. **Item 1** (toggle ativo) — rápido, alto valor operacional
2. **Item 2** (pesos) — destrava modo WEIGHTED
3. **Item 4** (drill-down cliques) — visibilidade
4. **Item 3** (ordem fallback) — destrava modo FALLBACK
5. **Item 5** (taxa match) — métrica
6. **Item 6** (deploy) — antes do release

Itens 1–4 são só frontend em `Rotators.tsx` (backend pronto). Item 5 mexe no backend. Item 6 é operacional.
