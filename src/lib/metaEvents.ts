// Catálogo dos eventos de conversão padrão da Meta (Pixel/CAPI).
// Usado no dropdown do editor de etapa e na página-catálogo "Eventos de Conversão".
export type MetaEvent = { name: string; description: string };

export const META_EVENTS: MetaEvent[] = [
  { name: 'ViewContent', description: 'Uma visita a uma página importante para você (ex: página de produto).' },
  { name: 'Lead', description: 'O envio de informações por um cliente que pode ser contatado depois.' },
  { name: 'Purchase', description: 'A conclusão de uma compra, geralmente indicada pelo recebimento do pedido.' },
  { name: 'AddPaymentInfo', description: 'A adição de informações de pagamento durante o checkout.' },
  { name: 'AddToCart', description: 'A adição de um item ao carrinho de compras.' },
  { name: 'AddToWishlist', description: 'A adição de itens à lista de desejos.' },
  { name: 'CompleteRegistration', description: 'O envio de um cadastro em troca de um serviço.' },
  { name: 'Contact', description: 'Um telefone, SMS, e-mail, chat ou outro contato com a empresa.' },
  { name: 'CustomizeProduct', description: 'A personalização de um produto por uma ferramenta de configuração.' },
  { name: 'Donate', description: 'A doação de fundos para sua organização ou causa.' },
  { name: 'FindLocation', description: 'Quando alguém encontra uma de suas localizações.' },
  { name: 'InitiateCheckout', description: 'O início do processo de finalização da compra.' },
  { name: 'Schedule', description: 'O agendamento de um horário para visitar uma localização.' },
  { name: 'Search', description: 'Uma pesquisa feita no seu site ou app.' },
  { name: 'StartTrial', description: 'O início de uma avaliação gratuita de um produto/serviço.' },
  { name: 'SubmitApplication', description: 'O envio de uma solicitação de produto, serviço ou programa.' },
  { name: 'Subscribe', description: 'O início de uma assinatura paga.' },
];

// Rótulo exibido no dropdown, ex: "Purchase (Meta Ads)"
export const eventLabel = (name: string) => `${name} (Meta Ads)`;
