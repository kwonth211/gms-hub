# 확성기 수집기 관리 (윈도우). 사용: powershell -ExecutionPolicy Bypass -File mega.ps1 start|stop|status|log|check
# 맥 mega.sh 와 같은 뜻. 기록: %USERPROFILE%\gms-hub-samples\mega-collector.log, 설정: %USERPROFILE%\.config\gms-hub\
# 옵션 클릭은 상점 수집기(price-collector)가 쥔 게임 마우스를 빌려서 한다(mouse_lend.py). 상점 수집기가 꺼져 있으면 글만 모은다.
param([string]$cmd = 'status', [string]$arg = '')
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Join-Path $env:USERPROFILE '.config\gms-hub'
$samples = Join-Path $env:USERPROFILE 'gms-hub-samples'
New-Item -ItemType Directory -Force $cfg, $samples | Out-Null
$pidFile = Join-Path $cfg 'mega-collector.pid'
$log = Join-Path $samples 'mega-collector.log'
function Test-Running { if (Test-Path $pidFile) { $p = Get-Content $pidFile; return [bool](Get-Process -Id $p -ErrorAction SilentlyContinue) } return $false }
switch ($cmd) {
  'start' {
    if (Test-Running) { "이미 수집 중 (pid $(Get-Content $pidFile))"; break }
    # 반복 실행(mega-loop.cmd): 메모리가 커지면 수집기가 스스로 끝나고 3초 뒤 다시 켠다.
    $p = Start-Process cmd -WindowStyle Hidden -PassThru -ArgumentList '/c', "`"$dir\mega-loop.cmd`""
    Set-Content $pidFile $p.Id
    "수집 시작 (pid $($p.Id)) · 기록: $log"
  }
  'stop' {
    if (Test-Running) { $p = Get-Content $pidFile; taskkill /PID $p /T /F | Out-Null; Remove-Item $pidFile; '수집 중지' } else { '수집 중이 아님' }
  }
  'status' {
    if (Test-Running) { "수집 중 (pid $(Get-Content $pidFile))" } else { '멈춤' }
    '최근 확성기:'; if (Test-Path $log) { Select-String -Path $log -Pattern '^\d\d:\d\d:\d\d ' | Select-Object -Last 5 | ForEach-Object { $_.Line } }
    '최근 옵션:'; if (Test-Path $log) { Select-String -Path $log -Pattern '^options' | Select-Object -Last 5 | ForEach-Object { $_.Line } }
  }
  'log' { Get-Content $log -Wait -Tail 30 }
  'check' { Set-Location $dir; node mega-check.mjs $(if ($arg) { $arg } else { 300 }) }
  default { '사용법: mega.ps1 start | stop | status | log | check' }
}
