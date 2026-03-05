'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Save, Eye, Trash2, Type, ImageIcon, QrCode,
  Layers, Check, Plus, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X,
  Globe, Package, MapPin, Camera, Upload, Lock, Palette, Loader2,
  RectangleHorizontal, BookOpen, ClipboardList, Rows3,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  Maximize2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  WorksheetLayout,
  WorksheetElement,
  WorksheetTextStyle,
  KlaseInstructionPage,
  KlaseInstructionPageLabels,
  KlaseInstructionSectionStyle,
  InstrExtraBlock,
  InstrTextStyle,
  BodyRow,
  TeacherSurvey,
  TeacherSurveyQuestion,
} from '@/lib/types/viewer';

// ─── Helpers ────────────────────────────────────────────────────────────────
const MIN_PCT = 3;
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** Compress an image file using canvas before upload.
 *  Max dimension: 1600px. Always output JPEG @ 85% quality (PNG quality param is ignored by browsers,
 *  so we convert everything to JPEG — worksheet images don't need transparency). */
async function compressImage(file: File, maxPx = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      // Fill white background before drawing so transparent PNGs get a white bg in JPEG output
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// ─── Default Layout ──────────────────────────────────────────────────────────
function createDefaultLayout(): WorksheetLayout {
  return {
    version: 1,
    defaultLang: 'en',
    languages: ['en'],
    elements: [
      // safeX≈2.7%, safeY≈3.8% with default 8mm margin — all elements kept inside
      { id: 'texture-zone-1', type: 'texture-zone', scope: 'per-model', x: 37, y: 7, w: 60, h: 85 },
      {
        id: 'title-1', type: 'text', scope: 'per-model', x: 3, y: 4, w: 33, h: 12,
        content: { en: '{modelName}' },
        textStyle: { fontSize: 14, fontWeight: 'bold', fontStyle: 'normal', color: '#ffffff', textAlign: 'center', backgroundColor: '#333333', padding: 8 },
      },
      {
        id: 'subtitle-1', type: 'text', scope: 'shared', x: 3, y: 17, w: 33, h: 7,
        content: { en: '{viewerName}' },
        textStyle: { fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#666666', textAlign: 'center', padding: 4 },
      },
      {
        id: 'instructions-1', type: 'text', scope: 'shared', x: 3, y: 25, w: 33, h: 40,
        content: { en: 'How to use:\n1. Print in landscape\n2. Color or paint the texture area\n3. Keep all corner markers visible\n4. Take a photo showing all 4 markers\n5. Scan QR code or go to the link below\n6. Your texture applies to the 3D model!' },
        textStyle: { fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', textAlign: 'left', backgroundColor: '#f5f5f5', padding: 8 },
      },
      { id: 'qr-zone-1', type: 'qr-zone', scope: 'per-model', x: 3, y: 67, w: 20, h: 25 },
      {
        id: 'footer-1', type: 'text', scope: 'shared', x: 3, y: 92, w: 33, h: 4,
        content: { en: 'Keep all 4 corner markers visible when photographing.' },
        textStyle: { fontSize: 7, fontWeight: 'normal', fontStyle: 'normal', color: '#666666', textAlign: 'center', backgroundColor: '#f5f5f5', padding: 6 },
      },
    ],
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Model {
  id: string;
  name: string;
  uv_map_url?: string | null;
  marker_id_base?: number;
  order_index: number;
  qr_code_data: string;
}

interface Viewer {
  id: string;
  name: string;
  settings: Record<string, unknown>;
}

interface DragState {
  elementId: string;
  mode: 'move' | 'resize';
  handle: string;
  startPctX: number;
  startPctY: number;
  orig: { x: number; y: number; w: number; h: number };
}

// ─── Resize handle layout ────────────────────────────────────────────────────
const HANDLE_POS: Record<string, { top: string; left: string; cursor: string }> = {
  nw: { top: '-5px', left: '-5px', cursor: 'nw-resize' },
  n:  { top: '-5px', left: 'calc(50% - 5px)', cursor: 'n-resize' },
  ne: { top: '-5px', left: 'calc(100% - 5px)', cursor: 'ne-resize' },
  e:  { top: 'calc(50% - 5px)', left: 'calc(100% - 5px)', cursor: 'e-resize' },
  se: { top: 'calc(100% - 5px)', left: 'calc(100% - 5px)', cursor: 'se-resize' },
  s:  { top: 'calc(100% - 5px)', left: 'calc(50% - 5px)', cursor: 's-resize' },
  sw: { top: 'calc(100% - 5px)', left: '-5px', cursor: 'sw-resize' },
  w:  { top: 'calc(50% - 5px)', left: '-5px', cursor: 'w-resize' },
};

// ─── Predefined languages (must match WORKSHEET_TRANSLATIONS in qr-codes.ts) ──
const PREDEFINED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'lt', label: 'Lietuvių' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'et', label: 'Eesti' },
];

// ─── Default labels for the teacher instruction page ────────────────────────
const INSTR_DEFAULTS: Record<string, Record<string, string>> = {
  lv: {
    title: 'Skolotāja instrukcija',
    klaseSection: 'Klases reģistrācija',
    klaseHint: 'Skenē QR kodu vai atvēri saiti, lai reģistrētu klasi un saņemtu darba lapas',
    pinSection: 'PIN kods',
    pinHint: 'Ievadi šo PIN kodu, lai atvērtu klases displeju',
    observerSection: 'Novērotāja aptauja',
    observerHint: 'Skenē QR kodu, lai aizpildītu novērotāja aptauju',
  },
  en: {
    title: 'Teacher Instruction',
    klaseSection: 'Class Registration',
    klaseHint: 'Scan QR or open the link to register your class and get worksheets',
    pinSection: 'PIN Code',
    pinHint: 'Enter this PIN to unlock the classroom display',
    observerSection: 'Observer Survey',
    observerHint: 'Scan QR to fill in the observer survey',
  },
  lt: {
    title: 'Mokytojo instrukcija',
    klaseSection: 'Klasės registracija',
    klaseHint: 'Skenk QR arba atidark nuorodą, kad registruotum klasę ir gautum darbo lapus',
    pinSection: 'PIN kodas',
    pinHint: 'Įvesk šį PIN kodą, kad atidaryčiau klasės ekraną',
    observerSection: 'Stebėtojo apklausa',
    observerHint: 'Skenk QR, kad užpildytum stebėtojo apklausa',
  },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function WorksheetBuilder({ viewer, models }: { viewer: Viewer; models: Model[] }) {
  const existing = viewer.settings?.worksheetLayout as WorksheetLayout | undefined;
  const [layout, setLayout] = useState<WorksheetLayout>(existing ?? createDefaultLayout());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentLang, setCurrentLang] = useState(layout.defaultLang);
  const [currentModelId, setCurrentModelId] = useState<string>(models[0]?.id ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [imgUploadState, setImgUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [canvasScale, setCanvasScale] = useState(0.8);
  const [showNewLang, setShowNewLang] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [activeTab, setActiveTab] = useState<'canvas' | 'instruction'>('canvas');
  const [instrLang, setInstrLang] = useState(layout.defaultLang);
  const [showTranslations, setShowTranslations] = useState(false);
  const [selectedInstrSection, setSelectedInstrSection] = useState<string|null>(null);
  const [expandedTsQ, setExpandedTsQ] = useState<string|null>(null);
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selectedEl = layout.elements.find(el => el.id === selectedId) ?? null;
  const currentModel = models.find(m => m.id === currentModelId) ?? models[0];

  // track canvas width for font scaling
  useEffect(() => {
    function update() {
      if (canvasRef.current) setCanvasScale(canvasRef.current.offsetWidth / 1122);
    }
    update();
    const obs = new ResizeObserver(update);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, []);

  // ─── Drag helpers ─────────────────────────────────────────────────────────
  function getPct(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  function startMoveDrag(e: React.PointerEvent, id: string) {
    e.stopPropagation(); e.preventDefault();
    setSelectedId(id);
    const el = layout.elements.find(el => el.id === id); if (!el) return;
    const pct = getPct(e);
    dragRef.current = { elementId: id, mode: 'move', handle: '', startPctX: pct.x, startPctY: pct.y, orig: { x: el.x, y: el.y, w: el.w, h: el.h } };
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function startResizeDrag(e: React.PointerEvent, id: string, handle: string) {
    e.stopPropagation(); e.preventDefault();
    setSelectedId(id);
    const el = layout.elements.find(el => el.id === id); if (!el) return;
    const pct = getPct(e);
    dragRef.current = { elementId: id, mode: 'resize', handle, startPctX: pct.x, startPctY: pct.y, orig: { x: el.x, y: el.y, w: el.w, h: el.h } };
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const pct = getPct(e);
    const ds = dragRef.current;
    const dx = pct.x - ds.startPctX;
    const dy = pct.y - ds.startPctY;
    const o = ds.orig;

    setLayout(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id !== ds.elementId) return el;
        if (ds.mode === 'move') {
          return { ...el, x: clamp(o.x + dx, safeX, 100 - safeX - el.w), y: clamp(o.y + dy, safeY, 100 - safeY - el.h) };
        }
        let { x, y, w, h } = o;
        const hd = ds.handle;
        const isCorner = hd.length === 2; // nw ne sw se
        // aspect ratio: texture-zone is always 1:1 in mm (h% = w% * 297/210)
        // other elements: maintain their current visual ratio on screen (h/w)
        const RATIO = el.type === 'texture-zone' ? 297 / 210 : o.h / o.w;

        if (isCorner) {
          // ── Proportional corner resize ────────────────────────────────────
          // Width driven by horizontal handle side
          if (hd.includes('e')) {
            w = clamp(o.w + dx, MIN_PCT, 100 - safeX - o.x);
          } else {
            const newX = clamp(o.x + dx, safeX, o.x + o.w - MIN_PCT);
            w = o.w - (newX - o.x);
            x = newX;
          }
          h = w * RATIO;
          // Re-anchor for north corners (bottom edge is fixed)
          if (hd.includes('n')) {
            y = o.y + o.h - h;
            // If clamped by top safe zone, shrink to fit
            if (y < safeY) {
              y = safeY;
              h = o.y + o.h - y;
              w = h / RATIO;
              if (hd.includes('w')) x = o.x + o.w - w;
            }
          } else {
            // South: clamp bottom edge to safe zone
            if (o.y + h > 100 - safeY) {
              h = 100 - safeY - o.y;
              w = h / RATIO;
              if (hd.includes('w')) x = o.x + o.w - w;
            }
          }
        } else {
          // ── Edge resize (free, or 1:1-locked for texture-zone) ────────────
          if (hd.includes('n')) { y = clamp(o.y + dy, safeY, o.y + o.h - MIN_PCT); h = o.h - (y - o.y); }
          if (hd.includes('s')) { h = clamp(o.h + dy, MIN_PCT, 100 - safeY - o.y); }
          if (hd.includes('w')) { x = clamp(o.x + dx, safeX, o.x + o.w - MIN_PCT); w = o.w - (x - o.x); }
          if (hd.includes('e')) { w = clamp(o.w + dx, MIN_PCT, 100 - safeX - o.x); }
          // Enforce 1:1 for texture-zone edge handles
          if (el.type === 'texture-zone') {
            if (hd === 'n' || hd === 's') {
              w = Math.max(h / RATIO, MIN_PCT);
            } else {
              h = w * RATIO;
              if (hd === 'n') y = o.y + o.h - h;
            }
          }
        }
        return { ...el, x, y, w, h };
      }),
    }));
  }

  function handlePointerUp() { dragRef.current = null; }

  // ─── Layout mutations ──────────────────────────────────────────────────────
  function updateEl(id: string, patch: Partial<WorksheetElement>) {
    setLayout(prev => ({ ...prev, elements: prev.elements.map(el => el.id === id ? { ...el, ...patch } : el) }));
  }

  function updateTs(id: string, patch: Partial<WorksheetTextStyle>) {
    const el = layout.elements.find(e => e.id === id); if (!el) return;
    const base: WorksheetTextStyle = el.textStyle ?? { fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#000000', textAlign: 'left' };
    updateEl(id, { textStyle: { ...base, ...patch } });
  }

  function updateContent(id: string, lang: string, text: string) {
    const el = layout.elements.find(e => e.id === id); if (!el) return;
    updateEl(id, { content: { ...(el.content ?? {}), [lang]: text } });
  }

  function updateModelContent(id: string, modelId: string, lang: string, text: string) {
    const el = layout.elements.find(e => e.id === id); if (!el) return;
    const prev = el.modelContent ?? {};
    updateEl(id, { modelContent: { ...prev, [modelId]: { ...(prev[modelId] ?? {}), [lang]: text } } });
  }

  function updateModelImageUrl(id: string, modelId: string, url: string) {
    const el = layout.elements.find(e => e.id === id); if (!el) return;
    updateEl(id, { modelImageUrl: { ...(el.modelImageUrl ?? {}), [modelId]: url } });
  }

  function deleteEl(id: string) {
    setLayout(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== id) }));
    setSelectedId(null);
  }

  function moveEl(id: string, dir: 'up' | 'down') {
    setLayout(prev => {
      const arr = [...prev.elements];
      const idx = arr.findIndex(el => el.id === id);
      if (idx < 0) return prev;
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return prev;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return { ...prev, elements: arr };
    });
  }

  function addElement(type: WorksheetElement['type']) {
    const id = uid();
    const defaultScope: WorksheetElement['scope'] =
      (type === 'texture-zone' || type === 'qr-zone' || type === 'image') ? 'per-model' : 'shared';
    // texture-zone must be 1:1 (square in mm on A4 landscape): h = w * 297/210
    const base: WorksheetElement = type === 'texture-zone'
      ? { id, type, scope: defaultScope, x: 10, y: 10, w: 30, h: Math.round(30 * 297 / 210 * 10) / 10 }
      : type === 'arrow'
      ? { id, type, scope: defaultScope, x: 10, y: 10, w: 15, h: 10 }
      : { id, type, scope: defaultScope, x: 10, y: 10, w: 30, h: 20 };
    const newEl: WorksheetElement =
      type === 'text'
        ? { ...base, content: { [currentLang]: 'New text' }, textStyle: { fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', textAlign: 'left' } }
        : type === 'image'
          ? { ...base, imageUrl: '', objectFit: 'contain' }
          : type === 'arrow'
          ? { ...base, arrowColor: '#333333' }
          : base;
    setLayout(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedId(id);
  }

  function updateInstrPage(patch: Partial<KlaseInstructionPage>) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, ...patch },
    }));
  }

  function updateInstrTranslation(lang: string, key: string, value: string) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: {
        enabled: false,
        ...prev.klaseInstructionPage,
        translations: {
          ...(prev.klaseInstructionPage?.translations ?? {}),
          [lang]: {
            ...(prev.klaseInstructionPage?.translations?.[lang] ?? {}),
            [key]: value,
          },
        },
      },
    }));
  }

  function updateInstrSectionStyle(section: 'header'|'klase'|'pin'|'observer'|'footer', patch: Partial<KlaseInstructionSectionStyle> & { borderColor?: string }) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: {
        enabled: false,
        ...prev.klaseInstructionPage,
        sectionStyles: {
          ...(prev.klaseInstructionPage?.sectionStyles ?? {}),
          [section]: {
            ...(prev.klaseInstructionPage?.sectionStyles?.[section] ?? {}),
            ...patch,
          },
        },
      },
    }));
  }

  function updateInstrSectionTextStyle(section: 'header'|'klase'|'pin'|'observer'|'footer', field: 'headingStyle'|'bodyStyle', patch: Partial<InstrTextStyle>) {
    setLayout(prev => {
      const cur = prev.klaseInstructionPage?.sectionStyles?.[section]?.[field] ?? {};
      return {
        ...prev,
        klaseInstructionPage: {
          enabled: false,
          ...prev.klaseInstructionPage,
          sectionStyles: {
            ...(prev.klaseInstructionPage?.sectionStyles ?? {}),
            [section]: {
              ...(prev.klaseInstructionPage?.sectionStyles?.[section] ?? {}),
              [field]: { ...cur, ...patch },
            },
          },
        },
      };
    });
  }

  function getInstrLabel(key: string, lang: string): string {
    const custom = (layout.klaseInstructionPage?.translations?.[lang] as Record<string, string> | undefined)?.[key];
    if (custom) return custom;
    return (INSTR_DEFAULTS[lang] ?? INSTR_DEFAULTS.en)[key] ?? '';
  }

  function addInstrBlock(type: InstrExtraBlock['type']) {
    const id = `iblock-${Date.now()}`;
    const block: InstrExtraBlock = type === 'url'
      ? { id, type, url: '', showQr: true, urlLabel: {} }
      : type === 'image'
      ? { id, type, imageUrl: '' }
      : { id, type, content: {} };
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, extraBlocks: [...(prev.klaseInstructionPage?.extraBlocks ?? []), block] },
    }));
    setSelectedInstrSection(id);
  }

  function removeInstrBlock(id: string) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: {
        enabled: false, ...prev.klaseInstructionPage,
        extraBlocks: (prev.klaseInstructionPage?.extraBlocks ?? []).filter(b => b.id !== id),
        bodyItemOrder: (prev.klaseInstructionPage?.bodyItemOrder ?? []).filter(i => i !== id),
        bodyRows: (prev.klaseInstructionPage?.bodyRows ?? []).map(r => ({ ...r, items: r.items.filter(i => i !== id) })),
      },
    }));
    setSelectedInstrSection(s => s === id ? null : s);
  }

  function updateInstrBlock(id: string, patch: Partial<InstrExtraBlock>) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, extraBlocks: (prev.klaseInstructionPage?.extraBlocks ?? []).map(b => b.id === id ? { ...b, ...patch } : b) },
    }));
  }

  function moveInstrBlock(id: string, dir: 'up' | 'down') {
    setLayout(prev => {
      const arr = [...(prev.klaseInstructionPage?.extraBlocks ?? [])];
      const idx = arr.findIndex(b => b.id === id);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, extraBlocks: arr } };
    });
  }

  function moveSectionOrder(id: string, dir: 'up' | 'down') {
    setLayout(prev => {
      const arr: string[] = [...(prev.klaseInstructionPage?.sectionOrder ?? ['klase', 'pin', 'observer'])];
      const idx = arr.indexOf(id);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, sectionOrder: arr as ('klase'|'pin'|'observer')[] } };
    });
  }

  /** Compute effective body rows from current ip state (handles backward compat). */
  function computeBodyRows(ip: KlaseInstructionPage | undefined): BodyRow[] {
    const bodyExtraBlocks = (ip?.extraBlocks ?? []).filter(b => b.position === 'body');
    if (ip?.bodyRows?.length) {
      const trackedIds = new Set(ip.bodyRows.flatMap(r => r.items));
      const untracked = bodyExtraBlocks.map(b => b.id).filter(id => !trackedIds.has(id));
      if (untracked.length === 0) return ip.bodyRows;
      const last = ip.bodyRows[ip.bodyRows.length - 1];
      return [...ip.bodyRows.slice(0, -1), { ...last, items: [...last.items, ...untracked] }];
    }
    if (ip?.bodyItemOrder?.length) return [{ id: 'row-default', items: ip.bodyItemOrder }];
    const soArr: string[] = ip?.sectionOrder ?? ['klase', 'pin', 'observer'];
    return [{ id: 'row-default', items: [...soArr] }];
  }

  function saveBodyRows(rows: BodyRow[]) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: rows },
    }));
  }

  function addBodyRow() {
    setLayout(prev => {
      const rows = computeBodyRows(prev.klaseInstructionPage);
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: [...rows, { id: `row-${Date.now()}`, items: [] }] } };
    });
  }

  function removeBodyRow(rowId: string) {
    setLayout(prev => ({
      ...prev,
      klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: computeBodyRows(prev.klaseInstructionPage).filter(r => r.id !== rowId) },
    }));
  }

  function moveBodyRow(rowId: string, dir: 'up' | 'down') {
    setLayout(prev => {
      const rows = [...computeBodyRows(prev.klaseInstructionPage)];
      const idx = rows.findIndex(r => r.id === rowId);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= rows.length) return prev;
      [rows[idx], rows[swap]] = [rows[swap], rows[idx]];
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: rows } };
    });
  }

  function moveWithinRow(rowId: string, itemId: string, dir: 'left' | 'right') {
    setLayout(prev => {
      const rows = computeBodyRows(prev.klaseInstructionPage).map(r => {
        if (r.id !== rowId) return r;
        const items = [...r.items];
        const idx = items.indexOf(itemId);
        const swap = dir === 'left' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= items.length) return r;
        [items[idx], items[swap]] = [items[swap], items[idx]];
        return { ...r, items };
      });
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: rows } };
    });
  }

  function removeFromRow(rowId: string, itemId: string) {
    setLayout(prev => {
      const rows = computeBodyRows(prev.klaseInstructionPage).map(r =>
        r.id === rowId ? { ...r, items: r.items.filter(i => i !== itemId) } : r
      );
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: rows } };
    });
    // If it was an extra block, remove it entirely
    const isSection = ['klase','pin','observer','teacher-survey'].includes(itemId);
    if (!isSection) removeInstrBlock(itemId);
  }

  function addSectionToRow(rowId: string, sectionId: string) {
    setLayout(prev => {
      const rows = computeBodyRows(prev.klaseInstructionPage);
      const alreadyPlaced = rows.flatMap(r => r.items).includes(sectionId);
      if (alreadyPlaced) return prev;
      const newRows = rows.map(r => r.id === rowId ? { ...r, items: [...r.items, sectionId] } : r);
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, bodyRows: newRows } };
    });
  }

  function addBlockToRow(rowId: string, type: InstrExtraBlock['type']) {
    const id = `iblock-${Date.now()}`;
    const block: InstrExtraBlock = type === 'url'
      ? { id, type, url: '', showQr: true, urlLabel: {}, position: 'body' as const }
      : type === 'image'
      ? { id, type, imageUrl: '', position: 'body' as const }
      : { id, type, content: {}, position: 'body' as const };
    setLayout(prev => {
      const rows = computeBodyRows(prev.klaseInstructionPage).map(r =>
        r.id === rowId ? { ...r, items: [...r.items, id] } : r
      );
      return {
        ...prev,
        klaseInstructionPage: {
          enabled: false, ...prev.klaseInstructionPage,
          extraBlocks: [...(prev.klaseInstructionPage?.extraBlocks ?? []), block],
          bodyRows: rows,
        },
      };
    });
    setSelectedInstrSection(id);
  }

  /** Add/update a teacher survey question. */
  function updateTeacherSurveyQuestion(qId: string, patch: Partial<TeacherSurveyQuestion>) {
    setLayout(prev => {
      const ts = prev.klaseInstructionPage?.teacherSurvey ?? { enabled: true, questions: [] };
      const questions = ts.questions.map(q => q.id === qId ? { ...q, ...patch } : q);
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, questions } } };
    });
  }

  function addTeacherSurveyQuestion(type: 'open' | 'checkbox' | 'textarea') {
    const id = `tsq-${Date.now()}`;
    const q: TeacherSurveyQuestion = { id, type, text: {}, ...(type === 'checkbox' ? { options: [{}] } : {}) };
    setLayout(prev => {
      const ts = prev.klaseInstructionPage?.teacherSurvey ?? { enabled: true, questions: [] };
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, questions: [...ts.questions, q] } } };
    });
    setSelectedInstrSection(`tsq-${id}`);
  }

  function removeTeacherSurveyQuestion(qId: string) {
    setLayout(prev => {
      const ts = prev.klaseInstructionPage?.teacherSurvey ?? { enabled: true, questions: [] };
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, questions: ts.questions.filter(q => q.id !== qId) } } };
    });
  }

  function moveTeacherSurveyQuestion(qId: string, dir: 'up' | 'down') {
    setLayout(prev => {
      const ts = prev.klaseInstructionPage?.teacherSurvey;
      if (!ts) return prev;
      const qs = [...ts.questions];
      const idx = qs.findIndex(q => q.id === qId);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= qs.length) return prev;
      [qs[idx], qs[swap]] = [qs[swap], qs[idx]];
      return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, questions: qs } } };
    });
  }

  function addLang(code: string) {
    if (!code || layout.languages.includes(code)) return;
    setLayout(prev => ({ ...prev, languages: [...prev.languages, code] }));
    setCurrentLang(code);
    setShowNewLang(false);
  }

  async function save() {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/viewers/${viewer.id}/worksheet-layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      });
      setSaveState(res.ok ? 'saved' : 'error');
    } catch { setSaveState('error'); }
    setTimeout(() => setSaveState('idle'), 2500);
  }

  function resetLayout() {
    if (!confirm('Reset to default layout? Unsaved changes will be lost.')) return;
    setLayout(createDefaultLayout());
    setSelectedId(null);
  }

  // Safe zone: A4 landscape = 297 x 210 mm. Margin applies to all 4 sides.
  const safeMarginMm = layout.safeMarginMm ?? 8;
  const safeX = (safeMarginMm / 297) * 100;   // % from left/right
  const safeY = (safeMarginMm / 210) * 100;   // % from top/bottom

  // ─── Canvas rendering ──────────────────────────────────────────────────────
  function ptToPx(pt: number) { return pt * 1.333 * canvasScale; }
  // 1mm on A4 landscape (297mm wide) at current canvas scale
  function mmToPx(mm: number) { return mm * (1122 / 297) * canvasScale; }

  function getPreviewText(el: WorksheetElement): string {
    if (el.scope === 'per-model' && currentModelId && el.modelContent?.[currentModelId]) {
      const mc = el.modelContent[currentModelId];
      return mc[currentLang] ?? mc[layout.defaultLang] ?? Object.values(mc)[0] ?? '';
    }
    return (el.content ?? {})[currentLang] ?? Object.values(el.content ?? {})[0] ?? '';
  }

  function getPreviewImageUrl(el: WorksheetElement): string | undefined {
    if (el.scope === 'per-model' && currentModelId && el.modelImageUrl?.[currentModelId]) {
      return el.modelImageUrl[currentModelId];
    }
    return el.imageUrl;
  }

  function renderElementContent(el: WorksheetElement) {
    if (el.type === 'texture-zone') {
      const uvUrl = currentModel?.uv_map_url;
      return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {uvUrl ? (
            <img src={uvUrl} alt="UV" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: '#3b82f6', fontSize: ptToPx(8) }}>
              <Palette style={{ width: ptToPx(16), height: ptToPx(16) }} />
              <div>UV Map (per model)</div>
            </div>
          )}
          {/* Locked ArUco marker placeholders at each corner */}
          {([
            { style: { top: 0, left: 0 } },
            { style: { top: 0, right: 0 } },
            { style: { bottom: 0, right: 0 } },
            { style: { bottom: 0, left: 0 } },
          ] as const).map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', ...pos.style,
              width: mmToPx(15), height: mmToPx(15),
              background: 'white', border: '1px solid #222',
              display: 'grid', placeItems: 'center', zIndex: 2,
              flexShrink: 0,
            }}>
              <div style={{ width: '55%', height: '55%', background: '#222' }} />
            </div>
          ))}
          <div style={{
            position: 'absolute', bottom: ptToPx(24), left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: ptToPx(3),
            fontSize: ptToPx(6.5), color: '#bbb',
            pointerEvents: 'none', zIndex: 1,
          }}>
            <Lock style={{ width: ptToPx(7), height: ptToPx(7) }} />
            <span>Markers locked to corners</span>
          </div>
        </div>
      );
    }
    if (el.type === 'qr-zone') {
      return (
        <div style={{
          position: 'absolute', inset: 0, border: '2px dashed #888', borderRadius: 4,
          display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start',
          background: '#fafafa', padding: ptToPx(4), boxSizing: 'border-box', gap: ptToPx(3),
          overflow: 'hidden',
        }}>
          {/* Square QR placeholder — height-driven so it stays square */}
          <div style={{
            flexShrink: 0,
            aspectRatio: '1 / 1',
            height: '80%',
            background: '#e5e7eb',
            display: 'grid', placeItems: 'center',
            borderRadius: 2,
          }}>
            <QrCode style={{ width: '70%', height: '70%', color: '#6b7280' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 0, gap: ptToPx(1.5) }}>
            <div style={{ fontSize: ptToPx(7), color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>URL</div>
            <div style={{ fontSize: ptToPx(5.5), color: '#aaa', wordBreak: 'break-all', lineHeight: 1.3 }}>https://…/upload</div>
          </div>
        </div>
      );
    }
    if (el.type === 'arrow') {
      const color = el.arrowColor ?? '#333333';
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowRight style={{ width: '100%', height: '100%', color }} />
        </div>
      );
    }
    if (el.type === 'image') {
      const imgUrl = getPreviewImageUrl(el);
      return imgUrl ? (
        <img src={imgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: el.objectFit ?? 'contain' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, border: '2px dashed #ccc',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
          background: '#f9f9f9', fontSize: ptToPx(9), color: '#bbb',
        }}>
          <ImageIcon style={{ width: ptToPx(14), height: ptToPx(14), opacity: 0.4 }} />
          <span>{el.scope === 'per-model' ? 'Image (per model)' : 'Image'}</span>
        </div>
      );
    }
    // text
    const ts = el.textStyle ?? { fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#000000', textAlign: 'left' };
    const text = getPreviewText(el);
    return (
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        fontSize: ptToPx(ts.fontSize),
        fontWeight: ts.fontWeight, fontStyle: ts.fontStyle,
        color: ts.color, textAlign: ts.textAlign as React.CSSProperties['textAlign'],
        backgroundColor: ts.backgroundColor,
        padding: ts.padding ? ts.padding * canvasScale : undefined,
        boxSizing: 'border-box', whiteSpace: 'pre-wrap', lineHeight: 1.4,
      }}>
        {text}
      </div>
    );
  }

  // ─── Properties Panel ──────────────────────────────────────────────────────
  // NOTE: defined as a plain render function (not a React component) to prevent
  // React from remounting it on every render — which would steal textarea focus.
  function renderPropertiesPanel(el: WorksheetElement) {
    const ts = el.textStyle;
    const isAlwaysPerModel = el.type === 'texture-zone' || el.type === 'qr-zone' || el.type === 'arrow';
    const effectiveScope = isAlwaysPerModel ? 'per-model' : (el.scope ?? 'shared');
    const perModelText = el.modelContent?.[currentModelId]?.[currentLang] ?? '';
    const sharedText = (el.content ?? {})[currentLang] ?? '';

    return (
      <div className="space-y-4 text-sm">

        {/* ── Scope toggle (text & image only) ── */}
        {!isAlwaysPerModel && (el.type === 'text' || el.type === 'image') && (
          <div>
            <p className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1.5">Scope</p>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className={`flex-1 py-1 text-xs font-medium transition-colors ${effectiveScope === 'shared' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                onClick={() => updateEl(el.id, { scope: 'shared' })}
              ><span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />Shared</span></button>
              <button
                className={`flex-1 py-1 text-xs font-medium transition-colors ${effectiveScope === 'per-model' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                onClick={() => updateEl(el.id, { scope: 'per-model' })}
              ><span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />Per Model</span></button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {effectiveScope === 'shared'
                ? `Same ${el.type === 'text' ? 'text' : 'image'} printed on every model's worksheet.`
                : <>Each model gets its own {el.type === 'text' ? 'text' : 'image'}. Now editing: <strong>{currentModel?.name ?? '—'}</strong>.</>}
            </p>
          </div>
        )}

        {/* ── Position / size ── */}
        <div>
          <p className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-2">Position & Size (mm)</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['x', 'y', 'w', 'h'] as const).map(field => {
              // Convert % → mm for display; X/W use 297mm width, Y/H use 210mm height
              const isHoriz = field === 'x' || field === 'w';
              const toMm = (pct: number) => Math.round(pct * (isHoriz ? 297 : 210) / 100 * 10) / 10;
              const toPct = (mm: number) => mm * 100 / (isHoriz ? 297 : 210);
              return (
                <div key={field}>
                  <Label className="text-xs">{field.toUpperCase()}</Label>
                  <Input type="number" min={0} max={isHoriz ? 297 : 210} step={0.5} className="h-7 text-xs"
                    value={toMm(el[field])}
                    onChange={e => updateEl(el.id, { [field]: toPct(parseFloat(e.target.value) || 0) })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Z-order ── */}
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => moveEl(el.id, 'up')}>
            <ChevronUp className="h-3 w-3 mr-1" />Fwd
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => moveEl(el.id, 'down')}>
            <ChevronDown className="h-3 w-3 mr-1" />Bck
          </Button>
        </div>

        {/* ── Align ── */}
        <div>
          <p className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1.5">Align to safe zone</p>
          {/* Horizontal row */}
          <div className="flex gap-1 mb-1">
            {[
              { icon: AlignStartVertical,  title: 'Align left',            fn: () => updateEl(el.id, { x: safeX }) },
              { icon: AlignCenterVertical, title: 'Center horizontally',    fn: () => updateEl(el.id, { x: safeX + (100 - 2 * safeX - el.w) / 2 }) },
              { icon: AlignEndVertical,    title: 'Align right',            fn: () => updateEl(el.id, { x: 100 - safeX - el.w }) },
              { icon: Maximize2,           title: 'Fill width (safe zone)',  fn: () => updateEl(el.id, { x: safeX, w: 100 - 2 * safeX }) },
            ].map(({ icon: Icon, title, fn }) => (
              <button key={title} title={title} onClick={fn}
                className="flex-1 py-1 rounded border border-gray-200 hover:border-gray-400 hover:bg-gray-50 flex items-center justify-center">
                <Icon className="h-3 w-3" />
              </button>
            ))}
          </div>
          {/* Vertical row */}
          <div className="flex gap-1">
            {[
              { icon: AlignStartHorizontal,  title: 'Align top',              fn: () => updateEl(el.id, { y: safeY }) },
              { icon: AlignCenterHorizontal, title: 'Center vertically',       fn: () => updateEl(el.id, { y: safeY + (100 - 2 * safeY - el.h) / 2 }) },
              { icon: AlignEndHorizontal,    title: 'Align bottom',            fn: () => updateEl(el.id, { y: 100 - safeY - el.h }) },
              { icon: Maximize2,             title: 'Fill height (safe zone)', fn: () => updateEl(el.id, { y: safeY, h: 100 - 2 * safeY }) },
            ].map(({ icon: Icon, title, fn }, i) => (
              <button key={title} title={title} onClick={fn}
                className="flex-1 py-1 rounded border border-gray-200 hover:border-gray-400 hover:bg-gray-50 flex items-center justify-center">
                {/* last button is duplicate Maximize2 — rotate 90 for fill-height visual */}
                <Icon className={`h-3 w-3 ${i === 3 ? 'rotate-90' : ''}`} />
              </button>
            ))}
          </div>
        </div>

        {/* ── Text content ── */}
        {el.type === 'text' && ts && (
          <>
            <div>
              <p className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">Content</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {layout.languages.map(lang => (
                  <button key={lang} onClick={() => setCurrentLang(lang)}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors ${currentLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
              {effectiveScope === 'shared' ? (
                <textarea className="w-full border rounded p-2 text-xs font-mono resize-y" rows={5}
                  value={sharedText}
                  onChange={e => updateContent(el.id, currentLang, e.target.value)}
                  placeholder={`Shared — ${currentLang.toUpperCase()}`} />
              ) : (
                <textarea className="w-full border rounded p-2 text-xs font-mono resize-y border-orange-300 bg-orange-50" rows={5}
                  value={perModelText}
                  onChange={e => updateModelContent(el.id, currentModelId, currentLang, e.target.value)}
                  placeholder={`${currentModel?.name ?? 'Model'} — ${currentLang.toUpperCase()}`} />
              )}
              <p className="text-xs text-gray-400 mt-1">Use <code>{'{modelName}'}</code> / <code>{'{viewerName}'}</code> as placeholders.</p>
            </div>

            {/* Text style */}
            <div>
              <p className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-2">Style</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Size (pt)</Label>
                  <Input type="number" min={4} max={72} className="h-7 text-xs w-20"
                    value={ts.fontSize} onChange={e => updateTs(el.id, { fontSize: parseInt(e.target.value) || 10 })} />
                </div>
                <div className="flex items-center gap-1">
                  <button title="Bold" onClick={() => updateTs(el.id, { fontWeight: ts.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    className={`p-1 rounded border text-xs ${ts.fontWeight === 'bold' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300'}`}>
                    <Bold className="h-3 w-3" /></button>
                  <button title="Italic" onClick={() => updateTs(el.id, { fontStyle: ts.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    className={`p-1 rounded border text-xs ${ts.fontStyle === 'italic' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300'}`}>
                    <Italic className="h-3 w-3" /></button>
                  <div className="flex rounded border overflow-hidden ml-1">
                    {(['left', 'center', 'right'] as const).map(align => {
                      const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                      return (
                        <button key={align} title={`Align ${align}`} onClick={() => updateTs(el.id, { textAlign: align })}
                          className={`p-1 text-xs ${ts.textAlign === align ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                          <Icon className="h-3 w-3" /></button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Color</Label>
                  <input type="color" className="h-7 w-10 rounded cursor-pointer border"
                    value={ts.color} onChange={e => updateTs(el.id, { color: e.target.value })} />
                  <span className="text-xs text-gray-400">{ts.color}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Bg Color</Label>
                  <input type="color" className="h-7 w-10 rounded cursor-pointer border"
                    value={ts.backgroundColor ?? '#ffffff'}
                    onChange={e => updateTs(el.id, { backgroundColor: e.target.value === '#ffffff' ? undefined : e.target.value })} />
                  {ts.backgroundColor && (
                    <button className="text-xs text-red-400 hover:text-red-600" onClick={() => updateTs(el.id, { backgroundColor: undefined })}>✕</button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Padding</Label>
                  <Input type="number" min={0} max={40} className="h-7 text-xs w-20"
                    value={ts.padding ?? 0} onChange={e => updateTs(el.id, { padding: parseInt(e.target.value) || 0 })} />
                  <span className="text-xs text-gray-400">px</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Image content ── */}
        {el.type === 'image' && (
          <div className="space-y-2">
            <p className="font-medium text-xs text-gray-500 uppercase tracking-wide">Image</p>

            {/* URL input */}
            <div>
              <Label className="text-xs mb-1 block">
                {effectiveScope === 'shared' ? 'URL — same for all models' : `URL — ${currentModel?.name ?? 'this model'}`}
              </Label>
              {effectiveScope === 'shared' ? (
                <Input className="h-7 text-xs" placeholder="https://…"
                  value={el.imageUrl ?? ''}
                  onChange={e => updateEl(el.id, { imageUrl: e.target.value })} />
              ) : (
                <Input className="h-7 text-xs border-orange-300 bg-orange-50"
                  placeholder="Paste URL or upload below"
                  value={el.modelImageUrl?.[currentModelId] ?? ''}
                  onChange={e => updateModelImageUrl(el.id, currentModelId, e.target.value)} />
              )}
            </div>

            {/* Upload button */}
            <label className="block cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const raw = e.target.files?.[0]; if (!raw) return;
                  setImgUploadState('uploading');
                  try {
                    const file = await compressImage(raw);
                    const fd = new FormData();
                    fd.append('viewerId', viewer.id);
                    fd.append('file', file);
                    const res = await fetch('/api/worksheet-image', { method: 'POST', body: fd });
                    const json = await res.json();
                    if (res.ok && json.url) {
                      if (effectiveScope === 'shared') {
                        updateEl(el.id, { imageUrl: json.url });
                      } else {
                        updateModelImageUrl(el.id, currentModelId, json.url);
                      }
                      setImgUploadState('idle');
                    } else {
                      setImgUploadState('error');
                    }
                  } catch { setImgUploadState('error'); }
                  e.target.value = '';
                }}
              />
              <span className={`inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded border text-xs transition-colors select-none ${
                imgUploadState === 'uploading' ? 'bg-gray-50 text-gray-400 border-gray-200' :
                imgUploadState === 'error' ? 'border-red-300 text-red-500 hover:bg-red-50' :
                'border-gray-300 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'
              }`}>
                {imgUploadState === 'uploading'
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Uploading…</>
                  : imgUploadState === 'error'
                  ? <><Upload className="h-3 w-3" />Upload failed — retry</>
                  : <><Upload className="h-3 w-3" />Upload image</>}
              </span>
            </label>

            {/* Object fit */}
            <div className="flex gap-1">
              {(['contain', 'cover', 'fill'] as const).map(fit => (
                <button key={fit} onClick={() => updateEl(el.id, { objectFit: fit })}
                  className={`flex-1 py-0.5 text-xs rounded border ${el.objectFit === fit ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300'}`}>
                  {fit}</button>
              ))}
            </div>
          </div>
        )}

        {el.type === 'texture-zone' && (
          <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium flex items-center gap-1"><MapPin className="h-3 w-3" />Texture Zone — always per model</p>
            <p>UV map + 4 ArUco corner markers are placed automatically for each model. Markers are locked.</p>
          </div>
        )}

        {el.type === 'qr-zone' && (
          <div className="rounded bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
            <p className="font-medium flex items-center gap-1"><Camera className="h-3 w-3" />QR Zone — always per model</p>
            <p>Each model's unique QR code is rendered here when printing.</p>
          </div>
        )}

        {el.type === 'arrow' && (
          <div className="space-y-2">
            <p className="font-medium text-xs text-gray-500 uppercase tracking-wide">Arrow Color</p>
            <div className="flex items-center gap-2">
              <input type="color" className="h-7 w-10 rounded cursor-pointer border"
                value={el.arrowColor ?? '#333333'}
                onChange={e => updateEl(el.id, { arrowColor: e.target.value })} />
              <span className="text-xs text-gray-400">{el.arrowColor ?? '#333333'}</span>
            </div>
          </div>
        )}

        <Button variant="destructive" size="sm" className="w-full h-7 text-xs" onClick={() => deleteEl(el.id)}>
          <Trash2 className="h-3 w-3 mr-1" />Delete Element
        </Button>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-100" style={{ userSelect: 'none' }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b shadow-sm flex-shrink-0">
        <Link href={`/admin/viewers/${viewer.id}`} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-medium text-gray-700">
          <span className="text-gray-400">{viewer.name}</span>
          <span className="mx-2 text-gray-300">›</span>
          Worksheet Builder
        </span>

        {/* ── Tab switcher ── */}
        <div className="flex items-center border rounded overflow-hidden flex-shrink-0">
          <button
            onClick={() => setActiveTab('canvas')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'canvas' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Worksheet
          </button>
          <button
            onClick={() => setActiveTab('instruction')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${activeTab === 'instruction' ? 'bg-purple-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <BookOpen className="h-3 w-3" />Instruction Page
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Model selector */}
          {models.length > 1 && (
            <div className="flex items-center gap-1 border rounded px-2 py-1 bg-gray-50">
              <span className="text-xs text-gray-500 mr-1">Model:</span>
              {models.map(m => (
                <button key={m.id} onClick={() => setCurrentModelId(m.id)}
                  className={`px-1.5 py-0.5 rounded text-xs truncate max-w-[80px] transition-colors ${currentModelId === m.id ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  title={m.name}>
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {/* Language selector */}
          <div className="flex items-center gap-1 border rounded px-2 py-1 bg-gray-50">
            <span className="text-xs text-gray-500 mr-1">Lang:</span>
            {layout.languages.map(lang => (
              <button
                key={lang}
                onClick={() => setCurrentLang(lang)}
                className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors ${currentLang === lang ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
            {showNewLang && (
              <div className="flex items-center gap-0.5 border-l pl-1 ml-0.5">
                {PREDEFINED_LANGS.filter(l => !layout.languages.includes(l.code)).map(l => (
                  <button
                    key={l.code}
                    title={l.label}
                    onClick={() => addLang(l.code)}
                    className="px-1.5 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors"
                  >
                    {l.code.toUpperCase()}
                  </button>
                ))}
                <button onClick={() => setShowNewLang(false)} className="ml-0.5 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
              </div>
            )}
            {!showNewLang && PREDEFINED_LANGS.some(l => !layout.languages.includes(l.code)) && (
              <button onClick={() => setShowNewLang(true)} className="text-blue-500 hover:text-blue-700" title="Add language">
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Preview */}
          {currentModel && (
            <a href={`/api/texture-template/${currentModel.id}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Eye className="h-3.5 w-3.5" />Preview
              </Button>
            </a>
          )}

          {/* Safe zone toggle */}
          <div className="flex items-center gap-0.5 border rounded bg-gray-50 h-8 px-1">
            <button
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showSafeZone ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setShowSafeZone(v => !v)}
              title="Toggle printer safe-zone guide"
            >
              <RectangleHorizontal className="h-3.5 w-3.5" />
              <span>Safe zone</span>
            </button>
            {showSafeZone && (
              <div className="flex items-center gap-0.5 border-l pl-1 ml-0.5">
                <input
                  type="number" min={3} max={25} step={1}
                  className="w-10 h-6 text-xs text-center border rounded bg-white"
                  value={safeMarginMm}
                  onChange={e => setLayout(prev => ({ ...prev, safeMarginMm: Math.max(0, parseInt(e.target.value) || 8) }))}
                  title="Safe margin in mm"
                />
                <span className="text-xs text-gray-400">mm</span>
              </div>
            )}
          </div>

          {/* Reset */}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetLayout}>
            Reset
          </Button>

          {/* Save */}
          <Button
            size="sm"
            className={`h-8 text-xs gap-1.5 transition-colors ${saveState === 'saved' ? 'bg-green-600 hover:bg-green-600' : saveState === 'error' ? 'bg-red-600 hover:bg-red-600' : ''}`}
            onClick={save}
            disabled={saveState === 'saving'}
          >
            {saveState === 'saved' ? <><Check className="h-3.5 w-3.5" />Saved</> :
             saveState === 'error' ? 'Error' :
             saveState === 'saving' ? 'Saving…' :
             <><Save className="h-3.5 w-3.5" />Save</>}
          </Button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'instruction' ? (() => {
          const ip = layout.klaseInstructionPage;
          const ss = ip?.sectionStyles ?? {};
          const showHeader  = ip?.showHeader  ?? true;
          const showKlase   = ip?.showKlase   ?? true;
          const showPin     = ip?.showPin     ?? true;
          const showObserver= ip?.showObserver ?? true;
          const sectionOrder: ('klase'|'pin'|'observer')[] =
            (ip?.sectionOrder as ('klase'|'pin'|'observer')[] | undefined) ?? ['klase', 'pin', 'observer'];

          // Compute effective body rows (handles backward compat with bodyItemOrder)
          const effectiveBodyRows: BodyRow[] = computeBodyRows(ip);

          // Helper: section box style for preview
          function sStyle(sec: 'klase'|'pin'|'observer'|'footer') {
            const s = ss[sec];
            return {
              background: s?.bg ?? (sec === 'pin' ? '#fff8e6' : sec === 'footer' ? '#f0f4ff' : '#f8f8f8'),
              border: `1px solid ${s?.borderColor ?? (sec === 'pin' ? '#f5c842' : sec === 'footer' ? '#c0cff8' : '#e0e0e0')}`,
            };
          }
          function tsToReact(s?: InstrTextStyle): CSSProperties {
            if (!s) return {};
            return {
              ...(s.fontSize      != null ? { fontSize: ptToPx(s.fontSize) } : {}),
              ...(s.fontWeight    ? { fontWeight: s.fontWeight } : {}),
              ...(s.fontStyle     ? { fontStyle: s.fontStyle } : {}),
              ...(s.color         ? { color: s.color } : {}),
              ...(s.textAlign     ? { textAlign: s.textAlign } : {}),
              ...(s.backgroundColor ? { backgroundColor: s.backgroundColor } : {}),
            };
          }

          // Right-side properties panel per selected section
          const FIXED_SECTIONS = ['header','klase','pin','observer','footer','teacher-survey'];

          // ── Body section preview renderer ─────────────────────────────────────
          function renderBodySection(sId: string): React.ReactNode {
            if (sId === 'klase') return showKlase ? (
              <div key="klase" onClick={e => { e.stopPropagation(); setSelectedInstrSection('klase'); }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ptToPx(8), padding: ptToPx(14), borderRadius: 6, cursor: 'pointer',
                  outline: selectedInstrSection === 'klase' ? '2px solid #a855f7' : 'none', outlineOffset: 2,
                  ...sStyle('klase') }}>
                <div style={{ fontSize: ptToPx(10), fontWeight: 600, color: '#444', ...tsToReact(ss.klase?.headingStyle) }}>{getInstrLabel('klaseSection', instrLang)}</div>
                <div style={{ width: ptToPx(80), height: ptToPx(80), background: '#e5e7eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QrCode style={{ width: '55%', height: '55%', color: '#6b7280' }} />
                </div>
                <div style={{ fontSize: ptToPx(5.5), color: '#888', textAlign: 'center' }}>https://…/klase</div>
                <div style={{ fontSize: ptToPx(5.5), color: '#999', textAlign: 'center', fontStyle: 'italic', ...tsToReact(ss.klase?.bodyStyle) }}>{getInstrLabel('klaseHint', instrLang)}</div>
              </div>
            ) : null;
            if (sId === 'pin') return showPin ? (
              <div key="pin" onClick={e => { e.stopPropagation(); setSelectedInstrSection('pin'); }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ptToPx(8), padding: ptToPx(14), borderRadius: 6, cursor: 'pointer',
                  outline: selectedInstrSection === 'pin' ? '2px solid #a855f7' : 'none', outlineOffset: 2,
                  ...sStyle('pin') }}>
                <div style={{ fontSize: ptToPx(10), fontWeight: 600, color: '#444', ...tsToReact(ss.pin?.headingStyle) }}>{getInstrLabel('pinSection', instrLang)}</div>
                <div style={{ fontSize: ptToPx(18), fontFamily: 'monospace', fontWeight: 700, letterSpacing: '4px', color: '#b8860b', background: 'white', border: `2px solid ${ss.pin?.borderColor ?? '#f5c842'}`, borderRadius: 8, padding: `${ptToPx(6)}px ${ptToPx(14)}px` }}>_ _ _ _</div>
                <div style={{ fontSize: ptToPx(5.5), color: '#888', textAlign: 'center', fontStyle: 'italic', ...tsToReact(ss.pin?.bodyStyle) }}>{getInstrLabel('pinHint', instrLang)}</div>
                {(ip?.showKlaseUrlInPin ?? true) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: ptToPx(6), marginTop: ptToPx(4), paddingTop: ptToPx(4), borderTop: '1px dashed rgba(0,0,0,0.15)', width: '100%', justifyContent: 'center' }}>
                    <div style={{ width: ptToPx((ip?.klaseUrlQrSizeMm ?? 16) * 2.835), height: ptToPx((ip?.klaseUrlQrSizeMm ?? 16) * 2.835), background: '#e5e7eb', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <QrCode style={{ width: '65%', height: '65%', color: '#6b7280' }} />
                    </div>
                    <div style={{ fontSize: ptToPx(ip?.klaseUrlTextSizePt ?? 6), color: '#999', wordBreak: 'break-all', lineHeight: 1.4, maxWidth: ptToPx(120) }}>klase viewer URL</div>
                  </div>
                )}
              </div>
            ) : null;
            if (sId === 'observer') return showObserver ? (
              <div key="observer" onClick={e => { e.stopPropagation(); setSelectedInstrSection('observer'); }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ptToPx(8), padding: ptToPx(14), borderRadius: 6, cursor: 'pointer',
                  outline: selectedInstrSection === 'observer' ? '2px solid #a855f7' : 'none', outlineOffset: 2,
                  ...(ip?.observerSurveyUrl ? sStyle('observer') : { background: '#fafafa', border: '2px dashed #ddd' }) }}>
                {ip?.observerSurveyUrl ? (
                  <>
                    <div style={{ fontSize: ptToPx(10), fontWeight: 600, color: '#444', ...tsToReact(ss.observer?.headingStyle) }}>{getInstrLabel('observerSection', instrLang)}</div>
                    <div style={{ width: ptToPx(80), height: ptToPx(80), background: '#e5e7eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <QrCode style={{ width: '55%', height: '55%', color: '#6b7280' }} />
                    </div>
                    <div style={{ fontSize: ptToPx(5.5), color: '#888', textAlign: 'center', wordBreak: 'break-all' }}>{ip.observerSurveyUrl.slice(0, 45)}</div>
                    <div style={{ fontSize: ptToPx(5.5), color: '#999', textAlign: 'center', fontStyle: 'italic', ...tsToReact(ss.observer?.bodyStyle) }}>{getInstrLabel('observerHint', instrLang)}</div>
                  </>
                ) : (
                  <div style={{ fontSize: ptToPx(7), color: '#bbb', textAlign: 'center' }}>Observer survey<br/>(set URL in properties)</div>
                )}
              </div>
            ) : null;
            if (sId === 'teacher-survey') {
              const ts = ip?.teacherSurvey;
              const tsEnabled = ts?.enabled;
              return (
                <div key="teacher-survey" onClick={e => { e.stopPropagation(); setSelectedInstrSection('teacher-survey'); }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ptToPx(8), padding: ptToPx(14), borderRadius: 6, cursor: 'pointer',
                    outline: selectedInstrSection === 'teacher-survey' ? '2px solid #a855f7' : 'none', outlineOffset: 2,
                    background: '#f0fdf4', border: `1px solid ${tsEnabled ? '#86efac' : '#d1fae5'}` }}>
                  <div style={{ fontSize: ptToPx(10), fontWeight: 600, color: '#15803d' }}>
                    {(ts?.title?.[instrLang] ?? ts?.title?.[layout.defaultLang] ?? 'Teacher Survey')}
                  </div>
                  <div style={{ width: ptToPx(60), height: ptToPx(60), background: '#dcfce7', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <QrCode style={{ width: '55%', height: '55%', color: '#16a34a' }} />
                  </div>
                  {!tsEnabled && <div style={{ fontSize: ptToPx(6), color: '#86efac', textAlign: 'center', fontStyle: 'italic' }}>disabled — enable in properties</div>}
                  {tsEnabled && ts?.questions?.length > 0 && <div style={{ fontSize: ptToPx(5.5), color: '#4ade80', textAlign: 'center' }}>{ts.questions.length} question{ts.questions.length !== 1 ? 's' : ''}</div>}
                </div>
              );
            }
            return null;
          }

          function renderExtraBlockPreview(block: InstrExtraBlock) {
            const isSelected = selectedInstrSection === block.id;
            const wPct = block.widthPercent;
            const widthOverride: CSSProperties = wPct
              ? { flex: `0 0 calc(${wPct}% - ${ptToPx(8)}px)`, maxWidth: `calc(${wPct}% - ${ptToPx(8)}px)` }
              : {};
            const base: CSSProperties = {
              cursor: 'pointer', borderRadius: 4,
              outline: isSelected ? '2px solid #a855f7' : 'none', outlineOffset: 2,
              ...widthOverride,
            };
            const click = (e: React.MouseEvent) => { e.stopPropagation(); setSelectedInstrSection(isSelected ? null : block.id); };
            if (block.type === 'text') {
              const text = block.content?.[instrLang] ?? block.content?.[layout.defaultLang] ?? '';
              const ts = block.textStyle;
              return (
                <div key={block.id} onClick={click}
                  style={{ ...base, flex: wPct ? `0 0 calc(${wPct}% - ${ptToPx(8)}px)` : '1 1 90px', minWidth: wPct ? undefined : 90, padding: `${ptToPx(5)}px ${ptToPx(7)}px`,
                    background: ts?.backgroundColor ?? '#fafafa', border: '1px solid #e5e5e5',
                    fontSize: ptToPx(ts?.fontSize ?? 6.5), color: ts?.color ?? '#333',
                    fontWeight: ts?.fontWeight ?? 'normal', fontStyle: ts?.fontStyle ?? 'normal',
                    textAlign: ts?.textAlign ?? 'left', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {text || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Text area {instrLang.toUpperCase()}…</span>}
                </div>
              );
            }
            if (block.type === 'image') {
              return (
                <div key={block.id} onClick={click}
                  style={{ ...base, minWidth: 80, padding: ptToPx(4), background: '#fafafa', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {block.imageUrl
                    ? <img src={block.imageUrl} alt="" style={{ maxHeight: ptToPx(50), maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
                    : <span style={{ fontSize: ptToPx(6.5), color: '#bbb', fontStyle: 'italic' }}><ImageIcon style={{ width: ptToPx(14), height: ptToPx(14), display: 'inline', marginRight: 2 }} />Image</span>}
                </div>
              );
            }
            if (block.type === 'url') {
              const label = block.urlLabel?.[instrLang] ?? block.urlLabel?.[layout.defaultLang] ?? '';
              return (
                <div key={block.id} onClick={click}
                  style={{ ...base, flex: wPct ? `0 0 calc(${wPct}% - ${ptToPx(8)}px)` : '1 1 100px', minWidth: wPct ? undefined : 100, display: 'flex', alignItems: 'center', gap: ptToPx(5), padding: `${ptToPx(5)}px ${ptToPx(7)}px`, background: '#f5f8ff', border: '1px solid #d0dcf8' }}>
                  {block.showQr !== false && (
                    <div style={{ width: ptToPx(28), height: ptToPx(28), background: '#e5e7eb', borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <QrCode style={{ width: '70%', height: '70%', color: '#6b7280' }} />
                    </div>
                  )}
                  <div>
                    {label && <div style={{ fontSize: ptToPx(6), fontWeight: 600, color: '#444' }}>{label}</div>}
                    <div style={{ fontSize: ptToPx(5.5), color: '#555', wordBreak: 'break-all' }}>{block.url || <span style={{ color: '#bbb', fontStyle: 'italic' }}>URL not set</span>}</div>
                  </div>
                </div>
              );
            }
            return null;
          }

          function renderInstrProps() {
            if (!selectedInstrSection) return (
              <div className="p-5 text-xs text-gray-400 text-center pt-12 space-y-2">
                <BookOpen className="h-8 w-8 mx-auto text-gray-200" />
                <p>Click a section on the page preview to edit its content.</p>
              </div>
            );

            // ── Reusable text style controls ───────────────────────────────────
            function TextStyleRow({ label, style, onChange }: {
              label: string;
              style: InstrTextStyle | undefined;
              onChange: (patch: Partial<InstrTextStyle>) => void;
            }) {
              const s = style ?? {};
              return (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">{label}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Bold */}
                    <button title="Bold"
                      onClick={() => onChange({ fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' })}
                      className={`w-6 h-6 rounded border text-xs font-bold transition-colors ${s.fontWeight === 'bold' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>B</button>
                    {/* Italic */}
                    <button title="Italic"
                      onClick={() => onChange({ fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' })}
                      className={`w-6 h-6 rounded border text-xs italic transition-colors ${s.fontStyle === 'italic' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>I</button>
                    {/* Alignment */}
                    <button title="Align left"
                      onClick={() => onChange({ textAlign: 'left' })}
                      className={`w-6 h-6 rounded border transition-colors ${s.textAlign === 'left' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                      <AlignLeft className="h-3 w-3 mx-auto" /></button>
                    <button title="Align center"
                      onClick={() => onChange({ textAlign: 'center' })}
                      className={`w-6 h-6 rounded border transition-colors ${(s.textAlign === 'center' || !s.textAlign) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                      <AlignCenter className="h-3 w-3 mx-auto" /></button>
                    <button title="Align right"
                      onClick={() => onChange({ textAlign: 'right' })}
                      className={`w-6 h-6 rounded border transition-colors ${s.textAlign === 'right' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                      <AlignRight className="h-3 w-3 mx-auto" /></button>
                    {/* Font size */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">pt</span>
                      <input type="number" min={4} max={72} step={0.5}
                        className="w-12 h-6 border rounded text-xs text-center"
                        placeholder="—"
                        value={s.fontSize ?? ''}
                        onChange={e => onChange({ fontSize: e.target.value ? parseFloat(e.target.value) : undefined })} />
                    </div>
                    {/* Text color */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">txt</span>
                      <input type="color"
                        value={s.color ?? '#333333'}
                        onChange={e => onChange({ color: e.target.value })}
                        className="w-6 h-6 rounded border cursor-pointer p-0" />
                    </div>
                    {/* Background */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">bg</span>
                      <input type="color"
                        value={s.backgroundColor ?? '#ffffff'}
                        onChange={e => onChange({ backgroundColor: e.target.value })}
                        className="w-6 h-6 rounded border cursor-pointer p-0" />
                    </div>
                    {/* Reset */}
                    <button className="text-xs text-gray-400 hover:text-red-500 underline"
                      onClick={() => onChange({ fontWeight: undefined, fontStyle: undefined, textAlign: undefined, fontSize: undefined, color: undefined, backgroundColor: undefined })}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            }

            // ── Extra block properties ──────────────────────────────────────
            if (!FIXED_SECTIONS.includes(selectedInstrSection)) {
              const block = (ip?.extraBlocks ?? []).find(b => b.id === selectedInstrSection);
              if (!block) return null;
              return (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <p className="font-semibold text-sm">
                      {block.type === 'text' ? 'Text area' : block.type === 'image' ? 'Image area' : 'Display URL'}
                    </p>
                    <button onClick={() => removeInstrBlock(block.id)}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />Remove
                    </button>
                  </div>

                  {/* TEXT block */}
                  {block.type === 'text' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {layout.languages.map(lang => (
                          <button key={lang} onClick={() => setInstrLang(lang)}
                            className={`px-2 py-0.5 rounded text-xs border transition-colors ${instrLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                            {lang.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Text ({instrLang.toUpperCase()})</Label>
                        <textarea className="w-full border rounded p-2 text-xs resize-y" rows={6}
                          value={block.content?.[instrLang] ?? ''}
                          onChange={e => updateInstrBlock(block.id, { content: { ...(block.content ?? {}), [instrLang]: e.target.value } })}
                          placeholder="Enter text…" />
                        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                          Variables:&nbsp;
                          {['{pin}','{klase_url}','{display_url}'].map(v => (
                            <code key={v} className="bg-gray-100 px-0.5 rounded font-mono text-gray-600 mr-0.5 text-xs">{v}</code>
                          ))}
                        </p>
                      </div>
                      {/* Text styling */}
                      <div className="border-t pt-2">
                        <TextStyleRow label="Text style"
                          style={block.textStyle}
                          onChange={p => updateInstrBlock(block.id, { textStyle: { ...(block.textStyle ?? {}), ...p } })} />
                      </div>
                    </div>
                  )}

                  {/* IMAGE block */}
                  {block.type === 'image' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1 block">Image URL or data URL</Label>
                        <Input className="h-7 text-xs" placeholder="https://… or paste data URL"
                          value={block.imageUrl ?? ''}
                          onChange={e => updateInstrBlock(block.id, { imageUrl: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Or upload file</Label>
                        <input type="file" accept="image/*" className="text-xs w-full"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => updateInstrBlock(block.id, { imageUrl: ev.target?.result as string });
                            reader.readAsDataURL(file);
                          }} />
                        <p className="text-xs text-gray-400 mt-1">Image is stored as a data URL inside the layout.</p>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Max width (mm)</Label>
                        <Input type="number" className="h-7 text-xs" min={10} max={200}
                          placeholder="80"
                          value={block.imageMaxWidthMm ?? ''}
                          onChange={e => updateInstrBlock(block.id, { imageMaxWidthMm: parseInt(e.target.value) || undefined })} />
                      </div>
                      {block.imageUrl && (
                        <img src={block.imageUrl} alt="" className="max-w-full max-h-32 object-contain border rounded" />
                      )}
                    </div>
                  )}

                  {/* URL block */}
                  {block.type === 'url' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1 block">URL to display</Label>
                        <Input className="h-7 text-xs" placeholder="https://…"
                          value={block.url ?? ''}
                          onChange={e => updateInstrBlock(block.id, { url: e.target.value })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Show QR code</span>
                        <button role="switch" aria-checked={block.showQr !== false}
                          onClick={() => updateInstrBlock(block.id, { showQr: !(block.showQr !== false) })}
                          className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${block.showQr !== false ? 'bg-purple-600' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${block.showQr !== false ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-gray-700">Label text (optional)</p>
                        <div className="flex flex-wrap gap-1">
                          {layout.languages.map(lang => (
                            <button key={lang} onClick={() => setInstrLang(lang)}
                              className={`px-2 py-0.5 rounded text-xs border transition-colors ${instrLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                              {lang.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <Input className="h-7 text-xs"
                          placeholder="Label above URL…"
                          value={block.urlLabel?.[instrLang] ?? ''}
                          onChange={e => updateInstrBlock(block.id, { urlLabel: { ...(block.urlLabel ?? {}), [instrLang]: e.target.value } })} />
                      </div>
                    </div>
                  )}

                  {/* Position */}
                  <div>
                    <Label className="text-xs mb-1 block">Position on page</Label>
                    <div className="flex gap-1 flex-wrap">
                      {(['after-footer', 'after-header', 'after-body', 'body'] as const).map(pos => (
                        <button key={pos}
                          onClick={() => updateInstrBlock(block.id, { position: pos })}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors capitalize ${
                            (block.position ?? 'after-footer') === pos ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 hover:border-gray-400'
                          }`}>
                          {pos === 'after-footer' ? 'After footer' : pos === 'after-header' ? 'After header' : pos === 'after-body' ? 'After body' : 'In body row'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Width */}
                  <div>
                    <Label className="text-xs mb-1 block">Width</Label>
                    <div className="flex gap-1 flex-wrap">
                      {([['', 'Auto'],['100','100%'],['75','75%'],['50','50%'],['33','33%'],['25','25%']] as const).map(([val, lbl]) => (
                        <button key={val}
                          onClick={() => updateInstrBlock(block.id, { widthPercent: val ? parseInt(val) : undefined })}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            String(block.widthPercent ?? '') === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'
                          }`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            // ── Teacher survey builder ──────────────────────────────────────
            if (selectedInstrSection === 'teacher-survey') {
              const ts: TeacherSurvey = ip?.teacherSurvey ?? { enabled: false, questions: [] };
              const updateTs = (patch: Partial<TeacherSurvey>) =>
                setLayout(prev => ({ ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, ...patch } } }));
              const qTypeColor = (t: string) => t === 'open' ? 'bg-blue-100 text-blue-700' : t === 'checkbox' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700';

              return (
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div className="flex items-center justify-between border-b pb-2">
                    <p className="font-semibold text-sm flex items-center gap-1.5"><ClipboardList className="h-4 w-4 text-green-600" />Teacher Survey</p>
                    <button role="switch" aria-checked={ts.enabled}
                      onClick={() => updateTs({ enabled: !ts.enabled })}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${ts.enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${ts.enabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {/* Compact question list */}
                  {ts.questions.length > 0 && (
                    <div className="space-y-1">
                      {ts.questions.map((q, qi) => (
                        <div key={q.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-gray-200 bg-gray-50 text-xs">
                          <span className="text-gray-400 flex-shrink-0">{qi + 1}.</span>
                          <span className="flex-1 truncate text-gray-700">{q.text[instrLang] ?? q.text[layout.defaultLang] ?? <span className="italic text-gray-400">No text</span>}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${qTypeColor(q.type)}`}>{q.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ts.questions.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No questions yet</p>
                  )}
                  {/* Open full builder */}
                  <button onClick={() => setShowSurveyModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
                    <ClipboardList className="h-4 w-4" />
                    Open Survey Builder
                  </button>
                </div>
              );
            }

            // ── Fixed section properties ────────────────────────────────────
            const labelFields: Record<string, [keyof KlaseInstructionPageLabels, string][]> = {
              header:   [['title', 'Page title']],
              klase:    [['klaseSection', 'Section heading'], ['klaseHint', 'Hint text']],
              pin:      [['pinSection', 'Section heading'], ['pinHint', 'Hint text']],
              observer: [['observerSection', 'Section heading'], ['observerHint', 'Hint text']],
              footer:   [],
            };

            const sec = selectedInstrSection;
            return (
              <div className="p-4 space-y-4">
                <p className="font-semibold text-sm capitalize border-b pb-2">
                  {sec === 'header' ? 'Header' : sec === 'klase' ? 'Registration section' : sec === 'pin' ? 'PIN section' : sec === 'observer' ? 'Observer section' : 'Footer / custom text'}
                </p>

                {/* Visibility toggle (not for header or footer) */}
                {(sec === 'klase' || sec === 'pin' || sec === 'observer') && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Visible</span>
                    <button role="switch"
                      aria-checked={sec === 'klase' ? showKlase : sec === 'pin' ? showPin : showObserver}
                      onClick={() => {
                        const key = sec === 'klase' ? 'showKlase' : sec === 'pin' ? 'showPin' : 'showObserver';
                        const cur = sec === 'klase' ? showKlase : sec === 'pin' ? showPin : showObserver;
                        updateInstrPage({ [key]: !cur });
                      }}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
                        (sec === 'klase' ? showKlase : sec === 'pin' ? showPin : showObserver) ? 'bg-purple-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                        (sec === 'klase' ? showKlase : sec === 'pin' ? showPin : showObserver) ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}

                {/* PIN: show klase URL toggle */}
                {sec === 'pin' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Show klase URL + QR in PIN</span>
                    <button role="switch" aria-checked={ip?.showKlaseUrlInPin ?? true}
                      onClick={() => updateInstrPage({ showKlaseUrlInPin: !(ip?.showKlaseUrlInPin ?? true) })}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
                        (ip?.showKlaseUrlInPin ?? true) ? 'bg-purple-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                        (ip?.showKlaseUrlInPin ?? true) ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}

                {/* PIN: viewer QR size + URL text size */}
                {sec === 'pin' && (ip?.showKlaseUrlInPin ?? true) && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 flex-1">Viewer QR size (mm)</span>
                    <input type="number" min={8} max={60} step={1}
                      className="w-16 h-7 border rounded px-2 text-xs"
                      value={ip?.klaseUrlQrSizeMm ?? 16}
                      onChange={e => updateInstrPage({ klaseUrlQrSizeMm: Math.max(8, Math.min(60, parseInt(e.target.value) || 16)) })} />
                  </div>
                )}
                {sec === 'pin' && (ip?.showKlaseUrlInPin ?? true) && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 flex-1">URL text size (pt)</span>
                    <input type="number" min={4} max={20} step={0.5}
                      className="w-16 h-7 border rounded px-2 text-xs"
                      value={ip?.klaseUrlTextSizePt ?? 6}
                      onChange={e => updateInstrPage({ klaseUrlTextSizePt: Math.max(4, Math.min(20, parseFloat(e.target.value) || 6)) })} />
                  </div>
                )}

                {/* Observer URL */}
                {sec === 'observer' && (
                  <div>
                    <Label className="text-xs mb-1 block">Survey URL</Label>
                    <Input className="h-7 text-xs" placeholder="https://…"
                      value={ip?.observerSurveyUrl ?? ''}
                      onChange={e => updateInstrPage({ observerSurveyUrl: e.target.value })} />
                  </div>
                )}

                {/* Per-language label fields */}
                {(labelFields[sec]?.length ?? 0) > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {layout.languages.map(lang => (
                        <button key={lang} onClick={() => setInstrLang(lang)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${instrLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {(labelFields[sec] ?? []).map(([key, label]) => (
                      <div key={key}>
                        <Label className="text-xs mb-0.5 block text-gray-600">{label}</Label>
                        <Input className="h-7 text-xs"
                          placeholder={(INSTR_DEFAULTS[instrLang] ?? INSTR_DEFAULTS.en)[key] ?? ''}
                          value={(ip?.translations?.[instrLang] as Record<string,string>|undefined)?.[key] ?? ''}
                          onChange={e => updateInstrTranslation(instrLang, key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer custom text */}
                {sec === 'footer' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {layout.languages.map(lang => (
                        <button key={lang} onClick={() => setInstrLang(lang)}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${instrLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Custom text ({instrLang.toUpperCase()})</Label>
                      <textarea className="w-full border rounded p-2 text-xs resize-y" rows={5}
                        value={ip?.customText?.[instrLang] ?? ''}
                        onChange={e => updateInstrPage({ customText: { ...(ip?.customText ?? {}), [instrLang]: e.target.value } })}
                        placeholder="Additional instructions…" />
                    </div>
                  </div>
                )}

                {/* Colors + Text styling */}
                {sec !== 'header' && (
                  <div className="space-y-2 pt-1 border-t">
                    <p className="text-xs font-medium text-gray-700">Colors</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20">Background</label>
                      <input type="color"
                        value={ss[sec as 'klase'|'pin'|'observer'|'footer']?.bg ?? (sec === 'pin' ? '#fff8e6' : sec === 'footer' ? '#f0f4ff' : '#f8f8f8')}
                        onChange={e => updateInstrSectionStyle(sec as 'klase'|'pin'|'observer'|'footer', { bg: e.target.value })}
                        className="w-7 h-7 rounded border cursor-pointer" />
                      <button className="text-xs text-gray-400 hover:text-gray-600 underline"
                        onClick={() => updateInstrSectionStyle(sec as 'klase'|'pin'|'observer'|'footer', { bg: undefined })}>reset</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20">Border</label>
                      <input type="color"
                        value={ss[sec as 'klase'|'pin'|'observer'|'footer']?.borderColor ?? (sec === 'pin' ? '#f5c842' : sec === 'footer' ? '#c0cff8' : '#e0e0e0')}
                        onChange={e => updateInstrSectionStyle(sec as 'klase'|'pin'|'observer'|'footer', { borderColor: e.target.value })}
                        className="w-7 h-7 rounded border cursor-pointer" />
                      <button className="text-xs text-gray-400 hover:text-gray-600 underline"
                        onClick={() => updateInstrSectionStyle(sec as 'klase'|'pin'|'observer'|'footer', { borderColor: undefined })}>reset</button>
                    </div>
                    {sec !== 'footer' && (
                      <TextStyleRow label="Heading text style"
                        style={ss[sec as 'klase'|'pin'|'observer']?.headingStyle}
                        onChange={p => updateInstrSectionTextStyle(sec as 'klase'|'pin'|'observer', 'headingStyle', p)} />
                    )}
                    <TextStyleRow label={sec === 'footer' ? 'Text style' : 'Body / hint text style'}
                      style={ss[sec as 'klase'|'pin'|'observer'|'footer']?.bodyStyle}
                      onChange={p => updateInstrSectionTextStyle(sec as 'klase'|'pin'|'observer'|'footer', 'bodyStyle', p)} />
                  </div>
                )}
                {sec === 'header' && (
                  <div className="space-y-2 pt-1 border-t">
                    <p className="text-xs font-medium text-gray-700">Colors &amp; Style</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20">Border</label>
                      <input type="color"
                        value={ss.header?.borderColor ?? '#333333'}
                        onChange={e => updateInstrSectionStyle('header', { borderColor: e.target.value })}
                        className="w-7 h-7 rounded border cursor-pointer" />
                      <button className="text-xs text-gray-400 hover:text-gray-600 underline"
                        onClick={() => updateInstrSectionStyle('header', { borderColor: undefined })}>reset</button>
                    </div>
                    <TextStyleRow label="Title text style"
                      style={ss.header?.headingStyle}
                      onChange={p => updateInstrSectionTextStyle('header', 'headingStyle', p)} />
                  </div>
                )}

                {/* Reset labels */}
                {(labelFields[sec]?.length ?? 0) > 0 && (
                  <button className="text-xs text-red-400 hover:text-red-600 underline"
                    onClick={() => setLayout(prev => ({
                      ...prev,
                      klaseInstructionPage: {
                        enabled: false, ...prev.klaseInstructionPage,
                        translations: { ...(prev.klaseInstructionPage?.translations ?? {}), [instrLang]: {} },
                      },
                    }))}>
                    Reset {instrLang.toUpperCase()} labels to defaults
                  </button>
                )}
              </div>
            );
          }

          return (
            <>
              {/* ── Left: sections list ── */}
              <div className="w-52 flex-shrink-0 bg-white border-r overflow-y-auto flex flex-col">
                {/* Enable toggle */}
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm">Instruction Page</p>
                    <button role="switch" aria-checked={ip?.enabled}
                      onClick={() => updateInstrPage({ enabled: !ip?.enabled })}
                      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${ip?.enabled ? 'bg-purple-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${ip?.enabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">Printed as the first page when a class registers at /klase.</p>
                  {/* Orientation toggle */}
                  {ip?.enabled && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">Orientation:</span>
                      {(['landscape','portrait'] as const).map(o => {
                        const active = (ip?.orientation ?? 'landscape') === o;
                        return (
                          <button key={o} onClick={() => updateInstrPage({ orientation: o })} title={o}
                            className={`p-1 rounded border transition-colors ${active ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                            {o === 'landscape'
                              ? <svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="1" y="1" width="18" height="12" rx="1.5"/></svg>
                              : <svg width="14" height="20" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="1" y="1" width="12" height="18" rx="1.5"/></svg>
                            }
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Language picker */}
                <div className="p-3 border-b">
                  <p className="text-xs text-gray-500 mb-1.5">Preview language</p>
                  <div className="flex flex-wrap gap-1">
                    {layout.languages.map(lang => (
                      <button key={lang} onClick={() => setInstrLang(lang)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${instrLang === lang ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sections list */}
                <div className="p-3 flex-1">
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold">Sections</p>
                  <div className="space-y-1">
                    {/* Header fixed top */}
                    <button
                      onClick={() => setSelectedInstrSection(selectedInstrSection === 'header' ? null : 'header')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors
                        ${selectedInstrSection === 'header' ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                      <span>Header</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0" />
                    </button>

                    {/* ── After-header extra blocks ── */}
                    {(ip?.extraBlocks ?? []).filter(b => b.position === 'after-header').map(block => {
                      const blockIdx = (ip?.extraBlocks ?? []).indexOf(block);
                      const totalBlocks = (ip?.extraBlocks ?? []).length;
                      return (
                        <div key={block.id} className="flex items-center gap-0.5 pl-3">
                          <div className="w-0.5 self-stretch bg-purple-200 rounded mr-1 flex-shrink-0" />
                          <button
                            onClick={() => setSelectedInstrSection(selectedInstrSection === block.id ? null : block.id)}
                            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs border transition-colors
                              ${selectedInstrSection === block.id ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-dashed border-gray-300 hover:border-gray-400 text-gray-600'}`}>
                            <span className="flex items-center gap-1 truncate min-w-0">
                              {block.type === 'text' ? <Type className="h-3 w-3 text-blue-500 flex-shrink-0" /> : block.type === 'image' ? <ImageIcon className="h-3 w-3 text-green-500 flex-shrink-0" /> : <Globe className="h-3 w-3 text-indigo-500 flex-shrink-0" />}
                              <span className="truncate">{block.type === 'text' ? (block.content?.[instrLang] ?? block.content?.[layout.defaultLang] ?? 'Text') : block.type === 'image' ? 'Image' : (block.url || 'URL')}</span>
                            </span>
                            <span className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <ChevronUp className={`h-3 w-3 cursor-pointer ${blockIdx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`} onClick={() => moveInstrBlock(block.id, 'up')} />
                              <ChevronDown className={`h-3 w-3 cursor-pointer ${blockIdx === totalBlocks - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`} onClick={() => moveInstrBlock(block.id, 'down')} />
                              <X className="h-3 w-3 text-gray-400 hover:text-red-500 cursor-pointer" onClick={() => removeInstrBlock(block.id)} />
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    {/* Add after-header element */}
                    <div className="pl-3 flex gap-1">
                      {(['text','image','url'] as const).map(t => (
                        <button key={t} title={`Add ${t} after header`}
                          onClick={() => { const id = `iblock-${Date.now()}`; const b = t === 'url' ? { id, type: t as 'url', url: '', showQr: true, urlLabel: {}, position: 'after-header' as const } : t === 'image' ? { id, type: t as 'image', imageUrl: '', position: 'after-header' as const } : { id, type: t as 'text', content: {}, position: 'after-header' as const }; setLayout(prev => ({ ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, extraBlocks: [...(prev.klaseInstructionPage?.extraBlocks ?? []), b] } })); setSelectedInstrSection(id); }}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-purple-300 hover:bg-purple-50 text-purple-500 text-xs transition-colors">
                          <span className="text-purple-400">+</span>
                          {t === 'text' ? <Type className="h-2.5 w-2.5" /> : t === 'image' ? <ImageIcon className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                        </button>
                      ))}
                    </div>

                    {/* ── Body rows zone ── */}
                    {effectiveBodyRows.map((row, rowIdx) => {
                      const FIXED_BODY_LABELS: Record<string, string> = {
                        klase: 'Registration', pin: 'PIN Code', observer: 'Observer Survey', 'teacher-survey': 'Teacher Survey',
                      };
                      const FIXED_BODY_VIS_KEY: Record<string, string> = { klase: 'showKlase', pin: 'showPin', observer: 'showObserver' };
                      const FIXED_BODY_VIS: Record<string, boolean> = { klase: showKlase, pin: showPin, observer: showObserver, 'teacher-survey': ip?.teacherSurvey?.enabled ?? false };
                      const placedSections = effectiveBodyRows.flatMap(r => r.items).filter(id => ['klase','pin','observer','teacher-survey'].includes(id));
                      const availableSections = ['klase','pin','observer','teacher-survey'].filter(s => !placedSections.includes(s));
                      return (
                        <div key={row.id} className="border border-blue-200 rounded-lg overflow-hidden">
                          {/* Row header */}
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-50">
                            <Rows3 className="h-3 w-3 text-blue-400 flex-shrink-0" />
                            <span className="text-xs text-blue-600 font-medium flex-1">Row {rowIdx + 1}</span>
                            <ChevronUp className={`h-3.5 w-3.5 cursor-pointer ${rowIdx === 0 ? 'text-gray-200' : 'text-blue-400 hover:text-blue-700'}`}
                              onClick={() => moveBodyRow(row.id, 'up')} />
                            <ChevronDown className={`h-3.5 w-3.5 cursor-pointer ${rowIdx === effectiveBodyRows.length - 1 ? 'text-gray-200' : 'text-blue-400 hover:text-blue-700'}`}
                              onClick={() => moveBodyRow(row.id, 'down')} />
                            <X className={`h-3.5 w-3.5 cursor-pointer ${effectiveBodyRows.length === 1 ? 'text-gray-200' : 'text-blue-400 hover:text-red-500'}`}
                              onClick={() => effectiveBodyRows.length > 1 && removeBodyRow(row.id)} />
                          </div>
                          {/* Items in this row */}
                          <div className="p-1.5 space-y-1">
                            {row.items.map((itemId, itemIdx) => {
                              const isFixed = ['klase','pin','observer','teacher-survey'].includes(itemId);
                              if (isFixed) {
                                const visible = FIXED_BODY_VIS[itemId] ?? true;
                                const toggleKey = FIXED_BODY_VIS_KEY[itemId];
                                return (
                                  <div key={itemId} className="flex items-center gap-0.5">
                                    <ChevronLeft className={`h-3.5 w-3.5 cursor-pointer flex-shrink-0 ${itemIdx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                                      onClick={() => moveWithinRow(row.id, itemId, 'left')} />
                                    <button onClick={() => setSelectedInstrSection(selectedInstrSection === itemId ? null : itemId)}
                                      className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors
                                        ${selectedInstrSection === itemId ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                                      <span>{FIXED_BODY_LABELS[itemId]}</span>
                                      {toggleKey && (
                                        <span onClick={e => { e.stopPropagation(); updateInstrPage({ [toggleKey]: !visible }); }}
                                          className={`w-2 h-2 rounded-full flex-shrink-0 ${visible ? 'bg-green-400' : 'bg-gray-300'}`}
                                          title={visible ? 'Hide' : 'Show'} />
                                      )}
                                      {itemId === 'teacher-survey' && (
                                        <span onClick={e => { e.stopPropagation(); setLayout(prev => { const ts = prev.klaseInstructionPage?.teacherSurvey ?? { enabled: false, questions: [] }; return { ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...ts, enabled: !ts.enabled } } }; }); }}
                                          className={`w-2 h-2 rounded-full flex-shrink-0 ${ip?.teacherSurvey?.enabled ? 'bg-green-400' : 'bg-gray-300'}`}
                                          title={ip?.teacherSurvey?.enabled ? 'Enabled' : 'Disabled'} />
                                      )}
                                    </button>
                                    <ChevronRight className={`h-3.5 w-3.5 cursor-pointer flex-shrink-0 ${itemIdx === row.items.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                                      onClick={() => moveWithinRow(row.id, itemId, 'right')} />
                                    <X className="h-3.5 w-3.5 text-gray-300 hover:text-red-400 cursor-pointer flex-shrink-0"
                                      onClick={() => removeFromRow(row.id, itemId)} />
                                  </div>
                                );
                              }
                              // Extra block item
                              const block = (ip?.extraBlocks ?? []).find(b => b.id === itemId && b.position === 'body');
                              if (!block) return null;
                              return (
                                <div key={itemId} className="flex items-center gap-0.5">
                                  <ChevronLeft className={`h-3.5 w-3.5 cursor-pointer flex-shrink-0 ${itemIdx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                                    onClick={() => moveWithinRow(row.id, itemId, 'left')} />
                                  <button onClick={() => setSelectedInstrSection(selectedInstrSection === block.id ? null : block.id)}
                                    className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors
                                      ${selectedInstrSection === block.id ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-dashed border-gray-300 hover:border-gray-400 text-gray-600'}`}>
                                    <span className="flex items-center gap-1 truncate min-w-0">
                                      {block.type === 'text' ? <Type className="h-3 w-3 text-blue-500 flex-shrink-0" /> : block.type === 'image' ? <ImageIcon className="h-3 w-3 text-green-500 flex-shrink-0" /> : <Globe className="h-3 w-3 text-indigo-500 flex-shrink-0" />}
                                      <span className="truncate">{block.type === 'text' ? (block.content?.[instrLang] ?? block.content?.[layout.defaultLang] ?? 'Text') : block.type === 'image' ? 'Image' : (block.url || 'URL')}</span>
                                    </span>
                                  </button>
                                  <ChevronRight className={`h-3.5 w-3.5 cursor-pointer flex-shrink-0 ${itemIdx === row.items.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                                    onClick={() => moveWithinRow(row.id, itemId, 'right')} />
                                  <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500 cursor-pointer flex-shrink-0"
                                    onClick={() => removeFromRow(row.id, itemId)} />
                                </div>
                              );
                            })}
                            {/* Add to this row */}
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-blue-100 mt-1">
                              {availableSections.map(s => (
                                <button key={s} onClick={() => addSectionToRow(row.id, s)}
                                  className="text-xs px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 truncate max-w-[100px]"
                                  title={`Add ${FIXED_BODY_LABELS[s]}`}>+{FIXED_BODY_LABELS[s].split(' ')[0]}</button>
                              ))}
                              {(['text','image','url'] as const).map(t => (
                                <button key={t} onClick={() => addBlockToRow(row.id, t)}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-gray-300 hover:bg-gray-50 text-gray-500 text-xs">
                                  <Plus className="h-2.5 w-2.5" />
                                  {t === 'text' ? <Type className="h-2.5 w-2.5" /> : t === 'image' ? <ImageIcon className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Add row button */}
                    <button onClick={() => addBodyRow()}
                      className="w-full flex items-center justify-center gap-1 py-1.5 text-xs rounded border border-dashed border-blue-300 hover:bg-blue-50 text-blue-500 transition-colors">
                      <Plus className="h-3 w-3" /><Rows3 className="h-3 w-3" />Add body row
                    </button>

                    {/* Footer fixed bottom */}
                    <button
                      onClick={() => setSelectedInstrSection(selectedInstrSection === 'footer' ? null : 'footer')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors
                        ${selectedInstrSection === 'footer' ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                      <span>Footer / custom text</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0" />
                    </button>

                    {/* ── After-footer extra blocks ── */}
                    {(ip?.extraBlocks ?? []).filter(b => !b.position || b.position === 'after-footer').map(block => {
                      const blockIdx = (ip?.extraBlocks ?? []).indexOf(block);
                      const totalBlocks = (ip?.extraBlocks ?? []).length;
                      return (
                        <div key={block.id} className="flex items-center gap-0.5 pl-3">
                          <div className="w-0.5 self-stretch bg-gray-200 rounded mr-1 flex-shrink-0" />
                          <button
                            onClick={() => setSelectedInstrSection(selectedInstrSection === block.id ? null : block.id)}
                            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs border transition-colors
                              ${selectedInstrSection === block.id ? 'bg-purple-50 border-purple-400 text-purple-800' : 'border-dashed border-gray-300 hover:border-gray-400 text-gray-600'}`}>
                            <span className="flex items-center gap-1 truncate min-w-0">
                              {block.type === 'text' ? <Type className="h-3 w-3 text-blue-500 flex-shrink-0" /> : block.type === 'image' ? <ImageIcon className="h-3 w-3 text-green-500 flex-shrink-0" /> : <Globe className="h-3 w-3 text-indigo-500 flex-shrink-0" />}
                              <span className="truncate">{block.type === 'text' ? (block.content?.[instrLang] ?? block.content?.[layout.defaultLang] ?? 'Text') : block.type === 'image' ? 'Image' : (block.url || 'URL')}</span>
                            </span>
                            <span className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <ChevronUp className={`h-3 w-3 cursor-pointer ${blockIdx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`} onClick={() => moveInstrBlock(block.id, 'up')} />
                              <ChevronDown className={`h-3 w-3 cursor-pointer ${blockIdx === totalBlocks - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`} onClick={() => moveInstrBlock(block.id, 'down')} />
                              <X className="h-3 w-3 text-gray-400 hover:text-red-500 cursor-pointer" onClick={() => removeInstrBlock(block.id)} />
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add element buttons */}
                  <div className="mt-4 pt-3 border-t space-y-1.5">
                    <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide font-semibold">Add element</p>
                    <button onClick={() => addInstrBlock('text')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 text-sm text-blue-700 transition-colors">
                      <Type className="h-3.5 w-3.5" /><span>Text area</span>
                    </button>
                    <button onClick={() => addInstrBlock('image')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 hover:bg-green-50 text-sm text-green-700 transition-colors">
                      <ImageIcon className="h-3.5 w-3.5" /><span>Image area</span>
                    </button>
                    <button onClick={() => addInstrBlock('url')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 hover:bg-indigo-50 text-sm text-indigo-700 transition-colors">
                      <Globe className="h-3.5 w-3.5" /><span>Display URL</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Center: A4 preview ── */}
              {(() => {
                const isPortrait = (ip?.orientation ?? 'landscape') === 'portrait';
                return (
              <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-gray-100">
                <div onClick={() => setSelectedInstrSection(null)}
                  style={{
                    position: 'relative', width: '100%',
                    maxWidth: isPortrait ? '794px' : '1122px',
                    aspectRatio: isPortrait ? '210 / 297' : '297 / 210', background: 'white',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.18)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    padding: `${ptToPx(34)}px`, boxSizing: 'border-box', gap: ptToPx(16),
                  }}>

                  {/* Header */}
                  {showHeader && (
                    <div onClick={e => { e.stopPropagation(); setSelectedInstrSection('header'); }}
                      style={{
                        borderBottom: `2px solid ${ss.header?.borderColor ?? '#333'}`,
                        paddingBottom: ptToPx(10), cursor: 'pointer',
                        outline: selectedInstrSection === 'header' ? '2px solid #a855f7' : 'none',
                        outlineOffset: 3, borderRadius: 2,
                      }}>
                      <div style={{ fontSize: ptToPx(14), fontWeight: 700, color: '#333' }}>
                        {getInstrLabel('title', instrLang)}
                      </div>
                    </div>
                  )}

                  {/* After-header extra blocks */}
                  {(ip?.extraBlocks ?? []).some(b => b.position === 'after-header') && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: ptToPx(8) }}>
                      {(ip?.extraBlocks ?? []).filter(b => b.position === 'after-header').map(block => renderExtraBlockPreview(block))}
                    </div>
                  )}

                  {/* Body — rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: ptToPx(14) }}>
                    {effectiveBodyRows.map(row => (
                      <div key={row.id} style={{ display: 'flex', gap: ptToPx(22), alignItems: 'flex-start' }}>
                        {row.items.map(itemId => {
                          if (['klase','pin','observer','teacher-survey'].includes(itemId)) return renderBodySection(itemId);
                          const block = (ip?.extraBlocks ?? []).find(b => b.id === itemId && b.position === 'body');
                          return block ? renderExtraBlockPreview(block) : null;
                        })}
                      </div>
                    ))}
                  </div>

                  {/* After-body extra blocks */}
                  {(ip?.extraBlocks ?? []).some(b => b.position === 'after-body') && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: ptToPx(8) }}>
                      {(ip?.extraBlocks ?? []).filter(b => b.position === 'after-body').map(block => renderExtraBlockPreview(block))}
                    </div>
                  )}

                  {/* Footer */}
                  {(ip?.customText?.[instrLang] || selectedInstrSection === 'footer') && (
                    <div onClick={e => { e.stopPropagation(); setSelectedInstrSection('footer'); }}
                      style={{ fontSize: ptToPx(7.5), color: '#555', borderRadius: 6, padding: `${ptToPx(8)}px ${ptToPx(12)}px`, lineHeight: 1.5, whiteSpace: 'pre-wrap', cursor: 'pointer',
                        outline: selectedInstrSection === 'footer' ? '2px solid #a855f7' : 'none', outlineOffset: 2,
                        ...sStyle('footer') }}>
                      {ip?.customText?.[instrLang] || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Click to add footer text…</span>}
                    </div>
                  )}
                  {!ip?.customText?.[instrLang] && selectedInstrSection !== 'footer' && (
                    <div onClick={e => { e.stopPropagation(); setSelectedInstrSection('footer'); }}
                      style={{ border: '2px dashed #ddd', borderRadius: 6, padding: `${ptToPx(6)}px ${ptToPx(12)}px`, cursor: 'pointer', textAlign: 'center' }}>
                      <span style={{ fontSize: ptToPx(7), color: '#ccc' }}>+ Footer / additional text</span>
                    </div>
                  )}

                  {/* ── After-footer extra blocks ── */}
                  {(ip?.extraBlocks ?? []).some(b => !b.position || b.position === 'after-footer') && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: ptToPx(8), marginTop: ptToPx(4) }}>
                      {(ip?.extraBlocks ?? []).filter(b => !b.position || b.position === 'after-footer').map(block => renderExtraBlockPreview(block))}
                    </div>
                  )}
                  {!ip?.enabled && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: ptToPx(13), color: '#aaa', fontWeight: 600 }}>Disabled — enable in the left panel</div>
                    </div>
                  )}
                </div>
              </div>
              );
              })()}

              {/* ── Right: properties panel ── */}
              <div className="w-64 flex-shrink-0 bg-white border-l overflow-y-auto">
                {renderInstrProps()}
              </div>
            </>
          );
        })() : (
          <>
        {/* ── Left tools sidebar ── */}
        <div className="flex flex-col gap-2 p-3 bg-white border-r w-44 flex-shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Element</p>
          <button
            onClick={() => addElement('text')}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-sm transition-colors"
          >
            <Type className="h-4 w-4 text-blue-500" /><span>Text</span>
          </button>
          <button
            onClick={() => addElement('image')}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 text-sm transition-colors"
          >
            <ImageIcon className="h-4 w-4 text-green-500" /><span>Image</span>
          </button>
          <button
            onClick={() => addElement('qr-zone')}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 text-sm transition-colors"
          >
            <QrCode className="h-4 w-4 text-purple-500" /><span>QR Zone</span>
          </button>
          <button
            onClick={() => addElement('arrow')}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-sm transition-colors"
          >
            <ArrowRight className="h-4 w-4 text-gray-500" /><span>Arrow</span>
          </button>
          <button
            onClick={() => addElement('texture-zone')}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-sm transition-colors"
          >
            <Layers className="h-4 w-4 text-orange-500" /><span>Texture Zone</span>
          </button>

          <div className="border-t pt-2 mt-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elements</p>
              <div className="flex gap-1.5 text-xs text-gray-400">
                <span title="Shared across all models" className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" />shared</span>
                <span title="Per model" className="inline-flex items-center gap-0.5"><Package className="h-3 w-3 text-orange-400" />per</span>
              </div>
            </div>
            <div className="space-y-0.5">
              {[...layout.elements].reverse().map(el => {
                const isPerModel = el.type === 'texture-zone' || el.type === 'qr-zone' || el.scope === 'per-model';
                const badgeIcon = isPerModel
                  ? <Package className="h-3 w-3 text-orange-400 flex-shrink-0" />
                  : <Globe className="h-3 w-3 text-blue-400 flex-shrink-0" />;
                const label = el.type === 'text'
                  ? (el.content?.[layout.defaultLang] ?? Object.values(el.content ?? {})[0] ?? 'Text').slice(0, 16)
                  : el.type === 'qr-zone' ? 'QR Zone'
                  : el.type === 'texture-zone' ? 'Texture Zone'
                  : el.type === 'arrow' ? 'Arrow'
                  : 'Image';
                return (
                  <button
                    key={el.id}
                    onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs truncate transition-colors flex items-center gap-1 ${el.id === selectedId ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    {badgeIcon}
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Canvas area ── */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-gray-100">
          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '1122px',
              aspectRatio: '297 / 210',
              background: 'white',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              cursor: 'default',
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerDown={e => { if (e.target === canvasRef.current) setSelectedId(null); }}
          >
            {/* ── Safe zone overlay ── */}
            {showSafeZone && (
              <>
                {/* Shaded outer strips (danger zone) */}
                {/* top */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${safeY}%`, background: 'rgba(251,146,60,0.10)', pointerEvents: 'none', zIndex: 200 }} />
                {/* bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${safeY}%`, background: 'rgba(251,146,60,0.10)', pointerEvents: 'none', zIndex: 200 }} />
                {/* left */}
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${safeX}%`, background: 'rgba(251,146,60,0.10)', pointerEvents: 'none', zIndex: 200 }} />
                {/* right */}
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${safeX}%`, background: 'rgba(251,146,60,0.10)', pointerEvents: 'none', zIndex: 200 }} />
                {/* Dashed inner border = safe area */}
                <div style={{
                  position: 'absolute',
                  top: `${safeY}%`, left: `${safeX}%`,
                  right: `${safeX}%`, bottom: `${safeY}%`,
                  border: '1.5px dashed rgba(251,146,60,0.7)',
                  pointerEvents: 'none', zIndex: 201,
                  borderRadius: 1,
                }} />
                {/* Label */}
                <div style={{
                  position: 'absolute',
                  top: `${safeY}%`,
                  left: `${safeX}%`,
                  transform: 'translateY(-100%)',
                  fontSize: ptToPx(6),
                  color: 'rgba(234,88,12,0.8)',
                  pointerEvents: 'none',
                  zIndex: 202,
                  whiteSpace: 'nowrap',
                  padding: '0 2px',
                }}>
                  {safeMarginMm}mm safe margin
                </div>
              </>
            )}

            {layout.elements.map(el => {
              const isSelected = el.id === selectedId;
              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${el.x}%`, top: `${el.y}%`,
                    width: `${el.w}%`, height: `${el.h}%`,
                    boxSizing: 'border-box',
                    cursor: 'grab',
                    outline: isSelected ? '2px solid #3b82f6' : '1px solid transparent',
                    outlineOffset: '1px',
                    zIndex: isSelected ? 50 : 'auto',
                  }}
                  onPointerDown={e => startMoveDrag(e, el.id)}
                >
                  {renderElementContent(el)}

                  {/* Resize handles (only when selected) */}
                  {isSelected && Object.entries(HANDLE_POS).map(([handle, pos]) => (
                    <div
                      key={handle}
                      style={{
                        position: 'absolute',
                        top: pos.top, left: pos.left,
                        width: 10, height: 10,
                        background: 'white',
                        border: '2px solid #3b82f6',
                        borderRadius: 2,
                        cursor: pos.cursor,
                        zIndex: 100,
                      }}
                      onPointerDown={e => startResizeDrag(e, el.id, handle)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right properties panel ── */}
        <div className="w-64 flex-shrink-0 bg-white border-l overflow-y-auto">
          {selectedEl ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm capitalize">{selectedEl.type.replace('-', ' ')}</p>
                <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              {renderPropertiesPanel(selectedEl)}
            </div>
          ) : (
            <div className="p-4 text-xs text-gray-400 text-center pt-10 space-y-2">
              <Layers className="h-8 w-8 mx-auto text-gray-200" />
              <p>Click an element on the canvas to edit its properties.</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── Teacher Survey Builder Modal ── */}
      {showSurveyModal && (() => {
        const ip = layout.klaseInstructionPage;
        const ts: TeacherSurvey = ip?.teacherSurvey ?? { enabled: false, questions: [] };
        const updateTs = (patch: Partial<TeacherSurvey>) =>
          setLayout(prev => ({ ...prev, klaseInstructionPage: { enabled: false, ...prev.klaseInstructionPage, teacherSurvey: { ...(prev.klaseInstructionPage?.teacherSurvey ?? { enabled: false, questions: [] }), ...patch } } }));
        const qTypeColor = (t: string) => t === 'open' ? 'bg-blue-100 text-blue-700' : t === 'checkbox' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700';
        const qTypeIcon = (t: string) => t === 'open' ? <Type className="h-3.5 w-3.5 text-blue-500" /> : t === 'checkbox' ? <Check className="h-3.5 w-3.5 text-purple-500" /> : <FileText className="h-3.5 w-3.5 text-orange-500" />;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[90vh] mx-4 overflow-hidden">
              {/* Modal header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b bg-green-50">
                <ClipboardList className="h-5 w-5 text-green-600" />
                <h2 className="font-semibold text-base text-gray-800 flex-1">Teacher Survey Builder</h2>
                {/* Enable toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Enabled</span>
                  <button role="switch" aria-checked={ts.enabled}
                    onClick={() => updateTs({ enabled: !ts.enabled })}
                    className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${ts.enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${ts.enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <button onClick={() => setShowSurveyModal(false)} className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left column — title + question list */}
                <div className="w-56 flex-shrink-0 border-r flex flex-col bg-gray-50">
                  {/* Title */}
                  <div className="p-3 border-b">
                    <Label className="text-xs mb-1 block text-gray-500 uppercase tracking-wide">Survey title</Label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {layout.languages.map(l => (
                        <button key={l} onClick={() => setInstrLang(l)}
                          className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${instrLang === l ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <Input className="h-7 text-xs" placeholder="Teacher Survey"
                      value={ts.title?.[instrLang] ?? ''}
                      onChange={e => updateTs({ title: { ...(ts.title ?? {}), [instrLang]: e.target.value } })} />
                  </div>

                  {/* Question list */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Questions ({ts.questions.length})</p>
                    {ts.questions.map((q, qi) => (
                      <div key={q.id}
                        onClick={() => setExpandedTsQ(expandedTsQ === q.id ? null : q.id)}
                        className={`group flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${expandedTsQ === q.id ? 'border-green-400 bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{qi + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 line-clamp-2 leading-snug">
                            {q.text[instrLang] ?? q.text[layout.defaultLang] ?? <span className="text-gray-400 italic">No text</span>}
                          </p>
                          <span className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${qTypeColor(q.type)}`}>
                            {qTypeIcon(q.type)}{q.type}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronUp className={`h-3 w-3 cursor-pointer ${qi === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                            onClick={e => { e.stopPropagation(); moveTeacherSurveyQuestion(q.id, 'up'); }} />
                          <ChevronDown className={`h-3 w-3 cursor-pointer ${qi === ts.questions.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
                            onClick={e => { e.stopPropagation(); moveTeacherSurveyQuestion(q.id, 'down'); }} />
                          <X className="h-3 w-3 text-gray-400 hover:text-red-500 cursor-pointer"
                            onClick={e => { e.stopPropagation(); removeTeacherSurveyQuestion(q.id); if (expandedTsQ === q.id) setExpandedTsQ(null); }} />
                        </div>
                      </div>
                    ))}
                    {ts.questions.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ClipboardList className="h-8 w-8 text-gray-200 mb-2" />
                        <p className="text-xs text-gray-400">No questions yet</p>
                      </div>
                    )}
                  </div>

                  {/* Add question buttons */}
                  <div className="p-3 border-t space-y-1.5">
                    <p className="text-xs text-gray-400 mb-1">Add question</p>
                    <button onClick={() => addTeacherSurveyQuestion('open')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors">
                      <Type className="h-3.5 w-3.5" />Short answer
                    </button>
                    <button onClick={() => addTeacherSurveyQuestion('textarea')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium transition-colors">
                      <FileText className="h-3.5 w-3.5" />Free text area
                    </button>
                    <button onClick={() => addTeacherSurveyQuestion('checkbox')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium transition-colors">
                      <Check className="h-3.5 w-3.5" />Checkbox options
                    </button>
                  </div>
                </div>

                {/* Right column — question editor */}
                <div className="flex-1 overflow-y-auto p-6">
                  {expandedTsQ === null || !ts.questions.find(q => q.id === expandedTsQ) ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                      <ClipboardList className="h-12 w-12 text-gray-200 mb-3" />
                      <p className="text-sm font-medium text-gray-500 mb-1">Select a question to edit</p>
                      <p className="text-xs">or add a new question from the left panel</p>
                    </div>
                  ) : (() => {
                    const q = ts.questions.find(q => q.id === expandedTsQ)!;
                    return (
                      <div className="space-y-5 max-w-lg">
                        {/* Question header */}
                        <div className="flex items-center gap-2 pb-3 border-b">
                          {qTypeIcon(q.type)}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${qTypeColor(q.type)}`}>{q.type}</span>
                          <div className="flex-1" />
                          {/* Type switcher */}
                          <div className="flex gap-1 border rounded-lg overflow-hidden">
                            {(['open','textarea','checkbox'] as const).map(t => (
                              <button key={t} onClick={() => updateTeacherSurveyQuestion(q.id, { type: t, ...(t === 'checkbox' && !q.options ? { options: [{}] } : {}) })}
                                className={`px-2 py-1 text-xs transition-colors ${q.type === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                {t === 'open' ? 'Short' : t === 'textarea' ? 'Long' : 'Checkbox'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Language tabs */}
                        <div className="flex flex-wrap gap-1">
                          {layout.languages.map(l => (
                            <button key={l} onClick={() => setInstrLang(l)}
                              className={`px-2.5 py-1 rounded-lg text-xs border font-medium transition-colors ${instrLang === l ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}>
                              {l.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        {/* Question text */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Question text <span className="text-gray-400 font-normal">({instrLang.toUpperCase()})</span></Label>
                          <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent" rows={3}
                            placeholder="Enter your question…"
                            value={q.text[instrLang] ?? ''}
                            onChange={e => updateTeacherSurveyQuestion(q.id, { text: { ...q.text, [instrLang]: e.target.value } })} />
                        </div>

                        {/* Preview label for answer area */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Answer preview</Label>
                          {q.type === 'open' && (
                            <div className="border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50">
                              <div className="h-8 rounded bg-white border border-gray-200" />
                              <p className="text-xs text-gray-400 mt-1">Short text input</p>
                            </div>
                          )}
                          {q.type === 'textarea' && (
                            <div className="border border-dashed border-orange-200 rounded-xl p-3 bg-orange-50">
                              <div className="h-20 rounded bg-white border border-gray-200" />
                              <p className="text-xs text-orange-500 mt-1">Long free-text area</p>
                            </div>
                          )}
                          {q.type === 'checkbox' && (
                            <div className="border border-dashed border-purple-200 rounded-xl p-3 bg-purple-50 space-y-2">
                              {(q.options ?? []).length === 0 && <p className="text-xs text-purple-400">Add options below</p>}
                              {(q.options ?? []).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <div className="w-4 h-4 rounded border border-purple-300 bg-white flex-shrink-0" />
                                  <span className="text-sm text-gray-700">{opt[instrLang] ?? opt[layout.defaultLang] ?? <span className="text-gray-400 italic">Option {oi + 1}</span>}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Checkbox options editor */}
                        {q.type === 'checkbox' && (
                          <div>
                            <Label className="text-sm font-medium mb-2 block">Options <span className="text-gray-400 font-normal">({instrLang.toUpperCase()})</span></Label>
                            <div className="space-y-2">
                              {(q.options ?? []).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <span className="text-sm text-gray-400 w-6 flex-shrink-0">{oi + 1}.</span>
                                  <Input className="h-8 text-sm flex-1"
                                    placeholder={`Option ${oi + 1}`}
                                    value={opt[instrLang] ?? ''}
                                    onChange={e => {
                                      const opts = [...(q.options ?? [])];
                                      opts[oi] = { ...opts[oi], [instrLang]: e.target.value };
                                      updateTeacherSurveyQuestion(q.id, { options: opts });
                                    }} />
                                  <button className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                                    onClick={() => updateTeacherSurveyQuestion(q.id, { options: (q.options ?? []).filter((_, i) => i !== oi) })}>
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                              <button className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 transition-colors"
                                onClick={() => updateTeacherSurveyQuestion(q.id, { options: [...(q.options ?? []), {}] })}>
                                <Plus className="h-4 w-4" />Add option
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Required toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Required</p>
                            <p className="text-xs text-gray-400">Respondent must answer this question</p>
                          </div>
                          <button role="switch" aria-checked={!!q.required}
                            onClick={() => updateTeacherSurveyQuestion(q.id, { required: !q.required })}
                            className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${q.required ? 'bg-purple-600' : 'bg-gray-300'}`}>
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${q.required ? 'left-5' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
