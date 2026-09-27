'use strict';

const assert = require('assert');
const { solvePacking, pack, MAX_PACK_ITEMS } = require('../packing');

const I = (name, weight) => ({ name, weight });

/* 1. 全部装得下一箱 */
{
  const r = solvePacking({
    items: [I('桌', 3), I('椅', 2), I('灯', 4)],
    capacity: 10,
    exclusions: [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 1);
  assert.strictEqual(r.boxes[0].weight, 9);
  assert.deepStrictEqual(r.boxes[0].items.map(x => x.name), ['桌', '椅', '灯']);
  assert.strictEqual(r.totalWeight, 9);
  assert.strictEqual(r.capacity, 10);
}

/* 2. 重量迫使分箱，且箱数最少 */
{
  // 6+5>10，两个 6 各占一箱，两个 5 合一箱 → 3 箱
  const r = solvePacking({
    items: [I('a', 6), I('b', 6), I('c', 5), I('d', 5)],
    capacity: 10,
    exclusions: [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 3);
  assert.deepStrictEqual(r.boxes.map(b => b.items.map(x => x.name)), [['a'], ['b'], ['c', 'd']]);
  assert.deepStrictEqual(r.boxes.map(b => b.weight), [6, 6, 10]);
}

/* 3. 不能同箱的道具对必须分箱 */
{
  const r = solvePacking({
    items: [I('x', 2), I('y', 2), I('z', 2)],
    capacity: 6,
    exclusions: [{ a: 'x', b: 'y' }],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 2);
  // x 在箱 1，y 不能同箱 → 箱 2；z 进箱 1
  assert.deepStrictEqual(r.boxes.map(b => b.items.map(x => x.name)), [['x', 'z'], ['y']]);
}

/* 4. 互斥迫使箱数超过重量下界 */
{
  // 三件各重 3，承重 6 本可两箱；三者两两互斥 → 3 箱
  const r = solvePacking({
    items: [I('a', 3), I('b', 3), I('c', 3)],
    capacity: 6,
    exclusions: [{ a: 'a', b: 'b' }, { a: 'b', b: 'c' }, { a: 'a', b: 'c' }],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 3);
}

/* 5. 单件超重：具体提示 */
{
  const r = solvePacking({
    items: [I('钢琴', 25), I('灯', 3)],
    capacity: 20,
    exclusions: [],
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(r.errors[0].includes('钢琴'));
  assert.ok(r.errors[0].includes('25'));
  assert.ok(r.errors[0].includes('20'));
  assert.ok(r.errors[0].includes('单件超重'));
}

/* 6. 道具超过 14 件：具体提示 */
{
  const items = [];
  for (let i = 1; i <= 15; i++) items.push(I(`p${i}`, 1));
  const r = solvePacking({ items, capacity: 100, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('15'));
  assert.ok(r.errors[0].includes(String(MAX_PACK_ITEMS)));
}

/* 7. 14 件边界：可求解 */
{
  const items = [];
  for (let i = 1; i <= 14; i++) items.push(I(`p${i}`, 2));
  const r = solvePacking({ items, capacity: 6, exclusions: [] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 5); // 每箱 3 件：3,3,3,3,2
}

/* 8. 配置无效：重量非正整数 / 承重非正整数 / 空清单 */
{
  let r = solvePacking({ items: [I('a', 0)], capacity: 10, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('「a」'));
  assert.ok(r.errors[0].includes('正整数'));

  r = solvePacking({ items: [I('a', 1.5)], capacity: 10, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('正整数'));

  r = solvePacking({ items: [I('a', -2)], capacity: 10, exclusions: [] });
  assert.strictEqual(r.ok, false);

  r = solvePacking({ items: [I('a', 2)], capacity: 0, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('单箱承重'));

  r = solvePacking({ items: [], capacity: 10, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('至少需要'));

  r = solvePacking({ items: [I('a', 2), I('a', 3)], capacity: 10, exclusions: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('重复'));
}

/* 9. 互斥对配置无效：引用不存在的道具 / 两个道具相同 */
{
  let r = solvePacking({
    items: [I('a', 1)],
    capacity: 5,
    exclusions: [{ a: 'a', b: 'ghost' }],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('不存在的道具'));

  r = solvePacking({
    items: [I('a', 1)],
    capacity: 5,
    exclusions: [{ a: 'a', b: 'a' }],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('相同'));
}

/* 10. 稳定展示：箱内与箱间均按道具录入顺序 */
{
  const r = solvePacking({
    items: [I('A', 3), I('B', 5), I('C', 3), I('D', 5)],
    capacity: 8,
    exclusions: [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 2);
  assert.deepStrictEqual(r.boxes.map(b => b.items.map(x => x.name)), [['A', 'B'], ['C', 'D']]);
  // 箱号从 1 起连续
  assert.deepStrictEqual(r.boxes.map(b => b.index), [1, 2]);
}

/* 11. 最优性：已知最少 2 箱的实例 */
{
  const r = solvePacking({
    items: [I('a', 2), I('b', 3), I('c', 4), I('d', 5), I('e', 6)],
    capacity: 10,
    exclusions: [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 2); // 6+4 / 5+3+2
}

/* 12. 确定性：同一输入两次求解结果一致 */
{
  const body = {
    items: [I('a', 4), I('b', 7), I('c', 3), I('d', 6), I('e', 5), I('f', 2)],
    capacity: 12,
    exclusions: [{ a: 'b', b: 'd' }],
  };
  const r1 = solvePacking(body);
  const r2 = solvePacking(body);
  assert.deepStrictEqual(r1, r2);
}

/* 13. 重量恰等于承重：独占一箱 */
{
  const r = solvePacking({
    items: [I('a', 10), I('b', 1)],
    capacity: 10,
    exclusions: [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxCount, 2);
  assert.deepStrictEqual(r.boxes[0].items.map(x => x.name), ['a']);
  assert.deepStrictEqual(r.boxes[1].items.map(x => x.name), ['b']);
}

/* 14. 随机对拍：与暴力枚举的最少箱数一致，且分箱可行、展示稳定 */
{
  // 暴力：DFS 求最少箱数
  function bruteMinBoxes(items, capacity, exclusions) {
    const n = items.length;
    const idx = new Map(items.map((it, i) => [it.name, i]));
    const excl = Array.from({ length: n }, () => new Set());
    for (const p of exclusions) {
      excl[idx.get(p.a)].add(idx.get(p.b));
      excl[idx.get(p.b)].add(idx.get(p.a));
    }
    const bins = [];
    let best = n;
    (function dfs(i) {
      if (bins.length >= best) return;
      if (i === n) { best = bins.length; return; }
      for (let b = 0; b < bins.length; b++) {
        if (bins[b].remaining < items[i].weight) continue;
        if (bins[b].members.some(m => excl[i].has(m))) continue;
        bins[b].remaining -= items[i].weight;
        bins[b].members.push(i);
        dfs(i + 1);
        bins[b].remaining += items[i].weight;
        bins[b].members.pop();
      }
      bins.push({ remaining: capacity - items[i].weight, members: [i] });
      dfs(i + 1);
      bins.pop();
    })(0);
    return best;
  }

  let seed = 20260927;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 400; t++) {
    const n = 1 + Math.floor(rand() * 8); // 1..8 件
    const capacity = 4 + Math.floor(rand() * 10); // 4..13
    const items = [];
    for (let i = 0; i < n; i++) items.push(I(`p${i}`, 1 + Math.floor(rand() * capacity)));
    const exclusions = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (rand() < 0.18) exclusions.push({ a: `p${i}`, b: `p${j}` });
      }
    }
    const r = solvePacking({ items, capacity, exclusions });
    assert.strictEqual(r.ok, true, `用例 ${t} 应有解`);
    assert.strictEqual(r.boxCount, bruteMinBoxes(items, capacity, exclusions), `用例 ${t} 箱数应最少: ${JSON.stringify({ items, capacity, exclusions })}`);

    // 完备且不重不漏：每件道具恰好出现一次
    const seen = [];
    for (const b of r.boxes) {
      let w = 0;
      let lastIdx = -1;
      for (const it of b.items) {
        const i = Number(it.name.slice(1));
        assert.ok(i > lastIdx, '箱内道具应按录入顺序');
        lastIdx = i;
        w += it.weight;
        seen.push(i);
      }
      assert.strictEqual(b.weight, w);
      assert.ok(w <= capacity, '每箱不得超重');
      // 互斥校验
      const names = new Set(b.items.map(x => x.name));
      for (const p of exclusions) assert.ok(!(names.has(p.a) && names.has(p.b)), '不得含互斥对');
    }
    seen.sort((a, b) => a - b);
    assert.deepStrictEqual(seen, items.map((_, i) => i));
    // 箱间稳定：各箱首件按录入顺序递增
    const firsts = r.boxes.map(b => Number(b.items[0].name.slice(1)));
    for (let i = 1; i < firsts.length; i++) assert.ok(firsts[i] > firsts[i - 1], '箱间应按录入顺序');
  }
}

/* 15. 14 件性能冒烟（含互斥，应远小于 1 秒） */
{
  const items = [];
  for (let i = 0; i < 14; i++) items.push(I(`p${i}`, 3 + (i % 5)));
  const t0 = Date.now();
  const r = solvePacking({
    items,
    capacity: 11,
    exclusions: [{ a: 'p0', b: 'p1' }, { a: 'p2', b: 'p3' }, { a: 'p4', b: 'p5' }],
  });
  assert.ok(Date.now() - t0 < 1000);
  assert.strictEqual(r.ok, true);
  const minByWeight = Math.ceil(items.reduce((s, x) => s + x.weight, 0) / 11);
  assert.ok(r.boxCount >= minByWeight);
}

console.log('装箱测试全部通过 ✔');
