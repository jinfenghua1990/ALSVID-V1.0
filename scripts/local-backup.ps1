<#
.SYNOPSIS
    ALSVID 本机代码自动备份到 GitHub 备份分支（负责人决定 2026-11-03：本地为主，GitHub 只作备份）。

.DESCRIPTION
    每次改完代码跑一次即可。脚本会：
      1) 把工作区全部改动暂存（.gitignore 已排除 .env.local、backups/ 等本机密钥与数据）
      2) 扫描待提交清单，发现疑似密钥/凭据文件立即中止，不提交
      3) 有改动就做一次本地提交（快照当时工作区全部内容，含同机其他窗口的改动）
      4) 只推送到 GitHub 的 backup/local 分支

    安全边界（重要）：
      - 本脚本永不推送 main，因此不会触发 CI、不会自动合并、不会发布线上。
      - 正式站 www/admin/dealer/catalog/my/service/supplier.alsvidbike.com 只从合并后的 main
        经 GitHub 工作流发布；要上线必须负责人另行明确授权后单独操作。
      - 不碰数据库、不跑迁移、不执行任何发布动作。

.PARAMETER Message
    自定义提交说明。省略则自动生成 "backup(local): <时间> 自动备份 <n> 个文件"。

.PARAMETER Snapshot
    额外推一个带时间戳的快照分支 backup/local-yyyyMMdd-HHmmss，用于阶段性留档。

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\local-backup.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\local-backup.ps1 -Message "整车建档改动" -Snapshot
#>
[CmdletBinding()]
param(
    [string]$Message = '',
    [switch]$Snapshot
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)
    # git 把进度和警告写到 stderr；这里必须临时关掉 Stop，否则 PowerShell 会当成异常中断
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & git @GitArgs 2>&1 | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    [pscustomobject]@{ ExitCode = $code; Output = $raw.Trim() }
}

$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo

try {
    # 0) 上一步：若存在 index.lock，说明有 git 操作正在这个仓库里跑（可能是同机另一个 AI 窗口）。
    #    不删除、不覆盖，直接退出，避免打断别人的提交。
    $gitDirRaw = (Invoke-Git -GitArgs @('rev-parse', '--git-dir')).Output.Trim()
    if ([string]::IsNullOrWhiteSpace($gitDirRaw)) { $gitDirRaw = '.git' }
    if ([System.IO.Path]::IsPathRooted($gitDirRaw)) { $gitDir = $gitDirRaw } else { $gitDir = Join-Path $repo $gitDirRaw }
    $lockPath = Join-Path $gitDir 'index.lock'
    if (Test-Path -LiteralPath $lockPath) {
        $age = ((Get-Date) - (Get-Item -LiteralPath $lockPath).LastWriteTime).TotalMinutes
        throw "检测到 $lockPath（$([math]::Round($age,1)) 分钟前）。可能另一个 git 操作正在本机跑这个仓库。`n等它结束后再重跑；确认是残留（无 git 进程且已超时）才手动删除该文件。"
    }

    $head = (Invoke-Git -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD')).Output
    Write-Host "ALSVID 本机备份 | 仓库 $repo | 当前分支 $head" -ForegroundColor Cyan

    # 1) 暂存全部改动
    $add = Invoke-Git -GitArgs @('add', '-A')
    if ($add.ExitCode -ne 0) { throw "git add 失败：`n$($add.Output)" }

    # 2) 密钥拦截：宁可漏备份，也不把凭据推上云端
    $stagedRaw = (Invoke-Git -GitArgs @('diff', '--cached', '--name-only')).Output
    $staged = @($stagedRaw -split "`r?`n" | Where-Object { $_ -ne '' })
    $suspect = @($staged | Where-Object {
            $_ -match '(^|/)\.env(\.|$)' -or
            $_ -match '\.(pem|key|p12|pfx|jks)$' -or
            $_ -match 'service-account|gha-creds-|google-credentials|id_rsa' -or
            $_ -match '^backups/'
        } | Where-Object { $_ -notmatch 'example|sample' })
    if ($suspect.Count -gt 0) {
        $list = $suspect -join "`n  - "
        throw "检测到疑似密钥或本机配置将被提交，已中止备份：`n  - $list`n先确认它是否应写入仓库（正式凭据一律不提交）。"
    }

    # 3) 有改动才提交
    $diffCheck = Invoke-Git -GitArgs @('diff', '--cached', '--quiet')
    if ($diffCheck.ExitCode -eq 1) {
        $ts = Get-Date -Format 'yyyy-MM-dd HH:mm'
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $Message = "backup(local): $ts 自动备份 $($staged.Count) 个文件"
        }
        $commit = Invoke-Git -GitArgs @('commit', '-m', $Message)
        if ($commit.ExitCode -ne 0) { throw "git commit 失败：`n$($commit.Output)" }
        Write-Host "已本地提交：$Message" -ForegroundColor Green
    }
    else {
        Write-Host '工作区无新改动，跳过提交，仅核对备份是否最新。' -ForegroundColor DarkGray
    }

    $sha = (Invoke-Git -GitArgs @('rev-parse', '--short', 'HEAD')).Output

    # 4) 只推滚动备份分支，绝不推 main
    $push = Invoke-Git -GitArgs @('push', 'origin', "HEAD:refs/heads/backup/local")
    if ($push.ExitCode -ne 0) { throw "推送 backup/local 失败（检查网络或 GitHub 凭据）：`n$($push.Output)" }
    Write-Host "已推送 GitHub 备份分支 backup/local -> $sha" -ForegroundColor Green

    if ($Snapshot) {
        $name = 'backup/local-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
        $snap = Invoke-Git -GitArgs @('push', 'origin', "HEAD:refs/heads/$name")
        if ($snap.ExitCode -ne 0) { throw "推送快照分支 $name 失败：`n$($snap.Output)" }
        Write-Host "已推送阶段快照 $name" -ForegroundColor Green
    }

    Write-Host '完成。未推送 main，未触发 CI，线上站点未变更。' -ForegroundColor Cyan
    Write-Host "本次涉及文件：$($staged.Count) 个；HEAD：$sha" -ForegroundColor DarkGray
}
finally {
    Pop-Location
}
