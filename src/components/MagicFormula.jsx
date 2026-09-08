import React, { useState } from 'react';
import { Search, Info, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';

const MagicFormula = () => {
  const [inputValue, setInputValue] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setError('');
    
    const tickers = inputValue.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
    
    if (tickers.length < 5 || tickers.length > 10) {
      setError('Por favor, insira entre 5 e 10 tickers separados por vírgula.');
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('investoria_token');
      const response = await fetch(`/api/formula-magica?tickers=${tickers.join(',')}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Erro ao buscar dados da API');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0A0F1C] text-[#F8FAFC]">
      {/* Header Premium */}
      <div className="bg-[#121A2F] border-b border-[#334155] px-10 py-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <TrendingUp className="text-amber-500" size={28} />
            </div>
            <h1 className="text-4xl font-bold text-[#F8FAFC] tracking-tight">Fórmula Mágica de Joel Greenblatt</h1>
          </div>
          <p className="text-[#94A3B8] text-xl leading-relaxed">
            Metodologia clássica de Joel Greenblatt. Insira de 5 a 10 tickers para ranquear as melhores oportunidades na bolsa baseadas em P/L e ROE.
          </p>
        </div>
        
        <div className="w-full xl:w-auto flex-1 max-w-2xl">
          <div className="relative flex shadow-2xl rounded-xl overflow-hidden border-2 border-[#334155] focus-within:ring-4 focus-within:ring-amber-500/20 focus-within:border-amber-500 transition-all bg-[#1E293B]">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Search className="h-6 w-6 text-[#94A3B8]" />
            </div>
            <input
              type="text"
              className="block w-full pl-14 pr-4 py-5 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none text-xl bg-transparent"
              placeholder="Ex: PETR4, VALE3, ITUB4, WEGE3, BBDC4"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-10 py-5 bg-amber-500 hover:bg-amber-600 text-[#0A0F1C] font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-3 text-xl"
            >
              {loading ? <RefreshCw className="animate-spin h-6 w-6" /> : 'Analisar'}
            </button>
          </div>
          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-base font-medium">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden p-10 flex flex-col">
        {!data && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 bg-[#121A2F] rounded-3xl border border-[#334155] shadow-lg">
            <div className="w-28 h-28 bg-[#1E293B] rounded-full flex items-center justify-center mb-8 border border-[#334155]">
              <Search className="text-[#64748B] w-12 h-12" />
            </div>
            <h3 className="text-3xl font-semibold text-[#F8FAFC] mb-4 tracking-tight">Pronto para Analisar</h3>
            <p className="text-[#94A3B8] text-xl max-w-lg leading-relaxed">
              Digite os tickers das empresas na barra de busca acima para iniciar o cruzamento de indicadores e revelar as melhores ações.
            </p>
          </div>
        )}

        {loading && (
           <div className="flex-1 flex flex-col items-center justify-center text-center bg-[#121A2F] rounded-3xl border border-[#334155] shadow-lg">
             <RefreshCw className="animate-spin text-amber-500 w-16 h-16 mb-6" />
             <h3 className="text-2xl font-semibold text-[#F8FAFC] mb-2">Processando Indicadores...</h3>
             <p className="text-[#94A3B8] text-lg">Buscando P/L e ROE atualizados para realizar o ranqueamento.</p>
           </div>
        )}

        {data && !loading && data.length > 0 && (
          <div className="bg-[#121A2F] rounded-3xl shadow-2xl border border-[#334155] flex flex-col h-full relative overflow-hidden">
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse min-w-full">
                <thead className="sticky top-0 bg-[#1E293B]/95 backdrop-blur-md z-10 shadow-sm border-b border-[#334155]">
                  <tr>
                    <th className="px-10 py-6 text-sm font-bold text-[#94A3B8] uppercase tracking-widest">
                      Nome da Ação
                    </th>
                    <th className="px-10 py-6 text-sm font-bold text-[#94A3B8] uppercase tracking-widest text-right">
                      P/L
                    </th>
                    <th className="px-10 py-6 text-sm font-bold text-[#94A3B8] uppercase tracking-widest text-right group relative">
                      <div className="flex items-center justify-end gap-2 cursor-help">
                        Nota P/L
                        <Info size={16} className="text-[#64748B] group-hover:text-amber-500 transition-colors" />
                      </div>
                      <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-sm rounded-lg py-3 px-4 right-10 top-14 whitespace-nowrap z-20 pointer-events-none shadow-2xl border border-[#334155]">
                        Ações mais baratas recebem as menores notas
                      </div>
                    </th>
                    <th className="px-10 py-6 text-sm font-bold text-[#94A3B8] uppercase tracking-widest text-right">
                      ROE (%)
                    </th>
                    <th className="px-10 py-6 text-sm font-bold text-[#94A3B8] uppercase tracking-widest text-right group relative">
                      <div className="flex items-center justify-end gap-2 cursor-help">
                        Nota ROE
                        <Info size={16} className="text-[#64748B] group-hover:text-amber-500 transition-colors" />
                      </div>
                      <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-sm rounded-lg py-3 px-4 right-10 top-14 whitespace-nowrap z-20 pointer-events-none shadow-2xl border border-[#334155]">
                        Ações mais lucrativas recebem as menores notas
                      </div>
                    </th>
                    <th className="px-10 py-6 text-sm font-black text-amber-500 uppercase tracking-widest text-right">
                      Pontuação Final
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155] bg-[#121A2F]">
                  {data.map((item, index) => {
                    const isTop3 = index < 3;
                    return (
                      <tr 
                        key={item['Nome da Ação']} 
                        className={`hover:bg-[#1E293B]/50 transition-colors group ${isTop3 ? 'bg-amber-500/5' : ''}`}
                      >
                        <td className="px-10 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base ${isTop3 ? 'bg-amber-500 text-[#0A0F1C] shadow-lg shadow-amber-500/20' : 'bg-[#1E293B] text-[#94A3B8]'}`}>
                              {index + 1}º
                            </div>
                            <span className="font-bold text-[#F8FAFC] text-xl">{item['Nome da Ação']}</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-lg text-[#94A3B8] text-right font-medium">
                          {item['P/L']}
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-lg text-[#94A3B8] text-right">
                          <span className="bg-[#1E293B] px-3 py-1 rounded-md text-[#F8FAFC] font-semibold border border-[#334155]">{item['Nota P/L']}</span>
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-lg text-[#94A3B8] text-right font-medium">
                          {item['ROE (%)']}
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-lg text-[#94A3B8] text-right">
                          <span className="bg-[#1E293B] px-3 py-1 rounded-md text-[#F8FAFC] font-semibold border border-[#334155]">{item['Nota ROE']}</span>
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-2xl font-black text-[#F8FAFC] text-right">
                          {item['Pontuação Final']}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicFormula;
