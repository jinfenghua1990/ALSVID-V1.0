import { AppShell } from '@alsvid/ui';
import { navigationFor } from '../_design/admin-navigation';

export const dynamic = 'force-dynamic';

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export default function EnvironmentPage() {
  const isProduction = process.env.ALSVID_ENV === 'production';
  const environment = isProduction ? 'production' : 'local / CI';
  const databaseReady = configured(process.env.DATABASE_URL);
  const storageReady = configured(process.env.OBJECT_STORAGE_BUCKET)
    && configured(process.env.OBJECT_STORAGE_ACCESS_KEY)
    && configured(process.env.OBJECT_STORAGE_SECRET_KEY);
  const releaseSha = process.env.ALSVID_RELEASE_SHA ?? process.env.K_REVISION ?? process.env.GITHUB_SHA ?? '未注入';
  const bucket = process.env.OBJECT_STORAGE_BUCKET ?? (isProduction ? '未注入' : '本地/CI 未配置');

  return (
    <AppShell navigation={navigationFor('/settings/environment')} footer="系统 / 环境与基础设施">
      <header className="pageHeader">
        <div>
          <div className="eyebrow">系统 / 环境与基础设施</div>
          <h1>环境与基础设施</h1>
          <p className="pageIntro">此页展示 Web 进程可见的配置，不代表 API、Worker 或云端资源的实际健康状态。</p>
        </div>
        <span className={`statusPill ${isProduction ? 'ready' : 'pending'}`}>{isProduction ? '正式环境' : '本地 / CI'}</span>
      </header>

      <div className="infoGrid">
        <section className="infoCard">
          <h2>当前运行环境</h2>
          <p>云端仅保留 Production。开发和自动化验证运行在本地或临时 CI 环境。</p>
          <div className="infoRows">
            <div className="infoRow"><span>ALSVID 环境</span><strong>{isProduction ? 'Production / 正式' : 'Local / CI'}</strong><span>{environment}</span></div>
            <div className="infoRow"><span>Google Cloud 项目</span><strong>{isProduction ? 'alsvid-production' : '不适用'}</strong><span>{isProduction ? '生产项目' : '无云端项目'}</span></div>
            <div className="infoRow"><span>运行平台</span><strong>{isProduction ? 'Google Cloud Run' : '本地容器 / CI runner'}</strong><span>{isProduction ? '云端运行' : '临时验证环境'}</span></div>
            <div className="infoRow"><span>发布版本</span><strong>{releaseSha}</strong><span>只读</span></div>
          </div>
        </section>

        <section className="infoCard">
          <h2>Web 配置可见性</h2>
          <p>这里只显示 Web 进程是否收到配置，不读取或展示敏感值，也不验证真实连接。</p>
          <div className="infoRows">
            <div className="infoRow"><span>配置来源</span><strong>{isProduction ? 'Production Secret Manager' : '本地 / CI 配置'}</strong><span>仅显示来源类别</span></div>
            <div className="infoRow"><span>数据库连接配置</span><strong>{databaseReady ? '已注入（未验证连接）' : '未注入'}</strong><span className={`statusPill ${databaseReady ? 'ready' : 'pending'}`}>{databaseReady ? '已注入' : '未注入'}</span></div>
            <div className="infoRow"><span>对象存储配置</span><strong>{storageReady ? '已注入（未验证连接）' : '未注入'}</strong><span className={`statusPill ${storageReady ? 'ready' : 'pending'}`}>{storageReady ? '已注入' : '未注入'}</span></div>
          </div>
        </section>

        <section className="infoCard">
          <h2>数据库 / PostgreSQL</h2>
          <p>{isProduction ? '生产服务应连接已批准的 Production 数据库。' : '本地或 CI 使用隔离的临时数据库；配置存在不代表连接成功。'}</p>
          <div className="infoRows">
            <div className="infoRow"><span>资源类别</span><strong>{isProduction ? 'Production Neon' : '本地 / 临时 PostgreSQL'}</strong><span>不显示连接串</span></div>
            <div className="infoRow"><span>连接串</span><strong>敏感值已隐藏</strong><span>不会展示</span></div>
          </div>
        </section>

        <section className="infoCard">
          <h2>对象存储 / Cloudflare R2</h2>
          <p>只在功能需要时配置隔离的测试存储；本页面不会判断 Bucket 是否可写。</p>
          <div className="infoRows">
            <div className="infoRow"><span>Bucket</span><strong>{bucket}</strong><span className={`statusPill ${storageReady ? 'ready' : 'pending'}`}>{storageReady ? '已注入' : '未注入'}</span></div>
            <div className="infoRow"><span>密钥</span><strong>敏感值已隐藏</strong><span>不会展示</span></div>
          </div>
        </section>
      </div>

      <div className="mutedBox">发布链路：GitHub PR → CI → review / merge to main → exact-commit CI → Production（alsvid-production / europe-west1）。本地和 CI 不使用 Production 凭据。旧的云端 Development / Test 部署链路已退出当前发布流程。</div>
    </AppShell>
  );
}
