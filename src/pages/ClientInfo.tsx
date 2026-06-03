import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Eye, PlayCircle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function ClientInfo() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
         <div className="w-64 h-36 bg-gray-900 rounded-lg shrink-0 relative overflow-hidden group cursor-pointer flex items-center justify-center">
            <div className="absolute inset-0 opacity-50 bg-black"></div>
            <PlayCircle className="w-12 h-12 text-blue-500 relative z-10" />
            <div className="absolute bottom-2 left-2 text-white text-xs font-bold leading-tight z-10">
               [TINTIM] TODAS AS ...
            </div>
         </div>
         
         <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2">
               Informações do Cliente
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
               <li>Consulte as configurações da sua conta, adicione os pixels e modifique endereços de webhooks.</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
               Precisa de ajuda? <a href="#" className="text-blue-500 hover:underline">Fale agora com o suporte</a>
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="space-y-6">
            <Card className="border-gray-200 shadow-sm">
               <CardHeader className="pb-3 border-b border-gray-100">
                  <CardTitle className="text-base text-gray-800 flex items-center justify-between">
                     Informações Básicas
                  </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4 pt-4">
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome</label>
                     <p className="text-gray-800 font-medium">Galeria</p>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">WhatsApp</label>
                     <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-green-600 font-medium text-sm">Conectado (xx) xxxxx-xxxx</span>
                     </div>
                  </div>
               </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
               <CardHeader className="pb-3 border-b border-gray-100">
                  <CardTitle className="text-base text-gray-800">Meta Ads</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4 pt-4">
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Pixel do Meta Ads</label>
                     <p className="text-gray-800 font-medium break-all">692131906233488</p>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Token de API de Conversão</label>
                     <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border border-gray-200">
                        <span className="text-gray-500 text-sm truncate pr-4">EAADQ9...rBAA</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-500">
                           <Eye className="w-4 h-4 mr-1" /> Exibir
                        </Button>
                     </div>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Contas de Anúncios Associadas</label>
                     <div className="flex gap-2">
                        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded text-xs font-medium border border-gray-200">act_403164968840244</span>
                     </div>
                  </div>
               </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm border-2 border-yellow-400">
               <CardHeader className="pb-3 bg-yellow-50 border-b border-yellow-100 flex flex-row items-center justify-between">
                  <div>
                     <CardTitle className="text-base text-yellow-800 flex items-center gap-2">
                        Dados para Integrações (API)
                     </CardTitle>
                     <p className="text-xs text-yellow-700 mt-1 pb-0">Nunca compartilhe esses dados livremente, são as credenciais de acesso seguro do seu cliente.</p>
                  </div>
               </CardHeader>
               <CardContent className="space-y-4 pt-4">
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Código do Cliente</label>
                     <div className="flex items-center gap-2">
                        <Input readOnly value="671bfe9c-0c6a-4934-bc2c-2c9e7826dd7" className="bg-gray-50 font-mono text-sm" />
                        <Button variant="outline" size="icon" className="shrink-0"><Copy className="w-4 h-4 text-gray-500" /></Button>
                     </div>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block flex items-center gap-1">
                        Token de Segurança <ShieldCheck className="w-3 h-3 text-green-600" />
                     </label>
                     <div className="flex items-center gap-2">
                        <Input readOnly type="password" value="**************" className="bg-gray-50 font-mono text-sm" />
                        <Button variant="outline" size="icon" className="shrink-0"><Copy className="w-4 h-4 text-gray-500" /></Button>
                     </div>
                  </div>
               </CardContent>
            </Card>
         </div>

         <div className="space-y-6">
            <Card className="border-gray-200 shadow-sm">
               <CardHeader className="pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
                  <CardTitle className="text-base text-gray-800">Endereços de Webhooks</CardTitle>
                  <Button variant="ghost" size="sm" className="text-blue-500 h-8 font-medium">Editar Webhooks</Button>
               </CardHeader>
               <CardContent className="space-y-4 pt-4">
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Criação de Conversa</label>
                     <p className="text-gray-500 text-sm">-</p>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Alteração de Etapa de Conversa</label>
                     <p className="text-gray-500 text-sm">-</p>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Criação de Mensagem</label>
                     <p className="text-gray-500 text-sm">-</p>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-gray-500 mb-1 block">Alteração da Origem da Conversa</label>
                     <p className="text-gray-500 text-sm">-</p>
                  </div>
               </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
               <CardHeader className="pb-3 border-b border-gray-100">
                  <div className="flex justify-between items-center">
                     <div>
                        <CardTitle className="text-base text-gray-800">Pixel do Tintim</CardTitle>
                        <p className="text-xs text-gray-500 mt-1">Copie o código base e instale no seu hub de tags ou no cabeçalho do seu site.</p>
                     </div>
                     <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">1.3</span>
                  </div>
               </CardHeader>
               <CardContent className="pt-4">
                  <div className="bg-gray-900 rounded-md p-4 relative group">
                     <Button size="sm" variant="secondary" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 bg-white/10 hover:bg-white/20 text-white border-0 text-xs">
                        <Copy className="w-3 h-3 mr-1" /> Copiar Código
                     </Button>
                     <pre className="text-xs text-green-400 font-mono overflow-hidden">
{`<!-- Base Pixel do TINTIM -->
<script>
!function(t,i,n,e,w){
  t.watrack||(w=t.watrack=function(){w.callMethod?
  w.callMethod.apply(w,arguments):w.queue.push(arguments)}...
</script>`}
                     </pre>
                  </div>
               </CardContent>
            </Card>
         </div>
      </div>
    </div>
  );
}
