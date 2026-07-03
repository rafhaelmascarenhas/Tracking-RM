import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageSquare, Download, Filter, Search, ChevronRight, Shuffle, Smartphone, RefreshCw, ChevronLeft } from 'lucide-react';
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
  utm_term?: string | null;
  utm_content?: string | null;
  fbclid?: string | null;
  ctwa_clid?: string | null;
  created_at: string;
  journeyStage?: { name: string } | null;
  whatsappConnection?: { session_name: string; phone_number: string | null } | null;
  messages?: { id: string; direction: string; content: string; timestamp: string }[];
};

function OriginBadge({ l }: { l: Lead }) {
  if (l.fbclid) return <Badge className="bg-[#0866FF] text-white">Meta ✓</Badge>;
  if (l.ctwa_clid) return <Badge className="bg-[#0866FF] text-white">Meta CTWA ✓</Badge>;
  if (l.utm_source) {
    const src = l.utm_source.toLowerCase();
    if (src.includes('google') || src.includes('adwords'))
      return <Badge className="bg-[#34A853] text-white">{l.utm_source}</Badge>;
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram') || src === 'fb' || src === 'ig')
      return <Badge className="bg-[#0866FF] text-white">{l.utm_source} ✓</Badge>;
    return <Badge variant="secondary">{l.utm_source}</Badge>;
  }
  return <span className="text-gray-400 text-sm">Não rastreada</span>;
}

type LeadDetail = Lead & {
  messages?: { id: string; direction: string; content: string; timestamp: string }[];
  origin?: {
    rotator_name: string | null;
    served_by: { session_name: string; phone_number: string | null } | null;
    meta_attributed: boolean;
  } | null;
};

const LIMIT = 50;

export function Conversations() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [originFilter, setOriginFilter] = useState<'all' | 'meta' | 'google' | 'untracked'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [convStage, setConvStage] = useState('');
  const [convValue, setConvValue] = useState('');
  const [marking, setMarking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, meta: 0, untracked: 0 });

  // Refs para valores atuais dentro de callbacks/intervals
  const searchRef = useRef('');
  const dateFromRef = useRef('');
  const dateToRef = useRef('');
  const pageRef = useRef(1);
  searchRef.current = search;
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;
  pageRef.current = page;

  const buildUrl = (p: number) => {
    const q = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (searchRef.current.trim()) q.set('search', searchRef.current.trim());
    if (dateFromRef.current) q.set('dateFrom', dateFromRef.current);
    if (dateToRef.current) q.set('dateTo', dateToRef.current);
    return `/leads?${q}`;
  };

  const applyResponse = (r: any) => {
    const list: Lead[] = Array.isArray(r) ? r : (r.leads ?? []);
    setLeads(list);
    if (r && !Array.isArray(r)) {
      setTotalPages(r.pages ?? 1);
      if (r.stats) setStats(r.stats);
    }
  };

  const loadLeads = (p: number) =>
    fetcher(buildUrl(p)).then(applyResponse).catch(console.error);

  const refresh = () => {
    setRefreshing(true);
    loadLeads(pageRef.current).finally(() => setRefreshing(false));
  };

  // Carga inicial + auto-refresh
  useEffect(() => {
    loadLeads(1).finally(() => setLoading(false));
    fetcher('/journey-stages').then(setStages).catch(console.error);
    const interval = setInterval(() => loadLeads(pageRef.current), 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // Busca/data: debounce 350ms, volta pra página 1
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    const t = setTimeout(() => {
      setPage(1);
      setLoading(true);
      loadLeads(1).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [search, dateFrom, dateTo]); // eslint-disable-line

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    setLoading(true);
    loadLeads(p).finally(() => setLoading(false));
  };

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
      loadLeads(pageRef.current);
      alert('Conversão marcada. Evento enviado ao Meta (se configurado).');
    } catch (e: any) {
      alert(e.message || 'Erro ao marcar conversão');
    } finally {
      setMarking(false);
    }
  };

  const isMeta = (l: Lead) => !!l.fbclid || !!l.ctwa_clid || /meta|facebook|instagram|fb|ig/i.test(l.utm_source || '');
  const isGoogle = (l: Lead) => /google|adwords|gclid/i.test(l.utm_source || '');

  // Filtro de origem aplicado client-side na página atual
  const filtered = leads.filter((l) => {
    if (originFilter === 'meta' && !isMeta(l)) return false;
    if (originFilter === 'google' && !isGoogle(l)) return false;
    if (originFilter === 'untracked' && (l.utm_source || l.fbclid || l.ctwa_clid)) return false;
    return true;
  });

  const { total: statTotal, meta: statMeta, untracked: statUntracked } = stats;
  const statOutras = Math.max(0, statTotal - statMeta - statUntracked);

  return (
   <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-gray-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <MessageSquare className="w-5 h-5 text-gray-600" />
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Total</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{statTotal}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-blue-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <span className="text-blue-600 text-lg font-bold">∞</span>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Meta Ads</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{statMeta}</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-yellow-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <div className="w-5 h-5 border-4 border-yellow-400 border-l-green-500 border-t-red-500 border-b-blue-500 rounded-full"></div>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Google Ads</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">0</p>
            </div>
         </div>
         <div className="bg-white rounded-3xl p-5 border border-gray-100/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3">
            <div className="bg-gray-50 w-10 h-10 rounded-xl flex items-center justify-center">
               <div className="w-5 h-5 rounded-full border-2 border-gray-400"></div>
            </div>
            <div>
               <p className="text-[13px] text-gray-500 font-medium mb-0.5">Outras Origens</p>
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{statOutras}</p>
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
               <p className="text-2xl font-bold text-gray-900 tracking-tight">{statUntracked}</p>
            </div>
         </div>
      </div>

      <div className="flex gap-4 items-center bg-white p-3 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-[#E5E5EA]/50">
         <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-[150px] bg-[#F5F5F7] border-transparent focus:bg-white focus:border-blue-500 rounded-full px-3" />
            <span className="text-gray-400 text-sm">até</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-[150px] bg-[#F5F5F7] border-transparent focus:bg-white focus:border-blue-500 rounded-full px-3" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-gray-400 hover:text-gray-600">limpar</button>
            )}
         </div>

         <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Telefone ou nome" className="pl-9 bg-[#F5F5F7] border-transparent focus:bg-white focus:border-blue-500 rounded-full" />
         </div>

         <div className="relative flex items-center border border-gray-100 rounded-full pl-5 pr-3 py-2 min-w-[180px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] bg-white">
            <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
              className="appearance-none bg-transparent text-[14px] text-gray-700 font-medium pl-2 pr-6 outline-none cursor-pointer w-full"
            >
              <option value="all">Todas as Origens</option>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="untracked">Não rastreada</option>
            </select>
            <svg className="w-4 h-4 text-gray-400 absolute right-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
         </div>

         <div className="ml-auto flex items-center gap-4">
            <Button variant="outline" onClick={refresh} disabled={refreshing} title="Atualizar lista" className="text-blue-600 border-transparent bg-blue-50 hover:bg-blue-100 rounded-full w-10 h-10 p-0 flex items-center justify-center">
               <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
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
              <TableHead className="font-semibold">Número</TableHead>
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
                  <TableCell className="text-sm text-gray-500">
                    {l.whatsappConnection ? (
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        {l.whatsappConnection.session_name}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell><OriginBadge l={l} /></TableCell>
                  <TableCell>{l.journeyStage?.name || '-'}</TableCell>
                  <TableCell>{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>
                    {l.messages?.[0] ? (
                      <div>
                        <div className="text-xs text-gray-500">{new Date(l.messages[0].timestamp).toLocaleString('pt-BR')}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[180px]">{l.messages[0].content}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-center items-center gap-3 mt-4">
        <span className="text-sm text-gray-500">
          {statTotal} lead{statTotal === 1 ? '' : 's'} no total
          {totalPages > 1 && ` · mostrando ${filtered.length} nesta página`}
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-2">
          <Button
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => goToPage(page - 1)}
            className="w-10 h-10 p-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm text-gray-500">
            Página {page} de {totalPages}
          </span>
          <input
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            key={page}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = parseInt((e.target as HTMLInputElement).value);
                if (!isNaN(v)) goToPage(v);
              }
            }}
            className="w-16 h-9 text-center text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <Button
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => goToPage(page + 1)}
            className="w-10 h-10 p-0"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.name || detail?.phone_number}</SheetTitle>
            <span className="text-sm text-gray-500">{detail?.phone_number}</span>
            {(() => {
              const servedBy = detail?.origin?.served_by ?? detail?.whatsappConnection;
              if (!servedBy) return null;
              return (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1 w-fit mt-1">
                  <Smartphone className="w-3 h-3" />
                  {servedBy.session_name}
                  {servedBy.phone_number ? <span className="text-gray-400">· {servedBy.phone_number}</span> : null}
                </span>
              );
            })()}
          </SheetHeader>

          <div className="px-4 pb-6 space-y-6">
            {/* Bloco Origem */}
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Origem</h3>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 space-y-2 text-sm">
                {(() => {
                  const rows: [string, string | null | undefined][] = [
                    ['Origem', detail?.utm_source || (detail?.fbclid ? 'Meta' : null) || (detail?.ctwa_clid ? 'Meta Direto' : null)],
                    ['Campanha', detail?.utm_campaign],
                    ['Conjunto', detail?.utm_term],
                    ['Anúncio', detail?.utm_content],
                  ];
                  const any = rows.some(([, v]) => v);
                  if (!any) {
                    return <div className="flex justify-between"><span className="text-gray-500">Campanha</span><span className="text-gray-400">Não rastreada</span></div>;
                  }
                  return rows.filter(([, v]) => v).map(([label, v]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-gray-500 shrink-0">{label}</span>
                      <span className="font-medium text-gray-900 text-right break-words">{v}</span>
                    </div>
                  ));
                })()}
                {detail?.fbclid && (
                  <div className="flex justify-between items-start gap-3">
                    <span className="text-gray-500 shrink-0">fbclid</span>
                    <code
                      onClick={() => navigator.clipboard.writeText(detail.fbclid!)}
                      title="Clique para copiar"
                      className="text-[11px] font-mono text-gray-600 break-all text-right cursor-pointer hover:text-blue-600 max-w-[220px]"
                    >
                      {detail.fbclid.length > 28 ? detail.fbclid.slice(0, 28) + '…' : detail.fbclid}
                    </code>
                  </div>
                )}
                {detail?.ctwa_clid && (
                  <div className="flex justify-between items-start gap-3">
                    <span className="text-gray-500 shrink-0">ctwa_clid</span>
                    <code
                      onClick={() => navigator.clipboard.writeText(detail.ctwa_clid!)}
                      title="Clique para copiar"
                      className="text-[11px] font-mono text-gray-600 break-all text-right cursor-pointer hover:text-blue-600 max-w-[220px]"
                    >
                      {detail.ctwa_clid.length > 28 ? detail.ctwa_clid.slice(0, 28) + '…' : detail.ctwa_clid}
                    </code>
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
                  ) : detail?.ctwa_clid ? (
                    <Badge variant="default" className="bg-[#0866FF] text-white">Meta CTWA ✓</Badge>
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

            {/* Marcar conversão */}
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
              {!detail?.fbclid && !detail?.ctwa_clid && !detail?.origin?.meta_attributed && (
                <p className="text-[11px] text-amber-600">Lead sem atribuição Meta — evento envia, mas sem casar com o clique do anúncio.</p>
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
                          ? 'max-w-[85%] mr-auto'
                          : 'max-w-[85%] ml-auto'
                      }
                    >
                      <p className={`text-[10px] font-medium mb-0.5 ${m.direction === 'INBOUND' ? 'text-gray-400' : 'text-blue-400 text-right'}`}>
                        {m.direction === 'INBOUND' ? 'Lead' : 'Atendente'}
                      </p>
                      <div className={m.direction === 'INBOUND'
                        ? 'bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-3'
                        : 'bg-blue-50 rounded-2xl rounded-tr-sm p-3'
                      }>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{new Date(m.timestamp).toLocaleString('pt-BR')}</p>
                      </div>
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
