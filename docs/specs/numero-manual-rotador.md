# Número manual no rotador

## Problem Statement

Hoje só entra no rotador um número que tem instância conectada num provider (uazapi ou Evolution): o operador precisa ler QR ou colar token de instância. Mas parte dos números que ele quer no rodízio não são dele — são de parceiros/vendedores, e ele não tem acesso ao WhatsApp deles pra conectar. Resultado: esses números ficam de fora do rotador, e a distribuição de leads tem que ser feita fora do sistema.

Além disso, um rotador já criado precisa poder receber esses números depois, sem ser recriado do zero.

## Solution

Um tipo novo de número: o **número manual**. O operador cadastra só o telefone (DDI+DDD+número) e um nome. Não há instância, QR, token nem webhook — o sistema só usa o telefone pra montar o link `wa.me` do rodízio.

Esse número aparece na lista de números com badge **Manual**, pode ser marcado como alvo em qualquer rotador (novo ou existente, pela edição que já existe), e entra no pool de distribuição normalmente — inclusive quando o rotador está configurado pra distribuir só entre números online, já que um número manual nunca fica `CONNECTED`.

O trade-off é explícito na UI: número manual **não recebe webhook**, então não há matching de conversa nem conversão automática atribuída a ele.

## User Stories

1. Como operador, quero cadastrar um número informando só nome e telefone, para colocar no rodízio um WhatsApp que não é meu.
2. Como operador, quero que o formulário rejeite telefone inválido (fora de 10–15 dígitos), para não criar um número que gera link `wa.me` quebrado.
3. Como operador, quero que o telefone seja normalizado (só dígitos) ao salvar, para colar com máscara/espaços sem quebrar.
4. Como operador, quero ver o número manual na lista de números com badge **Manual**, para distinguir de números conectados.
5. Como operador, quero que a coluna de provider mostre **Manual**, para saber que não há instância por trás.
6. Como operador, não quero ver o botão Conectar/Reconectar num número manual, porque não há sessão pra conectar.
7. Como operador, quero excluir um número manual sem que o sistema tente apagar instância em provider nenhum.
8. Como operador, quero selecionar um número manual como alvo ao criar um rotador, para incluí-lo no rodízio desde o começo.
9. Como operador, quero abrir um rotador já criado e adicionar/remover números manuais nos alvos, para ajustar o rodízio sem recriar o rotador.
10. Como operador, quero que na lista de alvos o número manual apareça com badge **Manual** em vez de "Offline", para não achar que está com problema.
11. Como operador, quero que o número manual receba peso em rotador `WEIGHTED` igual a qualquer outro alvo, para controlar a fatia dele.
12. Como operador, quero que o número manual entre no pool mesmo com `distribute_offline` desligado, porque ele nunca fica `CONNECTED` e o filtro de online o excluiria pra sempre.
13. Como visitante do link do rotador, quero ser levado ao WhatsApp do número manual normalmente, com o texto pré-preenchido do rotador.
14. Como operador, quero ver na UI, no momento do cadastro, que número manual não gera matching de conversa nem conversão automática, para decidir com consciência.
15. Como operador, quero que ações que não fazem sentido pra número manual (reinit, sync-webhook, connect) falhem com mensagem clara em vez de erro genérico do provider.
16. Como operador, quero consultar status de um número manual sem que o sistema chame provider nenhum.

## Implementation Decisions

- **Provider novo `MANUAL`** na conexão de WhatsApp, com `status = 'MANUAL'`. Não é um estado de sessão — é um marcador de que não existe sessão. Sem mudança de schema: `provider` e `status` já são string livre.
- **`is_imported = true`** no número manual, reusando a semântica já existente de "não mexer no provider ao deletar". Evita branch novo no delete.
- **Endpoint dedicado `POST /numbers/manual`**, separado do fluxo de criação normal, porque não compartilha nada com ele (sem init de instância, sem webhook, sem token). Body: `session_name`, `phone_number`. Valida nome não-vazio e telefone com 10–15 dígitos após remover não-dígitos. Retorna 201 com a conexão criada.
- **Guards nas rotas de sessão**: `reinit`, `sync-webhook` e `connect` retornam 400 com mensagem específica quando `provider === 'MANUAL'`. `GET /:id/status` retorna o status persistido sem chamar provider.
- **Seleção de alvo no rotador**: o pool de `pickTarget` passa a aceitar `provider === 'MANUAL'` além de `status === 'CONNECTED'` quando `distribute_offline` está desligado. Sem essa regra, número manual seria filtrado sempre e só entraria pelo fallback de "nenhum número online".
- **Sem mudança no contrato do rotador**: alvo de rotador continua referenciando uma conexão por id; peso e prioridade funcionam igual. Por isso a edição de rotador já existente cobre a história 9 sem código novo — a listagem de números do formulário passa a incluir os manuais.
- **UI de números**: "Sem conectar" é a terceira opção de **Provider** dentro do diálogo "Novo número", ao lado de uazapi e Evolution. Escolher revela o campo de telefone e troca o texto de ajuda pelo aviso de que não há webhook. Primeira tentativa foi uma ação secundária discreta abaixo do botão ("Adicionar número sem conectar", padrão visual da importação por token) — ninguém achava, então foi movida pra dentro do diálogo.
- **UI de rotadores**: o tipo do número no formulário passa a expor `provider`, e o badge de status vira Manual/Conectado/Offline.

## Testing Decisions

O repo não tem suíte automatizada — o único gate é `npm run lint` (`tsc --noEmit`) no front e o build do backend. A spec mantém esse padrão: **nenhum framework de teste é introduzido aqui**. Os critérios de aceite são verificação manual, na ordem:

1. `tsc --noEmit` limpo no front; backend compila.
2. Cadastrar número manual com telefone com máscara → salva só dígitos, aparece com badge Manual, sem botão Conectar.
3. Cadastrar com telefone de 5 dígitos → 400 com mensagem de telefone inválido, nada criado.
4. Criar rotador com 1 número manual + 1 conectado, `distribute_offline` desligado → os dois recebem cliques.
5. Abrir rotador existente, adicionar o número manual, salvar, reabrir → alvo persistido.
6. Clicar no link do rotador e cair no manual → abre `wa.me` do telefone certo com o texto pré-preenchido.
7. Excluir número manual → some da lista, sem erro de provider.

Prior art: não há testes de rota nem de serviço no backend; a verificação de features anteriores do rotador foi manual, pelo mesmo caminho.

## Out of Scope

- Matching de conversa e conversão automática para número manual — sem webhook, não há como. Fica só o aviso na UI.
- Status real de sessão (online/offline) do número manual.
- Envio de mensagem pelo sistema através de número manual.
- Migração de número manual para número conectado (hoje: apaga e cadastra de novo).
- Qualquer mudança no fluxo de edição de rotador além de os manuais aparecerem na lista de alvos.

## Further Notes

- **Aberto (só contexto, não bloqueia):** um número manual em rotador com `distribute_offline` desligado nunca é despriorizado, mesmo que o WhatsApp do parceiro esteja fora do ar — o sistema não tem como saber. Se isso virar problema na prática, a saída é desativar o alvo na mão.
- Deploy: push antes do deploy, conforme o gotcha já registrado do projeto.
