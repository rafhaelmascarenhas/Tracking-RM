import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Link as LinkIcon, Box, DollarSign } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fetcher } from '@/lib/fetcher';

type Stats = {
  total_conversations: number;
  tracked: number;
  untracked: number;
  tracked_pct: number;
  funnel: { name: string; count: number; order: number }[];
  source_breakdown: { source: string; count: number }[];
  chart: { date: string; count: number }[];
};

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetcher('/dashboard/stats')
      .then(setStats)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Carregando...</div>;
  if (err) return <div className="p-8 text-red-500">Erro: {err}</div>;
  if (!stats) return null;

  const sourceCount = (s: string) =>
    stats.source_breakdown.find((x) => x.source.toLowerCase().includes(s))?.count || 0;
  const meta = sourceCount('meta') + sourceCount('facebook') + sourceCount('instagram');
  const google = sourceCount('google');
  const untracked = stats.source_breakdown.find((x) => x.source === 'Não Rastreada')?.count || 0;
  const outras = stats.total_conversations - meta - google - untracked;

  const chartData = (stats.chart || []).map((c) => ({
    date: (c.date || '').slice(5) || '-',
    meta: 0,
    google: 0,
    outras: 0,
    naoRastreada: c.count,
  }));

  const totalFunnel = stats.funnel.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 rounded-2xl mb-6 border border-[#E5E5EA]/50">
        <div className="flex items-center gap-3 text-gray-800">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm">i</div>
          <p className="text-[15px]">Dúvidas sobre Dashboard? <a href="#" className="font-medium text-blue-600 hover:text-blue-700 transition-colors">Saiba mais no vídeo</a></p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div className="flex gap-4">
          <div className="bg-white rounded-full px-5 py-2 text-[14px] text-gray-700 min-w-[200px] flex items-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 font-medium">
            Últimos 30 dias
          </div>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 font-medium shadow-sm">
          Baixar Relatório
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-gray-100/50 min-h-[360px] flex flex-col p-8">
          <h3 className="font-semibold text-gray-900 text-lg tracking-tight mb-8">Visão Geral das Conversas</h3>
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <p className="text-[13px] text-gray-500 font-medium mb-0.5">Total de Conversas Novas Ativas</p>
                <p className="text-2xl font-bold text-gray-900 leading-none">{stats.total_conversations}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F5F5F7] rounded-2xl p-4 border border-[#E5E5EA]/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-100/50 flex items-center justify-center">
                    <LinkIcon className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-[13px] text-gray-600 font-medium leading-tight">Conversas<br/>Rastreadas</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-gray-900">{stats.tracked}</p>
                  <p className="text-sm font-semibold text-gray-500">{stats.tracked_pct}%</p>
                </div>
              </div>

              <div className="bg-[#F5F5F7] rounded-2xl p-4 border border-[#E5E5EA]/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-orange-100/50 flex items-center justify-center">
                    <span className="text-orange-500 font-bold text-lg leading-none mt-[-4px]">~</span>
                  </div>
                  <p className="text-[13px] text-gray-600 font-medium leading-tight">Conversas não<br/>rastreadas</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-gray-900">{stats.untracked}</p>
                  <p className="text-sm font-semibold text-gray-500">{100 - stats.tracked_pct}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-gray-100/50 min-h-[360px] flex flex-col p-8">
          <h3 className="font-semibold text-gray-900 text-lg tracking-tight mb-8">Origem das Conversas</h3>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div>
              <span className="text-[12px] font-medium text-gray-500">Meta Ads</span>
              <p className="text-2xl font-bold text-gray-900">{meta}</p>
            </div>
            <div>
              <span className="text-[12px] font-medium text-gray-500">Google Ads</span>
              <p className="text-2xl font-bold text-gray-900">{google}</p>
            </div>
            <div>
              <span className="text-[12px] font-medium text-gray-500">Outras</span>
              <p className="text-2xl font-bold text-gray-900">{Math.max(0, outras)}</p>
            </div>
            <div>
              <span className="text-[12px] font-medium text-gray-500">Não Rastreada</span>
              <p className="text-2xl font-bold text-gray-900">{untracked}</p>
            </div>
          </div>
          <div className="flex-1 min-h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8E8E93' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8E8E93' }} />
                <Tooltip cursor={{ fill: '#F5F5F7' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="meta" stackId="a" fill="#0066FF" />
                <Bar dataKey="google" stackId="a" fill="#34C759" />
                <Bar dataKey="outras" stackId="a" fill="#8E8E93" />
                <Bar dataKey="naoRastreada" stackId="a" fill="#FF9500" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-gray-100/50 min-h-[360px] flex flex-col p-8 col-span-1 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 text-lg tracking-tight mb-8">Funil da Jornada de Compra</h3>
          {stats.funnel.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">Nenhum estágio configurado</div>
          ) : (
            <div className="flex-1 grid grid-cols-1 gap-3">
              {stats.funnel.map((s) => {
                const pct = ((s.count / totalFunnel) * 100).toFixed(2);
                return (
                  <div key={s.name} className="bg-[#E0F0FF] rounded-xl py-4 px-4 text-center border-b-4 border-blue-500/20">
                    <span className="text-[13px] font-semibold text-blue-800/60 block mb-1">{s.name}</span>
                    <span className="text-xl font-bold text-blue-900">{pct}% ({s.count})</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
