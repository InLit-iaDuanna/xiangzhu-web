import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '乡筑 · 乡村适老化建设辅助工作台',
  description:
    '在同一项目中组织村庄档案、老人使用场景、空间调试、知识依据与可比较建设方案。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
