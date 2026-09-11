import type { Metadata } from 'next';
import PrototypeWorkbench from './prototype-workbench';
import './prototype.css';

export const metadata: Metadata = {
  title: '调试工作台 V1.1 · 可运行低模原型',
  description: '乡村适老化建设辅助工作台 V1.1 低保真功能原型。',
};

export default function PrototypePage() {
  return <PrototypeWorkbench />;
}
