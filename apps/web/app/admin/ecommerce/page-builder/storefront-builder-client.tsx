'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import styles from './storefront-builder.module.css';
import {numericProductBlock,verifiedPublishedProducts,type PublishedProductForBuilder} from './numeric-product-block';

type EditorApi = {
  getProjectData: () => unknown;
  loadProjectData: (data: Record<string, unknown>) => void;
  getHtml: () => string;
  getCss: () => string;
  runCommand: (id: string) => unknown;
  stopCommand: (id: string) => unknown;
  setDevice: (name: string) => void;
  setComponents: (content: string) => void;
  addComponents: (content: string) => unknown;
  setStyle: (content: string) => void;
  on: (event: string, callback: () => void) => void;
  destroy: () => void;
};

type GrapesRuntime = {
  init: (config: Record<string, unknown>) => EditorApi;
};

declare global {
  interface Window {
    grapesjs?: GrapesRuntime;
  }
}

const INITIAL_HTML = [
  '<main class="alsvid-storefront">',
  '  <header class="storefront-nav"><a class="brand" href="#">ALSVID</a><nav>整车　车型　配件　品牌故事</nav><span class="bag">购物袋</span></header>',
  '  <section class="hero" data-alsvid-block="hero"><div class="hero-copy"><p class="eyebrow">ALSVID ELECTRIC MOBILITY</p><h1>为每一段旅程<br>重新定义自由。</h1><p class="hero-subtitle">轻量设计，城市灵感，开启属于你的骑行方式。</p><a class="button" href="#">探索整车　→</a></div><div class="hero-visual"><div class="bike-placeholder">在此替换为整车主视觉图片</div><span class="visual-note">首页主视觉 · 可自由替换</span></div><span class="hero-index">01 / 04</span></section>',
  '  <section class="intro"><p class="eyebrow">CHOOSE YOUR RIDE</p><h2>找到适合你的骑行方式</h2><p>拖动左侧模块，自由组合你的商城首页。当前是独立预览，不会修改正式官网。</p></section>',
  '  <section class="model-grid" data-alsvid-block="product-grid"><article class="model-card"><div class="product-image">车型图片区域</div><p class="eyebrow">FOLDING SERIES</p><h3>ALSVID F8</h3><p>示例车型 · 尚未关联真实商品</p><a class="text-link" href="#">查看车型　→</a></article><article class="model-card"><div class="product-image product-image-alt">车型图片区域</div><p class="eyebrow">CITY SERIES</p><h3>城市通勤系列</h3><p>示例分类 · 尚未关联商品数据</p><a class="text-link" href="#">探索系列　→</a></article><article class="model-card"><div class="product-image product-image-third">车型图片区域</div><p class="eyebrow">TOURING SERIES</p><h3>探索旅行系列</h3><p>示例分类 · 尚未关联商品数据</p><a class="text-link" href="#">探索系列　→</a></article></section>',
  '  <section class="editorial" data-alsvid-block="image-text"><div><p class="eyebrow">MADE FOR YOUR EVERYDAY</p><h2>把日常骑行<br>变成喜欢的生活。</h2><p>在这里编辑品牌故事、产品优势和骑行场景。图片、文字、布局与按钮都可以调整。</p><a class="text-link" href="#">了解 ALSVID　→</a></div><div class="editorial-image">品牌故事图片区域</div></section>',
  '  <section class="service-row" data-alsvid-block="service"><div><strong>01</strong><h3>欧洲配送</h3><p>配置真实的配送范围与时效。</p></div><div><strong>02</strong><h3>质保支持</h3><p>展示经过确认的质保政策。</p></div><div><strong>03</strong><h3>售后与配件</h3><p>让客户快速找到服务支持。</p></div></section>',
  '  <footer class="storefront-footer"><a class="brand" href="#">ALSVID</a><p>骑行自由，从这里开始。</p><span>帮助中心　配送政策　退货政策　联系我们</span></footer>',
  '</main>',
].join('\n');

const INITIAL_CSS = [
  '*{box-sizing:border-box}.alsvid-storefront{font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:#18201d;background:#fff;max-width:1440px;margin:0 auto}.storefront-nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 6%;border-bottom:1px solid #e7eae7;gap:24px}.brand{font-size:20px;font-weight:800;letter-spacing:.28em;color:#18201d;text-decoration:none}.storefront-nav nav{font-size:13px;letter-spacing:.08em;color:#49524d}.bag{font-size:12px;letter-spacing:.05em}.hero{position:relative;min-height:500px;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:70px 8%;gap:42px;background:linear-gradient(120deg,#f1f3ee,#dfe7df)}.hero-copy{max-width:480px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:.22em;color:#6d7b70;margin:0 0 18px}.hero h1{font-size:clamp(30px,4vw,54px);line-height:1.18;letter-spacing:-.04em;margin:0 0 22px}.hero-subtitle{font-size:14px;line-height:1.8;color:#58645c;margin:0 0 30px}.button{display:inline-block;padding:13px 22px;background:#18201d;color:#fff;text-decoration:none;font-size:12px;letter-spacing:.08em;border-radius:2px}.hero-visual{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:270px;gap:12px}.bike-placeholder{width:100%;min-height:260px;display:grid;place-items:center;border:1px dashed #9aa79b;background:rgba(255,255,255,.48);color:#657168;text-align:center;padding:24px;font-size:13px}.visual-note{font-size:10px;color:#758078}.hero-index{position:absolute;bottom:22px;right:6%;font-size:10px;letter-spacing:.16em;color:#68756b}.intro{text-align:center;padding:76px 8% 36px}.intro h2,.editorial h2{font-size:clamp(26px,3vw,38px);line-height:1.3;letter-spacing:-.03em;margin:0 0 14px}.intro>p:last-child{font-size:13px;color:#778078;line-height:1.8;max-width:560px;margin:0 auto}.model-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:28px 6% 78px}.model-card{min-width:0}.product-image{height:220px;display:grid;place-items:center;background:#f0f2ee;color:#7c867d;font-size:12px;margin-bottom:22px}.product-image-alt{background:#e9eeeb}.product-image-third{background:#e8ecef}.model-card .eyebrow{margin-bottom:10px}.model-card h3{font-size:22px;margin:0 0 9px}.model-card p:not(.eyebrow){font-size:12px;color:#778078}.text-link{display:inline-block;margin-top:8px;color:#1c2922;font-size:12px;text-decoration:none;border-bottom:1px solid #9aa79b;padding-bottom:5px}.editorial{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:center;padding:70px 8%;background:#f6f7f4}.editorial>div:first-child>p:not(.eyebrow){font-size:13px;line-height:1.9;color:#6c766e;max-width:390px}.editorial-image{min-height:280px;background:#e3e8e2;display:grid;place-items:center;border:1px dashed #aeb9ae;color:#6f7c70;font-size:12px}.service-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;padding:62px 8%;border-bottom:1px solid #e7eae7}.service-row>div{border-top:1px solid #cfd6cf;padding-top:18px}.service-row strong{font-size:10px;color:#829084;letter-spacing:.18em}.service-row h3{font-size:17px;margin:14px 0 8px}.service-row p{font-size:12px;line-height:1.8;color:#788179}.storefront-footer{padding:34px 6%;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.storefront-footer p,.storefront-footer span{font-size:11px;color:#7a837c}.storefront-footer .brand{font-size:17px}@media(max-width:680px){.storefront-nav{height:60px;padding:0 5%}.storefront-nav nav{display:none}.hero{grid-template-columns:1fr;padding:50px 7% 64px;gap:24px}.hero-visual{min-height:190px}.bike-placeholder{min-height:180px}.model-grid{grid-template-columns:1fr;padding:20px 7% 50px}.product-image{height:230px}.editorial{grid-template-columns:1fr;padding:50px 7%;gap:24px}.service-row{grid-template-columns:1fr;padding:42px 7%;gap:14px}.intro{padding:52px 7% 26px}.storefront-footer{align-items:flex-start;flex-direction:column}}',
].join('\n');

const zhMessages = {
  general: {
    add: '添加', close: '关闭', cancel: '取消', confirm: '确认', yes: '是', no: '否',
    ok: '确定', select: '选择', deselect: '取消选择', delete: '删除', remove: '移除',
    move: '移动', copy: '复制', paste: '粘贴', settings: '设置', apply: '应用',
  },
  blockManager: { labels: { text: '文本', image: '图片', link: '链接', video: '视频', map: '地图' }, categories: { Basic: '基础模块', Layout: '布局模块' } },
  styleManager: {
    empty: '请选择一个元素，然后编辑它的样式。',
    sectors: { general: '常规', dimension: '尺寸', typography: '文字', decorations: '装饰', extra: '其他', flex: '弹性布局' },
    properties: {
      display: '显示方式', position: '定位方式', width: '宽度', height: '高度',
      'min-width': '最小宽度', 'min-height': '最小高度', 'max-width': '最大宽度', 'max-height': '最大高度',
      margin: '外边距', padding: '内边距', 'margin-top': '上外边距', 'margin-right': '右外边距',
      'margin-bottom': '下外边距', 'margin-left': '左外边距', 'padding-top': '上内边距',
      'padding-right': '右内边距', 'padding-bottom': '下内边距', 'padding-left': '左内边距',
      color: '文字颜色', 'background-color': '背景颜色', background: '背景', 'font-family': '字体',
      'font-size': '字号', 'font-weight': '字重', 'line-height': '行高', 'letter-spacing': '字间距',
      'text-align': '文字对齐', 'border-radius': '圆角', border: '边框', 'box-shadow': '阴影',
      'justify-content': '主轴对齐', 'align-items': '交叉轴对齐', 'flex-direction': '排列方向', gap: '间距',
    },
  },
  traitManager: { empty: '请选择一个元素，然后编辑它的属性。', label: '元素属性', traits: { labels: { id: 'ID', title: '标题', href: '链接地址', target: '打开方式', alt: '图片说明' } } },
  assetManager: { addButton: '上传图片', inputPlh: '输入图片地址', modalTitle: '选择图片', uploadTitle: '拖入图片，或点击上传' },
  layerManager: { empty: '暂无图层', label: '图层' },
  selectorManager: { label: '样式选择器', selected: '已选择', emptyState: '选择一个元素以管理样式' },
  deviceManager: { device: '设备预览' },
  panels: { buttons: { titles: { preview: '预览', fullscreen: '全屏', export: '导出', undo: '撤销', redo: '重做', canvasClear: '清空画布' } } },
  commands: { buttons: { titles: { preview: '预览', fullscreen: '全屏', export: '导出', undo: '撤销', redo: '重做' } } },
  modal: { title: '窗口', close: '关闭' },
  richTextEditor: { bold: '加粗', italic: '斜体', underline: '下划线', strikeThrough: '删除线', link: '链接', unlink: '取消链接', undo: '撤销', redo: '重做' },
  storageManager: { recover: '恢复', warning: '确定要继续吗？' },
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type: type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function StorefrontBuilderClient() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorApi | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [activeLeftTab, setActiveLeftTab] = useState<'blocks' | 'layers'>('blocks');
  const [activeDevice, setActiveDevice] = useState('桌面端');
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [notice, setNotice] = useState('装修预览已准备就绪。当前不会修改正式商城。');
  const [publishedProducts,setPublishedProducts]=useState<PublishedProductForBuilder[]>([]);
  const [publishedState,setPublishedState]=useState<'loading'|'ready'|'error'>('loading');
  const [publishedError,setPublishedError]=useState('');
  const [selectedProductId,setSelectedProductId]=useState('');
  const [productLocale,setProductLocale]=useState<'zh'|'de'|'en'>('de');

  const loadPublishedProducts=async(signal?:AbortSignal)=>{
    setPublishedState('loading');setPublishedError('');
    try{
      const res=await fetch('/api/control/v1/product/public/catalog',{cache:'no-store',...(signal?{signal}:{})});
      if(!res.ok)throw new Error('已发布商品目录接口不可用');
      const payload=await res.json() as {data?:unknown};
      const products=verifiedPublishedProducts(payload?.data);
      if(signal?.aborted)return;
      setPublishedProducts(products);
      setSelectedProductId(previous=>products.some(p=>p.productId===previous)?previous:'');
      setPublishedState('ready');
    }catch(error){
      if(signal?.aborted)return;
      setPublishedProducts([]);setSelectedProductId('');
      setPublishedState('error');setPublishedError(error instanceof Error?error.message:'商品目录读取失败');
    }
  };
  useEffect(()=>{const controller=new AbortController();void loadPublishedProducts(controller.signal);return()=>controller.abort()},[]);

  const insertPublishedProduct=()=>{
    const editor=editorRef.current;
    if(!ready||!editor||previewing)return;
    const selected=publishedProducts.find(p=>p.productId===selectedProductId);
    if(!selected){setNotice('请先选择已发布的真实数字商品 ID。');return;}
    editor.addComponents(numericProductBlock(selected,productLocale));
    setDirty(true);
    setNotice('已加入商品 #'+selected.productId+'。草稿保留 data-product-id 数字关联；正式官网未发布，也没有生成售价或库存。');
  };

  useEffect(() => {
    let cancelled = false;
    let editor: EditorApi | null = null;

    if (!document.querySelector('link[data-alsvid-grapesjs-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/grapesjs@0.23.8/dist/css/grapes.min.css';
      link.dataset.alsvidGrapesjsCss = 'true';
      document.head.appendChild(link);
    }

    const initialize = () => {
      if (cancelled || !window.grapesjs || !canvasRef.current || !blocksRef.current || !layersRef.current || !stylesRef.current) return;
      try {
        editor = window.grapesjs.init({
          container: canvasRef.current,
          height: '100%',
          width: 'auto',
          fromElement: false,
          storageManager: false,
          panels: { defaults: [] },
          i18n: { locale: 'zh', detectLocale: false, localeFallback: 'zh', messages: { zh: zhMessages } },
          deviceManager: {
            devices: [
              { name: '桌面端', width: '' },
              { name: '平板端', width: '768px' },
              { name: '手机端', width: '390px' },
            ],
          },
          blockManager: {
            appendTo: blocksRef.current,
            blocks: [
              { id: 'alsvid-hero', label: '主视觉横幅', category: '首页模块', content: '<section class="hero" data-alsvid-block="hero"><div class="hero-copy"><p class="eyebrow">ALSVID ELECTRIC MOBILITY</p><h1>在这里编辑首页主标题</h1><p class="hero-subtitle">添加一句简洁的品牌介绍。</p><a class="button" href="#">立即探索 →</a></div><div class="hero-visual"><div class="bike-placeholder">替换为整车主视觉图片</div></div></section>' },
              { id: 'alsvid-product-grid', label: '整车 / 商品展示', category: '商品模块', content: '<section class="model-grid" data-alsvid-block="product-grid"><article class="model-card"><div class="product-image">商品图片</div><p class="eyebrow">MODEL SERIES</p><h3>车型名称</h3><p>商品数据连接后自动读取</p><a class="text-link" href="#">查看详情 →</a></article><article class="model-card"><div class="product-image">商品图片</div><p class="eyebrow">MODEL SERIES</p><h3>车型名称</h3><p>商品数据连接后自动读取</p><a class="text-link" href="#">查看详情 →</a></article></section>' },
              { id: 'alsvid-image-text', label: '图文介绍', category: '内容模块', content: '<section class="editorial" data-alsvid-block="image-text"><div><p class="eyebrow">品牌故事</p><h2>编辑标题与品牌故事</h2><p>在这里介绍产品设计、骑行体验或品牌理念。</p><a class="text-link" href="#">了解更多 →</a></div><div class="editorial-image">替换图片</div></section>' },
              { id: 'alsvid-image', label: '单张图片', category: '内容模块', content: '<section class="editorial-image" data-alsvid-block="image">双击图片区域并设置图片地址</section>' },
              { id: 'alsvid-service', label: '服务保障', category: '内容模块', content: '<section class="service-row" data-alsvid-block="service"><div><strong>01</strong><h3>配送服务</h3><p>编辑真实的配送说明。</p></div><div><strong>02</strong><h3>质保政策</h3><p>编辑已确认的质保信息。</p></div><div><strong>03</strong><h3>售后支持</h3><p>编辑售后与配件支持。</p></div></section>' },
              { id: 'alsvid-heading', label: '标题与正文', category: '基础模块', content: '<section style="padding:48px 8%;"><h2>在此输入标题</h2><p>双击文字即可编辑内容。你可以在右侧调整字号、颜色和间距。</p></section>' },
              { id: 'alsvid-button', label: '行动按钮', category: '基础模块', content: '<div style="padding:20px 8%;"><a class="button" href="#">编辑按钮文字与链接 →</a></div>' },
              { id: 'alsvid-spacer', label: '留白间距', category: '基础模块', content: '<div style="height:64px;" data-alsvid-block="spacer"></div>' },
              { id: 'alsvid-footer', label: '页脚信息', category: '页脚模块', content: '<footer class="storefront-footer" data-alsvid-block="footer"><a class="brand" href="#">ALSVID</a><p>骑行自由，从这里开始。</p><span>帮助中心　配送政策　退货政策　联系我们</span></footer>' },
            ],
          },
          layerManager: { appendTo: layersRef.current },
          styleManager: {
            appendTo: stylesRef.current,
            sectors: [
              { name: '布局', open: true, buildProps: ['display', 'flex-direction', 'justify-content', 'align-items', 'gap'] },
              { name: '尺寸与间距', open: true, buildProps: ['width', 'height', 'min-height', 'max-width', 'margin', 'padding'] },
              { name: '文字样式', open: false, buildProps: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color'] },
              { name: '背景与边框', open: false, buildProps: ['background-color', 'background', 'border', 'border-radius', 'box-shadow'] },
              { name: '定位', open: false, buildProps: ['position', 'top', 'right', 'bottom', 'left'] },
            ],
          },
          selectorManager: { componentFirst: true },
          components: INITIAL_HTML,
          style: INITIAL_CSS,
        });
        editorRef.current = editor;
        editor.on('update', () => setDirty(true));
        setReady(true);
        setError('');
      } catch {
        setError('装修器初始化失败。请刷新页面后重试；如果持续出现，请检查 GrapesJS CDN 是否可访问。');
      }
    };

    if (window.grapesjs) {
      initialize();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/grapesjs@0.23.8/dist/grapes.min.js';
      script.async = true;
      script.dataset.alsvidGrapesjs = 'true';
      script.onload = initialize;
      script.onerror = () => {
        if (!cancelled) setError('无法加载可视化编辑器。请检查网络是否可以访问 jsDelivr CDN。');
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      editor?.destroy();
      editorRef.current = null;
    };
  }, []);

  const loadDraft = async () => {
    const editor = editorRef.current;
    if (!editor || draftBusy) return;
    if (dirty && !window.confirm('读取云端草稿会替换当前未保存的编辑内容，是否继续？')) return;
    setDraftBusy(true);
    try {
      const snapshot = JSON.stringify(editor.getProjectData());
      const response = await fetch('/api/control/v1/commerce/storefront/layout-draft', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? '草稿读取失败');
      if (JSON.stringify(editor.getProjectData()) !== snapshot) throw new Error('读取期间页面有新修改，请先导出当前方案再重新读取。');
      if (payload.data) {
        editor.loadProjectData(payload.data.project);
        setDraftVersion(payload.data.version);
        setDirty(false);
        setNotice('已读取云端草稿。');
      } else {
        setDraftVersion(0);
        setNotice('云端尚无草稿，可以保存当前方案。');
      }
    } catch (reason) {
      setDraftVersion(null);
      setNotice(reason instanceof Error ? reason.message : '草稿读取失败');
    } finally { setDraftBusy(false); }
  };

  const saveDraft = async () => {
    const editor = editorRef.current;
    if (!editor || draftBusy || draftVersion === null) return;
    setDraftBusy(true);
    try {
      const project = editor.getProjectData();
      const snapshot = JSON.stringify(project);
      const response = await fetch('/api/control/v1/commerce/storefront/layout-draft', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, expectedVersion: draftVersion }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? '云端草稿已被修改，请先导出当前方案，再重新读取。' : payload?.message ?? '草稿保存失败');
      setDraftVersion(payload.data.version);
      setDirty(JSON.stringify(editor.getProjectData()) !== snapshot);
      setNotice('云端草稿已保存；正式商城尚未发布。');
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : '草稿保存失败'); }
    finally { setDraftBusy(false); }
  };

  useEffect(() => {
    if (ready) void loadDraft();
    // Read once when the editor is initialized. Manual reload remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const exportProject = () => {
    const editor = editorRef.current;
    if (!editor) return;
    downloadText('alsvid-storefront-layout.json', JSON.stringify(editor.getProjectData(), null, 2), 'application/json;charset=utf-8');
    setNotice('装修方案已导出为 JSON 文件。正式商城未发生任何变化。');
  };

  const exportHtml = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALSVID 商城装修预览</title><style>' + editor.getCss() + '</style></head><body>' + editor.getHtml() + '</body></html>';
    downloadText('alsvid-storefront-preview.html', html, 'text/html;charset=utf-8');
    setNotice('静态 HTML 预览已导出。它不会自动发布到正式商城。');
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const editor = editorRef.current;
    if (!file || !editor) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid project');
      editor.loadProjectData(parsed as Record<string, unknown>);
      setDirty(true);
      setNotice('装修方案已导入，可以继续编辑。');
    } catch {
      setNotice('导入失败：请选择本装修器导出的有效 JSON 方案文件。');
    } finally {
      input.value = '';
    }
  };

  const togglePreview = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (previewing) {
      editor.stopCommand('core:preview');
      setPreviewing(false);
      setNotice('已返回编辑模式。');
    } else {
      editor.runCommand('core:preview');
      setPreviewing(true);
      setNotice('当前为预览模式；关闭预览即可继续编辑。');
    }
  };

  const setDevice = (device: string) => {
    editorRef.current?.setDevice(device);
    setActiveDevice(device);
  };

  const resetExample = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setComponents(INITIAL_HTML);
    editor.setStyle(INITIAL_CSS);
    setDirty(true);
    setNotice('已恢复初始示例布局。之前未导出的修改不会保留。');
  };

  return (
    <section className={styles.shell} aria-label="商城可视化装修工作区">
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>ALSVID COMMERCE STUDIO</p>
          <h1 className={styles.title}>商城首页装修</h1>
          <p className={styles.subtitle}>自由拖拽模块，直接编辑文字、图片和样式；独立于正式商城运行。</p>
        </div>
        <div className={styles.actions}>
          <a className={styles.secondaryButton} href="/admin/ecommerce/page-builder" onClick={event => { if (dirty && !window.confirm('当前修改尚未保存到云端，确定返回？')) event.preventDefault(); }}>返回记录</a>
          <button type="button" className={styles.secondaryButton} onClick={() => void loadDraft()} disabled={!ready || draftBusy}>读取云端草稿</button>
          <button type="button" className={styles.secondaryButton} onClick={() => void saveDraft()} disabled={!ready || draftBusy || draftVersion === null}>保存云端草稿</button>
          <button type="button" className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={!ready}>导入方案</button>
          <input ref={fileRef} className={styles.hiddenInput} type="file" accept=".json,application/json" onChange={importProject} />
          <button type="button" className={styles.secondaryButton} onClick={exportHtml} disabled={!ready}>导出 HTML</button>
          <button type="button" className={styles.primaryButton} onClick={exportProject} disabled={!ready}>导出装修方案</button>
        </div>
      </header>

      <div className={styles.notice}>
        <span className={styles.noticeIcon}>i</span>
        <div>
          <strong>独立装修窗口</strong>
          <p>先读取云端草稿，再保存修改。本地和云端后台使用同一份草稿；保存不会发布正式商城。</p>
        </div>
        <span className={styles.noticeStatus}>{dirty ? '有未导出的修改' : '方案未修改'}</span>
      </div>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <section className={styles.productBinder} aria-label="按数字商品 ID 关联装修素材">
        <div><strong>关联真实商品 ID（6 位数字）</strong><p>只读取已审核发布的商品；绑定到装修草稿，不创建商品，也不代表自动开放下单。</p></div>
        <label>选择商品<select aria-label="选择数字商品 ID" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)} disabled={publishedState!=='ready'}>
          <option value="">选择商品 ID</option>{publishedProducts.map(p=><option key={p.productId} value={p.productId}>{p.productId} · {p.title.zh} ({p.code})</option>)}
        </select></label>
        <label>语言<select aria-label="商品展示语言" value={productLocale} onChange={e=>setProductLocale(e.target.value as 'zh'|'de'|'en')}>
          <option value="de">德语</option><option value="en">英语</option><option value="zh">中文</option>
        </select></label>
        <button type="button" className={styles.primaryButton} onClick={insertPublishedProduct} disabled={!ready||previewing||publishedState!=='ready'||!selectedProductId}>插入商品模块</button>
        <button type="button" className={styles.secondaryButton} onClick={()=>void loadPublishedProducts()} disabled={publishedState==='loading'}>刷新商品</button>
        {publishedState==='error'?<p role="alert" className={styles.error}>商品读取失败：{publishedError}。不能使用示例数据代替。</p>:null}
        {publishedState==='ready'&&!publishedProducts.length?<p>暂无可绑定的已发布商品；请先到商城商品列表完成审核发布。</p>:null}
      </section>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button type="button" className={styles.toolButton} onClick={() => editorRef.current?.runCommand('core:undo')} disabled={!ready} title="撤销">↶ <span>撤销</span></button>
          <button type="button" className={styles.toolButton} onClick={() => editorRef.current?.runCommand('core:redo')} disabled={!ready} title="重做">↷ <span>重做</span></button>
          <span className={styles.toolbarDivider} />
          <span className={styles.statusText}>{ready ? '编辑器已就绪' : error ? '加载失败' : '正在加载装修器…'}</span>
        </div>
        <div className={styles.toolbarRight}>
          {(['桌面端', '平板端', '手机端'] as const).map((device) => (
            <button type="button" key={device} className={activeDevice === device ? styles.activeDevice : styles.deviceButton} onClick={() => setDevice(device)} disabled={!ready}>{device}</button>
          ))}
          <button type="button" className={previewing ? styles.primaryButton : styles.secondaryButton} onClick={togglePreview} disabled={!ready}>{previewing ? '退出预览' : '预览页面'}</button>
          <button type="button" className={styles.toolButton} onClick={resetExample} disabled={!ready}>恢复示例</button>
        </div>
      </div>

      <div className={styles.editorLayout}>
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <strong>页面结构</strong>
            <span>拖拽添加</span>
          </div>
          <div className={styles.panelTabs}>
            <button type="button" className={activeLeftTab === 'blocks' ? styles.activeTab : styles.tab} onClick={() => setActiveLeftTab('blocks')}>模块库</button>
            <button type="button" className={activeLeftTab === 'layers' ? styles.activeTab : styles.tab} onClick={() => setActiveLeftTab('layers')}>图层</button>
          </div>
          <div className={styles.blocksMount} ref={blocksRef} style={{ display: activeLeftTab === 'blocks' ? 'block' : 'none' }} />
          <div className={styles.layersMount} ref={layersRef} style={{ display: activeLeftTab === 'layers' ? 'block' : 'none' }} />
        </aside>

        <main className={styles.canvasPanel}>
          <div className={styles.canvasCaption}><span>页面预览</span><span>选中元素后可直接编辑</span></div>
          <div className={styles.canvas} ref={canvasRef} />
        </main>

        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <strong>样式设置</strong>
            <span>选中元素后编辑</span>
          </div>
          <div className={styles.stylesMount} ref={stylesRef} />
        </aside>
      </div>
      <p className={styles.footerNote}>{notice}</p>
    </section>
  );
}
