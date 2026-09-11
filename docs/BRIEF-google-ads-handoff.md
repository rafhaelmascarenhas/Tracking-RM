# O que queremos — Rastreamento de Google Ads (Galeria de Boleiro)

## Contexto

O tracking-rm é a plataforma que liga **anúncio → WhatsApp → venda**. Hoje ela já
faz isso para o **Meta** (Facebook/Instagram): quando alguém clica num anúncio,
cai no botão de WhatsApp e compra, o sistema avisa a Meta que aquele anúncio
específico gerou a venda. A Meta usa essa informação para otimizar as campanhas —
mandar mais verba pros anúncios que realmente vendem, não só pros que dão clique.

O problema: **o Google Ads está fora dessa conta.** As campanhas do Google trazem
gente pro WhatsApp da Galeria, essa gente compra, mas o Google nunca fica sabendo.
Pra ele, o anúncio "só deu clique". Sem saber quais cliques viraram venda, o
Google otimiza no escuro.

## O que queremos fazer

Fazer para o **Google Ads** exatamente o que já existe para o Meta: fechar o ciclo
anúncio → WhatsApp → venda e devolver a conversão pro Google.

## O fluxo completo

1. Pessoa vê um anúncio da Galeria no Google e clica.
2. Cai no site (loja Shopify) trazendo uma "etiqueta" invisível do clique (o
   identificador que o Google gera).
3. Toca no botão de WhatsApp. O tracking-rm guarda essa etiqueta e liga ela ao
   número que iniciou a conversa.
4. A pessoa conversa e compra.
5. Quando a venda é marcada no sistema (por etapa da jornada ou por gatilho de
   mensagem), o tracking-rm envia a conversão de volta pro Google Ads: **"a venda
   X veio do anúncio Y"**, com valor.

É o mesmo mecanismo do Meta, trocando o identificador do Facebook pelo do Google.

## Por que precisa do tracking-rm no meio

A venda não acontece no site — acontece **no WhatsApp**. O Google (e o Meta)
sozinhos não enxergam conversa de WhatsApp. O tracking-rm é a ponte: ele guarda de
onde veio cada pessoa, acompanha a conversa até virar venda, e só então reporta.
Sem ele, o clique e a venda ficam desconectados.

## Onde se aplica

- **Conta Google Ads**: Prime Nucleo Odontologia (Nova) — `725-952-3207` — que na
  prática roda as campanhas da **Galeria de Boleiro**.
- **Site**: a loja **Shopify** da Galeria (é onde entra a tag e o botão de
  WhatsApp que aponta pro sistema).
- **Onde a venda fecha**: no WhatsApp, atendido pelos números conectados.

## O que muda na prática

**No painel do tracking-rm:** cada lead passa a mostrar se veio do Google e de
qual campanha/anúncio — exatamente como já mostra pros leads do Meta. Dá pra ver
quanto o Google está realmente trazendo de venda, não só de conversa.

**No Google Ads:** as campanhas passam a receber as vendas como conversão, iguais
às do Meta. Com isso o algoritmo do Google pode otimizar por venda e por retorno
(ROAS), em vez de otimizar por clique — o que muda completamente a eficiência da
verba.

## Escopo — o que entra e o que não entra

**Entra:**
- Rastrear cliques de Google que chegam pelo WhatsApp (incluindo tráfego de
  celular/iPhone e campanhas Performance Max, que usam identificadores próprios).
- Devolver Lead e Venda pro Google Ads como conversão, com valor.
- Mostrar a origem Google no painel do lead.

**Não entra (por enquanto):**
- Criar/editar campanha no Google pelo sistema (isso é feito no painel do Google).
- Rastrear venda que fecha fora do WhatsApp (ex.: checkout direto no site) — esse
  caminho o próprio Google já cobre com a tag padrão.

## Status atual

- A **conexão com o Google Ads da conta já está funcionando** — o sistema
  consegue falar com a conta `725-952-3207` e enxerga os dados dela.
- O **motor de envio de conversão já está no ar** (mesma estrutura do Meta).
- Falta o **acabamento**: (1) ligar quais eventos contam como Lead e como Venda,
  usando as conversões que o Google já tem criadas na conta; (2) colocar a tag e o
  botão no site Shopify; (3) ligar o gatilho de Google no painel; (4) teste final
  com uma venda de verdade.

É reta final de configuração, não recomeço.
