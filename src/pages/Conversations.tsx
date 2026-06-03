import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageSquare, Download, Filter, Columns, Search, ChevronRight, PlayCircle, Shuffle, Smartphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetcher, patcher } from '@/lib/fetcher';

type Lead = {
  id: string;
  phone_number: string;
  name?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  fbclid?: string | null;
  created_at: string;
  journeyStage?: { name: string } | null;
};

type LeadDetail = Lead & {
  messages?: { id: string; direction: string; content: string; timestamp: string }[];
  origin?: {
    rotator_name: string | null;
    served_by: { session_name: string; phone_number: string | null } | null;
    meta_attributed: boolean;
  } | null;
};

export function Conversations() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [convStage, setConvStage] = useState('');
  const [convValue, setConvValue] = useState('');
  const [marking, setMarking] = useState(false);

  const loadLeads = () => fetcher('/leads').then(setLeads).catch(console.error);

  useEffect(() => {
    loadLeads().finally(() => setLoading(false));
    fetcher('/journey-stages').then(setStages).catch(console.error);
  }, []);

  const openLead = (lead: Lead) => {
    setDetail(lead);
    setOpen(true);
    setDetailLoading(true);
    setConvStage('');
    setConvValue('');
    fetcher(`/leads/${lead.id}`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  };

  const markConversion = async () => {
    if (!detail || !convStage) { alert('Selecione a etapa.'); return; }
    setMarking(true);
    try {
      await patcher(`/leads/${detail.id}/stage`, { stage_id: convStage, value: convValue });
      const fresh = await fetcher(`/leads/${detail.id}`);
      setDetail(fresh);
      setConvValue('');
      loadLeads();
      alert('Conversão marcada. Evento enviado ao Meta (se configurado).');
    } catch (e: any) {
      alert(e.message || 'Erro ao marcar conversão');
    } finally {
      setMarking(false);
    }
  };

  const filtered = leads.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.phone_number.toLowerCase().includes(s) || (l.name || '').toLowerCase().includes(s);
  });

  const total = leads.length;
  const meta = leads.filter((l) => /meta|facebook|instagram/i.test(l.utm_source || '')).length;
  const google = leads.filter((l) => /google/i.test(l.utm_source || '')).length;
  const untracked = leads.filter((l) => !l.utm_source).length;
  const outras = total - meta - google - untracked;
  return (
   <div className="space-y-8">
      <div className="flex items-start gap-5 bg-white border border-[#E5E5EA]/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] rounded-3xl p-6 mb-6">
         <div className="w-16 h-16 bg-blue-50 rounded-2xl shrink-0 flex items-center justify-center">
            <PlayCircle className="w-8 h-8 text-blue-600" />
         </div>
         
         <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
               <span className="text-xs font-bold text-blue-600 tracking-wider uppercase">[RM] GUIA RÁPIDO</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
               Descubra de onde vêm suas conversas e leads
            </h2>
            <p className="text-[15px] text-gray-500 max-w-3xl leading-relaxed mb-3">
               Veja a origem de cada contato para entender quais canais e campanhas trazem mais resultados. Analise o caminho do lead desde o primeiro contato até a venda e otimize suas estratégias.
            </p>
            <p className="text-[14px] text-gray-500">
               <a href="#" className="font-medium text-blue-600 hover:text-blue-700 transition-colors">Ver tutorial completo &rarr;</a>
            </p>
         </div>
      </div>

      <div className="flex justify-end mb-2">
         <button className="text-blue-600 hover:text-blue-700 text-[14px] font-medium flex items-center gap-1 transition-colors">
            Ver últimas atualizações <ChevronRight className="w-4 h-4" />
         </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-gray-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <MessageSquare className="w-5 h-5 text-gray-600" />
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Total</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{total}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-blue-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <span className="text-blue-600 text-lg font-bold">∞</span>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Meta Ads</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{meta}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-yellow-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <div className="w-5 h-5 border-4 border-yellow-400 border-l-green-500 border-t-red-500 border-b-blue-500 rounded-full"></div>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Google Ads</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{google}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-gray-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <div className="w-5 h-5 rounded-full border-2 border-gray-400"></div>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Outras Origens</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{Math.max(0, outras)}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-orange-50 w-10 h-10 rounded-xl flex items-center justify-center relative">
               <div className="w-5 h-5 border-2 border-orange-400 rounded-full opacity-50"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-0.5 bg-orange-400 transform rotate-45"></div>
               </div>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Não Rastreada</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{untracked}</p>
            </div>
         </div>
      </div>

      <div className="flex gap-4 items-center bg-white p-3 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-[#E5E5EA]/50">
         <div className="flex bg-[#F5F5F7] p-1 rounded-full text-sm cursor-pointer">
            <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.06)] font-medium text-gray-900">
               <Filter className="w-4 h-4" /> Lista
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 text-gray-500 font-medium hover:text-gray-700">
               <Columns className="w-4 h-4" /> Colunas
            </div>
         </div>
         
         <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Telefone ou nome" className="pl-9 bg-[#F5F5F7] border-transparent focus:bg-white focus:border-blue-500 rounded-full" />
         </div>

         <div className="border border-gray-100 rounded-full px-5 py-2 text-[14px] text-gray-700 min-w-[180px] flex items-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] cursor-pointer justify-between transition-all hover:bg-gray-50/50 font-medium bg-white">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              Todas as Origens
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
         </div>

         <div className="ml-auto flex items-center gap-4">
            <div className="text-blue-600 font-medium text-[14px] flex items-center gap-1 cursor-pointer">
               Filtros Salvos <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            <Button variant="outline" className="text-blue-600 border-transparent bg-blue-50 hover:bg-blue-100 rounded-full w-10 h-10 p-0 flex items-center justify-center">
               <Filter className="w-4 h-4" />
            </Button>
            <Button variant="outline" className="text-blue-600 border-transparent bg-blue-50 hover:bg-blue-100 rounded-full w-10 h-10 p-0 flex items-center justify-center">
               <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" className="text-blue-600 font-medium text-[14px] hover:bg-blue-50 rounded-full px-4">
               Alterar Etapa em Lote <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
         </div>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-gray-100/50 overflow-hidden min-h-[300px]">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="font-semibold">Contato</TableHead>
              <TableHead className="font-semibold">Origem</TableHead>
              <TableHead className="font-semibold">Etapa da Jornada</TableHead>
              <TableHead className="font-semibold">Primeira Mensagem</TableHead>
              <TableHead className="font-semibold">Última Mensagem ↓</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-gray-500 h-[200px]">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-gray-500 h-[200px]">
                  Nenhuma conversa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow key={l.id} onClick={() => openLead(l)} className="cursor-pointer hover:bg-gray-50/70">
                  <TableCell></TableCell>
                  <TableCell className="font-medium">{l.name || l.phone_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {l.utm_source || <span className="text-gray-400">Não rastreada</span>}
                      {l.fbclid && <Badge variant="default" className="bg-[#0866FF] text-white">Meta ✓</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{l.journeyStage?.name || '-'}</TableCell>
                  <TableCell>{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      <div className="flex justify-center gap-2 mt-4">
         <Button variant="outline" disabled className="w-10 h-10 p-0 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
         </Button>
         <Button variant="outline" disabled className="w-10 h-10 p-0 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
         </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.name || detail?.phone_number}</SheetTitle>
            <span className="text-sm text-gray-500">{detail?.phone_number}</span>
          </SheetHeader>

          <div className="px-4 pb-6 space-y-6">
            {/* Bloco Origem */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Origem</h3>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Campanha</span>
                  <span className="font-medium text-gray-900">
                    {[detail?.utm_source, detail?.utm_medium, detail?.utm_campaign].filter(Boolean).join(' · ') || 'Não rastreada'}
                  </span>
                </div>
                {detail?.origin?.served_by && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> Atendido por</span>
                    <span className="font-medium text-gray-900">
                      {detail.origin.served_by.session_name}
                      {detail.origin.served_by.phone_number ? ` (${detail.origin.served_by.phone_number})` : ''}
                    </span>
                  </div>
                )}
                {detail?.origin?.rotator_name && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /> Rotador</span>
                    <span className="font-medium text-gray-900">{detail.origin.rotator_name}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-gray-500">Atribuição</span>
                  {detail?.fbclid || detail?.origin?.meta_attributed ? (
                    <Badge variant="default" className="bg-[#0866FF] text-white">Meta ✓</Badge>
                  ) : (
                    <Badge variant="secondary">Sem atribuição Meta</Badge>
                  )}
                </div>
                {detail?.journeyStage?.name && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Etapa</span>
                    <Badge variant="outline">{detail.journeyStage.name}</Badge>
                  </div>
                )}
              </div>
            </section>

            {/* Marcar conversão: move etapa + dispara evento Meta com valor */}
            <section className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Marcar conversão</h3>
              <div>
                <Label className="text-xs text-gray-500">Etapa</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={convStage} onChange={(e) => setConvStage(e.target.value)}>
                  <option value="">Selecione...</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Valor da venda (opcional — sobrescreve o padrão do evento)</Label>
                <Input type="number" step="0.01" min="0" value={convValue} onChange={(e) => setConvValue(e.target.value)} placeholder="ex: 197.00" />
              </div>
              <Button onClick={markConversion} disabled={marking} className="w-full bg-[#0866FF] text-white">
                {marking ? 'Enviando...' : 'Marcar conversão e enviar ao Meta'}
              </Button>
              {!detail?.fbclid && !detail?.origin?.meta_attributed && (
                <p className="text-[11px] text-amber-600">Lead sem atribuição Meta (fbclid) — evento envia, mas sem casar com o clique do anúncio.</p>
              )}
            </section>

            {/* Timeline de mensagens */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Mensagens</h3>
              {detailLoading ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : !detail?.messages || detail.messages.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma mensagem registrada.</p>
              ) : (
                <div className="space-y-2">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.direction === 'INBOUND'
                          ? 'max-w-[85%] mr-auto bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-3'
                          : 'max-w-[85%] ml-auto bg-blue-50 rounded-2xl rounded-tr-sm p-3'
                      }
                    >
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{new Date(m.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
