'use strict';

/**
 * 巡演装箱求解器：把去重后的待运输道具分装进若干箱子，
 * 每箱总重量不超过单箱承重，且任意一对"不能同箱"的道具不得装入同一箱，
 * 在道具不超过 14 件时求箱数最少的完整分箱。
 *
 * 算法：分支限界。按道具录入顺序逐件分配：
 *  - 先跑 First-Fit 得到一个可行解作为上界；
 *  - 搜索下界取 max(已开箱数, ⌈已装重量 + 剩余重量⌉ / 单箱承重)，不优于当前最优即剪枝；
 *  - 空箱彼此等价，一件道具只尝试"开一个新箱"一次，消除对称。
 * m ≤ 14 时搜索规模有界，求解在毫秒级完成，结果保证箱数全局最少。
 *
 * 展示稳定性：道具按录入顺序分配、箱子按创建先后编号，因此同箱内道具与
 * 箱间顺序都按道具录入顺序稳定；达到最少箱数的解中保留搜索序最先遇到的一个，
 * 同一输入永远得到同一分箱结果。
 */

const MAX_PACK_ITEMS = 14;

function isPosInt(v) {
  return Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

/**
 * 校验并规范化装箱配置。
 * 返回 { errors, items, capacity, exclusions }：
 *  - items: [{ name, weight }]（name 非空不重复，weight 为正整数）
 *  - capacity: 正整数单箱承重
 *  - exclusions: [{ a, b }]（a、b 为已存在的道具名，去自环、去重）
 */
function validatePacking(body) {
  const errors = [];
  const rawItems = body && body.items;
  const items = [];

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    errors.push('至少需要 1 件待运输道具');
  } else {
    if (rawItems.length > MAX_PACK_ITEMS) {
      errors.push(`待运输道具共 ${rawItems.length} 件，超过上限 ${MAX_PACK_ITEMS} 件，请减少道具种类后再装箱`);
    }
    const seen = new Set();
    rawItems.forEach((it, i) => {
      const name = String((it && it.name) ?? '').trim();
      if (!name) {
        errors.push(`第 ${i + 1} 件道具缺少名称`);
        return;
      }
      if (seen.has(name)) {
        errors.push(`道具名重复：「${name}」`);
        return;
      }
      seen.add(name);
      const w = Number(it && it.weight);
      if (!isPosInt(w)) {
        errors.push(`道具「${name}」的重量必须是正整数（当前为「${(it && it.weight) ?? '空'}」）`);
        return;
      }
      items.push({ name, weight: w });
    });
  }

  let capacity = Number(body && body.capacity);
  if (!isPosInt(capacity)) {
    errors.push('单箱承重必须是正整数');
    capacity = 0;
  }

  // 单件超重：逐件明确指出
  if (capacity > 0) {
    for (const it of items) {
      if (it.weight > capacity) {
        errors.push(`道具「${it.name}」重量 ${it.weight} 超过单箱承重 ${capacity}（单件超重），无法装箱`);
      }
    }
  }

  const nameSet = new Set(items.map(it => it.name));
  const exclusions = [];
  const seenPair = new Set();
  const rawExcl = body && body.exclusions;
  if (rawExcl !== undefined && !Array.isArray(rawExcl)) {
    errors.push('不能同箱的道具对必须是数组');
  } else {
    for (const p of rawExcl || []) {
      const a = String((p && p.a) ?? '').trim();
      const b = String((p && p.b) ?? '').trim();
      if (!nameSet.has(a) || !nameSet.has(b)) {
        errors.push(`不能同箱的道具对引用了不存在的道具：「${a || '?'}」与「${b || '?'}」`);
        continue;
      }
      if (a === b) {
        errors.push(`不能同箱的道具对中两个道具相同：「${a}」`);
        continue;
      }
      const key = [a, b].sort().join('');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      exclusions.push({ a, b });
    }
  }

  return { errors, items, capacity, exclusions };
}

/**
 * 精确装箱：返回箱数最少的分箱。
 * @param items [{ name, weight }]（已校验：重量为正整数且不超过 capacity）
 * @param capacity 正整数单箱承重
 * @param exclusions [{ a, b }] 道具名互斥对
 * @returns 箱子数组，每箱为 items 下标数组（箱内按录入顺序，箱间按各箱首件的录入顺序）
 */
function pack(items, capacity, exclusions) {
  const n = items.length;
  if (n === 0) return [];
  const index = new Map(items.map((it, i) => [it.name, i]));
  const weights = items.map(it => it.weight);

  // 互斥集合（对称）
  const excl = Array.from({ length: n }, () => new Set());
  for (const p of exclusions || []) {
    const a = index.get(p.a);
    const b = index.get(p.b);
    if (a === undefined || b === undefined || a === b) continue;
    excl[a].add(b);
    excl[b].add(a);
  }

  // 后缀重量和，用于重量下界
  const suffixW = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixW[i] = suffixW[i + 1] + weights[i];

  // 箱子状态：remaining 剩余承重、members 已装道具下标（按录入顺序递增）
  const bins = [];
  let placedW = 0;
  let best = null;
  let bestCount = n + 1;

  const fits = (bi, i) => {
    const bin = bins[bi];
    if (bin.remaining < weights[i]) return false;
    for (const m of bin.members) if (excl[i].has(m)) return false;
    return true;
  };
  const place = (bi, i) => { bins[bi].remaining -= weights[i]; bins[bi].members.push(i); placedW += weights[i]; };
  const unplace = (bi, i) => { bins[bi].remaining += weights[i]; bins[bi].members.pop(); placedW -= weights[i]; };
  const openBin = (i) => { bins.push({ remaining: capacity - weights[i], members: [i] }); placedW += weights[i]; };
  const closeBin = (i) => { bins.pop(); placedW -= weights[i]; };

  // First-Fit 上界种子（按录入顺序、按箱号顺序试放）
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let b = 0; b < bins.length; b++) {
      if (fits(b, i)) { place(b, i); placed = true; break; }
    }
    if (!placed) openBin(i);
  }
  bestCount = bins.length;
  best = bins.map(b => b.members.slice());
  bins.length = 0;
  placedW = 0;

  // 下界：已开箱数与"总重量 / 单箱承重"上取整的较大者
  const lowerBound = (idx) => Math.max(bins.length, Math.ceil((placedW + suffixW[idx]) / capacity));

  function dfs(idx) {
    if (idx === n) {
      if (bins.length < bestCount) {
        bestCount = bins.length;
        best = bins.map(b => b.members.slice());
      }
      return;
    }
    if (lowerBound(idx) >= bestCount) return; // 不可能得到更少的箱数
    // 依次尝试已开的箱子（箱号顺序保证结果确定）
    for (let b = 0; b < bins.length; b++) {
      if (!fits(b, idx)) continue;
      place(b, idx);
      dfs(idx + 1);
      unplace(b, idx);
    }
    // 开新箱（空箱彼此等价，只开一只）；开箱后总数仍可能更优才继续
    if (bins.length + 1 < bestCount) {
      openBin(idx);
      dfs(idx + 1);
      closeBin(idx);
    }
  }
  dfs(0);
  return best;
}

/**
 * 装箱求解入口：校验 + 求箱数最少的完整分箱。
 * 成功：{ ok:true, capacity, totalWeight, boxCount, boxes:[{ index, weight, items:[{name,weight}] }] }
 * 失败：{ ok:false, errors:[...] }（单件超重 / 超过 14 件 / 配置无效均给出具体提示）
 */
function solvePacking(body) {
  const { errors, items, capacity, exclusions } = validatePacking(body);
  if (errors.length) return { ok: false, errors };

  const assignment = pack(items, capacity, exclusions);
  const boxes = assignment.map((members, bi) => {
    const boxItems = members.map(i => ({ name: items[i].name, weight: items[i].weight }));
    return {
      index: bi + 1,
      weight: boxItems.reduce((s, it) => s + it.weight, 0),
      items: boxItems,
    };
  });
  return {
    ok: true,
    capacity,
    totalWeight: items.reduce((s, it) => s + it.weight, 0),
    boxCount: boxes.length,
    boxes,
  };
}

module.exports = { solvePacking, validatePacking, pack, MAX_PACK_ITEMS };
