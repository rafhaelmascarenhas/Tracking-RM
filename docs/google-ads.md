# Google Ads — rastreamento de WhatsApp via rotador

Conta: **Prime Nucleo Odontologia (Nova)** — Customer ID `725-952-3207` (`7259523207`).

Fluxo igual ao do Meta, trocando `fbclid` por `gclid`:

```
anúncio Google → site (?gclid=...) → botão WhatsApp → /r/<slug>?gclid=...
  → RotatorClick grava gclid → lead manda msg com [token] → match lead↔click
  → etapa/gatilho converte → uploadClickConversions manda de volta pro Google
```

`wbraid` / `gbraid` substituem o `gclid` em tráfego iOS e campanhas de app
(Performance Max, Demand Gen). São capturados junto e são mutuamente exclusivos
no upload.

---

## 1. Tag no site

Precisa do ID de conversão `AW-XXXXXXXXXX` (Ads → Ferramentas → Gerenciador de
dados → Tags). **Não** é o mesmo número do Customer ID.

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-XXXXXXXXXX');
</script>
```

Ligar **tag automática** em Ads → Configurações da conta. Sem ela o Google não
anexa `gclid` na URL de destino e não há o que atribuir.

## 2. Botão do WhatsApp

> Loja é Shopify (Galeria de Boleiro). Use **`docs/shopify-gtag.liquid`** —
> versão pronta, colada em `layout/theme.liquid` antes de `</head>`. O snippet
> genérico abaixo fica de referência.

O botão aponta pro rotador, nunca direto pro `wa.me`. O clique pode acontecer
numa página interna, então o identificador é guardado no primeiro pageview e
lido de lá.

```html
<a href="https://SEU_DOMINIO/r/SLUG" class="btn-wpp">Falar no WhatsApp</a>

<script>
(function () {
  var KEYS = ['gclid', 'wbraid', 'gbraid', 'utm_source', 'utm_medium',
              'utm_campaign', 'utm_term', 'utm_content'];
  var STORE = 'trk_click';

  // 1) Persiste o que veio na URL. O visitante pode navegar várias páginas
  //    antes de clicar no botão; sem isso o gclid se perde na primeira troca.
  var url = new URLSearchParams(location.search);
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  var fresh = false;
  KEYS.forEach(function (k) {
    var v = url.get(k);
    if (v) { saved[k] = v; fresh = true; }
  });
  // Clique novo sobrescreve o antigo por inteiro — misturar gclid de hoje com
  // utm_campaign da semana passada credita a campanha errada.
  if (fresh) {
    saved._ts = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) {}
  }
  // Expira em 90 dias: é a janela que o Google aceita no import offline.
  if (saved._ts && Date.now() - saved._ts > 90 * 86400000) saved = {};

  // 2) Monta o href de cada botão com os params guardados.
  var qs = new URLSearchParams();
  KEYS.forEach(function (k) { if (saved[k]) qs.set(k, saved[k]); });

  Array.prototype.forEach.call(document.querySelectorAll('.btn-wpp'), function (a) {
    if (qs.toString()) {
      a.href = a.href.split('?')[0] + '?' + qs.toString();
    }
    a.addEventListener('click', function () {
      if (typeof gtag === 'function') {
        gtag('event', 'conversion', { send_to: 'AW-XXXXXXXXXX/LABEL_CLIQUE' });
      }
    });
  });
})();
</script>
```

## 3. Conversion Actions no Ads

| Nome | Tipo | Disparo | Principal? |
|---|---|---|---|
| Clique WhatsApp | Site | gtag no botão | não |
| Lead Qualificado | Importar → Conversões offline | backend | opcional |
| Venda | Importar → Conversões offline | backend | **sim** |

Só a Venda como conversão principal. Se "Clique WhatsApp" for principal, o lance
otimiza pra clique e não pra receita.

Pegar o ID de cada action: abrir a action no painel e ler `ctId=` na URL.

## 4. Configuração no tracking-rm

**Settings → Google Ads:**
- Customer ID: `725-952-3207`
- Conversion Actions (JSON): `{"Purchase":"<ctId venda>","Lead":"<ctId lead>"}`

A chave do JSON tem que bater **exatamente** com o `event_name` do gatilho /
evento de etapa, senão o disparo é ignorado com aviso no log.

**Gatilho/evento:** criar com `platform = GOOGLE`. Meta e Google convivem — dois
registros, um por plataforma, disparam no mesmo movimento.

## 5. Credenciais (env da VPS)

```
GOOGLE_ADS_DEVELOPER_TOKEN=      # Ads (conta MCC) → Ferramentas → Central de API
GOOGLE_ADS_CLIENT_ID=            # Google Cloud → Credenciais → OAuth "App para computador"
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=        # escopo https://www.googleapis.com/auth/adwords
GOOGLE_ADS_LOGIN_CUSTOMER_ID=    # ID da MCC, só dígitos (obrigatório p/ conta filha)
GOOGLE_ADS_TIMEZONE_OFFSET=-03:00
GOOGLE_ADS_VALIDATE_ONLY=false   # true no primeiro teste
```

Gerar o refresh token (uma vez, na máquina local):

```bash
npx -y google-ads-api-refresh-token   # ou o fluxo OAuth manual abaixo
```

Manual: abrir no navegador, autorizar, trocar o `code` por refresh token.

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=<CLIENT_ID>
  &redirect_uri=http://localhost
  &response_type=code
  &scope=https://www.googleapis.com/auth/adwords
  &access_type=offline
  &prompt=consent
```

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d client_id=<CLIENT_ID> -d client_secret=<CLIENT_SECRET> \
  -d code=<CODE> -d redirect_uri=http://localhost -d grant_type=authorization_code
```

`prompt=consent` é obrigatório — sem ele o Google devolve só `access_token` na
segunda autorização em diante, e o refresh token nunca chega.

## 6. Diagnóstico

O disparo aparece em **Disparos de Pixel** com `platform = GOOGLE`. Erros comuns
no campo `response`:

| Mensagem | Causa |
|---|---|
| `lead sem gclid/wbraid/gbraid` | tag automática desligada, ou botão não propagou o param |
| `clique com Nd — acima do limite de 90d` | conversão tardia demais, Google recusa |
| `PERMISSION_DENIED` | falta `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (conta é filha de MCC) |
| `DEVELOPER_TOKEN_NOT_APPROVED` | token ainda em acesso de teste, só funciona em conta de teste |
| `sem conversionAction mapeada` | nome do evento não bate com a chave do JSON em Settings |

Conversão importada leva **até 3h** pra aparecer no painel do Ads, e a coluna
só popula depois disso. Não é erro.
