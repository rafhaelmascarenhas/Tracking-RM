import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowRight, Info, Link as LinkIcon, Smartphone, HelpCircle } from 'lucide-react';

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [usePlatform, setUsePlatform] = useState('');
  const [aware, setAware] = useState(false);

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col items-center pt-24 p-4">
      <Card className="w-full max-w-3xl bg-white shadow-md border-0">
        <CardContent className="p-8 md:p-12">
          {/* STEP 1 (Mockado por enquanto como Passo 2 de 4) */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end mb-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                  Informações da sua conta<br/>do WhatsApp Business
                </h1>
                <span className="text-sm font-medium text-gray-400 mb-1">Passo 2 de 4</span>
              </div>
              <Progress value={25} className="h-2 mb-10 bg-gray-100" />

              <h2 className="text-xl font-medium text-gray-900 mb-6">
                Você utiliza esta conta de WhatsApp Business em alguma plataforma de atendimento ou automação (como CRMs, chatbots ou sistemas de suporte)?
              </h2>

              <RadioGroup value={usePlatform} onValueChange={setUsePlatform} className="space-y-4 mb-10">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="sim" id="sim" className="h-5 w-5" />
                  <Label htmlFor="sim" className="text-base text-gray-700 cursor-pointer">Sim</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="nao" id="nao" className="h-5 w-5" />
                  <Label htmlFor="nao" className="text-base text-gray-700 cursor-pointer">Não</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="nao-sei" id="nao-sei" className="h-5 w-5" />
                  <Label htmlFor="nao-sei" className="text-base text-gray-700 cursor-pointer">Não sei</Label>
                </div>
              </RadioGroup>

              <div className="bg-sky-50 border border-sky-200 rounded-lg p-5 mb-10">
                <div className="flex gap-3">
                  <HelpCircle className="h-6 w-6 text-sky-500 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sky-600 mb-1">Por que o WaTrack precisa saber disso?</h3>
                    <p className="text-sm text-sky-800 leading-relaxed">
                      Saber se você usa alguma plataforma ajuda o WaTrack a escolher a conexão certa e evitar falhas ou conflitos. Assim, seu WhatsApp Business e a plataforma seguem funcionando sem pausas nem interrupções.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <Button variant="outline" className="text-blue-500 border-blue-200 hover:bg-blue-50">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                <Button 
                  className="bg-[#0095FF] hover:bg-[#0080FF] text-white px-8"
                  onClick={() => setStep(2)}
                  disabled={!usePlatform}
                >
                  Continuar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex justify-between items-end mb-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                  Conecte sua conta<br/>do WhatsApp Business ao WaTrack
                </h1>
                <span className="text-sm font-medium text-gray-400 mb-1">Passo 3 de 4</span>
              </div>
              <Progress value={50} className="h-2 mb-6 bg-gray-100" indicatorClass="bg-emerald-500" />

              <p className="text-gray-500 mb-8">
                Siga as intruções abaixo para concluir a conexão. O processo é simples, rápido e seguro.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mb-4">Aviso Importante</h3>

              <div className="flex gap-4 items-center mb-6">
                 <div className="w-10 h-10 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-[#0668E1]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                 </div>
                 <p className="text-gray-700">
                   Você está pronto para conectar sua conta do WhatsApp Business ao WaTrack utilizando o método Coexistence. Uma integração <strong>oficial da Meta</strong>.
                 </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-8">
                <div className="flex gap-3">
                  <div className="text-amber-500 font-bold">!</div>
                  <p className="text-sm text-amber-800 leading-relaxed">
                    Porém, ele possui uma limitação. O método Coexistence <strong>NÃO é compatível</strong> com plataformas de atendimento e automação que usam conexões não-oficiais com a Meta. Se você utiliza alguma delas, ela <strong>deixará de funcionar</strong> assim que a conta for conectada ao WaTrack.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 mb-10">
                <Checkbox id="aware" checked={aware} onCheckedChange={(val) => setAware(val as boolean)} className="h-5 w-5 border-blue-500 text-blue-500" />
                <Label htmlFor="aware" className="text-base text-gray-700 cursor-pointer">Confirmo que estou ciente e quero prosseguir</Label>
              </div>

              <div className="flex justify-between items-center mt-8">
                <Button variant="outline" className="text-blue-500 border-blue-200 hover:bg-blue-50" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                
                <div className="flex flex-col items-center gap-3">
                  <Button 
                    className="bg-[#0095FF] hover:bg-[#0080FF] text-white px-8"
                    onClick={() => setStep(3)}
                    disabled={!aware}
                  >
                    Conectar o método Coexistence
                  </Button>
                  <Button variant="outline" className="text-[#0095FF] border-[#0095FF]">
                    Conectar com outro método
                  </Button>
                </div>

                <Button variant="ghost" className="text-gray-400">
                  Conectar Depois
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex justify-between items-end mb-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                  Escanear QR Code
                </h1>
                <span className="text-sm font-medium text-gray-400 mb-1">Passo 3 de 4</span>
              </div>
              <Progress value={75} className="h-2 mb-6 bg-gray-100" indicatorClass="bg-emerald-500" />

              <p className="text-gray-500 mb-8">
                A configuração é rápida e funciona igual ao WhatsApp Web: basta escanear um QR Code com o celular do número que você quer conectar. Após escanear o QR Code, basta aguardar.
              </p>

              <h4 className="font-semibold text-gray-700 flex items-center mb-4">
                <Smartphone className="h-5 w-5 mr-2" />
                Se não estiver com o smartphone, compartilhe o link abaixo com o responsável
              </h4>

              <div className="bg-[#1C2025] rounded-md p-3 flex justify-between items-center mb-4">
                <code className="text-gray-300 text-sm truncate flex-1 mr-4">
                  https://c.watrack.app/whatsapp-qrcode/98225881-c81f-42...
                </code>
                <Button size="sm" variant="secondary" className="bg-white text-black hover:bg-gray-100">
                  Copiar
                </Button>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center mb-10">
                <span className="text-red-500 font-bold mr-2 bg-red-100 rounded-full w-6 h-6 flex items-center justify-center">!</span>
                <p className="text-sm text-red-700">
                  <strong>Atenção! Não envie print ou captura</strong> do QR Code, pois não vai funcionar. <strong>Envie o link acima.</strong>
                </p>
              </div>

              <div className="flex gap-10">
                 <div className="w-1/3 flex flex-col items-center">
                    <div className="w-48 h-48 bg-gray-100 mb-4 p-2 rounded-md">
                      {/* Fake QR code */}
                      <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=watrack-auth-token-12345" alt="QR Code" className="w-full h-full mix-blend-multiply" />
                    </div>
                    <p className="text-center text-sm text-gray-400 mb-4">
                      Caso o QR Code não esteja funcionando, gere um novo.
                    </p>
                    <Button variant="secondary" className="w-full text-sky-600 bg-sky-50 hover:bg-sky-100">
                      Gerar Novo QR Code
                    </Button>
                 </div>

                 <div className="w-2/3">
                    <div className="flex gap-2 mb-6">
                      <Button variant="secondary" className="flex-1 bg-gray-100 text-gray-800">
                        Android
                      </Button>
                      <Button variant="ghost" className="flex-1 text-gray-400">
                         iPhone
                      </Button>
                    </div>

                    <ol className="space-y-4 text-gray-600 text-sm">
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">1</strong> <strong>Abra o WhatsApp</strong> no seu smartphone</li>
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">2</strong> Toque no <strong>ícone</strong> ⋮ no canto superior direito</li>
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">3</strong> Toque em <strong>Aparelhos conectados</strong></li>
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">4</strong> Toque em <strong>Conectar um Aparelho</strong></li>
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">5</strong> <strong>Aponte</strong> seu smartphone para o QR Code</li>
                      <li className="flex items-center"><strong className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-3 text-gray-800">6</strong> <strong>Pronto!</strong> Agora basta aguardar a conexão com o WaTrack</li>
                    </ol>
                 </div>
              </div>

              <div className="flex justify-between items-center mt-10">
                <Button variant="outline" className="text-blue-500 border-blue-200 hover:bg-blue-50" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                 <Button 
                    className="bg-[#0095FF] hover:bg-[#0080FF] text-white px-8"
                    onClick={() => setStep(4)}
                  >
                    Simular sucesso (dev)
                  </Button>
              </div>
            </div>
          )}

           {/* STEP 4 */}
           {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex justify-between items-end mb-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                  Parabéns! 🎉<br/>WhatsApp conectado com sucesso.
                </h1>
                <span className="text-sm font-medium text-gray-400 mb-1">Passo 4 de 4</span>
              </div>
              <Progress value={100} className="h-2 mb-10 bg-gray-100" indicatorClass="bg-emerald-500" />

              <div className="space-y-6 text-gray-600 leading-relaxed mb-10">
                <p>
                  Agora, o WaTrack já consegue rastrear todas as conversas que chegam pelo WhatsApp — mas para transformar esses contatos em resultados reais, precisamos dar o próximo passo: <strong>saber se a venda foi realizada.</strong>
                </p>
                <p>
                  Ao configurar uma frase gatilho da venda, você garante que o WaTrack registre automaticamente cada conversão, facilitando a geração de relatórios completos de quantos leads chegaram e quantos converteram.
                </p>
                <p className="font-semibold text-gray-800">
                  Vamos acompanhar suas vendas de verdade e ter dados confiáveis sempre à mão?
                </p>
              </div>

              <div className="flex justify-end items-center">
                 <Button className="bg-[#0095FF] hover:bg-[#0080FF] text-white px-8">
                    Definir Frase Gatilho de Venda <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
