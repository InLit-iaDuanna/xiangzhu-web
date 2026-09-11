'use client';
import { useEffect, useState } from 'react';
import DebugWorkbench from './debug-workbench';
import { request } from '@/lib/v2/client';
import { demoSpatial, type Spatial } from '@/lib/spatial';

export default function DebugEntry() {
  // 默认载入青溪村演示数据，打开即进入 7 步骤调试台（可在「转译平面图」更换底图与 AI 识别）。
  const [spatial, setSpatial] = useState<Spatial>(() => demoSpatial());
  const [projectId, setProjectId] = useState('');
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('');

  // 连接后端：获取已有项目，没有则创建一个 demo 项目，供 blueprint AI 识别使用。
  useEffect(() => {
    void (async () => {
      try {
        const projects = await request<any[]>('/api/v1/projects');
        let pid = projects[0]?.id;
        if (!pid) {
          const created = await request('/api/v1/projects', {
            method: 'POST',
            body: JSON.stringify({
              name: '青溪村 · 适老化建设计划',
              mode: 'demo',
            }),
          });
          pid = created.id;
        }
        setProjectId(pid);
        setConnected(true);
      } catch (e) {
        setNotice(
          e instanceof Error
            ? `后端未连接，AI 识别不可用：${e.message}`
            : '后端未连接，AI 识别不可用',
        );
      }
    })();
  }, []);

  const project = {
    id: 'local',
    name: '青溪村 · 适老化建设计划',
    address: '',
    spatial,
    photos: [],
  };
  const saved = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {notice && (
        <div
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#265948',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            boxShadow: '0 4px 16px rgba(18,62,41,.25)',
          }}
        >
          {notice}
        </div>
      )}
      <DebugWorkbench
        project={project}
        saved={saved}
        onNavigate={() => {}}
        onGallery={() => {}}
        onChange={setSpatial}
        onPlan={() => {}}
        projectId={projectId}
        connected={connected}
      />
    </>
  );
}
