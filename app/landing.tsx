'use client';
import { useState } from 'react';
import {
  Leaf,
  Plus,
  ArrowUpRight,
  Search,
  MapPin,
  ArrowRight,
  Accessibility,
  Play,
  ShieldCheck,
} from 'lucide-react';
export default function Landing({
  projects,
  onOpen,
  onCreate,
}: {
  projects: { id: string; name: string; address: string; updated: string }[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <>
      <main className="home">
        <section className="hero">
          <div className="eyebrow">AGE-FRIENDLY COUNTRYSIDE WORKBENCH</div>
          <div className="handwriting">让老人安心行走，也安心停留。</div>
          <h1>
            从真实村庄开始，
            <br />
            让适老化建设
            <br />
            <em>更有依据。</em>
          </h1>
          <p>
            把村庄资料、老人使用行为、空间问题与设计判断放在一起。
            <br />
            从建档到调试，再到可比较、可复核的建设方案。
          </p>
          <button className="create-card" onClick={onCreate}>
            <span>
              <b>新建村庄项目</b>
              <small>建立一份可持续补充的适老化档案</small>
            </span>
            <span className="round">
              <Plus />
            </span>
          </button>
          <div className="features">
            <span>
              <Accessibility />
              老人需求
            </span>
            <span>
              <Play />
              场景调试
            </span>
            <span>
              <ShieldCheck />
              合规复核
            </span>
          </div>
        </section>
        <section className="glass projects">
          <div className="section-top">
            <div>
              <div className="eyebrow">REAL VILLAGE, TRACEABLE DECISIONS</div>
              <h2>
                项目档案
                <span className="count">
                  {String(projects.length).padStart(2, '0')}
                </span>
              </h2>
            </div>
            <ArrowUpRight />
          </div>
          <p className="muted">每一个判断，都从真实村庄与老人使用场景开始。</p>
          <div className="search">
            <Search size={20} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目名称、村庄或关键词…"
            />
          </div>
          <div className="home-project-list">
            {projects
              .filter((p) => (p.name + p.address).includes(search))
              .map((p) => (
                <button
                  key={p.id}
                  className="project-card"
                  onClick={() => onOpen(p.id)}
                  aria-label={`打开项目：${p.name}`}
                >
                  <div className="project-image">
                    <span className="pill">进行中</span>
                    <div className="image-caption">
                      山水之间，让生活重新生长。
                    </div>
                  </div>
                  <div className="project-info">
                    <span className="eyebrow">
                      AGE-FRIENDLY VILLAGE PROJECT
                    </span>
                    <h3>{p.name}</h3>
                    <p>
                      <MapPin size={14} />
                      {p.address || '村庄地址待补充'}
                    </p>
                    <div className="project-bottom">
                      <span>
                        最近编辑 ·{' '}
                        {new Date(p.updated).toLocaleDateString('zh-CN')}
                      </span>
                      <b>
                        进入项目 <ArrowRight size={17} />
                      </b>
                    </div>
                  </div>
                </button>
              ))}
            {!projects.some((p) => (p.name + p.address).includes(search)) && (
              <p className="no-results">没有找到相关项目，换个关键词试试。</p>
            )}
          </div>
          <div className="archive-footer">
            <Leaf />
            <p>一份完整、可追溯的档案，是可靠调试与方案判断的第一步。</p>
          </div>
        </section>
      </main>
      <footer className="home-footer">
        <span>以适老化为主线，以合规为底线。</span>
        <span>真实场景 · 持续调试 · 可追溯方案</span>
      </footer>
    </>
  );
}
