# ALSVID 独立站商品、URL 与 SEO 架构技术规范 (v1.1 定稿)

本文档定义了 ALSVID 品牌独立站的全站 URL 命名规范、Google SEO 优化标准、结构化数据、数据库设计及德国工业级 SKU 编码标准。全站前端路由、服务端渲染（SSR）、数据库与外部系统对接必须严格遵循此规范。

---

## 1. Google SEO 与 URL 命名硬性规范

根据 Google 搜索中心（Google Search Central）官方准则，URL 是搜索引擎理解页面内容最直接的权重信号之一。

### 1.1 URL 核心五大戒律
1. **纯语义化（Semantic）**：URL 路径必须使用有意义的英文单词，**严禁出现任何内部数字 ID、数据库主键或 SKU 编码**。
   - 错误：`/bikes/product-1000051001`、`/item/A1-EBI-BLK`
   - 正确：`/bikes/a1`、`/accessories/a1-battery-500wh`
2. **字符标准（RFC 3986）**：
   - 全小写字母（Lowercase）：严禁出现大写字母（`/bikes/A1` ❌ $\rightarrow$ `/bikes/a1` ✅）。
   - 单词分隔符：**一律使用连字符 `-`（Hyphen）**，严禁使用下划线 `_`、空格 `%20` 或驼峰命名。Google 算法将 `-` 视作词与词的天然空格，而 `_` 会被合并为一个无意义词。
3. **扁平化层级（Flat Hierarchy）**：
   - 路径深度严格控制在 2~3 层以内，缩短爬虫抓取深度（Crawl Depth），提升页面抓取权重与点击率。
   - 推荐结构：`/[语言]/[品类]/[商品slug]`
4. **斜杠归一化（Trailing Slash）**：
   - 目录级与商品主页统一强制保持一致（推荐全站统一使用无末尾斜杠，如 `/de/bikes/a1`），并通过 Nginx / Cloudflare 自动 301 重定向带斜杠请求，杜绝重复页面竞争。
5. **严禁包含文件后缀**：
   - 严禁出现 `.html`、`.php` 或 `.aspx` 等过时静态扩展名。

---

### 1.2 全站 URL 路由架构体系表

| 页面类型 | 规则 / 语法模版 | 示例 URL (德国站) | 示例 URL (国际站) | SEO 核心意图 |
| :--- | :--- | :--- | :--- | :--- |
| **车型主页** | `/[lang]/bikes/[model-slug]` | `/de/bikes/a1` | `/en/bikes/a1` | 车型总词、品牌词、主词流量聚集点 |
| **颜色/配置变体** | `/[lang]/bikes/[model-slug]?[param]=[slug]` | `/de/bikes/a1?color=matte-black` | `/en/bikes/a1?color=matte-black` | 仅做落地承接与广告追踪，不争抢 SEO 权重 |
| **专属配件详情** | `/[lang]/accessories/[model]-[part-slug]` | `/de/accessories/a1-battery-500wh` | `/en/accessories/a1-battery-500wh` | 拦截“车型 + 配件”高意图车主搜索 |
| **通用配件详情** | `/[lang]/accessories/[gear-slug]` | `/de/accessories/heavy-duty-u-lock` | `/en/accessories/heavy-duty-u-lock` | 拦截泛骑行装备长尾词（严禁带 A1） |
| **品类聚合页** | `/[lang]/[category-slug]` | `/de/bikes`<br>`/de/accessories` | `/en/bikes`<br>`/en/accessories` | 行业大词与品类词排名 |
| **品牌与法律页** | `/[lang]/[page-slug]` | `/de/about-us`<br>`/de/impressum` | `/en/about-us`<br>`/en/imprint` | 德国法定 Impressum 页面与品牌信任背书 |

---

### 1.3 变体 URL、状态还原与 Canonical 死锁机制

为了在满足 Google 购物广告（GMC 落地页要求）的同时**彻底防止重复内容（Duplicate Content）惩罚**，前端交互与 SEO 标签必须遵循以下逻辑：

1. **变体参数化访问**：
   - 用户在页面上点击颜色或不同电池配置，URL 仅改变 Query 参数：
     - 切换白色：`?color=polar-white`
     - 切换高续航：`?color=matte-black&battery=750wh`
   - 使用前端路由 `history.replaceState` 动态更新地址，页面不发生硬刷新。
2. **服务端直出（SSR 强约束）**：
   - 当爬虫或买家直接通过 `/de/bikes/a1?color=polar-white` 访问时，服务端首屏返回的 HTML 中必须直接包含对应颜色的主图、价格、SKU 和“InStock”状态，严禁出现客户端 JS 延迟切换。
3. **Canonical 标签死锁**：
   - **核心规则**：无论 URL 后面带了多少变体参数（如 `?color=...`、`?utm_source=...`），页面 `<head>` 内的 Canonical 标签**必须死死指向无参数的纯净车型主 URL**：
     ```html
     <!-- 无论当前访问的是 ?color=matte-black 还是 ?color=polar-white -->
     <link rel="canonical" href="`https://yourdomain.com/de/bikes/a1`" />
     ```
   - 此机制确保 Google 将所有外链、社交分享与广告点击的权重 100% 沉淀在主车型页面上。

---

### 1.4 多语言与 Hreflang 国际化规范

全站针对目标市场设置独立语言根目录，并在每个页面的 HTML `<head>` 中输出完整的双向交叉引用与默认路由回退：

```html
<!-- 位于 /de/bikes/a1 页面中的配置示范 -->
<link rel="alternate" hreflang="de-DE" href="`https://yourdomain.com/de/bikes/a1`" />
<link rel="alternate" hreflang="en" href="`https://yourdomain.com/en/bikes/a1`" />
<link rel="alternate" hreflang="fr-FR" href="`https://yourdomain.com/fr/bikes/a1`" />
<link rel="alternate" hreflang="nl-NL" href="`https://yourdomain.com/nl/bikes/a1`" />
<link rel="alternate" hreflang="x-default" href="`https://yourdomain.com/en/bikes/a1`" />
```

*注：`x-default` 必须强制指向国际英文版首页/对应页，承接未匹配语言的全球访问。*

---

## 2. 页面元数据与视觉标签规范

### 2.1 标题（Title）与层级标题（H1）模版

* **德国站车型主页**：
* **Title**: `ALSVID A1 E-Klapprad – Mattschwarz | Kompakt-E-Bike | ALSVID`
* **H1**: `ALSVID A1 Kompakt E-Klapprad`

* **国际站车型主页**：
* **Title**: `ALSVID A1 Electric Folding Bike – Matte Black | ALSVID Official`
* **H1**: `ALSVID A1 Electric Folding Bike`

* **配件详情页**：
* **Title**: `ALSVID A1 Ersatz-Akku 500Wh | Offizielles Zubehör | ALSVID`
* **H1**: `ALSVID A1 Akku 500Wh`

### 2.2 图片 SEO 命名规范

图片文件名与 HTML `alt` 标签必须具备明确的描述性，辅助 Google 图片搜索引流：

* **图片文件命名公式**：`[brand]-[model]-[part/color]-[view].[ext]`
* 示例 1: `alsvid-a1-matte-black-side.webp`
* 示例 2: `alsvid-a1-folded-dimension.webp`
* 示例 3: `alsvid-a1-battery-500wh-front.webp`

* **图片 Alt 属性**：
```html
<img src="/images/alsvid-a1-matte-black-side.webp" 
     alt="ALSVID A1 E-Klapprad in Mattschwarz Seitenansicht" 
     width="1200" height="800" loading="lazy" />
```

---

## 3. 后端 SKU 编码标准 (DIN 助记符规范)

全链路业务编号采用 **10 位定长「三段式」助记符**，彻底解决数字扎堆造成的识别失误：

$$\mathbf{[归属前缀 2位]} - \mathbf{[品类缩写 3位]} - \mathbf{[规格/颜色 3位]}$$

### 3.1 编码段位定义

| 段位 | 长度 | 可选值 | 说明 |
| --- | --- | --- | --- |
| **归属前缀** | 2 位 | `A1`, `A2`, `L1`... | 专属车型 |
|  |  | `AL` | ALSVID 跨车型品牌通用配件 |
|  |  | `UN` | Universal 行业通用骑行装备 |
| **品类代码** | 3 位 | `EBI` | E-Bike 整车 (电助力自行车) |
|  |  | `BAT` | Batterie / 电池 |
|  |  | `CHG` | Ladegerät / 充电器 |
|  |  | `MOT` | Motor / 电机 |
|  |  | `RCK` | Gepäckträger / 后货架 |
|  |  | `FND` | Schutzblech / 挡泥板 |
|  |  | `LCK` | Fahrradschloss / 车锁 |
|  |  | `HLM` | Fahrradhelm / 头盔 |
|  |  | `BAG` | Tasche / 骑行包 |
| **规格/颜色** | 3 位 | `BLK`, `WHT`, `GRY` | 黑色, 白色, 灰色 |
|  |  | `500`, `750` | 电池容量 500Wh, 750Wh |
|  |  | `STD` | Standard (无颜色/无容量区分的标准款) |

### 3.2 SKU 业务速查表

| 商品类型 | 德语商品展示名 (发票/订单) | 标准 SKU (10位) |
| --- | --- | --- |
| **A1 整车 (黑)** | ALSVID A1 E-Klapprad (Mattschwarz) | `A1-EBI-BLK` |
| **A1 整车 (白)** | ALSVID A1 E-Klapprad (Polarweiß) | `A1-EBI-WHT` |
| **A1 整车 (灰)** | ALSVID A1 E-Klapprad (Graphitgrau) | `A1-EBI-GRY` |
| **A1 专属配件** | ALSVID A1 Akku 500Wh | `A1-BAT-500` |
| **A1 专属配件** | ALSVID A1 Akku 750Wh | `A1-BAT-750` |
| **A1 专属配件** | ALSVID A1 Heck-Gepäckträger | `A1-RCK-BLK` |
| **ALSVID 品牌共用** | ALSVID Schnellladegerät 3A | `AL-CHG-STD` |
| **通用周边 (Gear)** | Universal Faltschloss / U-Schloss | `UN-LCK-STD` |
| **通用周边 (Gear)** | City-Fahrradhelm (Schwarz) | `UN-HLM-BLK` |

---

## 4. 数据库设计基准 (PostgreSQL / Neon)

```sql
-- 1. 车型主表（纯管 SEO 路由与前端呈现，与具体库存变体物理隔离）
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    model_code VARCHAR(16) NOT NULL UNIQUE,       -- 如 'A1'
    slug VARCHAR(64) NOT NULL UNIQUE,             -- 严格全小写无符号，如 'a1'
    category VARCHAR(32) NOT NULL,                -- 如 'folding_ebike'
    title_de VARCHAR(128) NOT NULL,               -- 'ALSVID A1 E-Klapprad'
    title_en VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 变体子表（真实发货实体，强绑定 10位 SKU、价格与库存）
CREATE TABLE product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(16) NOT NULL UNIQUE,              -- 强约束格式 'A1-EBI-BLK'
    color_slug VARCHAR(32),                       -- URL 参数值，如 'matte-black'
    color_name_de VARCHAR(32),                    -- 'Mattschwarz'
    spec_code VARCHAR(16),                        -- '500WH' 或 NULL
    price_cents INT NOT NULL,                     -- 货币以分为单位存储 (129900 = 1299.00 EUR)
    stock_qty INT NOT NULL DEFAULT 0,
    gtin13 VARCHAR(13) DEFAULT NULL,              -- 真实 EAN-13 条码，未申请前严格为 NULL
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_products_slug ON products(slug);
```

---

## 5. Google 结构化数据标准 (JSON-LD)

在车型页面 `/de/bikes/a1` 的 HTML 中，输出官方认证的 `ProductGroup` + `hasVariant` 规范数据：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProductGroup",
  "name": "ALSVID A1 E-Klapprad",
  "description": "ALSVID A1 kompaktes und faltbares Elektrofahrrad für urbane Mobilität.",
  "url": "https://yourdomain.com/de/bikes/a1",
  "brand": {
    "@type": "Brand",
    "name": "ALSVID"
  },
  "productGroupID": "ALSVID-A1",
  "variesBy": [
    "https://schema.org/color"
  ],
  "hasVariant": [
    {
      "@type": "Product",
      "name": "ALSVID A1 E-Klapprad - Mattschwarz",
      "sku": "A1-EBI-BLK",
      "color": "Mattschwarz",
      "image": "https://yourdomain.com/images/alsvid-a1-matte-black-side.webp",
      "offers": {
        "@type": "Offer",
        "priceCurrency": "EUR",
        "price": "1299.00",
        "availability": "https://schema.org/InStock",
        "url": "https://yourdomain.com/de/bikes/a1?color=matte-black"
      }
    },
    {
      "@type": "Product",
      "name": "ALSVID A1 E-Klapprad - Polarweiß",
      "sku": "A1-EBI-WHT",
      "color": "Polarweiß",
      "image": "https://yourdomain.com/images/alsvid-a1-polar-white-side.webp",
      "offers": {
        "@type": "Offer",
        "priceCurrency": "EUR",
        "price": "1299.00",
        "availability": "https://schema.org/InStock",
        "url": "https://yourdomain.com/de/bikes/a1?color=polar-white"
      }
    }
  ]
}
</script>
```

> **字段缺失处理准则**：若变体尚无正式 GS1 EAN-13 码，JSON 中**严禁输出 `"gtin13": ""**`，直接省略该字段；在对接 Google Merchant Center 时将 `identifier_exists` 设为 `no`，杜绝任何爬虫校验报错。
