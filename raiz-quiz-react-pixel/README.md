# Competição DFS ao vivo

Quiz multiplayer em React, com servidor Node.js: cada participante entra com seu nome no próprio celular, responde às mesmas perguntas e disputa um lugar no pódio. O apresentador controla a partida pelo computador. Mantém o visual em pixel art e as 15 perguntas baseadas nos 14 slides de `Dominando_o_DFS_(3).pdf`.

A criação de salas é exclusiva para administradores autenticados. Configure `ADMIN_PASSWORD` no servidor (12 a 256 caracteres), clique em **Acesso de administrador** e entre com essa senha para liberar o botão de criação. Participantes usam apenas código e nome. Veja [como configurar o acesso no Render e localmente](ADMIN.md). Sem a senha configurada, criar salas fica bloqueado.

Para jogar pela internet, siga [o passo a passo de publicação na Vercel e no Render](DEPLOY_VERCEL.md). A interface usa `VITE_API_URL` para acessar a API remota; o servidor usa `ALLOWED_ORIGINS` para autorizar o site e `PUBLIC_SITE_URL` para gerar convites públicos. Sem essas variáveis, o modo local continua disponível.

## Executar a competição

Requer Node.js 22.12+ e npm. Depois de instalar as dependências com `npm ci`:

```sh
npm run build
npm run preview
```

Antes de iniciar, defina `ADMIN_PASSWORD` em um arquivo `.env` local, ignorado pelo Git. Abra o endereço **Local** exibido no terminal, entre pelo **Acesso de administrador** e clique em **Criar sala de competição**. A sala mostra o código de seis dígitos e um endereço da rede para os celulares.

1. Conecte o computador e os celulares à mesma rede Wi-Fi.
2. Compartilhe o **endereço para os celulares** exibido dentro da sala. Cada pessoa abre o link, informa o nome e entra. O link preenche o código automaticamente.
3. Espere os nomes aparecerem e clique em **Iniciar competição**. É possível jogar com 1 a 100 participantes.
4. A correção aparece quando todos respondem ou o prazo termina. O apresentador clica em **Próxima pergunta** depois de discutir a correção.
5. Após a última rodada, clique em **Revelar o pódio**. Os três primeiros aparecem em destaque, seguidos da classificação completa.

Mantenha o terminal aberto durante a partida. Ao alterar o código, execute `npm run build` novamente e reinicie o preview. As salas são mantidas na memória do processo: reiniciar o servidor encerra as salas existentes.

### Acesso pelos celulares

O celular deve usar o endereço IP da rede mostrado na sala, por exemplo `http://192.168.1.10:4173/?sala=123456`. `localhost` no celular aponta para o próprio celular, e não para o computador do apresentador.

Se o computador tiver várias interfaces, escolha na sala o endereço correspondente ao Wi-Fi. Se a página não abrir, confira se a rede permite comunicação entre dispositivos e se o Windows permite o Node.js na rede privada. Redes de convidados e algumas redes institucionais isolam os dispositivos. O projeto não altera o firewall automaticamente.

## Pontuação e tempo

- Perguntas comuns: **45 segundos**. Perguntas com código: **60 segundos**.
- Uma única resposta por participante em cada rodada, sem alteração após o envio.
- Acerto: **500 pontos + bônus de até 500 pontos pela rapidez**. Fórmula: `arredondar(500 + 500 × tempo_restante / tempo_total)`.
- Resposta errada ou sem resposta até o fim do prazo: **0 pontos**.
- Desempate: mais acertos, menor soma dos tempos das respostas corretas e ordem de entrada.
- O servidor determina o prazo, valida as respostas e calcula a pontuação. O gabarito e os pontos da rodada são liberados na correção.

O navegador tenta reconectar automaticamente. Atualizar a mesma aba preserva a entrada do participante e a resposta já enviada enquanto a sala existir. O relógio continua correndo durante uma desconexão. Fechar a aba pode perder a credencial de entrada, guardada em `sessionStorage`.

## Desenvolvimento e verificação

```sh
npm run dev
npm test
npm run build
```

Os testes também requerem Python 3 disponível como `python`, sem bibliotecas adicionais, para executar os exemplos das perguntas. A suíte verifica as perguntas, os códigos Python, sala e credenciais, validação de respostas, prazos, pontuação, classificação, reconexão e a API com eventos em tempo real.

Para servir o build sem Vite:

```sh
npm run build
npm start
```

O servidor Node abre em `http://localhost:3000` e aceita conexões na rede. A variável de ambiente `PORT` permite escolher outra porta. `npm run dev`, `npm run preview` e `npm start` incluem a API multiplayer. **Hospedagem somente de arquivos estáticos não suporta a competição**; uma publicação precisa executar o servidor Node e permitir conexões SSE duradouras.

## Organização

- `src/competition.jsx`: entrada, sala de espera, rodadas, cronômetro, correções, ranking e pódio.
- `src/competition.css`: interface da competição e adaptação para celular.
- `src/main.jsx`: ícones, diagrama das árvores e montagem do app.
- `src/questions.js`: perguntas, alternativas, gabaritos, explicações e referências em `sourceSlides`.
- `src/pixel-theme.css`: tema pixel art compartilhado.
- `server/game.js`: salas, participantes, fases, prazos e pontuação.
- `server/api.js`: API HTTP e atualizações por Server-Sent Events (SSE).
- `server/admin.js`: autenticação administrativa, expiração de sessões e limite de tentativas.
- `server/index.js`: servidor de produção que serve a API e `dist/`.
- `vite.config.js`: integração da mesma API nos modos dev e preview.
- `tests/game.test.js`: regras e integração multiplayer.
- `tests/quiz.test.js`: consistência das questões e execução dos exemplos Python.

## Conteúdo das perguntas

Exploração e backtracking, cores, tempos de descoberta e término, rastreamento da pilha, DFS recursiva e iterativa, LIFO, limite de recursão, complexidade, classificação de arestas, teorema dos parênteses, componentes conexos, DAGs e ordenação topológica.

As cores do material são branco (não descoberto), vermelho (ativo) e preto (finalizado). Os diagramas exploram os filhos da esquerda para a direita. Os códigos Python adaptam os slides para tornar os resultados observáveis e corrigem a linha duplicada do exemplo recursivo. A contagem de componentes por reinícios da DFS é delimitada a grafos não direcionados; a ordenação topológica exige um grafo direcionado sem ciclos.
