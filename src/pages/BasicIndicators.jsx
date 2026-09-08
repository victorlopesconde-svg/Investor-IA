import React, { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';

const INDICATORS_DATA = [
  {
    category: 'All-rounders',
    items: [
      {
        name: 'P/L',
        description: 'Avalia a relação entre preço e lucro de uma ação. Pode ser interpretado como o tempo em que o acionista vai ter o seu dinheiro de volta através do lucro da empresa ao longo dos anos.',
        howToAnalyze: 'Quanto menor, melhor.',
        attention: 'Não é ideal para analisar empresas de crescimento, pois elas abrem mão de parte do lucro presente para reinvestirem no próprio negócio. Além disso, valores negativos significam que a empresa teve prejuízo.'
      },
      {
        name: 'P/VP',
        description: 'Avalia a relação entre preço de mercado e o valor patrimonial de uma empresa.',
        howToAnalyze: 'Quanto menor, melhor.',
        attention: 'Cuidado com valores muito baixos, podem apresentar um risco oculto aos olhos dos investidores.'
      },
      {
        name: 'EV/EBITDA',
        description: 'Semelhante ao P/L, mas leva em consideração a dívida líquida e ignora o efeito dos juros, impostos, depreciação e amortização.',
        howToAnalyze: 'Quanto menor, melhor.',
        attention: 'Pode ter um resultado muito favorável por não incluir despesas de capital, que para algumas empresas podem ser uma despesa enorme.'
      }
    ]
  },
  {
    category: 'Rentabilidade',
    items: [
      {
        name: 'ROE',
        description: 'Avalia o desempenho de uma empresa ao usar recursos próprios e os de acionistas.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Valores negativos indicam que a empresa não gerou lucro no período.'
      },
      {
        name: 'ROIC',
        description: 'Avalia o desempenho de uma empresa ao usar todos os seus recursos.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Não aplicável a bancos porque o capital de terceiros faz parte da atividade operacional do banco.'
      }
    ]
  },
  {
    category: 'Endividamento',
    items: [
      {
        name: 'DL/EBITDA',
        description: 'Avalia a capacidade que uma empresa tem de honrar com as dívidas.',
        howToAnalyze: 'Quanto menor, melhor.',
        attention: 'Cuidado para valores acima de 3. Preferencialmente, abaixo de 2.'
      },
      {
        name: 'DL/PL',
        description: 'Avalia o grau de endividamento de uma empresa.',
        howToAnalyze: 'Quanto menor, melhor.',
        attention: 'Cuidado para valores acima de 1. Preferencialmente, abaixo de 0,5.'
      }
    ]
  },
  {
    category: 'Crescimento',
    items: [
      {
        name: 'CAGR Receita',
        description: 'Avaliar a taxa de crescimento da receita nos últimos 5 anos.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Distorções em períodos específicos podem distorcer o valor desse indicador.'
      },
      {
        name: 'CAGR Lucro',
        description: 'Avaliar a taxa de crescimento do lucro nos últimos 5 anos.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Distorções em períodos específicos podem distorcer o valor desse indicador.'
      }
    ]
  },
  {
    category: 'Governança',
    items: [
      {
        name: 'CVM 44 (antiga CVM 358)',
        description: 'Aponta movimentações internas dos membros da companhia.',
        howToAnalyze: 'Controladores comprando = bom sinal; Controladores vendendo = pode ser um sinal ruim.',
        attention: 'Essas informações podem demorar até 1 mês para chegar ao investidor através de um fato relevante.'
      }
    ]
  },
  {
    category: 'Dividendos',
    items: [
      {
        name: 'DY',
        description: 'Avalia a proporção de dividendos pagos em relação ao preço da ação.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Esse indicador mistura valores do passado (dividendo) com valores do futuro (preço do ativo)'
      },
      {
        name: 'CAGR Dividendos',
        description: 'Avaliar a taxa de crescimento dos dividendos pagos nos últimos 5 anos.',
        howToAnalyze: 'Quanto maior, melhor.',
        attention: 'Distorções em períodos específicos podem distorcer o valor desse indicador.'
      },
      {
        name: 'Payout',
        description: 'Avalia a proporção do lucro distribuída como dividendos aos acionistas.',
        howToAnalyze: 'Deve estar num nível controlado.',
        attention: 'Valores acima de 60% podem impactar na constância da distribuição dos dividendos futuros.'
      }
    ]
  }
];

export default function BasicIndicators() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = INDICATORS_DATA.map(category => ({
    ...category,
    items: category.items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(category => category.items.length > 0);

  return (
    <div className="w-full h-full flex flex-col items-center bg-[#0A0F1C] overflow-hidden p-6 md:p-8">
      
      {/* HEADER SECTION */}
      <div className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 mt-6 relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-[#121A2F] border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.15)]">
              <BookOpen className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-serif-display text-white tracking-tight">Indicadores Fundamentalistas Básicos</h1>
              <p className="text-sm text-zinc-400 uppercase tracking-widest mt-1">Seu Guia Rápido de Análise</p>
            </div>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="relative w-full md:w-80 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
          </div>
          <input
            type="text"
            className="w-full bg-[#121A2F] border border-white/10 text-white rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-zinc-600"
            placeholder="Buscar indicador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* TABLE CONTAINER */}
      <div className="w-full max-w-6xl flex-1 overflow-auto rounded-xl border border-white/5 bg-[#0C1222]/80 backdrop-blur-xl shadow-2xl relative z-10 custom-scrollbar mb-8">
        
        {/* DESKTOP TABLE */}
        <div className="hidden md:block min-w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#121A2F] text-zinc-300 font-sans text-sm tracking-wider uppercase border-b border-white/10 sticky top-0 z-20 shadow-sm">
                <th className="py-4 px-6 font-semibold w-[20%]">Indicadores</th>
                <th className="py-4 px-6 font-semibold w-[30%]">O que é</th>
                <th className="py-4 px-6 font-semibold w-[20%]">Como analisar</th>
                <th className="py-4 px-6 font-semibold w-[30%]">Pontos de atenção</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-zinc-500">
                    Nenhum indicador encontrado para "{searchTerm}".
                  </td>
                </tr>
              )}
              {filteredData.map((category, catIdx) => (
                <React.Fragment key={category.category}>
                  {category.items.map((item, itemIdx) => (
                    <tr 
                      key={item.name} 
                      className={`group hover:bg-white/[0.02] transition-colors border-b border-white/5 ${itemIdx === category.items.length - 1 ? 'border-b-white/10' : ''}`}
                    >
                      {/* CATEGORY & INDICATOR NAME */}
                      <td className="py-4 px-6 align-top border-r border-white/5">
                        {itemIdx === 0 && (
                          <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                            {category.category}
                          </span>
                        )}
                        <span className="inline-block font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 rounded-md text-sm font-semibold shadow-[0_0_10px_rgba(34,211,238,0.05)] group-hover:bg-cyan-400/20 transition-colors">
                          {item.name}
                        </span>
                      </td>

                      {/* DESCRIPTION */}
                      <td className="py-4 px-6 align-top text-zinc-300 text-sm leading-relaxed pr-8">
                        {item.description}
                      </td>

                      {/* HOW TO ANALYZE */}
                      <td className="py-4 px-6 align-top">
                        <span className="inline-flex items-center text-emerald-400/90 text-sm bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-md leading-snug">
                          {item.howToAnalyze}
                        </span>
                      </td>

                      {/* POINTS OF ATTENTION */}
                      <td className="py-4 px-6 align-top text-zinc-400 text-sm leading-relaxed border-l border-white/5 pl-8">
                        {item.attention}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden flex flex-col gap-6 p-4">
          {filteredData.length === 0 && (
            <div className="py-12 text-center text-zinc-500">
              Nenhum indicador encontrado para "{searchTerm}".
            </div>
          )}
          {filteredData.map((category) => (
            <div key={category.category}>
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-3 ml-2">{category.category}</h3>
              <div className="flex flex-col gap-4">
                {category.items.map((item) => (
                  <div key={item.name} className="bg-[#121A2F] rounded-lg border border-white/5 p-5 shadow-lg">
                    <div className="mb-4">
                      <span className="inline-block font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-3 py-1 rounded text-base font-bold">
                        {item.name}
                      </span>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">O que é</h4>
                        <p className="text-zinc-300 text-sm leading-relaxed">{item.description}</p>
                      </div>
                      
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Como analisar</h4>
                        <span className="inline-flex text-emerald-400 text-sm bg-emerald-400/10 px-2 py-1 rounded leading-snug">
                          {item.howToAnalyze}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Pontos de atenção</h4>
                        <p className="text-amber-400/90 text-sm leading-relaxed bg-amber-400/10 p-3 rounded-md border border-amber-400/20">
                          {item.attention}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
