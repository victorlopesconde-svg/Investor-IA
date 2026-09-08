# Skill: Padrões de Front-end do InvestorIA

**Contexto:**
Nós estamos construindo o InvestorIA, uma plataforma financeira usando React e Vite. O tema base é um Dark Mode institucional.

**Regras que a IA DEVE seguir sempre que criar ou editar componentes:**
1. **Estilização:** NUNCA use TailwindCSS ou CSS-in-JS. Sempre use Vanilla CSS (arquivos `.css` separados) utilizando as variáveis CSS que estão no nosso `index.css`.
2. **Cores Semânticas:** Sempre use `var(--signal-profit)` para valores positivos e `var(--signal-loss)` para negativos. Nunca decore a tela com vermelho e verde sem motivo.
3. **Estado:** Para requisições assíncronas, sempre crie estados de `isLoading` e `error`.
4. **Ícones:** Sempre use a biblioteca `lucide-react`.

**Como agir:**
Antes de escrever o código, sempre verifique se ele está de acordo com as 4 regras acima.
