'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Upload,ScanLine,LoaderCircle,X,Check,Ruler,AlertTriangle,Info} from 'lucide-react';
import {api,request} from '@/lib/v2/client';
import {applyBlueprint,applyScale,blueprintResult,type BlueprintSummary} from '@/lib/v2/blueprint';
import {enhanceImage,enhanceLabels,type EnhanceLevel} from '@/lib/v2/enhance';
import {hasMetricScale,scaleFromArea,scaleFromWidth,type Spatial} from '@/lib/spatial';

type Props={
 data:Spatial;
 change:(patch:Partial<Spatial>,action:string,before?:string,after?:string)=>void;
 onPickImage:()=>void;
 projectId?:string;
 connected:boolean;
 busy?:boolean;
 onNotice:(text:string)=>void;
};

type BlueprintRun={status:string;error?:string;result?:{model?:string}&Record<string,unknown>};

// 前端代理对请求体有限制（约 1MB），因此识别前必须把底图压缩为轻量 JPEG。
const UPLOAD_BUDGET=900*1024;
const ENCODE_STEPS=[[1600,.85],[1280,.72],[1024,.6]] as const;

function loadImage(src:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error('底图无法解码，请重新上传影像'));
  img.src=src;
 });
}

function canvasToBlob(canvas:HTMLCanvasElement,quality:number){
 return new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('影像压缩失败')),'image/jpeg',quality);
 });
}

// 逐级降采样与降质量，直到体积低于代理上限；识别用底图不需要原始分辨率。
async function encodeBasemap(image:string){
 const img=await loadImage(image);
 if(!img.naturalWidth||!img.naturalHeight)throw new Error('底图尺寸无效，请重新上传影像');
 let last:Blob|null=null;
 for(const [maxSide,quality] of ENCODE_STEPS){
  const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const context=canvas.getContext('2d');
  if(!context)throw new Error('无法处理影像，请更换浏览器后重试');
  context.drawImage(img,0,0,canvas.width,canvas.height);
  last=await canvasToBlob(canvas,quality);
  if(last.size<=UPLOAD_BUDGET)return last;
 }
 throw new Error(`影像压缩后仍为 ${Math.round((last?.size??0)/1024)} KB，超出上传上限，请先裁剪研究范围`);
}

// 上传底图到后端材料库，供业务服务视觉模型读取。
async function uploadBasemap(projectId:string,image:string){
 const blob=await encodeBasemap(image);
 const form=new FormData();
 form.append('file',new File([blob],'village-orthophoto.jpg',{type:'image/jpeg'}));
 const material=(await request(`/api/v1/projects/${projectId}/materials`,{method:'POST',body:form})) as {id:string};
 return material.id;
}

export default function BlueprintPanel({data,change,onPickImage,projectId,connected,busy,onNotice}:Props){
 const [areaInput,setAreaInput]=useState(''),[widthInput,setWidthInput]=useState('');
 const [runId,setRunId]=useState(''),[run,setRun]=useState<BlueprintRun|null>(null),[phase,setPhase]=useState<'idle'|'enhancing'|'uploading'|'running'|'failed'>('idle');
 const [error,setError]=useState(''),[summary,setSummary]=useState<BlueprintSummary|null>(null);
 // 高清修复档位与一键转译流程。
 const [enhanceLevel]=useState<EnhanceLevel>('light'),[progress,setProgress]=useState<{ratio:number;label:string}|null>(null);
 // 面积标定按底图真实像素面积换算（宽度标定仍为米/横向单位，不受影响）。
 const scale=useMemo(()=>{const area=Number(areaInput);if(area>0)return scaleFromArea(area,data.imageSize)??0;const width=Number(widthInput);if(width>0)return scaleFromWidth(width)??0;return 0;},[areaInput,widthInput,data.imageSize]);
 // 轮询期间需要读取最新的场景、尺度与回调，用 ref 保存避免重启定时器。
 const latest=useRef({data,scale,change,onNotice});
 useEffect(()=>{latest.current={data,scale,change,onNotice};},[data,scale,change,onNotice]);
 const abortRef=useRef<AbortController|null>(null);
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 const calibrated=hasMetricScale(data);
 const candidates=data.roads.filter(r=>r.status==='candidate');
 useEffect(()=>{
  if(!runId||!projectId)return;
  let stopped=false;
  const poll=async()=>{
   try{
    const current=(await api(projectId,`/runs/${runId}`)) as BlueprintRun;
    if(stopped)return;
    setRun(current);
    if(current.status==='completed'){
     setRunId('');setPhase('idle');
     const parsed=blueprintResult.safeParse(current.result);
     if(!parsed.success){setError('识别结果格式不符，请重新识别');setPhase('failed');return;}
     const {data:scene,scale:currentScale,change:apply,onNotice:notify}=latest.current;
     const next=applyBlueprint(scene,parsed.data,currentScale,{model:current.result?.model??'gpt-5.3-codex'});
     apply({nodes:next.spatial.nodes,roads:next.spatial.roads,scale:next.spatial.scale,calibration:next.spatial.calibration,blueprint:next.spatial.blueprint},'AI 转译平面图','',`道路 ${next.summary.roads} 段`);setSummary(next.summary);
     notify(`已生成候选：${next.summary.roads} 段道路。请逐条校正后再确认。`);
    }else if(['failed','cancelled','stale'].includes(current.status)){
     setRunId('');setPhase('failed');setError(current.error||'识别未完成，请重试');
    }
   }catch(e){
    if(!stopped){setRunId('');setPhase('failed');setError(e instanceof Error?e.message:'读取识别进度失败');}
   }
  };
  void poll();
  const timer=setInterval(poll,2000);
  return ()=>{stopped=true;clearInterval(timer);};
 },[runId,projectId]);
 const running=phase==='enhancing'||phase==='uploading'||phase==='running';
 // 一键转译：高清修复 → 上传增强图 → 提交 AI 识别（仅道路）。
 async function runPipeline(){
  if(!projectId||!data.image)return;
  setError('');setSummary(null);setPhase('enhancing');setProgress({ratio:0,label:'高清修复底图'});
  try{
   // 1) 高清修复（始终执行，替换显示底图 + 作识别输入）。
   const enhanced=await enhanceImage(data.image,{level:enhanceLevel,onProgress:(ratio,label)=>setProgress({ratio,label})});
   change({image:enhanced.dataUrl,imageSize:{w:enhanced.size.w,h:enhanced.size.h}},'高清修复底图','',`增强档位 ${enhanceLabels[enhanceLevel]}`);
   // 2) 上传增强图到材料库。
   setPhase('uploading');setProgress(null);
   const materialId=await uploadBasemap(projectId,enhanced.dataUrl);
   // 3) 提交 run（AI 视觉模型识别道路）。
   setPhase('running');
   const created=await api(projectId,'/runs',{type:'blueprint',material_id:materialId});
   setRunId(created.run_id);
  }catch(e){
   setProgress(null);setPhase('failed');
   setError(e instanceof Error?e.message:'转译流程失败，请重试');
  }
 }
 function cancel(){
  abortRef.current?.abort();
  if(projectId&&runId)void api(projectId,`/runs/${runId}/cancel`,{}).catch(()=>{});
  setRunId('');setProgress(null);setPhase('idle');onNotice('已请求取消本次转译。');
 }
 function applyCalibration(){
  if(!(scale>0))return;
  const next=applyScale(data,scale);
  change({scale:next.scale,calibration:next.calibration,roads:next.roads},'标定影像尺度','',`1 图像单位 = ${scale.toFixed(3)} m`);
  onNotice(`已按 ${scale.toFixed(3)} m/图像单位标定，路长与路宽将据此估算。`);
 }
 const remoteUsable=connected&&!!projectId;
 return <div className="dw-blueprint">
  <div className="dw-inspector-title"><ScanLine size={17}/><h3>转译平面图</h3></div>
  <p className="dw-note">上传卫星/正射俯视图后即可识别候选道路与建筑；所有结果都需人工校正后才进入正式模拟。</p>
  <div className="dw-blueprint-map">
   <button className="dw-secondary full" onClick={onPickImage} disabled={running}><Upload size={14}/>{data.image?'更换卫星底图':'上传卫星/正射俯视图'}</button>
  </div>
  <div className="dw-blueprint-badges">
   <span className={data.image?'good':''}>{data.image?'底图已载入':'底图待上传'}</span>
   <span className={calibrated?'good':''}>{calibrated?`尺度 ${data.scale.toFixed(3)} m/单位`:'尺度未标定'}</span>
  </div>
  <div className="dw-info-card">
   <b><Ruler size={13}/> 尺度标定（用于估算路长路宽）</b>
   <p>已知研究范围占地面积或影像宽度时填写任一即可；未知则保留为「未知」，不输出伪精确尺寸。</p>
   <label className="dw-field"><span>研究范围占地面积（m²）</span><input type="number" min="1" value={areaInput} placeholder="例如 48000" onChange={e=>{setAreaInput(e.target.value);if(e.target.value)setWidthInput('')}}/></label>
   <label className="dw-field"><span>影像宽度对应实际距离（m）</span><input type="number" min="1" value={widthInput} placeholder="例如 240" onChange={e=>{setWidthInput(e.target.value);if(e.target.value)setAreaInput('')}}/></label>
   <div className="dw-inline"><span className="dw-blueprint-scale">{scale>0?`1 图像单位 = ${scale.toFixed(3)} m`:'填写任一项以计算尺度'}</span><button className="dw-secondary" disabled={!(scale>0)} onClick={applyCalibration}><Check size={13}/>应用尺度</button></div>
  </div>
  <div className="dw-info-card">
   <b><ScanLine size={13}/> 一键转译（高清修复 → AI 识别道路）</b>
   {!data.image?<p>请先上传卫星/正射俯视图。</p>:!remoteUsable?<p>AI 道路识别需先登录业务服务（点右上角「连接工作台」）；在此之前可点「仅高清修复」在本机修复底图。</p>:<p>流程将依次：高清修复底图 → 上传增强图 → AI 识别道路并自动标号（R-01、R-02…）。结果只作候选事实，必须逐条确认。</p>}
   <div className="dw-inline">
    <button className="dw-primary" disabled={!data.image||running||!!busy||!remoteUsable} onClick={runPipeline}>{running?<LoaderCircle size={14} className="dw-spin"/>:<ScanLine size={14}/>}{phase==='enhancing'?'高清修复中…':phase==='uploading'?'上传增强图…':phase==='running'?'AI 识别道路中…':candidates.length?'重新转译':'开始转译'}</button>
    {running&&<button className="dw-secondary" onClick={cancel}>取消</button>}
   </div>
   {progress&&<div className="dw-vision-progress" role="status"><i style={{width:`${Math.round(Math.max(0,Math.min(1,progress.ratio))*100)}%`}}/><span>{progress.label} {Math.round(progress.ratio*100)}%</span></div>}
   {run&&running&&<p className="dw-note" role="status">AI 识别进行中：{run.status==='queued'?'排队等待执行…':run.status==='numbering'?'正在标号道路…':'视觉模型正在识别道路…'}（约 10–40 秒）</p>}
   {error&&<p className="dw-alert" role="alert"><AlertTriangle size={13}/>{error}<button onClick={()=>setError('')}><X size={13}/></button></p>}
  </div>
  {summary&&<div className="dw-info-card">
   <b><Info size={13}/> 本次识别结果</b>
   <p>新增候选道路 {summary.roads} 段 · 新增节点 {summary.nodes} 个 · 低置信 {summary.lowConfidence} 条{summary.skipped?` · 已跳过 ${summary.skipped} 项与现有内容重复的几何`:''}{summary.removedCandidates?` · 已替换上一轮候选 ${summary.removedCandidates} 项`:''}。</p>
   <p className="dw-note">道路已在底图上以黄色虚线标出并带 R-xx 编号；请到「路网校正」逐条核对属性，置信度低的对象优先现场核实。</p>
  </div>}
  </div>;
  }

