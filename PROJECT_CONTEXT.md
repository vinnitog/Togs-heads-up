# PROJECT_CONTEXT.md - Togs-heads-up

Gerado em: 2026-06-26 12:33:09

## Descricao

Aplicacao de uso pessoal de alertas sobre acidentes, ocorrencias e perigos na cidade de Marília-SP

## Objetivo

Alertar sobre acidentes, ocorrencias policiais e demais problemas que estão ocorrendo na cidade em tempo real

## Publico Alvo

Nao definido

## Caracteristicas Informadas

- Interface visual: Sim
- Login/autenticacao: Nao
- Banco de dados: Nao
- Offline/PWA: Sim
- Mobile: Sim
- Dashboard/graficos: Sim
- API propria: Nao
- Integracoes externas: Sim
- Multiusuario: Nao

## Stack Escolhida

```text
React + Vite + Recharts
```

## Motivo Da Stack

Dashboards costumam ter componentes reutilizaveis, filtros, estados e graficos. React + Recharts cobre isso com baixo atrito.

## Alternativas Rejeitadas

HTML/CSS/JS vanilla: possivel, mas tende a ficar disperso com muitos widgets. Supabase: adiar ate existir necessidade clara de persistencia/autenticacao.

## Revisao Obrigatoria De Stack

Antes da primeira feature real, o `senior-dev` deve validar se a stack escolhida ainda faz sentido.

Se houver front-end, `ui-ux-expert` deve validar impacto visual e UX.

O `code-reviewer` deve apontar risco de stack inadequada, excesso de complexidade ou falta de base para evolucao.

## Workflow Padrao

1. `senior-dev`
2. `ui-ux-expert`, quando houver front-end
3. `code-reviewer`
4. `qa-senior`
5. `qa-automate`
6. Validacao final com testes e diff
7. Commit/push em `develop` e PR `develop -> main`

## Comandos De Validacao

```powershell
.\test.cmd
npm.cmd test
git diff --check
```

## Notas De Escopo

- Trabalhar sempre em `develop`.
- Nunca fazer push direto para `main`.
- Preservar alteracoes existentes do usuario.
- Fazer staging explicito por arquivo.
- Manter documentacao de contexto versionada neste arquivo.

