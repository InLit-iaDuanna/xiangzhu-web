'use client';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  Leaf,
  Plus,
  ArrowUpRight,
  Search,
  FolderOpen,
  MapPin,
  Layers,
  ArrowRight,
  FileText,
  Settings,
  Check,
  Upload,
  Satellite,
  Image as ImageIcon,
  Send,
  Sparkles,
  Download,
  PanelRightClose,
  MessageCircle,
  Trash2,
  LocateFixed,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Building2,
  BookOpen,
  GripVertical,
  Link2,
  Unlink,
  Play,
  Users,
  AlertTriangle,
  Clock,
  ShieldCheck,
  GitCompare,
  Accessibility,
  Box,
  MoreVertical,
  Maximize2,
  Minimize2,
  Paperclip,
  X,
  House,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Landing from './landing';
import SpatialEditor from './spatial-editor';
import { emptySpatial, type Spatial } from '@/lib/spatial';
import { ApiError, request } from '@/lib/v2/client';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  formatFileSize,
  getAssistantStatus,
  parseArchiveFill,
  readAttachment,
  streamAssistant,
  stripArchiveFill,
  toPayloadAttachments,
  type DraftAttachment,
} from '@/lib/assistant';
import {
  PHOTO_SLOTS,
  computeWorkspaceFlow,
  fillableArchiveFields,
} from '@/lib/workspace-flow';
type WorkspacePanel = 'archive' | 'debug' | 'plans';
type WorkspacePage = 'home' | 'workspace' | WorkspacePanel;
type PlanPageMotion = 'idle' | 'crossfading';
type Photo = {
  id: string;
  name: string;
  category: string;
  src: string;
  note?: string;
};
type Mark = {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: string;
  observation?: string;
  status?: '待核实' | '已确认';
};
type DebugRun = {
  id: string;
  title: string;
  scenarios: string[];
  status: '待建模' | '资料准备中' | '待专业复核';
  created: string;
  note: string;
};
type Plan = {
  id: string;
  title: string;
  body: string;
  scene?: string;
  scope?: string;
  references?: string;
  innovation?: string;
  compliance?: string;
  implementation?: string;
  cost?: string;
  maintenance?: string;
  verification?: string;
  tradeoffs?: string;
  tasks?: string[];
};
type PlanTextField = Exclude<keyof Plan, 'tasks'>;
type Project = {
  spatial?: Spatial;
  id: string;
  name: string;
  address: string;
  updated: string;
  fields: Record<string, string>;
  facilities: string[];
  photos: Photo[];
  marks: Mark[];
  debugScenarios: string[];
  debugRuns: DebugRun[];
  plans: Plan[];
  current: string;
  /** 建档完成后，用户是否已对齐疑点并确认进入调试。 */
  debugEntry?: 'pending' | 'confirmed';
};
/** 消息里回显的附件：只保留展示所需字段，不含发送用的原始数据。 */
type MessageAttachment = {
  id: string;
  name: string;
  mime: string;
  kind: DraftAttachment['kind'];
  size: number;
  preview?: string;
};

type ChatMessage = {
  role: string;
  text: string;
  context?: WorkspacePanel;
  attachments?: MessageAttachment[];
  /** 模型的思考过程，折叠展示，不进入正文。 */
  thinking?: string;
  /** 已把这轮图片存入的图片库分类，避免重复入库。 */
  filedSlot?: string;
};

type KnowledgeLayer = {
  title: string;
  purpose: string;
  trace: string;
};
const knowledgeLayers: KnowledgeLayer[] = [
  {
    title: '法规、规范与政策依据',
    purpose: '校验安全、尺寸、审批与责任边界',
    trace: '保留条文、地区与版本',
  },
  {
    title: '乡村适老化原则与评估',
    purpose: '围绕安全、独立使用、识路、停留与求助判断',
    trace: '记录评估方法与适用条件',
  },
  {
    title: '国内外公共空间案例',
    purpose: '迁移可验证的场景做法，而非套用模板',
    trace: '标注案例地区与可迁移范围',
  },
  {
    title: '环境分析',
    purpose: '核对地形、气候、日照、雨水、积水与照明',
    trace: '关联现场资料与分析时间',
  },
  {
    title: '材料、节点与施工做法',
    purpose: '判断建造条件、成本、施工影响和维护要求',
    trace: '保留材料参数与施工来源',
  },
  {
    title: '老人行为与使用场景',
    purpose: '组织行走、停顿、绕行、休息、识路、如厕与求助',
    trace: '关联人物特征与观察证据',
  },
  {
    title: '项目复盘与失败经验',
    purpose: '识别效果、失效原因与长期维护风险',
    trace: '记录项目阶段与证据等级',
  },
];
const panelMeta: {
  id: WorkspacePanel;
  title: string;
  sub: string;
  Icon: typeof FolderOpen;
}[] = [
  { id: 'archive', title: '档案', sub: '村庄与老人需求', Icon: FolderOpen },
  { id: 'debug', title: '调试', sub: '空间分析与行为脚本', Icon: Play },
  { id: 'plans', title: '方案', sub: '比较、依据与复核', Icon: FileText },
];
const behaviorScenarios = [
  '行走',
  '停顿',
  '绕行',
  '休息',
  '识路',
  '如厕',
  '求助',
];
const photoCategories = [
  {
    title: '卫星航拍图',
    sub: '了解道路、居住点与设施的整体关系',
    Icon: Satellite,
    preview: '/gallery-satellite-map.webp',
    tone: 'green',
  },
  {
    title: '重点区域与道路',
    sub: '记录高差、积水、断点与建设约束',
    Icon: MapPin,
    preview: '/gallery-priority-map.webp',
    tone: 'peach',
  },
  {
    title: '村庄场景图片',
    sub: '留存老人真实使用与停留场景',
    Icon: ImageIcon,
    preview: '/countryside.png',
    tone: 'peach',
  },
];
const sample: Project = {
  id: 'qingxi',
  name: '青溪村 · 适老化建设计划',
  address: '浙江省 / 杭州市 / 桐庐县 / 分水镇 / 青溪村',
  updated: '2026-09-08',
  fields: {
    area: '12.6',
    households: '386',
    population: '1128',
    elderlyPopulation: '361',
    old: '32',
    livingAlone: '46',
    mobilityLimited: '28',
    economy: '生态农业',
    budget: '50–100 万元',
    notes:
      '以水稻种植、乡村旅游为主，保留传统村落肌理。重点关注老人从居住点到卫生室、助餐点和文化礼堂的日常路径。',
    elderProfiles:
      '高龄独居老人主要分布在老村组；部分老人使用手杖，雨天外出频率明显下降。',
    elderBehaviors:
      '上午前往集市和卫生室，傍晚在村口、文化礼堂附近停留；连续步行约 150–200 米后需要休息。',
    elderNeeds:
      '连续防滑慢行路径、可辨识导向、遮阴休息点、夜间照明、就近如厕与紧急求助。',
    roads: '主路基本硬化，支路局部坡陡、路缘高差明显，雨后易积水。',
    residential: '居住点较分散，老村组与公共服务设施之间存在步行距离和高差。',
    priorityAreas: '卫生室—文化礼堂—村口集市之间的日常活动路径。',
    constraints:
      '村道宽度有限；传统村落风貌需保留；部分用地权属和排水条件待核实。',
    cases: '待从知识库补充具有相似地形、气候与人口结构的案例。',
    userRequirements: '优先做低干扰、可分期、便于村级维护的改造。',
    designGoals: '让老人可以更安全、独立地完成出行、休息、识路、如厕与求助。',
    openQuestions:
      '雨天积水范围、夜间照度、公共厕所开放时段、重点老人真实步行路线待现场核实。',
    fieldNotes: '现场调研记录待继续补充。',
    elderPersona:
      '以 70–85 岁、可独立或借助手杖出行的老人作为第一阶段重点人物。',
    mobilityConstraints:
      '步速较慢、连续步行距离有限，对高差、湿滑路面和复杂导向更敏感。',
    testGoal: '检验日常公共服务路径是否连续、可休息、可识别并可及时求助。',
  },
  facilities: ['村委会', '卫生室', '助餐点', '文化礼堂', '公共厕所'],
  photos: [
    {
      id: 'scene-qingxi',
      name: '青溪村场景照片',
      category: '村庄场景图片',
      src: '/countryside.png',
      note: '图片作为场景参考，正式使用前请完成现场资料核验。',
    },
  ],
  marks: [],
  debugScenarios: ['行走', '停顿', '休息', '识路', '求助'],
  debugRuns: [],
  plans: [
    {
      id: 'p1',
      title: '连续慢行与休憩网络 · 方案 A',
      body: '老人从老村组前往卫生室、助餐点和文化礼堂时，需要经过坡陡、路缘高差和缺少休息点的路段。雨天湿滑与积水会进一步降低独立出行意愿。',
      scene:
        '重点影响使用手杖、步速较慢及需要中途休息的老人，覆盖就医、就餐、社交与日常采购。',
      scope: '卫生室—文化礼堂—村口集市的高频慢行路径及沿线节点。',
      references:
        '关联乡村适老化评估、无障碍通行、安全照明与休憩设施资料；具体条文和尺寸待知识库核验。',
      innovation:
        '把连续通行、短距离休息、识路和求助整合为一条可分期建设的日常生活支持网络。',
      compliance:
        '涉及坡度、防滑、扶手、照明与无障碍尺寸的内容需由专业人员按项目所在地现行规范复核。',
      implementation:
        '先处理高频危险点和断点，再补充休息、导向及求助节点；施工期间保留基本通行。',
      cost: '中等；可按关键节点、连续路段、服务网络三期实施。',
      maintenance:
        '明确村级巡检责任，雨季重点检查排水、防滑面层、照明和座椅稳固性。',
      verification:
        '需核实真实步行路线、坡度与高差、雨天积水、夜间照度、土地权属和维护主体。',
      tradeoffs: '覆盖面较广、连续性强，但前期测绘与多节点协调量较大。',
    },
    {
      id: 'p2',
      title: '邻里照护微节点 · 方案 B',
      body: '分散居住使部分高龄老人难以持续到达中心公共设施，日常停留、短时照护和求助节点不足。',
      scene: '面向高龄独居、活动半径较小及需要邻里照看的老人。',
      scope: '老村组入口、巷道交汇处及现有闲置小空间。',
      references:
        '关联老人行为场景、邻里照护案例和公共设施维护经验；来源待知识库补充。',
      innovation:
        '以小尺度、可维护的邻里节点缩短支持距离，并与村级照护联络机制结合。',
      compliance:
        '不得占用消防、应急和必要通行空间，构筑物安全与用地条件需复核。',
      implementation:
        '优先选择权属清晰、邻里参与度高的两处节点试点，再根据使用反馈扩展。',
      cost: '低至中等；单点投入较小，后续网络化需持续运营。',
      maintenance: '由村集体与邻里志愿者共同巡查，明确设施报修和紧急联络流程。',
      verification:
        '需核实老人分布、实际停留点、邻里照护意愿、权属和消防条件。',
      tradeoffs: '启动快、干扰小，但服务覆盖依赖节点分布和日常运营。',
    },
    {
      id: 'p3',
      title: '公共服务识路提升 · 方案 C',
      body: '公共服务设施之间缺少统一、易辨认的导向，转折点和夜间环境容易造成犹豫与绕行。',
      scene: '面向视力下降、记忆与方向判断能力减弱的老人，也兼顾外来访客。',
      scope: '村口、主要路口、卫生室、助餐点、公共厕所和文化礼堂。',
      references:
        '关联认知友好导向、夜间照明和乡村风貌协调方法；参数待专业复核。',
      innovation: '以地标、色彩、距离提示和连续照明组成低文字依赖的识路系统。',
      compliance:
        '标识设置不得影响交通安全，照明、用电和结构固定应按现行要求复核。',
      implementation:
        '先以可移除标识开展路径测试，再定稿材料、位置与夜间照明。',
      cost: '低至中等；适合快速试点和迭代。',
      maintenance: '定期检查可见度、遮挡、褪色、照明和信息准确性。',
      verification:
        '需组织老人实走测试，核实视距、理解度、夜间效果及风貌协调。',
      tradeoffs: '见效快、成本可控，但不能替代通行空间本身的安全改造。',
    },
  ],
  current: 'p1',
};
function normalizeProject(value: Project): Project {
  const plans = (value.plans || []).map((plan) => ({
    scene: '',
    scope: '',
    references: '',
    innovation: '',
    compliance: '',
    implementation: '',
    cost: '',
    maintenance: '',
    verification: '',
    tradeoffs: '',
    tasks: [],
    ...plan,
  }));
  return {
    ...sample,
    ...value,
    fields: { ...value.fields },
    facilities: value.facilities || [],
    photos: value.photos || [],
    marks: (value.marks || []).map((mark) => ({
      observation: '',
      status: '待核实',
      ...mark,
    })),
    debugScenarios: value.debugScenarios || [],
    debugRuns: value.debugRuns || [],
    plans,
    current: value.current || plans[0]?.id || '',
    debugEntry: value.debugEntry === 'confirmed' ? 'confirmed' : 'pending',
  };
}
function readDB(): Promise<Project[] | undefined> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('xiangzhu-workspace', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('data');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction('data').objectStore('data').get('projects');
      q.onsuccess = () => {
        resolve(q.result);
        db.close();
      };
      q.onerror = () => reject(q.error);
    };
  });
}
function writeDB(data: Project[]) {
  return new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('xiangzhu-workspace', 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result,
        t = db.transaction('data', 'readwrite');
      t.objectStore('data').put(data, 'projects');
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    };
  });
}
export default function Workspace() {
  const [projects, setProjects] = useState<Project[]>([sample]);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<WorkspacePage>('debug');
  const [fadingPanel, setFadingPanel] = useState<WorkspacePanel | null>(null);
  const [active, setActive] = useState('qingxi');
  const [tab, setTab] = useState('basic');
  const [debugTab, setDebugTab] = useState('map');
  const [assistant, setAssistant] = useState(true);
  const [assistantZoomed, setAssistantZoomed] = useState(false);
  /** 调试台「转译平面图」AI 识别所需的后端项目与连接状态。 */
  const [spatialProjectId, setSpatialProjectId] = useState('');
  const [spatialConnected, setSpatialConnected] = useState(false);
  /** 工作台文档（服务器 doc）版本与保存代数：乐观锁与响应乱序保护。 */
  const docVersion = useRef(0);
  const docLoaded = useRef(false);
  const saveGeneration = useRef(0);
  /** 本机 IndexedDB 旧数据待迁移至服务器（迁移确认弹窗）。 */
  const [migrateLocal, setMigrateLocal] = useState<Project[] | null>(null);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [lastPanel, setLastPanel] = useState<WorkspacePanel>('archive');
  const [attachedPanel, setAttachedPanel] = useState<WorkspacePanel | null>(
    null,
  );
  const [draggingPanel, setDraggingPanel] = useState<WorkspacePanel | null>(
    null,
  );
  const [dragOverAssistant, setDragOverAssistant] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>(['p1', 'p2']);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState('');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState('正在载入');
  const [category, setCategory] = useState('卫星航拍图');
  const [galleryCategory, setGalleryCategory] = useState<string | null>(null);
  const [markKind, setMarkKind] = useState('通行障碍');
  const [selectedPlan, setSelectedPlan] = useState('p1');
  const [displayedPlan, setDisplayedPlan] = useState('p1');
  const [outgoingPlanHtml, setOutgoingPlanHtml] = useState<string | null>(null);
  const [planPageMotion, setPlanPageMotion] =
    useState<PlanPageMotion>('idle');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftFiles, setDraftFiles] = useState<DraftAttachment[]>([]);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLElement>(null);
  const pageRef = useRef<WorkspacePage>('debug');
  const navBrushFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlan = useRef<string | null>(null);
  const planMotion = useRef<PlanPageMotion>('idle');
  const planSwitchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const aiAbort = useRef<AbortController | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPhase, setAiPhase] = useState('');
  const [aiStatus, setAiStatus] = useState<{
    available: boolean;
    version: string | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getAssistantStatus(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAiStatus({ available: result.available, version: result.version });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAiStatus({ available: false, version: null });
        }
      });
    return () => {
      controller.abort();
      aiAbort.current?.abort();
      aiAbort.current = null;
    };
  }, []);
  // 连接本地业务服务：为调试台「转译平面图」的 AI 识别准备后端项目。
  useEffect(() => {
    void (async () => {
      try {
        const list = await request<{ id: string }[]>('/api/v1/projects');
        let pid = list[0]?.id;
        if (!pid) {
          const created = await request<{ id: string }>('/api/v1/projects', {
            method: 'POST',
            body: JSON.stringify({
              name: '青溪村 · 适老化建设计划',
              mode: 'demo',
            }),
          });
          pid = created.id;
        }
        setSpatialProjectId(pid);
        setSpatialConnected(true);
      } catch {
        setSpatialConnected(false);
      }
    })();
  }, []);
  const project = projects.find((p) => p.id === active) || projects[0];
  const plan =
    project.plans.find((p) => p.id === displayedPlan) || project.plans[0];
  const comparisonPlans = compareIds
    .map((id) => project.plans.find((item) => item.id === id))
    .filter((item): item is Plan => Boolean(item));
  const satellite = project.photos.find((p) => p.category === '卫星航拍图');
  const galleryPhotos = galleryCategory
    ? project.photos.filter((photo) => photo.category === galleryCategory)
    : [];
  const openPanel: WorkspacePanel | null = panelMeta.some(
    (item) => item.id === page,
  )
    ? (page as WorkspacePanel)
    : null;
  // 对话作用域：点开某个板块即限定在该板块，其次是显式拖入的板块，最后回落到上次板块。
  const scopedByOpenPanel = Boolean(openPanel);
  const conversationPanel: WorkspacePanel =
    openPanel ?? attachedPanel ?? lastPanel;
  const conversationTitle =
    panelMeta.find((item) => item.id === conversationPanel)?.title || '档案';
  // 建档 → 调试 → 方案 的推进状态，界面提示与助手上下文共用这一份判断。
  const flow = computeWorkspaceFlow(project, conversationPanel);
  const setWorkspacePage = useCallback((value: WorkspacePage) => {
    const previous = panelMeta.some((item) => item.id === pageRef.current)
      ? (pageRef.current as WorkspacePanel)
      : null;
    const next = panelMeta.some((item) => item.id === value)
      ? (value as WorkspacePanel)
      : null;
    if (previous && previous !== next) {
      if (navBrushFadeTimer.current) clearTimeout(navBrushFadeTimer.current);
      setFadingPanel(previous);
      navBrushFadeTimer.current = setTimeout(() => {
        setFadingPanel(null);
        navBrushFadeTimer.current = null;
      }, 480);
    }
    pageRef.current = value;
    setPage(value);
  }, []);
  useEffect(() => {
    void (async () => {
      // 数据全走后端：优先加载服务器工作台文档（多设备共享）。
      let serverReachable = false;
      try {
        const result = await request<{
          doc: Project[] | null;
          version: number;
        }>('/api/v1/workspace/doc');
        serverReachable = true;
        docVersion.current = result.version;
        if (result.doc?.length) {
          const normalizedProjects = result.doc.map(normalizeProject);
          const firstPlan = normalizedProjects[0].plans[0]?.id || '';
          setProjects(normalizedProjects);
          setActive(normalizedProjects[0].id);
          setSelectedPlan(firstPlan);
          setDisplayedPlan(firstPlan);
          docLoaded.current = true;
          setSaved('已保存至服务器');
        }
      } catch {
        setSaved('服务器未连接');
      }
      if (!docLoaded.current) {
        // 服务器无数据或不可达：回读本机 IndexedDB（旧版本数据或离线草稿）。
        try {
          const local = await readDB();
          if (local?.length) {
            const normalizedProjects = local.map(normalizeProject);
            const firstPlan = normalizedProjects[0].plans[0]?.id || '';
            setProjects(normalizedProjects);
            setActive(normalizedProjects[0].id);
            setSelectedPlan(firstPlan);
            setDisplayedPlan(firstPlan);
            if (serverReachable) {
              // 服务器可达但为空：提示一键迁移；迁移完成前不向服务器写入，防误覆盖。
              setMigrateLocal(normalizedProjects);
            } else {
              docLoaded.current = true;
              setSaved('已保存至本地（离线）');
            }
          } else if (serverReachable) {
            docLoaded.current = true;
            setSaved('尚未创建项目');
          }
        } catch {
          if (serverReachable) docLoaded.current = true;
        }
      }
      setReady(true);
    })();
    const hash = () => {
      const hashValue = location.hash.slice(1);
      const v = hashValue === 'survey' ? 'debug' : hashValue;
      if (['home', 'workspace', 'archive', 'debug', 'plans'].includes(v))
        setWorkspacePage(v as WorkspacePage);
    };
    hash();
    window.addEventListener('hashchange', hash);
    window.addEventListener('popstate', hash);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('popstate', hash);
    };
  }, [setWorkspacePage]);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      // 本地 IndexedDB 始终留一份兜底（离线仍可继续工作）。
      writeDB(projects).catch(() => {});
      if (!docLoaded.current) return;
      const generation = ++saveGeneration.current;
      request<{ version: number }>('/api/v1/workspace/doc', {
        method: 'PUT',
        body: JSON.stringify({ doc: projects, version: docVersion.current }),
      })
        .then((r) => {
          if (generation !== saveGeneration.current) return;
          docVersion.current = r.version;
          setSaved('已保存至服务器');
        })
        .catch((e: unknown) => {
          if (generation !== saveGeneration.current) return;
          if (e instanceof ApiError && e.status === 409) {
            setNotice('其他设备已保存更新，请刷新页面加载最新内容');
            setSaved('保存冲突，需刷新');
          } else {
            setSaved('已保存至本地（服务器不可达）');
          }
        });
    }, 300);
    return () => clearTimeout(id);
  }, [projects, ready]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages]);
  useEffect(
    () => () => {
      planSwitchTimers.current.forEach(clearTimeout);
      if (navBrushFadeTimer.current) clearTimeout(navBrushFadeTimer.current);
    },
    [],
  );
  function setPlanMotion(value: PlanPageMotion) {
    planMotion.current = value;
    setPlanPageMotion(value);
  }
  function clearPlanSwitchTimers() {
    planSwitchTimers.current.forEach(clearTimeout);
    planSwitchTimers.current = [];
  }
  function showPlanImmediately(id: string) {
    clearPlanSwitchTimers();
    pendingPlan.current = null;
    setSelectedPlan(id);
    setDisplayedPlan(id);
    setOutgoingPlanHtml(null);
    setPlanMotion('idle');
    paper.current?.scrollTo({ top: 0 });
  }
  function runPlanTransition(id: string) {
    clearPlanSwitchTimers();
    pendingPlan.current = null;
    const outgoingHtml = paper.current?.innerHTML;
    if (!outgoingHtml) {
      showPlanImmediately(id);
      return;
    }
    setOutgoingPlanHtml(outgoingHtml);
    setPlanMotion('crossfading');
    setDisplayedPlan(id);
    paper.current?.scrollTo({ top: 0 });
    const transitionTimer = setTimeout(() => {
      setOutgoingPlanHtml(null);
      setPlanMotion('idle');
      const queuedPlan = pendingPlan.current;
      if (queuedPlan && queuedPlan !== id) runPlanTransition(queuedPlan);
    }, 220);
    planSwitchTimers.current = [transitionTimer];
  }
  function switchPlan(id: string) {
    if (!id || (id === selectedPlan && id === displayedPlan)) return;
    setSelectedPlan(id);
    setEditing(false);
    pendingPlan.current = id;

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(max-width: 650px)').matches
    ) {
      showPlanImmediately(id);
      return;
    }
    if (planMotion.current !== 'idle') return;
    runPlanTransition(id);
  }
  function navigate(v: WorkspacePage) {
    setWorkspacePage(v);
    window.history.pushState(null, '', `#${v}`);
    setEditing(false);
  }
  function togglePanel(panel: WorkspacePanel) {
    setLastPanel(panel);
    if (page === panel) {
      navigate('workspace');
      return;
    }
    navigate(panel);
  }
  function attachToAssistant(panel: WorkspacePanel) {
    setLastPanel(panel);
    setAttachedPanel(panel);
    setAssistant(true);
    setDragOverAssistant(false);
    navigate('workspace');
    setNotice(
      `已关联“${panelMeta.find((item) => item.id === panel)?.title}”资料`,
    );
  }
  function update(fn: (p: Project) => Project) {
    setProjects((all) =>
      all.map((p) =>
        p.id === active ? { ...fn(p), updated: new Date().toISOString() } : p,
      ),
    );
  }
  function openProject(id: string) {
    const firstPlan = projects.find((p) => p.id === id)?.plans[0]?.id || '';
    setActive(id);
    setLastPanel('archive');
    setMessages([]);
    setAttachedPanel(null);
    setComparing(false);
    showPlanImmediately(firstPlan);
    navigate('archive');
  }
  function switchProject(id: string) {
    if (id === active) return;
    const nextProject = projects.find((item) => item.id === id);
    if (!nextProject) return;
    setActive(id);
    setMessages([]);
    setAttachedPanel(null);
    setComparing(false);
    showPlanImmediately(nextProject.plans[0]?.id || '');
    setNotice(`已切换至${nextProject.name.split(' · ')[0]}`);
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (...args: unknown[]) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'navigate_village_workspace',
          description:
            'Open or collapse the archive, debugging or plans panel of the current age-friendly village project.',
          inputSchema: {
            type: 'object',
            properties: {
              page: {
                type: 'string',
                enum: ['home', 'workspace', 'archive', 'debug', 'plans'],
              },
            },
            required: ['page'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input: unknown) {
            const value = (input as { page?: string })?.page;
            if (
              !value ||
              !['home', 'workspace', 'archive', 'debug', 'plans'].includes(
                value,
              )
            )
              throw new Error('Unknown workspace page');
            setWorkspacePage(value as WorkspacePage);
            window.history.pushState(null, '', `#${value}`);
            setEditing(false);
            return { page: value };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [setWorkspacePage]);
  function create() {
    if (!name.trim()) return;
    if (dialog === 'project') {
      const id = crypto.randomUUID();
      setProjects((p) => [
        ...p,
        {
          id,
          name: name.trim(),
          address: '',
          updated: new Date().toISOString(),
          fields: {},
          facilities: [],
          photos: [],
          marks: [],
          debugScenarios: [],
          debugRuns: [],
          plans: [],
          current: '',
        },
      ]);
      setActive(id);
      navigate('archive');
    } else {
      const id = crypto.randomUUID();
      update((p) => ({
        ...p,
        plans: [
          {
            id,
            title: name.trim(),
            body: '说明问题依据，以及受影响的老人使用场景。',
            scene: '',
            scope: '',
            references: '',
            innovation: '',
            compliance: '',
            implementation: '',
            cost: '',
            maintenance: '',
            verification: '',
            tradeoffs: '',
            tasks: [],
          },
          ...p.plans,
        ],
        current: p.current || id,
      }));
      showPlanImmediately(id);
      navigate('plans');
    }
    setDialog('');
    setName('');
    setNotice('创建成功');
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    const photos: Photo[] = [];
    for (const f of Array.from(files)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        setNotice('请选择 JPG、PNG 或 WebP 图片');
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        setNotice('单张图片请小于 15 MB');
        continue;
      }
      // 图片优先上传服务器材料库（doc 只存引用，避免 base64 撑爆文档）；服务器不可用回退 base64。
      let src = '';
      if (spatialProjectId) {
        try {
          const form = new FormData();
          form.append('file', f);
          const m = await request<{ id: string }>(
            `/api/v1/projects/${spatialProjectId}/materials`,
            { method: 'POST', body: form },
          );
          src = `/api/v1/projects/${spatialProjectId}/materials/${m.id}`;
        } catch {
          src = '';
        }
      }
      if (!src) {
        src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('图片读取失败'));
          };
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
      }
      photos.push({ id: crypto.randomUUID(), name: f.name, category, src });
    }
    update((p) => ({ ...p, photos: [...p.photos, ...photos] }));
    if (photos.length) setNotice(`已添加 ${photos.length} 张图片`);
    if (file.current) file.current.value = '';
  }
  /** 把本机 IndexedDB 旧数据导入服务器：图片补传材料库，项目整体并入工作台文档。 */
  async function importLocalProjects() {
    const source = migrateLocal;
    if (!source || migrateBusy) return;
    setMigrateBusy(true);
    try {
      const copied: Project[] = [];
      for (const proj of source) {
        const photos: Photo[] = [];
        for (const photo of proj.photos) {
          if (photo.src.startsWith('data:') && spatialProjectId) {
            try {
              const blob = await (await fetch(photo.src)).blob();
              const form = new FormData();
              form.append(
                'file',
                new File([blob], photo.name || 'image', {
                  type: blob.type || 'image/png',
                }),
              );
              const m = await request<{ id: string }>(
                `/api/v1/projects/${spatialProjectId}/materials`,
                { method: 'POST', body: form },
              );
              photos.push({
                ...photo,
                src: `/api/v1/projects/${spatialProjectId}/materials/${m.id}`,
              });
              continue;
            } catch {
              // 单张上传失败保留 base64 原文（文档仍可用），后续可手动重传。
            }
          }
          photos.push(photo);
        }
        copied.push({ ...proj, photos });
      }
      setProjects(copied);
      setActive(copied[0]?.id || '');
      docLoaded.current = true;
      setMigrateLocal(null);
      setNotice('已导入本机旧数据');
    } finally {
      setMigrateBusy(false);
    }
  }
  function addMapMark(x: number, y: number) {
    update((p) => ({
      ...p,
      marks: [
        ...p.marks,
        {
          id: crypto.randomUUID(),
          x,
          y,
          label: `${markKind} ${p.marks.length + 1}`,
          kind: markKind,
          observation: '',
          status: '待核实',
        },
      ],
    }));
  }
  async function addFiles(list: FileList | File[] | null) {
    const incoming = list ? Array.from(list) : [];
    if (!incoming.length) return;

    const room = Math.max(0, MAX_ATTACHMENT_COUNT - draftFiles.length);
    const accepted: DraftAttachment[] = [];
    let skipped = 0;

    setReadingFiles(true);
    try {
      for (const file of incoming) {
        if (accepted.length >= room || file.size > MAX_ATTACHMENT_BYTES) {
          skipped += 1;
          continue;
        }
        try {
          accepted.push(await readAttachment(file));
        } catch {
          skipped += 1;
        }
      }
    } finally {
      setReadingFiles(false);
    }

    if (accepted.length) {
      setDraftFiles((current) => [...current, ...accepted]);
    }
    if (skipped) {
      setNotice(
        `已跳过 ${skipped} 个文件：单个不超过 ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB，最多 ${MAX_ATTACHMENT_COUNT} 个`,
      );
    } else if (accepted.length) {
      setNotice(`已添加 ${accepted.length} 个附件`);
    }
  }
  function removeDraft(id: string) {
    setDraftFiles((current) => current.filter((item) => item.id !== id));
  }
  /** 把某一轮对话里的图片存入图片库的指定分类。 */
  function fileMessagePhotos(index: number, slot: string) {
    const source = messages[index];
    const images = (source?.attachments ?? []).filter(
      (item) => item.kind === 'image' && item.preview,
    );
    if (!images.length) return;

    update((p) => ({
      ...p,
      photos: [
        ...p.photos,
        ...images.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          category: slot,
          src: item.preview as string,
        })),
      ],
    }));
    setMessages((m) =>
      m.map((item, i) => (i === index ? { ...item, filedSlot: slot } : item)),
    );
    setNotice(`已把 ${images.length} 张图片存入「${slot}」`);
  }
  /** 从图片库删除一张图片。 */
  function removePhoto(id: string) {
    update((p) => ({
      ...p,
      photos: p.photos.filter((photo) => photo.id !== id),
    }));
    setNotice('已删除该图片');
  }
  /** 把一张图片移动到图片库的另一个分类。 */
  function movePhoto(id: string, target: string) {
    update((p) => ({
      ...p,
      photos: p.photos.map((photo) =>
        photo.id === id ? { ...photo, category: target } : photo,
      ),
    }));
    setNotice(`已移动到「${target}」`);
  }
  /** 疑点对齐完毕，正式进入调试阶段。 */
  function confirmDebugEntry() {
    update((p) => ({ ...p, debugEntry: 'confirmed' }));
    setNotice('已确认进入调试阶段');
    navigate('debug');
  }
  /** 把文档里识别出的档案信息写入仍然为空的基本信息字段。 */
  function applyArchiveFill(values: Record<string, string>) {
    const labels = new Map(
      fillableArchiveFields(project).map((item) => [item.key, item.label]),
    );
    const entries = Object.entries(values).filter(
      ([key, value]) => labels.has(key) && value.trim().length > 0,
    );
    if (!entries.length) return;

    update((p) => {
      const fields = { ...p.fields };
      for (const [key, value] of entries) {
        const current = fields[key];
        if (!current || !current.trim()) fields[key] = value;
      }
      return { ...p, fields };
    });
    setNotice(
      `已从文档填入 ${entries.length} 项：${entries
        .map(([key]) => labels.get(key))
        .join('、')}`,
    );
  }
  function isFileDrag(event: ReactDragEvent<HTMLElement>) {
    const types = event.dataTransfer?.types;
    return types ? Array.from(types).includes('Files') : false;
  }
  function send(text = message) {
    const question = text.trim();
    const outgoing = draftFiles;
    if ((!question && !outgoing.length) || aiAbort.current) return;
    setMessage('');
    setNotice('');

    const history = messages
      .filter((item) => item.text.trim())
      .map((item) => ({
        role: item.role === 'user' ? ('user' as const) : ('assistant' as const),
        text: item.text,
      }));

    setMessages((m) => [
      ...m,
      {
        role: 'user',
        text: question,
        context: conversationPanel,
        attachments: outgoing.length
          ? outgoing.map((item) => ({
              id: item.id,
              name: item.name,
              mime: item.mime,
              kind: item.kind,
              size: item.size,
              preview: item.preview,
            }))
          : undefined,
      },
      { role: 'assistant', text: '', context: conversationPanel },
    ]);
    setDraftFiles([]);
    setAiBusy(true);
    setAiPhase('');

    const controller = new AbortController();
    aiAbort.current = controller;

    let answer = '';
    const appendToLast = (chunk: string) => {
      answer += chunk;
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== 'assistant') return m;
        return [...m.slice(0, -1), { ...last, text: last.text + chunk }];
      });
    };
    const appendThinking = (chunk: string) => {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== 'assistant') return m;
        return [
          ...m.slice(0, -1),
          { ...last, thinking: (last.thinking ?? '') + chunk },
        ];
      });
    };

    streamAssistant({
      messages: [...history, { role: 'user', text: question }],
      attachments: outgoing.length ? toPayloadAttachments(outgoing) : undefined,
      context: {
        panel: conversationPanel,
        panelTitle: conversationTitle,
        flow: {
          stage: conversationPanel,
          archiveReady: flow.archive.ready,
          missingFields: flow.archive.missingFields,
          missingSlots: flow.archive.missingSlots,
          fillableFields: fillableArchiveFields(project),
          photoCount: flow.archive.photoCount,
          openIssues: flow.openIssues,
          debugIntegrated: flow.debug.integrated,
          debugConfirmed: flow.debug.confirmed,
          debugRunCount: flow.debug.runCount,
          debugMarkCount: flow.debug.markCount,
          nextActionLabel: flow.nextActionLabel,
        },
        project: {
          name: project.name,
          address: project.address,
          facilities: project.facilities,
          photoCount: project.photos.length,
          markCount: project.marks.length,
          confirmedMarkCount: project.marks.filter(
            (mark) => mark.status === '已确认',
          ).length,
          debugScenarioCount: project.debugScenarios.length,
          debugRunCount: project.debugRuns.length,
          planCount: project.plans.length,
          fields: project.fields,
        },
        plan:
          conversationPanel === 'plans' && plan
            ? {
                title: plan.title,
                scene: plan.scene,
                scope: plan.scope,
                references: plan.references,
                innovation: plan.innovation,
                compliance: plan.compliance,
                implementation: plan.implementation,
                cost: plan.cost,
                maintenance: plan.maintenance,
                verification: plan.verification,
                tradeoffs: plan.tradeoffs,
                body: plan.body,
              }
            : undefined,
      },
      signal: controller.signal,
      onDelta: appendToLast,
      onThinking: appendThinking,
      onStatus: (status) => setAiPhase(status === 'compacting' ? '整理上下文…' : ''),
    })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const failure =
          error instanceof Error ? error.message : 'AI 服务暂时不可用';
        appendToLast(failure);
        setNotice(failure);
      })
      .finally(() => {
        aiAbort.current = null;
        setAiBusy(false);
        setAiPhase('');
        applyArchiveFill(parseArchiveFill(answer));
        setMessages((m) => {
          const last = m[m.length - 1];
          if (!last || last.role !== 'assistant') return m;
          if (stripArchiveFill(last.text).trim()) return m;
          return [...m.slice(0, -1), { ...last, text: '（本次没有返回内容，请重试）' }];
        });
      });
  }
  function updatePlanField(field: PlanTextField, value: string) {
    if (!plan) return;
    update((p) => ({
      ...p,
      plans: p.plans.map((item) =>
        item.id === plan.id ? { ...item, [field]: value } : item,
      ),
    }));
  }
  function toggleScenario(scenario: string, checked: boolean) {
    update((p) => ({
      ...p,
      debugScenarios: checked
        ? Array.from(new Set([...p.debugScenarios, scenario]))
        : p.debugScenarios.filter((item) => item !== scenario),
    }));
  }
  function createDebugRun() {
    if (!project.debugScenarios.length) {
      setNotice('请先选择至少一个老人使用场景');
      return;
    }
    const run: DebugRun = {
      id: crypto.randomUUID(),
      title: `行为调试任务 ${project.debugRuns.length + 1}`,
      scenarios: project.debugScenarios,
      status: '待建模',
      created: new Date().toISOString(),
      note: project.fields.testGoal || '调试目标待补充。',
    };
    update((p) => ({ ...p, debugRuns: [run, ...p.debugRuns] }));
    setDebugTab('runs');
    setNotice('已保存调试任务；场景编辑与行为模拟将按项目资料逐步完善');
  }
  function toggleComparePlan(id: string) {
    setCompareIds((ids) =>
      ids.includes(id)
        ? ids.filter((item) => item !== id)
        : [...ids.slice(-1), id],
    );
  }
  function renderPlanField(field: PlanTextField, placeholder: string) {
    const value = plan?.[field] || '';
    return editing ? (
      <textarea
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(event) => updatePlanField(field, event.target.value)}
      />
    ) : (
      <p className={field === 'body' ? 'plan-body' : ''}>
        {value || `待补充：${placeholder}`}
      </p>
    );
  }
  function download() {
    const planText = plan
      ? [
          plan.title,
          `\n一、问题依据与老人使用场景\n${plan.body}\n${plan.scene || ''}`,
          `\n二、适用空间与建设对象\n${plan.scope || '待补充'}`,
          `\n三、案例、规范与研究关联\n${plan.references || '待核验'}`,
          `\n四、创新点与具体价值\n${plan.innovation || '待补充'}`,
          `\n五、合规、实施、成本与维护\n合规：${plan.compliance || '待专业复核'}\n实施：${plan.implementation || '待补充'}\n成本：${plan.cost || '待估算'}\n维护：${plan.maintenance || '待明确'}`,
          `\n六、方案取舍\n${plan.tradeoffs || '待比较'}`,
          `\n七、尚需核实与确认\n${plan.verification || '待补充'}`,
          '\n说明：本方案为辅助建议，不能替代专业勘察、设计、审批、施工、监理、检测和验收。',
        ].join('\n')
      : '';
    const blob = new Blob(
      [page === 'plans' && plan ? planText : JSON.stringify(project, null, 2)],
      { type: 'text/plain;charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${page === 'plans' ? plan?.title : project.name}.${page === 'plans' ? 'txt' : 'json'}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice('已导出到下载文件夹');
  }
  return (
    <div className={`site ${page !== 'home' ? 'workspace-site' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark">
            <Leaf />
          </span>
          乡筑<span className="brand-en">XIANGZHU</span>
        </button>
        <div className="top-caption">
          </div>
        <div className="profile">
          <span className="status-dot" />
          {saved}
          <span className="avatar">Z</span>张工
        </div>
      </header>
      {page === 'home' ? (
        <Landing
          projects={projects}
          onOpen={openProject}
          onCreate={() => {
            setDialog('project');
            setName('');
          }}
        />
      ) : (
        <SidebarProvider className="workspace">
          <Sidebar collapsible="none" className="village-sidebar panel-rail">
            <div className="project-switch">
              <span>当前项目</span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="project-switch-trigger"
                      aria-label="切换当前项目"
                    >
                      <span>{project.name.split(' · ')[0]}</span>
                      <ChevronDown
                        className="project-switch-chevron"
                        size={16}
                        aria-hidden="true"
                      />
                    </button>
                  }
                />
                <DropdownMenuContent
                  className="project-switch-menu"
                  align="start"
                  sideOffset={8}
                >
                  {projects.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className={`project-switch-option ${item.id === active ? 'current' : ''}`}
                      onClick={() => switchProject(item.id)}
                    >
                      <FolderOpen size={15} aria-hidden="true" />
                      <span>{item.name.split(' · ')[0]}</span>
                      {item.id === active && (
                        <Check
                          className="project-switch-check"
                          size={15}
                          aria-hidden="true"
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="project-switch-divider" />
                  <DropdownMenuItem
                    className="project-switch-option"
                    onClick={() => navigate('home')}
                  >
                    <House size={15} aria-hidden="true" />
                    <span>返回首页</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <SidebarContent>
              <TooltipProvider delay={250}>
                <SidebarMenu>
                  {panelMeta.map(({ id, title, sub, Icon }) => (
                    <SidebarMenuItem
                      key={id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/workspace-panel', id);
                        event.dataTransfer.effectAllowed = 'link';
                        setDraggingPanel(id);
                        setAssistant(true);
                      }}
                      onDragEnd={() => {
                        setDraggingPanel(null);
                        setDragOverAssistant(false);
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <SidebarMenuButton
                              className={`nav-item panel-bubble ${page === id ? 'selected' : ''} ${fadingPanel === id && page !== id ? 'ink-leaving' : ''} ${attachedPanel === id ? 'attached' : ''}`}
                              isActive={page === id}
                              onClick={() => togglePanel(id)}
                              aria-label={`${page === id ? '收起' : '展开'}${title}板块；也可拖入项目协作区`}
                            >
                              <Icon />
                              <b>{title}</b>
                              <ChevronRight
                                className="nav-chevron"
                                strokeWidth={1.7}
                                aria-hidden="true"
                              />
                            </SidebarMenuButton>
                          }
                        />
                        <TooltipContent
                          side="right"
                          sideOffset={12}
                          className="panel-tooltip"
                        >
                          {sub}
                        </TooltipContent>
                      </Tooltip>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </TooltipProvider>
            </SidebarContent>
            <button
              className="settings-button"
              onClick={() => setDialog('settings')}
            >
              <Settings size={20} />
              <span>工作台设置</span>
            </button>
            <button
              className="settings-button"
              onClick={() => setDialog('knowledge')}
            >
              <BookOpen size={20} />
              <span>知识库结构</span>
            </button>
            <div className="side-note">
              适老为先
              <br />
              合规为底
            </div>
          </Sidebar>
          <main
            className={`work-main ${!assistant ? 'wide' : ''} ${page === 'workspace' && assistant ? 'conversation-only' : ''}`}
          >
            <div className="work-columns">
              {!(page === 'workspace' && assistant) && (
                <section
                  className={`main-surface ${page === 'plans' ? 'plan-surface' : 'glass'} ${page === 'workspace' ? 'overview-surface' : ''} ${page === 'debug' ? 'debug-surface' : ''} ${page === 'archive' && tab === 'basic' ? 'archive-basic-surface' : ''} ${page === 'archive' && tab === 'photos' ? 'archive-gallery-surface' : ''}`}
                >
                  {page === 'workspace' && (
                    <div className="workbench-overview">
                      <div className="work-heading">
                        <div className="heading-icon">
                          <Accessibility />
                        </div>
                        <div>
                          <div className="eyebrow">
                            AGE-FRIENDLY VILLAGE WORKBENCH
                          </div>
                          <h1>乡村适老化建设辅助工作台</h1>
                          <p>
                            在同一个项目里组织真实资料、使用行为、调试判断与可比较方案。
                          </p>
                        </div>
                        <span className="pill prototype-pill">
                          <Clock size={12} /> 当前阶段 · 分阶段实施
                        </span>
                      </div>
                      <div className="workflow-cards">
                        {panelMeta.map(({ id, title, Icon }, index) => (
                          <button
                            key={id}
                            className="workflow-card"
                            onClick={() => togglePanel(id)}
                          >
                            <span className="workflow-index">0{index + 1}</span>
                            <Icon />
                            <b>{title}</b>
                            <small>
                              {id === 'archive'
                                ? '记录村庄、老人、空间与约束'
                                : id === 'debug'
                                  ? '定义场景、问题与老人行为脚本'
                                  : '整合依据并形成可比较方案'}
                            </small>
                            <ArrowRight />
                          </button>
                        ))}
                      </div>
                      <div className="logic-loop">
                        <div>
                          <BookOpen />
                          <span>
                            <b>知识库贯穿全过程</b>
                            <small>
                              规范、案例、方法与适用条件为判断提供依据
                            </small>
                          </span>
                        </div>
                        <ArrowRight />
                        <div>
                          <MessageCircle />
                          <span>
                            <b>项目协作复核</b>
                            <small>将左侧板块拖入协作区，关联相关资料</small>
                          </span>
                        </div>
                      </div>
                      <div className="boundary-note">
                        <AlertTriangle />
                        <p>
                          当前页面用于整理项目资料、使用行为与判断依据；场景编辑和行为模拟能力将按项目条件逐步完善。输出仅作辅助参考，不能替代专业勘察、设计、审批、施工和验收。
                        </p>
                      </div>
                    </div>
                  )}
                  {page === 'archive' && (
                    <>
                      <div className="work-heading archive-heading">
                        <div className="heading-icon">
                          <Leaf />
                        </div>
                        <div>
                          <h1>{project.name.split(' · ')[0]}档案</h1>
                        </div>
                        <Tabs
                          value={tab === 'photos' ? 'photos' : 'basic'}
                          onValueChange={(value) => setTab(String(value))}
                          className="archive-tabs-control"
                        >
                          <TabsList
                            className="village-tabs archive-two-tabs"
                            data-active-tab={
                              tab === 'photos' ? 'photos' : 'basic'
                            }
                          >
                            <TabsTrigger value="basic">基本信息</TabsTrigger>
                            <TabsTrigger value="photos">
                              图片库
                              <span className="mini-count">
                                {project.photos.length}
                              </span>
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      {tab !== 'photos' ? (
                        <div className="form-scroll">
                          <section className="form-section">
                            <h2>
                              <Building2 />
                              村庄概况<span>VILLAGE PROFILE</span>
                            </h2>
                            <label className="field full">
                              村庄地址
                              <div className="input-wrap">
                                <MapPin size={16} />
                                <input
                                  value={project.address}
                                  placeholder="省 / 市 / 县 / 乡镇 / 村"
                                  onChange={(e) =>
                                    update((p) => ({
                                      ...p,
                                      address: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            </label>
                            <div className="field-grid">
                              {[
                                ['area', '村庄面积', '亩'],
                                ['households', '常住户数', '户'],
                                ['population', '常住人口', '人'],
                                ['elderlyPopulation', '老年人口', '人'],
                              ].map(([key, label, unit]) => (
                                <label className="field" key={key}>
                                  {label}
                                  <div className="input-wrap">
                                    <input
                                      type="number"
                                      min="0"
                                      value={project.fields[key] || ''}
                                      placeholder="待补充"
                                      onChange={(e) =>
                                        update((p) => ({
                                          ...p,
                                          fields: {
                                            ...p.fields,
                                            [key]: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                    <span>{unit}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </section>
                          <section className="form-section">
                            <h2>
                              <Layers />
                              公共设施基础<span>可多选</span>
                            </h2>
                            <div className="facility-list">
                              {[
                                '村委会',
                                '卫生室',
                                '助餐点',
                                '文化礼堂',
                                '公共厕所',
                                '停车点',
                                '健身场地',
                                '集市商店',
                              ].map((f) => (
                                <label
                                  key={f}
                                  className={
                                    project.facilities.includes(f)
                                      ? 'checked'
                                      : ''
                                  }
                                >
                                  <Checkbox
                                    checked={project.facilities.includes(f)}
                                    onCheckedChange={(checked) =>
                                      update((p) => ({
                                        ...p,
                                        facilities: checked
                                          ? [...p.facilities, f]
                                          : p.facilities.filter((x) => x !== f),
                                      }))
                                    }
                                  />
                                  {f}
                                </label>
                              ))}
                            </div>
                          </section>
                          <section className="form-section">
                            <h2>
                              <LocateFixed />
                              发展条件与建设期望<span>规划的起点</span>
                            </h2>
                            <div className="field-grid">
                              {[
                                ['economy', '主要经济模式'],
                                ['budget', '建设预算'],
                                ['direction', '期望建设方向'],
                              ].map(([key, label]) => (
                                <label className="field" key={key}>
                                  {label}
                                  <input
                                    className="plain-input"
                                    value={project.fields[key] || ''}
                                    placeholder={
                                      key === 'economy'
                                        ? '例如：生态农业、乡村旅游'
                                        : key === 'direction'
                                          ? '例如：完善公共服务、改善出行环境'
                                          : '例如：50–100 万元'
                                    }
                                    onChange={(e) =>
                                      update((p) => ({
                                        ...p,
                                        fields: {
                                          ...p.fields,
                                          [key]: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                            <label className="field full">
                              补充说明
                              <textarea
                                value={project.fields.notes || ''}
                                placeholder="记录村庄特色、发展愿景与当前需求…"
                                onChange={(e) =>
                                  update((p) => ({
                                    ...p,
                                    fields: {
                                      ...p.fields,
                                      notes: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </section>
                          <section className="form-section">
                            <h2>
                              <Users />
                              老人情况与使用需求<span>适老化判断基础</span>
                            </h2>
                            <div className="field-grid archive-metric-grid">
                              {[
                                ['old', '老年人口占比', '%'],
                                ['livingAlone', '60岁以上老年人口数', '人'],
                                ['mobilityLimited', '行动受限老人', '人'],
                              ].map(([key, label, unit]) => (
                                <label className="field" key={key}>
                                  {label}
                                  <div className="input-wrap">
                                    <input
                                      type="number"
                                      min="0"
                                      max={key === 'old' ? 100 : undefined}
                                      value={project.fields[key] || ''}
                                      placeholder="待补充"
                                      onChange={(event) =>
                                        update((p) => ({
                                          ...p,
                                          fields: {
                                            ...p.fields,
                                            [key]: event.target.value,
                                          },
                                        }))
                                      }
                                    />
                                    <span>{unit}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                            <div className="archive-text-grid archive-summary-grid">
                              {[
                                [
                                  'elderProfiles',
                                  '重点老人画像',
                                  '年龄、居住情况、行动能力、辅助器具与照护条件…',
                                ],
                                [
                                  'elderBehaviors',
                                  '村中老人的日常活动',
                                  '记录何时出门、去哪里、在哪里停顿、绕行或求助…',
                                ],
                              ].map(([key, label, placeholder]) => (
                                <label className="field" key={key}>
                                  {label}
                                  <textarea
                                    value={project.fields[key] || ''}
                                    placeholder={placeholder}
                                    onChange={(event) =>
                                      update((p) => ({
                                        ...p,
                                        fields: {
                                          ...p.fields,
                                          [key]: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          </section>
                          <button
                            className="next-step"
                            onClick={() => setTab('photos')}
                          >
                            下一步，整理图片库
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      ) : (
                        <div className="gallery">
                          <div className="search">
                            <Search size={18} />
                            <input
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              placeholder="搜索图片名称或分类…"
                            />
                          </div>
                          <div className="upload-grid">
                            {photoCategories.map(
                              ({ title, sub, Icon, preview, tone }, index) => {
                                const slotPhotos = project.photos.filter(
                                  (photo) => photo.category === title,
                                );
                                const cover = slotPhotos.length
                                  ? slotPhotos[slotPhotos.length - 1].src
                                  : preview;
                                return (
                                  <div
                                    className={`upload-card ${tone}`}
                                    key={title}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`查看「${title}」已上传图片`}
                                    onClick={() => setGalleryCategory(title)}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                      ) {
                                        event.preventDefault();
                                        setGalleryCategory(title);
                                      }
                                    }}
                                  >
                                    <div className="upload-card-top">
                                      <Icon />
                                      <span>
                                        {String(index + 1).padStart(2, '0')}
                                      </span>
                                    </div>
                                    <h3>{title}</h3>
                                    <p>{sub}</p>
                                    <div className="upload-preview">
                                      {/* oxlint-disable-next-line next/no-img-element -- Local generated gallery artwork is rendered at a responsive card crop. */}
                                      <img
                                        src={cover}
                                        alt={
                                          slotPhotos.length
                                            ? `${title}已上传图片`
                                            : `${title}示意图`
                                        }
                                      />
                                      {slotPhotos.length > 0 && (
                                        <span className="upload-preview-count">
                                          {slotPhotos.length} 张
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setCategory(title);
                                        file.current?.click();
                                      }}
                                    >
                                      <Upload size={17} />
                                      上传图片
                                    </button>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {page === 'debug' && (
                    <SpatialEditor
                      data={project.spatial ?? emptySpatial(project.address)}
                      onChange={(s) => update((p) => ({ ...p, spatial: s }))}
                      onPlan={(title, body) => {
                        update((p) => ({
                          ...p,
                          plans: [
                            ...p.plans,
                            { id: crypto.randomUUID(), title, body, tasks: [] },
                          ],
                        }));
                        setNotice(`「${title}」已发送到方案区`);
                      }}
                      onEmpty={() => setNotice('可在「转译平面图」上传或更换底图')}
                      chatOpen={assistant}
                      onToggleChat={() => setAssistant(!assistant)}
                      projectId={spatialProjectId}
                      connected={spatialConnected}
                      satelliteImage={satellite?.src}
                    />
                  )}
                  {page === 'plans' && (
                    <>
                      <div className="notebook">
                        <div className="plan-list glass">
                          <div className="plan-list-top">
                            <span className="plan-list-mark" aria-hidden="true">
                              <Leaf size={23} />
                            </span>
                            <button
                              className="plan-create-button"
                              onClick={() => {
                                setDialog('plan');
                                setName('');
                              }}
                            >
                              <Plus size={18} />
                              新建方案
                            </button>
                            <div className="plan-list-actions">
                              <button
                                className={comparing ? 'active' : ''}
                                aria-label={
                                  comparing ? '退出方案比较' : '比较方案'
                                }
                                onClick={() => {
                                  setComparing((value) => !value);
                                  setEditing(false);
                                  if (compareIds.length < 2) {
                                    setCompareIds(
                                      project.plans
                                        .slice(0, 2)
                                        .map((item) => item.id),
                                    );
                                  }
                                }}
                              >
                                <GitCompare size={17} />
                              </button>
                            </div>
                          </div>
                          {comparing && (
                            <p className="compare-hint">
                              选择两版方案进行取舍比较
                            </p>
                          )}
                          {project.plans.map((item, index) => (
                            <button
                              key={item.id}
                              aria-label={`${comparing ? '选择比较' : '打开'}方案：${item.title}`}
                              onClick={() => {
                                if (comparing) {
                                  toggleComparePlan(item.id);
                                  return;
                                }
                                switchPlan(item.id);
                              }}
                              className={`plan-card ${!comparing && selectedPlan === item.id ? 'active' : ''} ${comparing && compareIds.includes(item.id) ? 'compare-selected' : ''}`}
                            >
                              <div
                                className={`plan-thumb thumb-${index % 3}`}
                              />
                              <div className="plan-card-copy">
                                <div className="plan-card-title-row">
                                  <h3>{item.title}</h3>
                                  <MoreVertical size={16} aria-hidden="true" />
                                </div>
                                <small>
                                  {[
                                    '09/07 19:59',
                                    '09/05 14:20',
                                    '09/03 10:12',
                                  ][index] || '最近编辑'}
                                </small>
                                <div className="plan-card-tags">
                                  <span>
                                    {index === 1
                                      ? '交通组织'
                                      : index === 2
                                        ? '建筑更新'
                                        : '空间优化'}
                                  </span>
                                  <span>
                                    {index === 2 ? '文化传承' : '乡村振兴'}
                                  </span>
                                  {(item.id === project.current ||
                                    (comparing &&
                                      compareIds.includes(item.id))) && (
                                    <span className="plan-status-tag">
                                      {item.id === project.current
                                        ? '当前方案'
                                        : '比较中'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                          <button
                            className="new-plan"
                            onClick={() => {
                              setDialog('plan');
                              setName('');
                            }}
                          >
                            <Plus size={16} />
                            新建方案
                          </button>
                        </div>
                        {/* oxlint-disable-next-line next/no-img-element -- Decorative generated binder artwork requires transparent responsive sizing. */}
                        <img
                          className="paper-rings"
                          src="/plan-binder-rings.png"
                          alt=""
                          aria-hidden="true"
                        />
                        <article
                          ref={paper}
                          className={`paper plan-page-motion ${outgoingPlanHtml ? 'plan-page-underlay-entering' : `plan-page-${planPageMotion}`}`}
                          data-plan-id={plan?.id || ''}
                          data-plan-page-motion={planPageMotion}
                          aria-busy={planPageMotion !== 'idle'}
                        >
                          {comparing ? (
                            <div className="comparison-paper">
                              <div className="paper-toolbar">
                                <span className="eyebrow">
                                  COMPARE THE TRADE-OFFS
                                </span>
                                <span className="pill">
                                  <GitCompare size={13} />{' '}
                                  {comparisonPlans.length} / 2
                                </span>
                              </div>
                              <div className="paper-title">
                                <span>方案比较 / DECISION SUPPORT</span>
                                <h1>把取舍说清楚，再确认方向</h1>
                                <p>
                                  比较问题场景、价值、实施成本、维护与待复核事项
                                </p>
                              </div>
                              {comparisonPlans.length === 2 ? (
                                <div className="compare-grid">
                                  {comparisonPlans.map((item) => (
                                    <section
                                      className="compare-column"
                                      key={item.id}
                                    >
                                      <div className="compare-column-head">
                                        <span
                                          className={
                                            item.id === project.current
                                              ? 'pill current'
                                              : 'pill'
                                          }
                                        >
                                          {item.id === project.current
                                            ? '当前方案'
                                            : '备选方案'}
                                        </span>
                                        <h2>{item.title}</h2>
                                      </div>
                                      {[
                                        [
                                          '问题与场景',
                                          `${item.body}\n${item.scene || ''}`,
                                        ],
                                        [
                                          '创新与价值',
                                          item.innovation || '待补充',
                                        ],
                                        [
                                          '实施与成本',
                                          `${item.implementation || '待补充'}\n${item.cost || '成本待估算'}`,
                                        ],
                                        [
                                          '维护要求',
                                          item.maintenance || '待明确',
                                        ],
                                        [
                                          '方案取舍',
                                          item.tradeoffs || '待比较',
                                        ],
                                        [
                                          '待核实事项',
                                          item.verification || '待补充',
                                        ],
                                      ].map(([label, value]) => (
                                        <div
                                          className="compare-item"
                                          key={label}
                                        >
                                          <b>{label}</b>
                                          <p>{value}</p>
                                        </div>
                                      ))}
                                      <button
                                        className="compare-set-current"
                                        onClick={() => {
                                          update((p) => ({
                                            ...p,
                                            current: item.id,
                                          }));
                                          setNotice('已更新当前方案');
                                        }}
                                      >
                                        <CheckCircle2 size={15} />
                                        设为当前方案
                                      </button>
                                    </section>
                                  ))}
                                </div>
                              ) : (
                                <div className="survey-empty compact-run-empty">
                                  <GitCompare size={42} />
                                  <h2>请选择两版方案</h2>
                                  <p>在左侧点击方案卡片加入或移出比较。</p>
                                </div>
                              )}
                              <div className="boundary-note compact">
                                <AlertTriangle />
                                <p>
                                  比较结果用于辅助讨论。涉及规范、工程安全、造价和审批的内容仍需专业复核。
                                </p>
                              </div>
                            </div>
                          ) : plan ? (
                            <>
                              <div className="paper-toolbar">
                                <span className="eyebrow">
                                  TRACEABLE AGE-FRIENDLY PLAN
                                </span>
                                <button
                                  className="pill"
                                  onClick={() => {
                                    update((p) => ({ ...p, current: plan.id }));
                                    setNotice('已设为当前方案');
                                  }}
                                >
                                  <CheckCircle2 size={13} />
                                  {project.current === plan.id
                                    ? '当前方案'
                                    : '设为当前'}
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label="导出方案"
                                  onClick={download}
                                >
                                  <Download size={17} />
                                </button>
                              </div>
                              <div className="paper-title">
                                <span>方案标题</span>
                                {/* oxlint-disable-next-line next/no-img-element -- Decorative generated watercolor artwork is locally bundled. */}
                                <img
                                  className="paper-landscape"
                                  src="/plan-village-watercolor.png"
                                  alt=""
                                  aria-hidden="true"
                                />
                                {editing ? (
                                  <input
                                    aria-label="方案标题"
                                    value={plan.title}
                                    onChange={(event) =>
                                      updatePlanField(
                                        'title',
                                        event.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  <h1>{plan.title}</h1>
                                )}
                                <p>
                                  最后编辑{' '}
                                  {new Date(project.updated).toLocaleDateString(
                                    'zh-CN',
                                  )}
                                  <span>
                                    <Users size={12} /> 张工
                                  </span>
                                </p>
                              </div>
                              <div className="trace-grid">
                                <div>
                                  <b>{project.address ? '已关联' : '待补充'}</b>
                                  <span>村庄档案</span>
                                </div>
                                <div>
                                  <b>
                                    {
                                      project.marks.filter(
                                        (mark) => mark.status === '已确认',
                                      ).length
                                    }
                                    /{project.marks.length}
                                  </b>
                                  <span>已确认问题</span>
                                </div>
                                <div>
                                  <b>{plan.references ? '已记录' : '待补充'}</b>
                                  <span>知识依据</span>
                                </div>
                                <div>
                                  <b>
                                    {plan.verification ? '已列出' : '待补充'}
                                  </b>
                                  <span>复核事项</span>
                                </div>
                              </div>
                              <section className="paper-section">
                                <h2>
                                  <b>一</b>问题依据与老人使用场景
                                </h2>
                                {renderPlanField('body', '问题依据')}
                                <h3 className="paper-subtitle">
                                  受影响的老人使用场景
                                </h3>
                                {renderPlanField('scene', '老人使用场景')}
                              </section>
                              <section className="paper-section">
                                <h2>
                                  <b>二</b>适用空间与建设对象
                                </h2>
                                {renderPlanField('scope', '适用空间与建设对象')}
                                {project.marks.length > 0 && (
                                  <p className="linked-marks">
                                    关联调试问题：
                                    {project.marks
                                      .map((mark) => mark.label)
                                      .join('、')}
                                  </p>
                                )}
                              </section>
                              <section className="paper-section">
                                <h2>
                                  <b>三</b>案例、规范与研究关联
                                </h2>
                                {renderPlanField(
                                  'references',
                                  '知识来源、适用地区、适用条件与证据等级',
                                )}
                              </section>
                              <section className="paper-section">
                                <h2>
                                  <b>四</b>创新点及其具体价值
                                </h2>
                                {renderPlanField(
                                  'innovation',
                                  '创新点与具体价值',
                                )}
                              </section>
                              <section className="paper-section">
                                <h2>
                                  <b>五</b>合规、实施、成本与维护
                                </h2>
                                <div className="plan-detail-grid">
                                  {[
                                    ['compliance', '合规依据与责任边界'],
                                    ['implementation', '实施条件与施工影响'],
                                    ['cost', '成本等级与分期'],
                                    ['maintenance', '维护要求与责任主体'],
                                  ].map(([field, label]) => (
                                    <div className="plan-detail" key={field}>
                                      <h3>{label}</h3>
                                      {renderPlanField(
                                        field as PlanTextField,
                                        label,
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </section>
                              <section className="paper-section">
                                <h2>
                                  <b>六</b>方案取舍与待核实事项
                                </h2>
                                <h3 className="paper-subtitle">方案取舍</h3>
                                {renderPlanField(
                                  'tradeoffs',
                                  '方案优势、局限与取舍',
                                )}
                                <h3 className="paper-subtitle">
                                  待现场或专业复核
                                </h3>
                                {renderPlanField(
                                  'verification',
                                  '现场、专业人员或用户需确认的事项',
                                )}
                              </section>
                              <section className="paper-section review-section">
                                <h2>
                                  <b>七</b>复核清单
                                </h2>
                                <div className="todo-grid">
                                  {[
                                    '现场尺度与使用路线已核实',
                                    '规范条文与专业判断已复核',
                                    '老人、村民和实施主体已确认',
                                    '成本、施工影响与维护责任已明确',
                                  ].map((task) => (
                                    <label key={task}>
                                      <Checkbox
                                        checked={Boolean(
                                          plan.tasks?.includes(task),
                                        )}
                                        onCheckedChange={(checked) =>
                                          update((p) => ({
                                            ...p,
                                            plans: p.plans.map((item) =>
                                              item.id === plan.id
                                                ? {
                                                    ...item,
                                                    tasks: checked
                                                      ? [
                                                          ...(item.tasks || []),
                                                          task,
                                                        ]
                                                      : (
                                                          item.tasks || []
                                                        ).filter(
                                                          (value) =>
                                                            value !== task,
                                                        ),
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                      {task}
                                    </label>
                                  ))}
                                </div>
                              </section>
                              <div className="boundary-note compact plan-disclaimer">
                                <AlertTriangle />
                                <p>
                                  协作内容属于辅助建议，不能替代专业设计、审批、施工、监理、检测和验收。
                                </p>
                              </div>
                              <div className="paper-memo-slot">
                                {/* oxlint-disable-next-line next/no-img-element -- Decorative generated memo artwork is locally bundled. */}
                                <img
                                  className="paper-memo"
                                  src="/plan-handwritten-note.png"
                                  alt="好的乡村，是人与自然共同生长的地方。"
                                />
                              </div>
                              <div className="paper-bottom">
                                <span>
                                  <Leaf size={16} />
                                  适老为主，合规为底。
                                </span>
                                <button onClick={() => setEditing(!editing)}>
                                  {editing ? (
                                    <Check size={15} />
                                  ) : (
                                    <FileText size={15} />
                                  )}{' '}
                                  {editing ? '完成编辑' : '编辑方案'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="survey-empty">
                              <FileText size={45} />
                              <h2>让想法，落成一份方案</h2>
                              <p>从档案、调试、知识依据和用户反馈开始。</p>
                              <button
                                className="primary-button"
                                onClick={() => {
                                  setDialog('plan');
                                  setName('');
                                }}
                              >
                                <Plus size={18} />
                                新建方案
                              </button>
                            </div>
                          )}
                        </article>
                        {outgoingPlanHtml && (
                          <article
                            className="paper plan-page-motion plan-page-outgoing"
                            aria-hidden="true"
                            inert
                            dangerouslySetInnerHTML={{
                              __html: outgoingPlanHtml,
                            }}
                          />
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}
              {assistant && (
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 对话区同时是文件拖放落点；拖放不引入点击或键盘交互语义。
                <aside
                  className={`assistant glass ${page === 'workspace' ? 'assistant-expanded' : ''} ${assistantZoomed ? 'assistant-zoomed' : ''} ${draggingPanel ? 'drop-ready' : ''} ${dragOverAssistant ? 'drop-active' : ''} ${fileDragOver ? 'file-drop-active' : ''}`}
                  onDragOver={(event) => {
                    if (!isFileDrag(event)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    if (!fileDragOver) setFileDragOver(true);
                  }}
                  onDragLeave={(event) => {
                    if (!isFileDrag(event)) return;
                    const next = event.relatedTarget as Node | null;
                    if (next && event.currentTarget.contains(next)) return;
                    setFileDragOver(false);
                  }}
                  onDrop={(event) => {
                    if (!isFileDrag(event)) return;
                    event.preventDefault();
                    setFileDragOver(false);
                    void addFiles(event.dataTransfer.files);
                  }}
                >
                  {fileDragOver && (
                    <div className="assistant-file-drop">
                      <ImageIcon size={24} />
                      <span>松开即可把图片或文档加入对话</span>
                      <small>支持图片、PDF、Word、Excel 与文本文件</small>
                    </div>
                  )}
                  {draggingPanel && (
                    <button
                      type="button"
                      className="assistant-drop-target"
                      aria-label={`将${panelMeta.find((item) => item.id === draggingPanel)?.title || '当前'}板块关联至项目协作区`}
                      onClick={() => attachToAssistant(draggingPanel)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'link';
                        setDragOverAssistant(true);
                      }}
                      onDragLeave={() => setDragOverAssistant(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const value =
                          event.dataTransfer.getData('text/workspace-panel') ||
                          draggingPanel;
                        if (panelMeta.some((item) => item.id === value)) {
                          attachToAssistant(value as WorkspacePanel);
                        }
                        setDraggingPanel(null);
                      }}
                    >
                      <Link2 size={22} />
                      <span>松开以关联该板块资料</span>
                    </button>
                  )}
                  <div className="assistant-header">
                    <div className="assistant-header-note">
                      <span>
                        {conversationPanel === 'plans'
                          ? '方案研判'
                          : conversationPanel === 'debug'
                            ? '场景研判'
                            : '档案整理'}
                      </span>
                      <p>{flow.nextActionLabel}</p>
                      <em
                        className={`assistant-ai-badge ${aiStatus?.available ? 'ready' : 'offline'}`}
                        title={aiStatus?.available ? '已接入本机 CodeBuddy CLI' : '未检测到可用的 CodeBuddy CLI'}
                      >
                        {aiStatus === null
                          ? 'AI 连接中'
                          : aiStatus.available
                            ? `AI 已就绪${aiStatus.version ? ` · CLI ${aiStatus.version}` : ''}`
                            : 'AI 未连接'}
                      </em>
                    </div>
                    <div className="assistant-header-actions">
                      <button
                        aria-label="打开知识库"
                        onClick={() => setDialog('knowledge')}
                      >
                        <BookOpen size={16} />
                      </button>
                      <button
                        aria-label={
                          assistantZoomed ? '还原协作区' : '放大协作区'
                        }
                        onClick={() => setAssistantZoomed((value) => !value)}
                      >
                        {assistantZoomed ? (
                          <Minimize2 size={17} />
                        ) : (
                          <Maximize2 size={17} />
                        )}
                      </button>
                      <button
                        aria-label="收起协作区"
                        onClick={() => {
                          setAssistant(false);
                          setAssistantZoomed(false);
                        }}
                      >
                        <PanelRightClose size={18} />
                      </button>
                    </div>
                  </div>
                  {scopedByOpenPanel ? (
                    <div className="assistant-channel">
                      <Link2 />
                      <span>
                        <b>对话已限定在「{conversationTitle}」</b>
                        <small>
                          本次对话只围绕该板块的资料与任务；需要跨板块时明确说明即可
                        </small>
                      </span>
                    </div>
                  ) : attachedPanel ? (
                    <div className="assistant-channel">
                      <Link2 />
                      <span>
                        <b>{conversationTitle}资料已关联</b>
                        <small>本次对话优先引用相关内容</small>
                      </span>
                      <button
                        aria-label="解除板块关联"
                        onClick={() => {
                          setAttachedPanel(null);
                          setNotice('已恢复项目综合对话');
                        }}
                      >
                        <Unlink size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="assistant-drop-hint">
                      <GripVertical />
                      <span>
                        {dragOverAssistant
                          ? '松开以关联资料'
                          : conversationPanel === 'archive'
                            ? '将左侧工作板块拖入对话框，可进行针对性沟通和修改'
                            : '拖入左侧板块，关联相关资料'}
                      </span>
                    </div>
                  )}
                  <div className="chat-scroll">
                    {messages.length === 0 ? (
                      <div className="suggestions">
                        <span>
                          {flow.archive.ready ? '建议事项' : '当前该做的事'}
                        </span>
                        {(flow.archive.ready
                          ? flow.debug.integrated
                            ? [
                                '提出当前方案的优化建议',
                                '整理适老化改造策略',
                                '比较不同方案的优势与局限',
                              ]
                            : [
                                '档案齐了，下一步该做什么？',
                                '调试分析会解决什么问题？',
                                '为什么现在不能直接出方案？',
                              ]
                          : flow.archive.missingFields.length
                            ? [
                                '档案还缺哪些必填信息？',
                                '这些数据一般从哪里能拿到？',
                                '先帮我看看已经填的信息有没有问题',
                              ]
                            : [
                                '图片库这三类影像各自要拍到什么程度？',
                                '我手上的照片该放进哪个分类？',
                                '卫星图要能看清什么才算合格？',
                              ]
                        ).map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => send(suggestion)}
                          >
                            <MessageCircle size={17} />
                            {suggestion}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="chat-messages">
                        {messages.map((m, i) => {
                          const shown = stripArchiveFill(m.text);
                          const thinking = m.thinking?.trim() ?? '';
                          const streaming =
                            aiBusy && i === messages.length - 1;
                          // 正文只含回填数据时不渲染空气泡；有思考过程时也不补占位。
                          const showText =
                            Boolean(shown) ||
                            streaming ||
                            (!m.attachments?.length && !thinking);
                          return (
                          <div className={`message ${m.role}`} key={i}>
                            {m.role === 'assistant' && <Leaf size={17} />}
                            <div>
                              {m.context && (
                                <span className="message-context">
                                  {panelMeta.find(
                                    (item) => item.id === m.context,
                                  )?.title || '项目'}
                                </span>
                              )}
                              {m.attachments?.length ? (
                                <div className="message-files">
                                  {m.attachments.map((item) =>
                                    item.preview ? (
                                      <a
                                        className="message-file-image"
                                        key={item.id}
                                        href={item.preview}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {/* oxlint-disable-next-line next/no-img-element -- Baseline preview of a user-supplied image with no stable dimensions or loader. */}
                                        <img src={item.preview} alt={item.name} />
                                      </a>
                                    ) : (
                                      <span className="message-file" key={item.id}>
                                        <FileText size={13} />
                                        <b>{item.name}</b>
                                        <small>{formatFileSize(item.size)}</small>
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : null}
                              {m.role === 'user' &&
                                m.attachments?.some(
                                  (item) => item.kind === 'image' && item.preview,
                                ) && (
                                  <div className="message-filing">
                                    {m.filedSlot ? (
                                      <span className="message-filed">
                                        <CheckCircle2 size={12} />
                                        已存入「{m.filedSlot}」
                                      </span>
                                    ) : (
                                      <>
                                        <span>存入图片库：</span>
                                        {PHOTO_SLOTS.map((slot) => (
                                          <button
                                            type="button"
                                            key={slot.title}
                                            title={slot.sub}
                                            onClick={() =>
                                              fileMessagePhotos(i, slot.title)
                                            }
                                          >
                                            {slot.title}
                                          </button>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )}
                              {thinking && (
                                <details className="message-reasoning">
                                  <summary>
                                    <ChevronRight size={13} />
                                    思考过程
                                  </summary>
                                  <div>{thinking}</div>
                                </details>
                              )}
                              {showText && (
                                <p
                                  className={shown ? undefined : 'message-thinking'}
                                >
                                  {shown ||
                                    (streaming ? aiPhase || '正在生成…' : '')}
                                </p>
                              )}
                            </div>
                          </div>
                          );
                        })}
                        <div ref={end} />
                      </div>
                    )}
                  </div>
                  {flow.nextAction === 'align-debug' && (
                    <div className="assistant-quick-actions">
                      {flow.openIssues.length > 0 && (
                        <button
                          onClick={() =>
                            send('把档案里还没核实的疑点逐条列出来，我来确认')
                          }
                        >
                          <AlertTriangle size={13} />
                          对齐待核疑点（{flow.openIssues.length}）
                        </button>
                      )}
                      <button onClick={confirmDebugEntry}>
                        <Play size={13} />
                        确认无误，进入调试
                      </button>
                    </div>
                  )}
                  {conversationPanel === 'plans' && messages.length === 0 && (
                    <div className="assistant-quick-actions">
                      {['方案优化', '生成图表', '风险分析'].map((action) => (
                        <button key={action} onClick={() => send(action)}>
                          <Sparkles size={13} />
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="chat-compose">
                    {draftFiles.length > 0 && (
                      <div className="compose-files">
                        {draftFiles.map((item) => (
                          <div className={`compose-file ${item.kind}`} key={item.id}>
                            {item.preview ? (
                              /* oxlint-disable-next-line next/no-img-element -- Thumbnail of a pending local attachment with no stable dimensions. */
                              <img src={item.preview} alt={item.name} />
                            ) : (
                              <span className="compose-file-icon">
                                <FileText size={15} />
                              </span>
                            )}
                            <span className="compose-file-meta">
                              <b title={item.name}>{item.name}</b>
                              <small>
                                {formatFileSize(item.size)}
                                {item.kind === 'file' ? ' · 内容暂不可读' : ''}
                              </small>
                            </span>
                            <button
                              type="button"
                              aria-label={`移除 ${item.name}`}
                              onClick={() => removeDraft(item.id)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="clear-chat"
                      aria-label="重置对话内容"
                      onClick={() => {
                        setMessages([]);
                        setMessage('');
                        setNotice('已重置对话内容，已操作内容未撤回');
                      }}
                    >
                      重置对话内容
                      <Trash2 size={14} />
                    </button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        send();
                      }}
                    >
                      <button
                        type="button"
                        className="attach-button"
                        aria-label="添加图片或文档"
                        disabled={aiBusy || readingFiles}
                        onClick={() => filePicker.current?.click()}
                      >
                        <Paperclip size={17} />
                      </button>
                      <textarea
                        aria-label="向项目协作区提问"
                        rows={2}
                        value={message}
                        disabled={aiBusy}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={
                          aiBusy
                            ? 'AI 正在回复，请稍候…'
                            : '输入问题或补充信息…'
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            send();
                          }
                        }}
                      />
                      <button
                        type="submit"
                        aria-label="发送消息"
                        disabled={
                          (!message.trim() && !draftFiles.length) ||
                          aiBusy ||
                          readingFiles
                        }
                      >
                        <Send size={19} />
                      </button>
                    </form>
                    <input
                      ref={filePicker}
                      type="file"
                      multiple
                      hidden
                      accept={ATTACHMENT_ACCEPT}
                      onChange={(event) => {
                        void addFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <p>
                      <ShieldCheck size={12} />
                      {readingFiles ? '正在读取附件…' : '辅助内容仅供研判，专业结论需复核'}
                    </p>
                  </div>
                </aside>
              )}
              {!assistant && (
                <button
                  className="assistant-rail"
                  onClick={() => setAssistant(true)}
                  aria-label="展开项目协作区"
                >
                  <Sparkles size={18} />
                  <span>协作</span>
                  {attachedPanel && <Link2 size={14} />}
                </button>
              )}
            </div>
          </main>
        </SidebarProvider>
      )}
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog('');
        }}
      >
        <DialogContent
          className={`village-dialog ${dialog === 'knowledge' ? 'knowledge-dialog' : ''}`}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === 'settings'
                ? '工作台设置'
                : dialog === 'knowledge'
                  ? '知识库结构与追溯要求'
                  : dialog === 'project'
                    ? '新建村庄档案'
                    : '新建方案'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'settings'
                ? '资料保存在当前浏览器，可导出作为备份。'
                : dialog === 'knowledge'
                  ? '知识库贯穿档案、调试、对话与方案；来源与适用条件需在使用时逐项核验。'
                  : '请输入名称以建立项目记录。'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'settings' ? (
            <>
              <div className="setting-row">
                <span>资料存储</span>
                <b>{saved}</b>
              </div>
              <div className="setting-row">
                <span>当前项目</span>
                <b>{project.name}</b>
              </div>
              <div className="setting-row">
                <span>项目总纲</span>
                <b>已备份至项目资料目录</b>
              </div>
              <button className="primary-button" onClick={download}>
                <Download size={17} />
                导出当前项目资料
              </button>
            </>
          ) : dialog === 'knowledge' ? (
            <div className="knowledge-dialog-content">
              <div className="knowledge-layer-list">
                {knowledgeLayers.map((layer, index) => (
                  <article key={layer.title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{layer.title}</h3>
                      <p>{layer.purpose}</p>
                      <small>{layer.trace}</small>
                    </div>
                  </article>
                ))}
              </div>
              <div className="boundary-note compact">
                <ShieldCheck />
                <p>
                  每条知识需保留来源、适用地区、适用条件、证据等级和可迁移范围。涉及规范与工程安全的判断必须再次专业复核。
                </p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <label className="field">
                {dialog === 'project' ? '项目名称' : '方案名称'}
                <input
                  className="plain-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    dialog === 'project'
                      ? '例如：青溪村 · 适老化建设计划'
                      : '例如：连续慢行与休憩网络 · 方案 A'
                  }
                  maxLength={60}
                />
              </label>
              <button
                className="primary-button"
                disabled={!name.trim()}
                type="submit"
              >
                <Plus size={17} />
                确认创建
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={galleryCategory !== null}
        onOpenChange={(open) => {
          if (!open) setGalleryCategory(null);
        }}
      >
        <DialogContent className="village-dialog gallery-dialog">
          <DialogHeader>
            <DialogTitle>{galleryCategory}</DialogTitle>
            <DialogDescription>
              {galleryPhotos.length
                ? `共 ${galleryPhotos.length} 张图片，可删除或移动到其他分类。`
                : '该分类还没有图片，上传后即可在这里查看与管理。'}
            </DialogDescription>
          </DialogHeader>
          <div className="gallery-dialog-body">
            {galleryPhotos.length ? (
              <div className="photo-grid">
                {galleryPhotos.map((photo) => (
                  <div className="photo-card" key={photo.id}>
                    <button
                      type="button"
                      className="photo-thumb"
                      aria-label={`预览 ${photo.name}`}
                    >
                      <img src={photo.src} alt={photo.name} />
                      <b>{photo.name}</b>
                      <small>{photo.category}</small>
                    </button>
                    <button
                      type="button"
                      className="photo-delete"
                      aria-label={`删除 ${photo.name}`}
                      onClick={() => removePhoto(photo.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            className="photo-move"
                            aria-label={`移动 ${photo.name}`}
                          >
                            <ChevronDown size={14} />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {photoCategories
                          .filter((item) => item.title !== galleryCategory)
                          .map((item) => (
                            <DropdownMenuItem
                              key={item.title}
                              onClick={() => movePhoto(photo.id, item.title)}
                            >
                              移动到「{item.title}」
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ) : (
              <div className="gallery-empty">
                <ImageIcon size={25} />
                <p>该分类还没有图片</p>
                <span>上传后即可在这里查看、删除或移动。</span>
              </div>
            )}
            <button
              type="button"
              className="gallery-dialog-upload"
              onClick={() => {
                if (galleryCategory) setCategory(galleryCategory);
                file.current?.click();
              }}
            >
              <Upload size={16} />
              上传图片到「{galleryCategory}」
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={migrateLocal !== null}
        onOpenChange={(open) => {
          if (!open && !migrateBusy) setMigrateLocal(null);
        }}
      >
        <DialogContent className="village-dialog">
          <DialogHeader>
            <DialogTitle>发现本机旧数据</DialogTitle>
            <DialogDescription>
              这台电脑的浏览器里存有 {migrateLocal?.length || 0} 个项目、
              {migrateLocal?.reduce((n, p) => n + p.photos.length, 0) || 0}{' '}
              张图片。导入后集中保存到服务器，其他设备也能访问；本机数据仍会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="rounded-lg border border-[#d4ded4] bg-white/70 px-4 py-2 text-[14px] text-[#2b2a24] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={migrateBusy}
              onClick={() => setMigrateLocal(null)}
            >
              暂不导入
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#24583e] px-4 py-2 text-[14px] font-medium text-white transition hover:bg-[#2f5d3a] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={migrateBusy}
              onClick={() => void importLocalProjects()}
            >
              {migrateBusy ? '正在导入…' : '导入并继续'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {notice && (
        <output className="toast">
          <CheckCircle2 size={18} />
          {notice}
        </output>
      )}
    </div>
  );
}
