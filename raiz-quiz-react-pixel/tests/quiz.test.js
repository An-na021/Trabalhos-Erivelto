import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { questions, binaryTree } from '../src/questions.js';
import { restoreProgress, scoreQuiz, countAnswered } from '../src/quiz-state.js';

test('São 15 questões distintas, com quatro alternativas e referências aos slides', () => {
  assert.equal(questions.length, 15);
  assert.equal(new Set(questions.map(q => q.id)).size, 15);
  for (const q of questions) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4);
    assert.ok(q.explanation.length > 30);
    assert.ok(q.sourceSlides.length > 0);
    assert.ok(q.sourceSlides.every(n => Number.isInteger(n) && n >= 1 && n <= 14));
  }
});

test('O percurso de descoberta corresponde ao diagrama', () => {
  const children = Object.fromEntries(binaryTree.nodes.map(([id]) => [id, []]));
  for (const [parent, child] of binaryTree.edges) children[parent].push(child);
  const output = [];
  function visit(id) { output.push(id); children[id].forEach(visit); }
  visit('A');
  const q = questions.find(q => q.id === 1);
  assert.equal(q.options[q.correct], output.slice(0, 3).join(' → '));
});

function runPython(code) {
  const result = spawnSync('python', ['-c', code], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const adjacency = Object.fromEntries(binaryTree.nodes.map(([id]) => [id, []]));
for (const [parent, child] of binaryTree.edges) adjacency[parent].push(child);

test('O código Python recursivo alcança a subárvore correta e evita revisitas em ciclos', () => {
  const q = questions.find(q => q.id === 5);
  const prefix = q.code + '\ntree = ' + JSON.stringify(adjacency) + '\n';
  const result = runPython(prefix + 'print(", ".join(sorted(dfs_recursive(tree, "B"))))');
  assert.equal(`{${result}}`, q.options[q.correct]);
  const cycleResult = runPython(prefix + 'tree["D"].append("B")\nprint(", ".join(sorted(dfs_recursive(tree, "B"))))');
  assert.equal(cycleResult, result);
});

test('O código Python iterativo reproduz o percurso com LIFO e reversed', () => {
  const q = questions.find(q => q.id === 6);
  const prefix = q.code + '\ntree = ' + JSON.stringify(adjacency) + '\n';
  const result = runPython(prefix + 'dfs_iterative(tree, "A")');
  assert.equal(result.split(/\s+/).join(' → '), q.options[q.correct]);
  const cycleResult = runPython(prefix + 'tree["D"].append("A")\ndfs_iterative(tree, "A")');
  assert.equal(cycleResult, result);
});

test('Só a alternativa marcada viola o teorema dos parênteses', () => {
  const q = questions.find(q => q.id === 11);
  const invalid = q.options.flatMap((option, index) => {
    const [du, fu, dv, fv] = option.match(/\d+/g).map(Number);
    const valid = fu < dv || fv < du || (du < dv && fv < fu) || (dv < du && fu < fv);
    return valid ? [] : [index];
  });
  assert.deepEqual(invalid, [q.correct]);
});

test('O gabarito topológico segue os tempos decrescentes e as dependências', () => {
  const q = questions.find(q => q.id === 14);
  const finish = { Cueca: 6, Calça: 5, Cinto: 4, Meias: 10, Sapatos: 9 };
  const order = q.options[q.correct].split(' → ');
  assert.deepEqual(order, Object.keys(finish).sort((a, b) => finish[b] - finish[a]));
  for (const [before, after] of [['Cueca', 'Calça'], ['Calça', 'Cinto'], ['Meias', 'Sapatos']]) {
    assert.ok(order.indexOf(before) < order.indexOf(after));
  }
});

test('Pontuação distingue acertos, erros, vazios e índice zero', () => {
  const perfect = Object.fromEntries(questions.map(q => [q.id, q.correct]));
  assert.equal(scoreQuiz(perfect), 15);
  assert.equal(countAnswered(perfect), 15);
  assert.equal(scoreQuiz({}), 0);
  assert.equal(countAnswered({1:0}), 1);
  assert.equal(scoreQuiz(Object.fromEntries(questions.map(q => [q.id,(q.correct+1)%4]))), 0);
  assert.equal(countAnswered({1:9, 2:null, 3:'0'}), 0);
});

test('Restauração recupera tentativa completa e descarta dados inválidos', () => {
  const complete = {answers:Object.fromEntries(questions.map(q => [q.id,q.correct])),index:14,finished:true};
  assert.deepEqual(restoreProgress(JSON.stringify(complete)), complete);
  assert.equal(restoreProgress('{broken'), null);
  assert.equal(restoreProgress('null'), null);
  assert.deepEqual(restoreProgress(JSON.stringify({answers:{1:0,2:7,3:'2'},index:99,finished:true})), {answers:{1:0},index:0,finished:false});
});
