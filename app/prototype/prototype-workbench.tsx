'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Node = Point & { id: string; name: string; kind: '起点' | '路口' | '公共点' | '地标' };
type Road = {
  id: string;
  a: string;
  b: string;
  width: number | null;
  access: '公开通行' | '条件通行' | '季节性通行' | '不可通行';
  source: string;
  confirmed: boolean;
  steps?: boolean;
  lit?: boolean;
  mixedTraffic?: boolean;
};
type Hazard = Point & {
  id: string;
  road: string;
  kind: string;
  environment: '日常' | '雨后' | '夜间' | '农忙';
  status: '待核实' | '已确认' | '已修改' | '已否定' | '已解决';
  source: string;
  note: string;
};
type Building = Point & {
  id: string;
  name: string;
  w: number;
  h: number;
  height: number;
  kind: '背景体块' | '公共建设点' | '重点地标';
};
type RouteMode = 'shortest' | 'safe' | 'habit';
type RouteEvent = {
  road: string;
  title: string;
  category: '稳定问题' | '条件性问题' | '数据缺口';
  severity: '高' | '中' | '低' | '待判断';
  evidence: string;
  advice: string;
};
type RouteResult = {
  nodes: string[];
  roads: string[];
  length: number;
  cost: number;
  events: RouteEvent[];
  reachable: boolean;
};
type Facility = Point & { name: string; size: '小' | '中' | '大'; angle: number };

const STEPS = [
  '项目与路网',
  '关键标点',
  '低模校正',
  'NPC 模拟',
  'Risk Map',
  '候选选址',
  '场域设计',
  '方案复测',
] as const;

const NODES: Node[] = [
  { id: 'N-01', name: '西侧代表性起点', kind: '起点', x: 105, y: 330 },
  { id: 'N-02', name: '老街西口', kind: '路口', x: 285, y: 330 },
  { id: 'N-03', name: '中心广场', kind: '公共点', x: 485, y: 330 },
  { id: 'N-04', name: '卫生室入口', kind: '公共点', x: 755, y: 165 },
  { id: 'N-05', name: '南巷入口', kind: '路口', x: 485, y: 535 },
  { id: 'N-06', name: '助餐点入口', kind: '公共点', x: 755, y: 505 },
  { id: 'N-07', name: '东侧路口', kind: '路口', x: 900, y: 330 },
  { id: 'N-08', name: '祠堂地标', kind: '地标', x: 495, y: 95 },
];

const INITIAL_ROADS: Road[] = [
  { id: 'R-01', a: 'N-01', b: 'N-02', width: 3.2, access: '公开通行', source: '底图候选 + 用户确认', confirmed: true, lit: true },
  { id: 'R-02', a: 'N-02', b: 'N-03', width: 2.4, access: '公开通行', source: '底图候选 + 用户确认', confirmed: true, lit: true },
  { id: 'R-03', a: 'N-03', b: 'N-04', width: 1.2, access: '条件通行', source: '村民说明', confirmed: false, steps: true, lit: false },
  { id: 'R-04', a: 'N-03', b: 'N-05', width: 2.8, access: '公开通行', source: '用户补画', confirmed: true, lit: true },
  { id: 'R-05', a: 'N-05', b: 'N-06', width: 3.0, access: '公开通行', source: '底图候选 + 用户确认', confirmed: true, lit: true },
  { id: 'R-06', a: 'N-06', b: 'N-07', width: 3.5, access: '公开通行', source: '图片判断', confirmed: true, lit: false, mixedTraffic: true },
  { id: 'R-07', a: 'N-07', b: 'N-04', width: 2.7, access: '公开通行', source: '底图候选 + 用户确认', confirmed: true, lit: true },
  { id: 'R-08', a: 'N-03', b: 'N-08', width: null, access: '季节性通行', source: '未知', confirmed: false },
  { id: 'R-09', a: 'N-08', b: 'N-04', width: 1.8, access: '公开通行', source: '用户估计', confirmed: true, lit: false },
];

const INITIAL_HAZARDS: Hazard[] = [
  { id: 'SP-01', road: 'R-03', kind: '楼梯', environment: '日常', status: '已确认', source: '用户标点', note: '卫生室近路有连续台阶，尚未实测尺寸。', x: 610, y: 250 },
  { id: 'SP-02', road: 'R-02', kind: '雨后积水', environment: '雨后', status: '已确认', source: '现场照片 IMG-02', note: '雨后有效宽度明显缩窄。', x: 385, y: 330 },
  { id: 'SP-03', road: 'R-06', kind: '人车混行', environment: '日常', status: '已确认', source: '村民说明', note: '农用车辆和步行者共用路段。', x: 825, y: 420 },
  { id: 'SP-04', road: 'R-08', kind: '路口难识别', environment: '夜间', status: '待核实', source: 'AI 图片候选 IMG-05 · 0.63', note: '候选观察，未确认前只作为资料缺口。', x: 490, y: 210 },
];

const BUILDINGS: Building[] = [
  { id: 'B-01', name: '背景建筑 01', kind: '背景体块', x: 205, y: 205, w: 95, h: 68, height: 34 },
  { id: 'B-02', name: '背景建筑 02', kind: '背景体块', x: 350, y: 455, w: 110, h: 70, height: 45 },
  { id: 'B-03', name: '背景建筑 03', kind: '背景体块', x: 650, y: 430, w: 115, h: 76, height: 38 },
  { id: 'B-04', name: '背景建筑 04', kind: '背景体块', x: 840, y: 230, w: 92, h: 70, height: 42 },
  { id: 'B-05', name: '卫生室', kind: '公共建设点', x: 700, y: 115, w: 105, h: 68, height: 50 },
  { id: 'B-06', name: '助餐点', kind: '公共建设点', x: 690, y: 555, w: 110, h: 70, height: 45 },
  { id: 'B-07', name: '祠堂', kind: '重点地标', x: 425, y: 75, w: 115, h: 62, height: 62 },
  { id: 'B-08', name: '村委会', kind: '重点地标', x: 405, y: 255, w: 90, h: 55, height: 44 },
];

const WATER = [
  { x: 820, y: 535 },
  { x: 985, y: 515 },
  { x: 985, y: 635 },
  { x: 850, y: 630 },
];

const RULE_VERSION = 'rules-v1.1-demo';

function node(id: string) {
  return NODES.find((item) => item.id === id)!;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roadLength(road: Road) {
  return distance(node(road.a), node(road.b)) * 0.62;
}

function effectiveRoad(road: Road, planApplied: boolean): Road {
  if (!planApplied) return road;
  if (road.id === 'R-03') return { ...road, width: 1.8, steps: false, lit: true, access: '公开通行' };
  if (road.id === 'R-06') return { ...road, lit: true };
  return road;
}

function eventsForRoad(road: Road, hazards: Hazard[], role: string, environment: string, planApplied: boolean) {
  const current = effectiveRoad(road, planApplied);
  const events: RouteEvent[] = [];
  if (current.width === null) {
    events.push({ road: road.id, title: '有效宽度未知', category: '数据缺口', severity: '待判断', evidence: `${road.id} · ${road.source}`, advice: '补测最窄有效通行宽度。' });
  } else if (current.width < (role === '使用助行器' ? 1.5 : 1.3)) {
    events.push({ road: road.id, title: '通行空间偏窄', category: '稳定问题', severity: '高', evidence: `${road.id} · ${road.source}`, advice: '核实最窄处并清理占道，保留避让空间。' });
  }
  if (current.steps) {
    events.push({ road: road.id, title: '连续台阶限制通行', category: role === '独立步行' ? '条件性问题' : '稳定问题', severity: '高', evidence: 'SP-01 · 用户已确认', advice: '复核台阶尺寸，比较无台阶绕行或连续坡道方案。' });
  }
  if (environment === '夜间' && !current.lit) {
    events.push({ road: road.id, title: '夜间照明不连续', category: '条件性问题', severity: '中', evidence: `${road.id} · 道路属性`, advice: '夜间实走核查灯位与暗区。' });
  }
  if (current.mixedTraffic && ['日常', '农忙'].includes(environment)) {
    events.push({ road: road.id, title: '人车混行暴露', category: '条件性问题', severity: environment === '农忙' ? '高' : '中', evidence: 'SP-03 · 村民说明', advice: '设置避让点、限速提示并核查农忙时段。' });
  }
  hazards
    .filter((hazard) => hazard.road === road.id && hazard.status !== '已否定' && hazard.status !== '已解决')
    .filter((hazard) => hazard.environment === '日常' || hazard.environment === environment)
    .forEach((hazard) => {
      if (hazard.kind === '楼梯' || hazard.kind === '人车混行') return;
      if (hazard.status === '待核实') {
        events.push({ road: road.id, title: hazard.kind, category: '数据缺口', severity: '待判断', evidence: `${hazard.id} · ${hazard.source}`, advice: '确认、修改或否定该候选事实。' });
      } else {
        events.push({ road: road.id, title: hazard.kind, category: hazard.environment === '日常' ? '稳定问题' : '条件性问题', severity: '中', evidence: `${hazard.id} · ${hazard.source}`, advice: '结合现场证据处理路面、排水或绕行条件。' });
      }
    });
  return events;
}

function routeCost(road: Road, hazards: Hazard[], role: string, environment: string, safe: boolean, planApplied: boolean) {
  const current = effectiveRoad(road, planApplied);
  if (current.access === '不可通行') return Infinity;
  if (current.access === '季节性通行' && environment === '雨后') return Infinity;
  if (role === '使用助行器' && current.steps) return Infinity;
  const length = roadLength(current);
  if (!safe) return length;
  const penalty = eventsForRoad(current, hazards, role, environment, planApplied).reduce((sum, event) => {
    if (event.category === '数据缺口') return sum + 45;
    if (event.severity === '高') return sum + 620;
    if (event.severity === '中') return sum + 210;
    return sum + 80;
  }, 0);
  return length + penalty;
}

function calculateRoute(
  roads: Road[],
  hazards: Hazard[],
  start: string,
  end: string,
  mode: RouteMode,
  role: string,
  environment: string,
  planApplied: boolean,
): RouteResult {
  const failed: RouteResult = { nodes: [], roads: [], length: 0, cost: 0, events: [], reachable: false };
  if (mode === 'habit') {
    const habit = ['N-01', 'N-02', 'N-03', 'N-05', 'N-06', 'N-07', 'N-04'];
    if (start !== habit[0] || end !== habit[habit.length - 1]) return failed;
    const routeRoads: Road[] = [];
    for (let index = 1; index < habit.length; index += 1) {
      const edge = roads.find((road) =>
        (road.a === habit[index - 1] && road.b === habit[index]) ||
        (road.b === habit[index - 1] && road.a === habit[index]),
      );
      if (!edge || routeCost(edge, hazards, role, environment, false, planApplied) === Infinity) return failed;
      routeRoads.push(edge);
    }
    const events = routeRoads.flatMap((road) => eventsForRoad(road, hazards, role, environment, planApplied));
    return {
      nodes: habit,
      roads: routeRoads.map((road) => road.id),
      length: routeRoads.reduce((sum, road) => sum + roadLength(effectiveRoad(road, planApplied)), 0),
      cost: routeRoads.reduce((sum, road) => sum + routeCost(road, hazards, role, environment, true, planApplied), 0),
      events,
      reachable: true,
    };
  }

  const distances = new Map(NODES.map((item) => [item.id, Infinity]));
  const previous = new Map<string, { node: string; road: string }>();
  const open = new Set(NODES.map((item) => item.id));
  distances.set(start, 0);
  while (open.size) {
    const current = [...open].sort((a, b) => distances.get(a)! - distances.get(b)!)[0];
    if (distances.get(current) === Infinity) break;
    open.delete(current);
    if (current === end) break;
    roads.forEach((road) => {
      if (road.a !== current && road.b !== current) return;
      const next = road.a === current ? road.b : road.a;
      if (!open.has(next)) return;
      const cost = routeCost(road, hazards, role, environment, mode === 'safe', planApplied);
      if (cost === Infinity) return;
      const candidate = distances.get(current)! + cost;
      if (candidate < distances.get(next)!) {
        distances.set(next, candidate);
        previous.set(next, { node: current, road: road.id });
      }
    });
  }
  if (distances.get(end) === Infinity) return failed;
  const routeNodes = [end];
  const routeRoads: string[] = [];
  let cursor = end;
  while (cursor !== start) {
    const value = previous.get(cursor);
    if (!value) return failed;
    routeNodes.unshift(value.node);
    routeRoads.unshift(value.road);
    cursor = value.node;
  }
  const usedRoads = routeRoads.map((id) => roads.find((road) => road.id === id)!);
  return {
    nodes: routeNodes,
    roads: routeRoads,
    length: usedRoads.reduce((sum, road) => sum + roadLength(effectiveRoad(road, planApplied)), 0),
    cost: usedRoads.reduce((sum, road) => sum + routeCost(road, hazards, role, environment, true, planApplied), 0),
    events: usedRoads.flatMap((road) => eventsForRoad(road, hazards, role, environment, planApplied)),
    reachable: true,
  };
}

function projected(point: Point, view3d: boolean) {
  if (!view3d) return point;
  return {
    x: 500 + (point.x - 500) * 0.65 - (point.y - 320) * 0.28,
    y: 100 + (point.x - 500) * 0.1 + point.y * 0.58,
  };
}

function polygon(points: Point[], view3d: boolean) {
  return points.map((point) => {
    const value = projected(point, view3d);
    return `${value.x},${value.y}`;
  }).join(' ');
}

function pointOnRoute(route: RouteResult, progress: number) {
  if (!route.reachable || route.nodes.length === 0) return node('N-01');
  const points = route.nodes.map(node);
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let target = total * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index]) {
      const ratio = target / lengths[index];
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    target -= lengths[index];
  }
  return points[points.length - 1];
}

function overlapsBuilding(facility: Facility) {
  const side = facility.size === '小' ? 50 : facility.size === '中' ? 76 : 104;
  return BUILDINGS.find((building) =>
    Math.abs(facility.x - building.x) < side / 2 + building.w / 2 &&
    Math.abs(facility.y - building.y) < side / 2 + building.h / 2,
  );
}

function pointInPolygon(point: Point, shape: Point[]) {
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i, i += 1) {
    const a = shape[i];
    const b = shape[j];
    const hit = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function nearestRoadDistance(facility: Facility, roads: Road[]) {
  return Math.min(...roads.map((road) => {
    const a = node(road.a);
    const b = node(road.b);
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((facility.x - a.x) * (b.x - a.x) + (facility.y - a.y) * (b.y - a.y)) / lengthSquared));
    return distance(facility, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }));
}

function facilityStatus(facility: Facility, roads: Road[], hazards: Hazard[]) {
  if (!roads.every((road) => road.confirmed)) return { tone: 'gray', label: '灰 · 资料不足', reason: '路网尚未全部确认，暂不形成选址结论。' };
  const side = facility.size === '小' ? 50 : facility.size === '中' ? 76 : 104;
  if (facility.x - side / 2 < 25 || facility.x + side / 2 > 975 || facility.y - side / 2 < 25 || facility.y + side / 2 > 625) {
    return { tone: 'red', label: '红 · 超出研究范围', reason: '候选设施轮廓必须完整落在研究范围内。' };
  }
  const hit = overlapsBuilding(facility);
  if (hit) return { tone: 'red', label: '红 · 空间冲突', reason: `轮廓与 ${hit.name} 重叠。` };
  if (pointInPolygon(facility, WATER)) return { tone: 'red', label: '红 · 水体冲突', reason: '候选轮廓落入已知水体范围。' };
  const access = nearestRoadDistance(facility, roads);
  if (access < side / 2 + 8) return { tone: 'red', label: '红 · 占用道路', reason: '候选轮廓侵入已确认道路通行空间。' };
  if (access > 75) return { tone: 'red', label: '红 · 无道路接入', reason: `距确认路网约 ${Math.round(access * 0.62)} 米。` };
  const closeHazard = hazards.find((hazard) => hazard.status !== '已否定' && distance(facility, hazard) < 120);
  if (closeHazard) return { tone: 'yellow', label: '黄 · 有条件推荐', reason: `接近 ${closeHazard.id}「${closeHazard.kind}」，需先核实到达条件。` };
  return { tone: 'green', label: '绿 · 当前条件较优', reason: '空间无已知冲突，可接入确认路网；仍需另行核查用地与审批。' };
}

function Scene({
  view3d,
  roads,
  hazards,
  route,
  riskLayer,
  progress,
  selectedRoad,
  facility,
  designReady,
  onSelectRoad,
  onSelectHazard,
  onPlaceFacility,
  placing,
}: {
  view3d: boolean;
  roads: Road[];
  hazards: Hazard[];
  route: RouteResult;
  riskLayer: boolean;
  progress: number;
  selectedRoad: string;
  facility: Facility | null;
  designReady: boolean;
  onSelectRoad: (id: string) => void;
  onSelectHazard: (id: string) => void;
  onPlaceFacility: (point: Point) => void;
  placing: boolean;
}) {
  const npc = projected(pointOnRoute(route, progress), view3d);
  const ground = [
    { x: 25, y: 25 },
    { x: 975, y: 25 },
    { x: 975, y: 625 },
    { x: 25, y: 625 },
  ];
  function clickScene(event: React.PointerEvent<SVGSVGElement>) {
    if (!placing || view3d) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPlaceFacility({
      x: Math.max(25, Math.min(975, ((event.clientX - rect.left) / rect.width) * 1000)),
      y: Math.max(25, Math.min(625, ((event.clientY - rect.top) / rect.height) * 650)),
    });
  }
  return (
    <svg className={`pt-scene ${placing && !view3d ? 'is-placing' : ''}`} viewBox="0 0 1000 650" role="img" aria-label={view3d ? '村庄可运行三维低模' : '村庄二维语义底图'} onPointerDown={clickScene}>
      {view3d ? <polygon points={polygon(ground, true)} className="pt-ground" /> : <rect x="25" y="25" width="950" height="600" rx="8" className="pt-ground" />}
      <polygon points={polygon(WATER, view3d)} className="pt-water" />
      {roads.map((road) => {
        const a = projected(node(road.a), view3d);
        const b = projected(node(road.b), view3d);
        const roadEvents = eventsForRoad(road, hazards, '拄杖', '日常', false);
        const risk = roadEvents.some((event) => event.category !== '数据缺口');
        return (
          <g key={road.id} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelectRoad(road.id)} className="pt-road-hit">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="pt-road-base" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`pt-road ${road.confirmed ? 'is-confirmed' : 'is-candidate'} ${riskLayer && risk ? 'is-risk' : ''} ${road.id === selectedRoad ? 'is-selected' : ''}`} />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} className="pt-road-id">{road.id}</text>
          </g>
        );
      })}
      {BUILDINGS.map((building) => {
        const corners = [
          { x: building.x - building.w / 2, y: building.y - building.h / 2 },
          { x: building.x + building.w / 2, y: building.y - building.h / 2 },
          { x: building.x + building.w / 2, y: building.y + building.h / 2 },
          { x: building.x - building.w / 2, y: building.y + building.h / 2 },
        ];
        if (!view3d) {
          return <g key={building.id}><rect x={corners[0].x} y={corners[0].y} width={building.w} height={building.h} className={`pt-building ${building.kind !== '背景体块' ? 'is-key' : ''}`} /><text x={building.x} y={building.y + 4} className="pt-building-label">{building.kind === '背景体块' ? building.id : building.name}</text></g>;
        }
        const base = corners.map((corner) => projected(corner, true));
        const top = base.map((corner) => ({ x: corner.x, y: corner.y - building.height }));
        return <g key={building.id} className={building.kind !== '背景体块' ? 'is-key-building' : ''}>
          <polygon points={`${base[1].x},${base[1].y} ${base[2].x},${base[2].y} ${top[2].x},${top[2].y} ${top[1].x},${top[1].y}`} className="pt-building-side" />
          <polygon points={`${base[2].x},${base[2].y} ${base[3].x},${base[3].y} ${top[3].x},${top[3].y} ${top[2].x},${top[2].y}`} className="pt-building-side is-dark" />
          <polygon points={top.map((corner) => `${corner.x},${corner.y}`).join(' ')} className="pt-building-top" />
          <text x={top.reduce((sum, corner) => sum + corner.x, 0) / 4} y={top.reduce((sum, corner) => sum + corner.y, 0) / 4 + 4} className="pt-building-label">{building.kind === '背景体块' ? building.id : building.name}</text>
        </g>;
      })}
      {NODES.map((item) => {
        const value = projected(item, view3d);
        return <g key={item.id}><circle cx={value.x} cy={value.y} r={item.kind === '起点' ? 9 : 6} className={`pt-node is-${item.kind}`} /><text x={value.x + 10} y={value.y - 10} className="pt-node-label">{item.name}</text></g>;
      })}
      {hazards.filter((hazard) => hazard.status !== '已否定').map((hazard) => {
        const value = projected(hazard, view3d);
        return <g key={hazard.id} className="pt-hazard" onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelectHazard(hazard.id)}><circle cx={value.x} cy={value.y} r="13" /><text x={value.x} y={value.y + 5}>!</text></g>;
      })}
      {facility && (() => {
        const side = facility.size === '小' ? 50 : facility.size === '中' ? 76 : 104;
        const corners = [
          { x: facility.x - side / 2, y: facility.y - side / 2 },
          { x: facility.x + side / 2, y: facility.y - side / 2 },
          { x: facility.x + side / 2, y: facility.y + side / 2 },
          { x: facility.x - side / 2, y: facility.y + side / 2 },
        ];
        const center = projected(facility, view3d);
        return <g><polygon points={polygon(corners, view3d)} className="pt-facility" /><text x={center.x} y={center.y - 12} className="pt-facility-label">候选：{facility.name}</text></g>;
      })()}
      {designReady && [
        { x: 535, y: 390, label: '长椅' },
        { x: 595, y: 410, label: '遮阳' },
        { x: 555, y: 455, label: '照明' },
      ].map((item) => {
        const value = projected(item, view3d);
        return <g key={item.label}><rect x={value.x - 18} y={value.y - 10} width="36" height="20" rx="4" className="pt-design-item" /><text x={value.x} y={value.y + 4} className="pt-design-label">{item.label}</text></g>;
      })}
      {route.reachable && <polyline points={route.nodes.map((id) => { const value = projected(node(id), view3d); return `${value.x},${value.y}`; }).join(' ')} className="pt-route-line" />}
      {route.reachable && <g className="pt-npc"><circle cx={npc.x} cy={npc.y} r="11" /><circle cx={npc.x} cy={npc.y - 17} r="6" /><text x={npc.x + 16} y={npc.y + 4}>测试角色</text></g>}
    </svg>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="pt-field"><span>{label}</span>{children}</label>;
}

export default function PrototypeWorkbench() {
  const [step, setStep] = useState(0);
  const [roads, setRoads] = useState(INITIAL_ROADS);
  const [hazards, setHazards] = useState(INITIAL_HAZARDS);
  const [selectedRoad, setSelectedRoad] = useState('R-03');
  const [selectedHazard, setSelectedHazard] = useState('SP-01');
  const [view3d, setView3d] = useState(false);
  const [riskLayer, setRiskLayer] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(true);
  const [modelState, setModelState] = useState<'未生成' | '生成中' | '待校正' | '已校正'>('未生成');
  const [role, setRole] = useState('拄杖');
  const [environment, setEnvironment] = useState('日常');
  const [start, setStart] = useState('N-01');
  const [end, setEnd] = useState('N-04');
  const [routeMode, setRouteMode] = useState<RouteMode>('safe');
  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [facility, setFacility] = useState<Facility | null>({ name: '树荫休息点', size: '小', angle: 0, x: 590, y: 430 });
  const [designReady, setDesignReady] = useState(false);
  const [planApplied, setPlanApplied] = useState(false);
  const [goal, setGoal] = useState('改善卫生室近路台阶，并补充连续休息与照明。');
  const [budget, setBudget] = useState('低');
  const [newHazardKind, setNewHazardKind] = useState('缺少休息点');
  const [newHazardRoad, setNewHazardRoad] = useState('R-05');
  const [audit, setAudit] = useState<string[]>(['载入青溪村虚构演示数据 · 现状 V0']);
  const [versions, setVersions] = useState<string[]>(['现状 V0']);
  const [notice, setNotice] = useState('');
  const animation = useRef<number | null>(null);

  const allRoadsConfirmed = roads.length > 0 && roads.every((road) => road.confirmed);
  const canDiagnose = locationConfirmed && allRoadsConfirmed && modelState === '已校正';
  const route = useMemo(
    () => calculateRoute(roads, hazards, start, end, routeMode, role, environment, planApplied),
    [roads, hazards, start, end, routeMode, role, environment, planApplied],
  );
  const beforeRoute = useMemo(
    () => calculateRoute(roads, hazards, start, end, 'safe', role, environment, false),
    [roads, hazards, start, end, role, environment],
  );
  const afterRoute = useMemo(
    () => calculateRoute(roads, hazards, start, end, 'safe', role, environment, true),
    [roads, hazards, start, end, role, environment],
  );
  const site = facility ? facilityStatus(facility, roads, hazards) : null;
  const activeRoad = roads.find((road) => road.id === selectedRoad) ?? roads[0];
  const activeHazard = hazards.find((hazard) => hazard.id === selectedHazard) ?? hazards[0];

  useEffect(() => () => { if (animation.current) cancelAnimationFrame(animation.current); }, []);

  function log(message: string) {
    setAudit((items) => [`${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${message}`, ...items].slice(0, 12));
  }

  function resetDemo() {
    if (animation.current) cancelAnimationFrame(animation.current);
    setRoads(INITIAL_ROADS);
    setHazards(INITIAL_HAZARDS);
    setSelectedRoad('R-03');
    setSelectedHazard('SP-01');
    setView3d(false);
    setRiskLayer(false);
    setLocationConfirmed(true);
    setModelState('未生成');
    setRole('拄杖');
    setEnvironment('日常');
    setStart('N-01');
    setEnd('N-04');
    setRouteMode('safe');
    setHasRun(false);
    setRunning(false);
    setProgress(0);
    setFacility({ name: '树荫休息点', size: '小', angle: 0, x: 590, y: 430 });
    setDesignReady(false);
    setPlanApplied(false);
    setVersions(['现状 V0']);
    setAudit(['载入青溪村虚构演示数据 · 现状 V0']);
    setNotice('演示数据已重置。');
  }

  function updateRoad(patch: Partial<Road>) {
    setRoads((items) => items.map((road) => road.id === activeRoad.id ? { ...road, ...patch } : road));
    setModelState('未生成');
    setHasRun(false);
    log(`编辑道路 ${activeRoad.id}，低模需重新生成`);
  }

  function generateModel() {
    if (!locationConfirmed) {
      setNotice('请先确认位置与研究范围。');
      return;
    }
    setModelState('生成中');
    setNotice('正在生成地形、道路带、背景体块与通行图…');
    window.setTimeout(() => {
      setModelState('待校正');
      setView3d(true);
      setNotice('低模已生成。请核对断路、穿模和关键对象挂接。');
      log('生成可运行低模预览');
    }, 850);
  }

  function runSimulation() {
    if (!route.reachable) {
      setNotice('当前角色与条件下任务不可达，请调整路线或道路条件。');
      return;
    }
    setHasRun(true);
    setView3d(true);
    setRiskLayer(false);
    setRunning(true);
    setProgress(0);
    if (animation.current) cancelAnimationFrame(animation.current);
    const started = performance.now();
    const duration = Math.max(2600, route.length * 3.2);
    const tick = (time: number) => {
      const next = Math.min(1, (time - started) / duration);
      setProgress(next);
      if (next < 1) animation.current = requestAnimationFrame(tick);
      else {
        setRunning(false);
        setNotice(canDiagnose ? '正式模拟完成，可查看 Risk Map 与证据链。' : '预览完成；路网或低模尚未确认，不形成正式诊断。');
        log(`${canDiagnose ? '完成正式模拟' : '完成候选路线预览'} · ${routeMode} · ${role} · ${environment}`);
      }
    };
    animation.current = requestAnimationFrame(tick);
  }

  function addHazard() {
    const road = roads.find((item) => item.id === newHazardRoad)!;
    const a = node(road.a);
    const b = node(road.b);
    const hazard: Hazard = {
      id: `SP-${String(hazards.length + 1).padStart(2, '0')}`,
      road: road.id,
      kind: newHazardKind,
      environment: environment as Hazard['environment'],
      status: '待核实',
      source: '用户新增 · 待绑定证据',
      note: '新标点尚未核实，不进入正式风险事实。',
      x: (a.x + b.x) / 2 + 18,
      y: (a.y + b.y) / 2 + 18,
    };
    setHazards((items) => [...items, hazard]);
    setSelectedHazard(hazard.id);
    setNotice(`${hazard.id} 已添加为待核实候选事实。`);
    log(`添加特殊情况 ${hazard.id} · ${hazard.kind}`);
  }

  function exportCase() {
    const payload = {
      prototype: '乡村适老化建设辅助工作台 V1.1',
      sceneVersion: planApplied ? '方案 A' : '现状 V0',
      ruleVersion: RULE_VERSION,
      locationConfirmed,
      modelState,
      roads,
      hazards,
      task: { start, end, role, environment, routeMode },
      result: hasRun ? route : null,
      facility,
      design: designReady ? { goal, budget, output: '概念布局与文字方案演示' } : null,
      audit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '乡筑-V1.1-模拟用例.json';
    link.click();
    URL.revokeObjectURL(url);
    log('导出可复现模拟用例 JSON');
  }

  function renderInspector() {
    if (step === 0) return <>
      <h2>项目定位与路网校正</h2>
      <Labeled label="村庄地址"><input defaultValue="四川省 · 青溪村（虚构演示）" /></Labeled>
      <label className="pt-check"><input type="checkbox" checked={locationConfirmed} onChange={(event) => setLocationConfirmed(event.target.checked)} />位置与研究范围已确认</label>
      <div className="pt-source-box"><b>高程资料</b><span>GLO-30 · 30 m · 演示元数据</span><small>仅用于宏观地势，不用于局部坡度和工程尺寸。</small></div>
      <div className="pt-section-title"><b>道路 {roads.filter((road) => road.confirmed).length}/{roads.length} 已确认</b><button onClick={() => { setRoads((items) => items.map((road) => ({ ...road, confirmed: true }))); setModelState('未生成'); setNotice('全部路网已确认，可生成低模。'); log('确认全部路网'); }}>确认全部</button></div>
      <div className="pt-road-list">{roads.map((road) => <button key={road.id} className={road.id === activeRoad.id ? 'active' : ''} onClick={() => setSelectedRoad(road.id)}><span>{road.id}</span><i className={road.confirmed ? 'good' : 'pending'}>{road.confirmed ? '已确认' : '待校正'}</i></button>)}</div>
      <div className="pt-subpanel">
        <b>{activeRoad.id} 道路属性</b>
        <Labeled label="有效宽度（米；空为未知）"><input type="number" step="0.1" value={activeRoad.width ?? ''} placeholder="未知" onChange={(event) => updateRoad({ width: event.target.value ? Number(event.target.value) : null, confirmed: false })} /></Labeled>
        <Labeled label="通行属性"><select value={activeRoad.access} onChange={(event) => updateRoad({ access: event.target.value as Road['access'], confirmed: false })}><option>公开通行</option><option>条件通行</option><option>季节性通行</option><option>不可通行</option></select></Labeled>
        <p>来源：{activeRoad.source}</p>
        <button className="pt-primary" onClick={() => updateRoad({ confirmed: true })}>确认此道路</button>
      </div>
    </>;

    if (step === 1) return <>
      <h2>公共点、地标与特殊情况</h2>
      <div className="pt-stats"><span><b>3</b>公共建设点</span><span><b>2</b>重点地标</span><span><b>{hazards.length}</b>特殊标点</span></div>
      <div className="pt-field-grid"><Labeled label="新增类型"><select value={newHazardKind} onChange={(event) => setNewHazardKind(event.target.value)}>{['明显陡坡', '楼梯', '坑洼', '积水', '人车混行', '夜间无照明', '道路过窄', '缺少休息点', '路口难识别'].map((item) => <option key={item}>{item}</option>)}</select></Labeled><Labeled label="关联路段"><select value={newHazardRoad} onChange={(event) => setNewHazardRoad(event.target.value)}>{roads.map((road) => <option key={road.id}>{road.id}</option>)}</select></Labeled></div>
      <button className="pt-primary" onClick={addHazard}>添加为待核实标点</button>
      <div className="pt-hazard-list">{hazards.map((hazard) => <button key={hazard.id} className={hazard.id === activeHazard.id ? 'active' : ''} onClick={() => setSelectedHazard(hazard.id)}><span><b>{hazard.id}</b>{hazard.kind}</span><i>{hazard.status}</i></button>)}</div>
      <div className="pt-subpanel">
        <b>{activeHazard.id} · {activeHazard.kind}</b><p>{activeHazard.note}</p><small>证据：{activeHazard.source}</small>
        <Labeled label="绑定现场图片"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; setHazards((items) => items.map((hazard) => hazard.id === activeHazard.id ? { ...hazard, source: `现场图片 ${file.name}`, status: '待核实' } : hazard)); setNotice('图片已绑定；可见事实仍需用户确认。'); log(`为 ${activeHazard.id} 绑定现场图片`); }} /></Labeled>
        <div className="pt-button-row"><button onClick={() => { setHazards((items) => items.map((hazard) => hazard.id === activeHazard.id ? { ...hazard, status: '已确认' } : hazard)); log(`确认候选事实 ${activeHazard.id}`); }}>确认</button><button onClick={() => { setHazards((items) => items.map((hazard) => hazard.id === activeHazard.id ? { ...hazard, status: '已否定' } : hazard)); log(`否定候选事实 ${activeHazard.id}`); }}>否定</button></div>
      </div>
    </>;

    if (step === 2) return <>
      <h2>生成与校正可运行低模</h2>
      <div className="pt-stats"><span><b>1</b>地形网格</span><span><b>{roads.length}</b>道路带</span><span><b>{BUILDINGS.length}</b>建筑体块</span><span><b>{hazards.length}</b>场景事件</span></div>
      <ol className="pt-checklist"><li className={locationConfirmed ? 'done' : ''}>统一项目坐标与研究范围</li><li className={allRoadsConfirmed ? 'done' : ''}>使用确认后的道路图</li><li className={modelState !== '未生成' ? 'done' : ''}>生成背景体块与关键对象</li><li className={modelState === '已校正' ? 'done' : ''}>核对断路、穿模与事件挂接</li></ol>
      <button className="pt-primary" disabled={modelState === '生成中'} onClick={generateModel}>{modelState === '生成中' ? '生成中…' : modelState === '未生成' ? '生成低模' : '重新生成低模'}</button>
      {modelState === '待校正' && <div className="pt-warning"><b>待校正 2 项</b><p>R-03 道路带与卫生室入口需核对；SP-04 的道路挂接尚未确认。</p><button onClick={() => { setModelState('已校正'); setNotice('模型校正已记录，可运行正式模拟。'); log('确认低模关键对象与通行网络'); }}>确认关键模型校正</button></div>}
      {modelState === '已校正' && <div className="pt-success"><b>低模已校正</b><p>几何版本、语义对象、路网和规则可组成可复现用例。</p></div>}
      <p className="pt-boundary">低模用于空间关系、路径运行与方案比较；默认建筑高度、局部坡度和台阶尺寸不能作为工程判断。</p>
    </>;

    if (step === 3) return <>
      <h2>虚拟测试角色与任务</h2>
      <Labeled label="移动能力"><select value={role} onChange={(event) => { setRole(event.target.value); setHasRun(false); }}><option>独立步行</option><option>拄杖</option><option>耐力较弱</option><option>使用助行器</option></select></Labeled>
      <Labeled label="环境条件"><select value={environment} onChange={(event) => { setEnvironment(event.target.value); setHasRun(false); }}><option>日常</option><option>雨后</option><option>夜间</option><option>农忙</option></select></Labeled>
      <div className="pt-field-grid"><Labeled label="起点"><select value={start} onChange={(event) => setStart(event.target.value)}>{NODES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled><Labeled label="终点"><select value={end} onChange={(event) => setEnd(event.target.value)}>{NODES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Labeled></div>
      <Labeled label="候选路线"><select value={routeMode} onChange={(event) => { setRouteMode(event.target.value as RouteMode); setHasRun(false); }}><option value="shortest">最短候选路线</option><option value="safe">相对低风险路线</option><option value="habit">用户指定习惯路线</option></select></Labeled>
      <button className="pt-primary" disabled={running} onClick={runSimulation}>{running ? `运行中 ${Math.round(progress * 100)}%` : canDiagnose ? '运行正式模拟' : '预览候选路线'}</button>
      <div className="pt-result-summary"><b>{route.reachable ? `${Math.round(route.length)} m` : '不可达'}</b><span>{route.reachable ? `${route.events.filter((event) => event.category !== '数据缺口').length} 项问题 · ${route.events.filter((event) => event.category === '数据缺口').length} 项资料缺口` : '调整角色或道路条件'}</span></div>
      <p className="pt-boundary">虚拟测试角色只比较候选路线与方案，不预测真实老人路线、走失或事故概率。</p>
    </>;

    if (step === 4) return <>
      <h2>Risk Map 与问题卡片</h2>
      {!hasRun ? <div className="pt-empty"><b>尚无模拟结果</b><p>先运行一次 NPC 路径压力测试。</p><button onClick={() => setStep(3)}>前往 NPC 模拟</button></div> : !canDiagnose ? <div className="pt-warning"><b>仅为预览</b><p>路网和低模未完成确认，不能形成正式诊断。</p></div> : <>
        <div className="pt-stats"><span><b>{route.events.filter((event) => event.severity === '高').length}</b>高严重度</span><span><b>{route.events.filter((event) => event.category === '条件性问题').length}</b>条件性</span><span><b>{route.events.filter((event) => event.category === '数据缺口').length}</b>资料缺口</span></div>
        <button className="pt-primary" onClick={() => setRiskLayer((value) => !value)}>{riskLayer ? '关闭风险图层' : '在场景中显示风险'}</button>
        <div className="pt-issue-list">{route.events.map((event, index) => <article key={`${event.road}-${event.title}-${index}`}><header><span>{event.category}</span><b>{event.road} · {event.title}</b><i>{event.severity}</i></header><p>{event.advice}</p><small>证据：{event.evidence} → 道路对象 → 运行事件 → {RULE_VERSION}</small><button onClick={() => { setSelectedRoad(event.road); setStep(0); }}>定位道路</button></article>)}</div>
      </>}
    </>;

    if (step === 5) return <>
      <h2>候选活动点 / 服务点</h2>
      <Labeled label="拟建设内容"><input value={facility?.name ?? ''} onChange={(event) => setFacility((value) => ({ ...(value ?? { size: '小', angle: 0, x: 590, y: 430 }), name: event.target.value }))} /></Labeled>
      <Labeled label="面积档"><select value={facility?.size ?? '小'} onChange={(event) => setFacility((value) => ({ ...(value ?? { name: '候选设施', angle: 0, x: 590, y: 430 }), size: event.target.value as Facility['size'] }))}><option>小</option><option>中</option><option>大</option></select></Labeled>
      <p className="pt-help">切到 2D 后直接点击地图试放，或用按钮微调。面积档仅表达大致占地。</p>
      <div className="pt-nudge"><button onClick={() => facility && setFacility({ ...facility, y: facility.y - 25 })}>↑</button><button onClick={() => facility && setFacility({ ...facility, x: facility.x - 25 })}>←</button><button onClick={() => facility && setFacility({ ...facility, x: facility.x + 25 })}>→</button><button onClick={() => facility && setFacility({ ...facility, y: facility.y + 25 })}>↓</button></div>
      {site && <div className={`pt-site-result ${site.tone}`}><b>{site.label}</b><p>{site.reason}</p><small>只评价已录入的通达性、代表性任务与空间关系。</small></div>}
      <button className="pt-primary" disabled={!facility || site?.tone === 'red' || site?.tone === 'gray'} onClick={() => { const name = `候选选址 · ${facility!.name}`; setVersions((items) => items.includes(name) ? items : [...items, name]); setNotice('候选点已保存为独立场景版本，并完成代表性任务重测。'); log(`保存 ${name}`); }}>保存候选版本并重测</button>
      <p className="pt-boundary">绿色不代表可建设；用地、产权、规划、防洪、消防、管线、造价与审批均未评价。</p>
    </>;

    if (step === 6) return <>
      <h2>具体场域概念设计</h2>
      <Labeled label="设计目标"><textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></Labeled>
      <Labeled label="预算等级"><select value={budget} onChange={(event) => setBudget(event.target.value)}><option>低</option><option>中</option><option>高</option></select></Labeled>
      <div className="pt-source-box"><b>现状证据</b><span>中心广场边界 + 相邻道路 + 4 个特殊标点</span><small>多角度照片与 AI 图像编辑接口在此原型中未接入。</small></div>
      <button className="pt-primary" onClick={() => { setDesignReady(true); setNotice('已生成概念布局与文字方案草案。'); log('生成中心广场概念布局'); }}>生成概念布局与文字方案</button>
      {designReady && <div className="pt-plan"><h3>中心广场 · 概念草案</h3><p><b>空间组织：</b>保留主入口；在南侧连续布置休息、遮阳和照明节点。</p><p><b>近期措施：</b>清理有效通道、修补积水点、补充夜间照明。</p><p><b>模型验证：</b>方案 A 将复测代表性起点至卫生室任务。</p><p><b>待复核：</b>尺寸、排水、结构、用地和审批。</p></div>}
    </>;

    return <>
      <h2>现状 V0 / 方案 A 复测</h2>
      <div className="pt-compare"><article><span>现状 V0</span><b>{Math.round(beforeRoute.length)} m</b><small>{beforeRoute.events.filter((event) => event.category !== '数据缺口').length} 项已知问题</small></article><article className={planApplied ? 'after' : ''}><span>方案 A</span><b>{planApplied ? `${Math.round(afterRoute.length)} m` : '待生成'}</b><small>{planApplied ? `${afterRoute.events.filter((event) => event.category !== '数据缺口').length} 项已知问题` : '连续坡道 + 照明 + 休息点'}</small></article></div>
      <div className="pt-source-box"><b>方案 A 修改</b><span>R-03 台阶改连续坡道、有效宽度占位 1.8 m；R-06 补充照明；广场增加休息点。</span><small>均为概念假设，不是工程尺寸或施工结论。</small></div>
      <button className="pt-primary" onClick={() => { setPlanApplied(true); setHasRun(true); setRouteMode('safe'); setProgress(1); setVersions((items) => items.includes('方案 A · 适老化改善') ? items : [...items, '方案 A · 适老化改善']); setNotice('方案 A 已写入新场景并完成同条件复测。'); log('写入方案 A 并完成同条件复测'); }}>写入方案 A 并复测</button>
      {planApplied && <div className="pt-success"><b>复测完成</b><p>低风险路线由南侧绕行切换为卫生室近路；已知问题从 {beforeRoute.events.filter((event) => event.category !== '数据缺口').length} 项降为 {afterRoute.events.filter((event) => event.category !== '数据缺口').length} 项。保留数据缺口与专业复核事项。</p></div>}
      <h3 className="pt-minor-title">场景版本</h3><ul className="pt-version-list">{versions.map((version) => <li key={version}>{version}</li>)}</ul>
    </>;
  }

  return <main className="prototype-shell">
    <header className="pt-header">
      <div><a href="/">乡村适老化建设辅助工作台</a><span>调试工作区 · V1.1 功能原型</span></div>
      <div className="pt-header-status"><span>项目：青溪村演示</span><span>场景：{planApplied ? '方案 A' : '现状 V0'}</span><span>规则：{RULE_VERSION}</span></div>
      <div className="pt-header-actions"><button onClick={resetDemo}>重置演示</button><button onClick={exportCase}>导出用例</button></div>
    </header>

    <div className="pt-workspace">
      <nav className="pt-steps" aria-label="调试流程">
        <h1>调试流程</h1>
        {STEPS.map((label, index) => <button key={label} className={step === index ? 'active' : ''} onClick={() => { setStep(index); if (index === 4) setRiskLayer(true); }}><span>{String(index + 1).padStart(2, '0')}</span>{label}<i>{index === 0 ? `${roads.filter((road) => road.confirmed).length}/${roads.length}` : index === 2 ? modelState : index === 3 ? hasRun ? '已运行' : '待运行' : index === 7 ? planApplied ? '已复测' : '待复测' : ''}</i></button>)}
        <div className="pt-gate"><b>正式结论门槛</b><p className={locationConfirmed ? 'done' : ''}>位置已确认</p><p className={allRoadsConfirmed ? 'done' : ''}>路网已校正</p><p className={modelState === '已校正' ? 'done' : ''}>低模已校正</p></div>
      </nav>

      <section className="pt-center">
        <div className="pt-toolbar">
          <div role="group" aria-label="场景视图"><button className={!view3d ? 'active' : ''} onClick={() => setView3d(false)}>2D 编辑</button><button className={view3d ? 'active' : ''} disabled={modelState === '未生成' || modelState === '生成中'} onClick={() => setView3d(true)}>3D 低模</button></div>
          <label><input type="checkbox" checked={riskLayer} onChange={(event) => setRiskLayer(event.target.checked)} />Risk Map</label>
          <span className={canDiagnose ? 'ready' : 'preview'}>{canDiagnose ? '可形成正式诊断' : '仅预览'}</span>
        </div>
        <div className="pt-canvas-wrap">
          <Scene view3d={view3d} roads={roads.map((road) => effectiveRoad(road, planApplied))} hazards={hazards} route={hasRun ? route : { ...route, reachable: false }} riskLayer={riskLayer} progress={progress} selectedRoad={selectedRoad} facility={facility} designReady={designReady} onSelectRoad={(id) => { setSelectedRoad(id); setStep(0); }} onSelectHazard={(id) => { setSelectedHazard(id); setStep(1); }} onPlaceFacility={(point) => setFacility((value) => ({ ...(value ?? { name: '候选设施', size: '小', angle: 0 }), ...point }))} placing={step === 5} />
          <div className="pt-legend"><span><i className="road" />确认道路</span><span><i className="candidate" />候选道路</span><span><i className="risk" />风险路段</span><span><i className="route" />运行轨迹</span></div>
          {step === 5 && !view3d && <p className="pt-map-tip">点击地图试放候选设施</p>}
        </div>
        <div className="pt-timeline">
          <span>任务时间线</span>
          <div><i style={{ width: `${progress * 100}%` }} /></div>
          <b>{running ? `NPC 运行中 ${Math.round(progress * 100)}%` : hasRun ? '运行记录可回放' : '等待运行'}</b>
          {hasRun && <button onClick={runSimulation}>回放</button>}
        </div>
      </section>

      <aside className="pt-inspector">{renderInspector()}</aside>
    </div>

    <footer className="pt-footer">
      <div><b>操作记录</b><span>{audit[0]}</span></div>
      <button onClick={() => setNotice('源证据 → 空间对象 → 低模/路网 → 运行事件 → 问题卡 → 方案版本')}>查看追溯链</button>
      <p>内部概念原型，不替代勘察、审批、施工图、检测与验收。</p>
    </footer>
    {notice && <button className="pt-toast" onClick={() => setNotice('')} aria-label="关闭提示">{notice}<span>×</span></button>}
  </main>;
}
