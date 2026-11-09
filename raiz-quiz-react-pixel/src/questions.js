// Árvores ordenadas: os filhos são explorados da esquerda para a direita.
export const binaryTree = {
  id: 'binary', label: 'Árvore binária: A tem filhos B e C; B tem D e E; C tem F e G.',
  nodes: [['A', 260, 40], ['B', 140, 135], ['C', 380, 135], ['D', 80, 230], ['E', 200, 230], ['F', 320, 230], ['G', 440, 230]],
  edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['C', 'G']],
};
export const generalTree = {
  id: 'general', label: 'R tem filhos A, B e C, nesta ordem. A tem filho D. B é folha. C tem filhos E e F.',
  nodes: [['R', 260, 40], ['A', 100, 135], ['B', 260, 135], ['C', 420, 135], ['D', 100, 230], ['E', 360, 230], ['F', 480, 230]],
  edges: [['R', 'A'], ['R', 'B'], ['R', 'C'], ['A', 'D'], ['C', 'E'], ['C', 'F']],
};

// Base: Dominando_o_DFS_(3).pdf, 14 slides.
// Branco = não descoberto; vermelho = ativo; preto = finalizado.
export const questions = [
  {
    id: 1, topic: 'Intuição da DFS', tree: 'binary', sourceSlides: [2],
    title: 'Como começa o mergulho em profundidade?',
    prompt: 'Na árvore ilustrada, comece em A e escolha sempre o filho mais à esquerda ainda não descoberto. Quais são os três primeiros vértices descobertos?',
    options: ['A → B → C', 'A → B → D', 'D → B → A', 'A → C → G'], correct: 1,
    explanation: 'A DFS segue um ramo o mais fundo possível antes de voltar. Ela descobre A, segue para B e depois para D. Visitar C logo depois de B corresponderia a trocar de ramo antes de aprofundar B.',
  },
  {
    id: 2, topic: 'Regra das três cores', sourceSlides: [3, 14],
    title: 'O que cada cor informa sobre um vértice?',
    prompt: 'Qual alternativa associa corretamente branco, vermelho e preto aos estados de um vértice na DFS recursiva?',
    options: ['Branco: finalizado; vermelho: não descoberto; preto: ativo.', 'Branco: ativo; vermelho: finalizado; preto: não descoberto.', 'Branco: não descoberto; vermelho: finalizado; preto: ativo.', 'Branco: não descoberto; vermelho: ativo na pilha; preto: finalizado.'], correct: 3,
    explanation: 'Branco indica que o vértice ainda não foi descoberto. Vermelho indica uma chamada ativa cuja exploração ainda não terminou. Preto indica que todos os vizinhos foram examinados e a chamada terminou.',
  },
  {
    id: 3, topic: 'Tempos de descoberta e término', sourceSlides: [4],
    title: 'Quando registrar d[u] e f[u]?',
    prompt: 'Um relógio global é incrementado em cada descoberta e finalização. Em quais momentos a DFS registra os tempos d[u] e f[u] do vértice u?',
    options: ['d[u] ao descobrir u; f[u] ao concluir sua exploração.', 'Ambos quando u é descoberto.', 'd[u] ao terminar u; f[u] ao descobrir u.', 'd[u] e f[u] apenas quando u pertence a um ciclo.'], correct: 0,
    explanation: 'd[u] marca a entrada no vértice, quando ele fica vermelho. f[u] marca a saída, quando ele fica preto. Como a descoberta vem antes do término, d[u] < f[u]. Os intervalos também permitem analisar ancestralidade.',
  },
  {
    id: 4, topic: 'Rastreamento em memória', tree: 'binary', sourceSlides: [6],
    title: 'O que permanece na memória depois de retornar de D?',
    prompt: 'A busca recursiva descobriu A, B e D. A chamada de D acaba de retornar, antes da descoberta de E. Qual é o conjunto visited e qual é a pilha de chamadas, da base ao topo?',
    options: ['visited = {A, B}; pilha = [dfs(A), dfs(B)].', 'visited = {D}; pilha = [dfs(D)].', 'visited = {A, B, D}; pilha = [dfs(A), dfs(B)].', 'visited = {A, B, D}; pilha = [dfs(A), dfs(B), dfs(D)].'], correct: 2,
    explanation: 'O conjunto visited guarda o histórico das descobertas; D continua nele depois do retorno. A pilha guarda apenas chamadas ativas. A chamada de D já terminou, enquanto A e B ainda aguardam a conclusão de seus ramos.',
  },
  {
    id: 5, topic: 'DFS recursiva em Python', tree: 'binary', sourceSlides: [5], codeLanguage: 'PYTHON',
    title: 'Quais vértices a chamada a partir de B alcança?',
    prompt: 'O código adapta o exemplo dos slides, retornando visited para facilitar a inspeção. tree contém somente os filhos de cada vértice do diagrama; folhas têm listas vazias. Qual conjunto dfs_recursive(tree, "B") retorna?',
    code: 'def dfs_recursive(tree, node, visited=None):\n    if visited is None:\n        visited = set()\n    visited.add(node)\n    for child in tree[node]:\n        if child not in visited:\n            dfs_recursive(tree, child, visited)\n    return visited',
    options: ['{A, B, D, E}', '{B, D, E}', '{B, C, D, E}', '{A, B, C, D, E, F, G}'], correct: 1,
    explanation: 'B alcança seus filhos D e E pelas listas de adjacência fornecidas. A função compartilha o mesmo conjunto entre as chamadas e devolve {B, D, E}. Não há ligação de B para seu pai A nessa representação.',
  },
  {
    id: 6, topic: 'DFS iterativa e LIFO', tree: 'binary', sourceSlides: [7], codeLanguage: 'PYTHON',
    title: 'Por que inverter os vizinhos antes de empilhar?',
    prompt: 'Execute a função a partir de A, com os filhos de cada vértice na ordem esquerda, direita. O print foi incluído para mostrar as descobertas. Qual sequência será impressa?',
    code: 'def dfs_iterative(tree, start):\n    visited = set()\n    stack = [start]\n    while stack:\n        node = stack.pop()\n        if node not in visited:\n            visited.add(node)\n            print(node, end=" ")\n            stack.extend(reversed(tree[node]))',
    options: ['A → C → G → F → B → E → D', 'A → B → C → D → E → F → G', 'D → E → B → F → G → C → A', 'A → B → D → E → C → F → G'], correct: 3,
    explanation: 'A pilha é LIFO: retira primeiro o último inserido. reversed faz o filho direito entrar antes do esquerdo, deixando o esquerdo no topo. Assim, a descoberta segue A, B, D, E, C, F, G.',
  },
  {
    id: 7, topic: 'Limite de recursão', sourceSlides: [7, 14],
    title: 'Como evitar depender da profundidade da pilha nativa?',
    prompt: 'Em Python, uma DFS recursiva em uma cadeia muito longa excede o limite de recursão e gera RecursionError. Qual mudança do material enfrenta diretamente essa limitação?',
    options: ['Usar DFS iterativa com uma pilha explícita.', 'Remover o conjunto de visitados.', 'Trocar a pilha por uma fila e continuar chamando a função recursivamente.', 'Garantir que toda chamada recursiva use memória constante no total.'], correct: 0,
    explanation: 'A implementação iterativa guarda os próximos vértices em uma estrutura explícita e dispensa a cadeia de chamadas recursivas. Ela continua consumindo memória e não elimina os limites de recursos da máquina.',
  },
  {
    id: 8, topic: 'Complexidade de tempo', sourceSlides: [8],
    title: 'Qual é o custo de uma varredura completa?',
    prompt: 'Um grafo com V vértices e E arestas é representado por listas de adjacência. Uma DFS completa marca cada vértice uma vez e examina todas as listas. Qual é a complexidade de tempo?',
    options: ['O(V × E)', 'O(log V)', 'O(V + E)', 'O(V²), mesmo quando o grafo é esparso.'], correct: 2,
    explanation: 'O trabalho soma o processamento dos V vértices ao exame das E arestas. Em grafos não direcionados, cada aresta aparece em duas listas, o que só muda o fator constante. Com listas de adjacência, o tempo é O(V + E).',
  },
  {
    id: 9, topic: 'Complexidade de espaço', sourceSlides: [8],
    title: 'Qual formato produz a maior pilha recursiva?',
    prompt: 'Desconsidere o armazenamento do próprio grafo. Em uma cadeia direcionada com V vértices, todos alcançáveis a partir do primeiro, quantas chamadas podem ficar ativas antes do primeiro retorno e qual é o espaço auxiliar da DFS recursiva?',
    options: ['Uma chamada; O(1).', 'Cerca de log₂ V chamadas; O(log V).', 'E² chamadas; O(E²).', 'V chamadas; O(V).'], correct: 3,
    explanation: 'A busca percorre a cadeia inteira antes de começar o backtracking. Cada vértice gera uma chamada ainda ativa, totalizando V. A pilha e o conjunto de visitados usam espaço auxiliar O(V) no pior caso.',
  },
  {
    id: 10, topic: 'Classificação de arestas', sourceSlides: [9],
    title: 'Como classificar as quatro conexões?',
    prompt: 'Em um grafo direcionado, I descobre um vértice branco; II aponta para um ancestral vermelho; III aponta para um descendente preto sem ser aresta da árvore DFS; IV conecta vértices sem relação de ancestralidade. Quais são os tipos, nessa ordem?',
    options: ['Árvore, avanço, retorno e cruzamento.', 'Árvore, retorno, avanço e cruzamento.', 'Retorno, árvore, cruzamento e avanço.', 'Cruzamento, retorno, árvore e avanço.'], correct: 1,
    explanation: 'Arestas de árvore descobrem vértices; as de retorno voltam a ancestrais ativos; as de avanço alcançam descendentes por outra ligação; as de cruzamento conectam ramos sem ancestralidade. Em grafo direcionado, uma aresta de retorno comprova um ciclo.',
  },
  {
    id: 11, topic: 'Teorema dos parênteses', sourceSlides: [10],
    title: 'Qual par de intervalos é impossível na DFS?',
    prompt: 'Considere os intervalos [d[u], f[u]] e [d[v], f[v]] de dois vértices distintos na mesma execução. Qual alternativa viola o teorema dos parênteses?',
    options: ['u = [1, 8] e v = [3, 6].', 'u = [1, 4] e v = [5, 8].', 'u = [1, 6] e v = [3, 8].', 'u = [3, 6] e v = [1, 8].'], correct: 2,
    explanation: 'Intervalos DFS são disjuntos ou um está inteiramente contido no outro. No terceiro caso, u termina depois da descoberta de v, mas antes do término de v: há sobreposição parcial, impossível em uma DFS.',
  },
  {
    id: 12, topic: 'Componentes conexos', sourceSlides: [11],
    title: 'Quantas vezes o laço externo inicia uma DFS?',
    prompt: 'Em um grafo não direcionado com vértices A, B, C, D, E e F, existem apenas as arestas A—B, B—C e D—E. F está isolado. Um laço percorre todos os vértices e inicia uma DFS para cada vértice ainda branco. Quantos componentes serão contados?',
    options: ['3', '1', '2', '6'], correct: 0,
    explanation: 'As três ilhas são {A, B, C}, {D, E} e {F}. Cada nova busca a partir de um vértice branco alcança todo o seu componente. A contagem por esse procedimento se aplica a componentes conexos de grafos não direcionados.',
  },
  {
    id: 13, topic: 'Dependências e DAG', sourceSlides: [9, 12],
    title: 'O que impede uma ordenação topológica?',
    prompt: 'Três tarefas têm dependências A → B, B → C e C → A. Ao percorrer A, B e C, a DFS encontra a aresta C → A com A ainda vermelho. O que concluir?',
    options: ['Existe uma ordem topológica começando em qualquer tarefa.', 'Basta ignorar as cores para ordenar as tarefas.', 'Todo grafo direcionado admite ordenação topológica.', 'Há um ciclo direcionado; essas dependências não admitem ordenação topológica.'], correct: 3,
    explanation: 'A aresta para o ancestral ativo fecha A → B → C → A. Uma ordenação topológica exige um DAG, isto é, um grafo direcionado acíclico. Nesse ciclo, nenhuma tarefa pode aparecer antes de todas as que dependem dela.',
  },
  {
    id: 14, topic: 'Ordem inversa de finalização', sourceSlides: [12, 13],
    title: 'Como formar a lista topológica ao finalizar os nós?',
    prompt: 'As dependências são Cueca → Calça → Cinto e Meias → Sapatos. A DFS finalizou os vértices nesta sequência: Cinto, Calça, Cueca, Sapatos, Meias. Inserindo cada vértice no início da lista ao finalizar, qual será o resultado?',
    options: ['Cinto → Calça → Cueca → Sapatos → Meias', 'Meias → Sapatos → Cueca → Calça → Cinto', 'Cueca → Cinto → Calça → Meias → Sapatos', 'Sapatos → Meias → Cueca → Calça → Cinto'], correct: 1,
    explanation: 'Inserir cada finalizado no início produz a ordem inversa de término, equivalente aos tempos f decrescentes. O resultado respeita Cueca antes de Calça e Cinto, e Meias antes de Sapatos. Em um DAG, isso fornece uma ordem topológica.',
  },
  {
    id: 15, topic: 'Cuidados na implementação', sourceSlides: [5, 14],
    title: 'Como explorar um grafo com ciclos sem prometer o menor caminho?',
    prompt: 'Você adapta a DFS para resolver um labirinto modelado como grafo, que pode conter ciclos. Qual afirmação reúne o cuidado com visited e a garantia correta sobre o caminho encontrado?',
    options: ['Marcar só no retorno e garantir o menor caminho.', 'Apagar visited ao mudar de ramo e garantir o menor custo.', 'Marcar antes de explorar vizinhos, evitar revisitas e reconhecer que o primeiro caminho encontrado pode não ser o mais curto.', 'Dispensar visited porque toda DFS termina em grafos com ciclos.'], correct: 2,
    explanation: 'A marcação antes da exploração, junto à verificação dos vizinhos, evita revisitas infinitas em ciclos. A DFS prioriza aprofundar um ramo; por isso, o primeiro caminho que encontra não tem garantia de menor comprimento ou custo.',
  },
];

