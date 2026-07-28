# Filtros, vendedor e atribuição de venda

Status: **planejado, nada implementado**
Data: 2026-07-28

Decisões já tomadas:

- **Vendedor = número.** Não vamos criar entidade `Seller`. O filtro lista
  `WhatsappConnection` por `profile_name`/`phone_number`. Se um vendedor usar dois
  números, aparecem separados — aceito por ora.
- **Atribuição = último que atendeu.** O lead passa a mudar de dono quando outro
  número recebe mensagem dele.

## O bug que originou tudo

Pedido de 28/07/2026 14:12, Gustavo Souza (553492579140), Purchase BRL 398,00:
apareceu no número errado. O lead tinha chegado meses antes por outro número,
voltou hoje, falou com outro vendedor, e esse vendedor fechou a venda.

Causa exata, em `backend/src/routes/webhook.ts` (upsert do lead):

```ts
update: contactName ? { name: contactName } : {},
create: { ..., whatsapp_connection_id: connection.id },
```

`whatsapp_connection_id` é gravado **só na criação e nunca mais atualizado**. O
lead fica colado no primeiro número para sempre. E `PixelFire` não tem coluna
de conexão nenhuma, então a aba de disparos não tem como mostrar quem vendeu.

## Ordem de implementação

A ordem é por dependência, não por tamanho. Os itens 1 e 2 mexem em dados e
precisam de deploy com `db push`; os demais são só front.

### 1. `PixelFire.whatsapp_connection_id` + coluna na aba de disparos

Grava qual número estava ativo no momento do disparo. É histórico imutável:
venda antiga não muda de dono quando o lead for reatribuído depois.

- schema: coluna nullable + relação com `WhatsappConnection`
- preencher no ponto onde o `PixelFire` é criado (`metaCapi`/`triggerService`),
  a partir do `lead.whatsapp_connection_id` vigente
- front `PixelFires.tsx`: coluna "Número"
- **backfill**: disparos antigos ficam com a coluna nula. Dá pra preencher com o
  `whatsapp_connection_id` atual do lead, mas isso é um chute retroativo — mostra
  o dono de hoje, não o de quando a venda aconteceu. Preferível deixar "—" e
  documentar o corte.

Precisa de `db push` no deploy.

### 2. Reatribuição do lead para o último que atendeu

No mesmo upsert do webhook, passar a atualizar `whatsapp_connection_id` quando a
mensagem chegar por outro número.

Cuidado que isso exige: o item 1 tem que estar **em produção antes**, senão a
reatribuição reescreve o dono dos leads sem que exista o registro histórico no
`PixelFire` — e aí a venda antiga passa a aparecer no vendedor novo, que é
exatamente o problema que estamos resolvendo, só que ao contrário.

Ordem obrigatória: **1 → deploy → 2**.

### 3. Filtro por vendedor nas abas

Depende de 1 e 2 estarem certos, senão o filtro mostra dado errado com cara de
dado certo.

- backend: aceitar `?connection_id=` em conversas, disparos de pixel, relatórios
- front: select alimentado por `GET /numbers`, rotulado pelo `profile_name` com
  o telefone como subtítulo
- disparos de pixel filtram pelo campo novo do item 1, não pelo dono atual do lead

### 4. DateRangePicker do ERP-Estudio-AME

Fonte: `C:\Users\rafha\desktop\ERP-Estudio-ame\src\components\ui\DateRangePicker.tsx`
(463 linhas). Dependências: `lucide-react`, `cn` de `lib/utils`, portal do
`react-dom` — tudo já existe aqui, então é cópia direta sem instalar nada.

Exporta `RangeData`, `SHORTCUTS`, `buildRange`, `detectActiveShortcut`. Substitui
os pares de `<Input type="date">` espalhados hoje (rotador de grupo, cliques,
conversas, disparos).

Copiar em vez de importar: são projetos separados, sem pacote compartilhado.
Divergência futura é o preço; alternativa seria um pacote comum, que não se paga
por um componente só.

### 5. Busca em Conversas e Disparos de pixel

Campo de busca nas duas abas. Filtro no backend (não no cliente) — as duas listas
paginam, então filtrar só o que já veio na tela daria resultado errado.

Busca por: nome, telefone, e no caso dos disparos também o evento.

### 6. Arrumar o campo de busca existente

Hoje é pequeno, feio, e o placeholder diz "número" quando a busca aceita mais que
número. Trocar por algo que descreva o que realmente casa (ex: "Buscar por nome
ou telefone") e alinhar o tamanho com o resto dos controles.

Item cosmético e independente — pode ser feito a qualquer momento, inclusive
antes dos outros, se quiser resultado visível rápido.

## Aberto

- Item 1: confirmar se o `PixelFire` é criado em mais de um lugar antes de
  escolher onde preencher a coluna.
- Item 3: relatórios agregam por período; filtrar por vendedor muda o
  denominador de algumas métricas. Verificar quais.
