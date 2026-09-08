import React, { useState } from 'react';
import { Search, Scale, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CompareStocks = () => {
  const [inputValue, setInputValue] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Função para normalizar dados de 0 a 100
  const normalizeData = (metrics, tickerA, tickerB) => {
    const categories = [
      { key: 'P/L', inverse: true },
      { key: 'ROE', inverse: false },
      { key: 'ROA', inverse: false },
      { key: 'Margem Líquida', inverse: false },
      { key: 'DL/EBITDA', inverse: true },
      { key: 'Dividend Yield', inverse: false }
    ];

    return categories.map(cat => {
      const valA = metrics[tickerA][cat.key] || 0;
      const valB = metrics[tickerB][cat.key] || 0;

      let normA = 0, normB = 0;
      const max = Math.max(Math.abs(valA), Math.abs(valB), 0.001);

      if (cat.inverse) {
        if (valA <= 0 && valB > 0) { normA = 100; normB = 50; }
        else if (valA > 0 && valB <= 0) { normA = 50; normB = 100; }
        else {
          normA = valA <= valB ? 100 : (valB / valA) * 100;
          normB = valB <= valA ? 100 : (valA / valB) * 100;
        }
      } else {
        if (valA < 0 && valB < 0) { normA = 10; normB = 10; }
        else {
          normA = valA >= valB ? 100 : (valA / max) * 100;
          normB = valB >= valA ? 100 : (valB / max) * 100;
        }
      }

      return {
        subject: cat.key,
        [tickerA]: Math.max(10, normA),
        [tickerB]: Math.max(10, normB),
        rawA: valA,
        rawB: valB
      };
    });
  };

  const handleSearch = async () => {
    setError('');
    const tickers = inputValue.split(',').map(t => t.trim().toUpperCase()).filter(t => t);

    if (tickers.length !== 2) {
      setError('Por favor, insira exatamente 2 tickers separados por vírgula (Ex: PETR4, VALE3).');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('investoria_token');
      const response = await fetch(`/api/comparar?tickers=${tickers.join(',')}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Falha ao buscar dados da API');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatLargeNumber = (num) => {
    if (!num || num === 0) return 'R$ 0,00';
    if (Math.abs(num) >= 1.0e+9) return "R$ " + (num / 1.0e+9).toFixed(2) + " Bi";
    if (Math.abs(num) >= 1.0e+6) return "R$ " + (num / 1.0e+6).toFixed(2) + " Mi";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const formatValue = (key, value) => {
    if (['ROE', 'ROA', 'Margem Líquida', 'Margem Bruta', 'Margem EBITDA', 'Dividend Yield', 'CAGR Receita', 'CAGR Lucro'].includes(key)) {
      return `${(value * 100).toFixed(2)}%`;
    }
    if (['Lucro Bruto', 'Lucro Líquido', 'Receita Líquida', 'Patrimônio Líquido', 'Dívida Líquida'].includes(key)) {
      return formatLargeNumber(value);
    }
    return value.toFixed(2);
  };

  const getWinnerClass = (key, valA, valB) => {
    const inverse = ['P/L', 'Div/Patrimônio', 'P/VP', 'DL/EBITDA', 'Dívida Líquida'].includes(key);
    let aWins = inverse ? valA < valB : valA > valB;
    if (valA === valB) return '';
    return aWins ? 'A' : 'B';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0A0F1C] text-[#F8FAFC] p-3 rounded-lg shadow-2xl border border-[#334155] text-sm">
          <p className="font-semibold text-[#94A3B8] mb-2 border-b border-[#334155] pb-1">{payload[0].payload.subject}</p>
          <div className="flex flex-col gap-1">
            <span style={{ color: payload[0].stroke }} className="font-medium">
              {payload[0].name}: {formatValue(payload[0].payload.subject, payload[0].payload.rawA)}
            </span>
            <span style={{ color: payload[1].stroke }} className="font-medium">
              {payload[1].name}: {formatValue(payload[0].payload.subject, payload[1].payload.rawB)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const indicatorGroups = [
    { name: 'Valuation', items: ['P/L', 'P/VP', 'Dividend Yield'] },
    { name: 'Rentabilidade', items: ['ROE', 'ROA', 'Margem Bruta', 'Margem EBITDA', 'Margem Líquida'] },
    { name: 'Endividamento', items: ['Div/Patrimônio', 'DL/EBITDA', 'Dívida Líquida'] },
    { name: 'Crescimento', items: ['CAGR Receita', 'CAGR Lucro'] },
    { name: 'Demonstrativo', items: ['Receita Líquida', 'Lucro Bruto', 'Lucro Líquido', 'Patrimônio Líquido'] }
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#0A0F1C] text-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#121A2F] border-b border-[#334155] px-10 py-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Scale className="text-indigo-400" size={28} />
            </div>
            <h1 className="text-4xl font-bold text-[#F8FAFC] tracking-tight">Compare Ações</h1>
          </div>
          <div className="space-y-2">
            <p className="text-[#F8FAFC] text-xl font-medium">
              Ao digitar dois ticker a IA recomendará qual ação é a melhor.
            </p>
            <p className="text-[#94A3B8] text-lg leading-relaxed italic">
              (Isto é uma recomendação da IA e analisa apenas os indicadores fundamentalistas. Sempre veja a composição acionária e os fatos relevantes da empresa.)
            </p>
          </div>
        </div>

        <div className="w-full xl:w-auto flex-1 max-w-2xl">
          <div className="relative flex shadow-2xl rounded-xl overflow-hidden border-2 border-[#334155] focus-within:ring-4 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all bg-[#1E293B]">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Search className="h-6 w-6 text-[#94A3B8]" />
            </div>
            <input
              type="text"
              className="block w-full pl-14 pr-4 py-5 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none text-xl bg-transparent uppercase"
              placeholder="Ex: PETR4, VALE3"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-3 text-xl"
            >
              {loading ? <RefreshCw className="animate-spin h-6 w-6" /> : 'Comparar'}
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
      <div className="flex-1 overflow-auto p-10">
        {!data && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 bg-[#121A2F] rounded-3xl border border-[#334155] shadow-lg min-h-[500px]">
            <div className="w-28 h-28 bg-[#1E293B] rounded-full flex items-center justify-center mb-8 border border-[#334155]">
              <Scale className="text-indigo-400 w-12 h-12" />
            </div>
            <h3 className="text-3xl font-semibold text-[#F8FAFC] mb-4 tracking-tight">Pronto para o Combate</h3>
            <p className="text-[#94A3B8] text-xl max-w-lg leading-relaxed">
              Digite exatamente 2 tickers acima para que a nossa IA cruze os dados e emita o veredito final.
            </p>
          </div>
        )}

        {loading && (
          <div className="h-full flex flex-col items-center justify-center text-center bg-[#121A2F] rounded-3xl border border-[#334155] shadow-lg min-h-[500px]">
            <RefreshCw className="animate-spin text-indigo-500 w-16 h-16 mb-6" />
            <h3 className="text-2xl font-semibold text-[#F8FAFC] mb-2">Analisando Balanços...</h3>
            <p className="text-[#94A3B8] text-lg">A IA está processando os indicadores em tempo real.</p>
          </div>
        )}

        {data && !loading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="flex flex-col gap-8">
              {/* Radar Chart */}
              <div className="bg-[#121A2F] p-6 rounded-3xl shadow-lg border border-[#334155]">
                <h3 className="text-xl font-bold text-[#F8FAFC] mb-6 flex items-center gap-2">
                  <Scale className="text-indigo-400" size={24} />
                  Equilíbrio Fundamentalista
                </h3>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={normalizeData(data.metrics, Object.keys(data.metrics)[0], Object.keys(data.metrics)[1])}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94A3B8', fontSize: 13, fontWeight: 600 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Radar name={Object.keys(data.metrics)[0]} dataKey={Object.keys(data.metrics)[0]} stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
                      <Radar name={Object.keys(data.metrics)[1]} dataKey={Object.keys(data.metrics)[1]} stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-8 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[#6366f1]"></div>
                    <span className="font-semibold text-[#F8FAFC]">{Object.keys(data.metrics)[0]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[#10b981]"></div>
                    <span className="font-semibold text-[#F8FAFC]">{Object.keys(data.metrics)[1]}</span>
                  </div>
                </div>
              </div>

              {/* Table (XAI) */}
              <div className="bg-[#121A2F] p-6 rounded-3xl shadow-lg border border-[#334155]">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-4 px-4 border-b border-[#334155] text-[#94A3B8] font-semibold">Indicador</th>
                      <th className="py-4 px-4 border-b border-[#334155] font-bold text-indigo-400 text-right">{Object.keys(data.metrics)[0]}</th>
                      <th className="py-4 px-4 border-b border-[#334155] font-bold text-emerald-400 text-right">{Object.keys(data.metrics)[1]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#334155]/30">
                    {indicatorGroups.map(group => (
                      <React.Fragment key={group.name}>
                        <tr className="bg-[#1E293B]/50">
                          <td colSpan="3" className="py-2 px-4 text-xs font-bold text-indigo-400 uppercase tracking-widest">{group.name}</td>
                        </tr>
                        {group.items.map(key => {
                          const tA = Object.keys(data.metrics)[0];
                          const tB = Object.keys(data.metrics)[1];
                          const valA = data.metrics[tA][key] || 0;
                          const valB = data.metrics[tB][key] || 0;
                          const winner = getWinnerClass(key, valA, valB);

                          return (
                            <tr key={key} className="hover:bg-[#1E293B]/30 transition-colors">
                              <td className="py-4 px-4 font-medium text-[#F8FAFC]">{key}</td>
                              <td className={`py-4 px-4 text-right font-bold ${winner === 'A' ? 'text-[#10B981] bg-[#10B981]/10' : 'text-[#94A3B8]'}`}>
                                {formatValue(key, valA)}
                              </td>
                              <td className={`py-4 px-4 text-right font-bold ${winner === 'B' ? 'text-[#10B981] bg-[#10B981]/10' : 'text-[#94A3B8]'}`}>
                                {formatValue(key, valB)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Verdict */}
            <div className="bg-[#121A2F] rounded-3xl shadow-lg border border-[#334155] overflow-hidden flex flex-col h-full">
              <div className="bg-[#1E293B] p-8 flex items-center gap-4 border-b border-[#334155]">
                <div className="p-3 bg-indigo-500/20 rounded-xl">
                  <Sparkles className="text-indigo-400" size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#F8FAFC]">Veredito da Inteligência Artificial</h3>
                  <p className="text-[#94A3B8]">Análise fundamentalista automatizada</p>
                </div>
              </div>
              <div className="p-10 flex-1 overflow-auto bg-[#121A2F]">
                <div className="prose prose-invert prose-lg max-w-none text-[#F8FAFC] leading-relaxed space-y-6">
                  {data.verdict.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="first-letter:text-4xl first-letter:font-bold first-letter:text-indigo-400 first-letter:mr-2">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompareStocks;
