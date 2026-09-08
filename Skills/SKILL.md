# Skill:Padrões de Back-end do InvestorIA

**Contexto:**
Estamos construindo o InvestorIA, uma plataforma financeira utilizando Node.js e Express. O tema base é um Dark Mode institucional.

**Regras que a IA DEVE seguir sempre que criar ou editar rotas/controllers:**
1. **Segurança Primeiro:** NUNCA exponha rotas de teste ou endpoints de debug para produção. Remova logs desnecessários e comentários óbvios de "TODO" antes de finalizar.
2. **Validação:** Sempre valide os parâmetros de entrada (query params e body) usando Joi ou Zod.
3. **Tratamento de Erros:** Use um middleware de tratamento de erros global (Try-Catch) e retorne mensagens de erro claras em português.
4. **JSON:** Sempre retorne respostas em JSON válido.

**Como agir:**
Antes de escrever o código, sempre verifique se ele está de acordo com as 4 regras acima.